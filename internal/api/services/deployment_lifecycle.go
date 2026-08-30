package services

import (
	"context"
	"fmt"
	"time"
)

// ActiveDeploymentCount returns deployments that are still owned by a live
// NanoFly process. A completed deployment is stored with status=running and a
// finished_at timestamp, so it must not block updates or shutdowns.
func (m *Manager) ActiveDeploymentCount(ctx context.Context) (int, error) {
	if m == nil || m.db == nil {
		return 0, nil
	}

	var count int
	err := m.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM deployments
		WHERE status = 'building' AND finished_at IS NULL
	`).Scan(&count)
	return count, err
}

// RecoverInterruptedDeployments closes deployment records that were left in
// building state when NanoFly was terminated. Deployment goroutines and their
// Docker children do not survive a process restart, so keeping these rows
// active would leave the service and dashboard permanently in "deploying".
func (m *Manager) RecoverInterruptedDeployments(ctx context.Context) error {
	if m == nil || m.db == nil {
		return nil
	}

	rows, err := m.db.QueryContext(ctx, `
		SELECT id, service_id
		FROM deployments
		WHERE status = 'building' AND finished_at IS NULL
	`)
	if err != nil {
		return fmt.Errorf("find interrupted deployments: %w", err)
	}
	defer rows.Close()

	type interruptedDeployment struct {
		id        string
		serviceID string
	}
	var interrupted []interruptedDeployment
	for rows.Next() {
		var item interruptedDeployment
		if err := rows.Scan(&item.id, &item.serviceID); err != nil {
			return fmt.Errorf("scan interrupted deployment: %w", err)
		}
		interrupted = append(interrupted, item)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read interrupted deployments: %w", err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close interrupted deployments: %w", err)
	}
	if len(interrupted) == 0 {
		return nil
	}

	now := time.Now().Format("2006-01-02 15:04:05")
	for _, item := range interrupted {
		_, err := m.db.ExecContext(ctx, `
			UPDATE deployments
			SET status = 'error',
				log = CASE
					WHEN COALESCE(log, '') = '' THEN ?
					ELSE log || char(10) || ?
				END,
				finished_at = ?
			WHERE id = ? AND status = 'building' AND finished_at IS NULL
		`, "[ERROR] Deployment interrupted because NanoFly restarted before it finished.", "[ERROR] Deployment interrupted because NanoFly restarted before it finished.", now, item.id)
		if err != nil {
			return fmt.Errorf("recover deployment %s: %w", item.id, err)
		}

		// An interrupted build has no new runnable image. Mark the service as an
		// error so the operator can redeploy it explicitly.
		if _, err := m.db.ExecContext(ctx, `
			UPDATE services SET status = 'error'
			WHERE id = ? AND status = 'deploying'
		`, item.serviceID); err != nil {
			return fmt.Errorf("recover service %s: %w", item.serviceID, err)
		}
	}

	return nil
}

// CancelAllDeployments requests cancellation of every deployment owned by the
// current process. This is used only when the process itself is shutting down
// and the normal graceful drain deadline has expired.
func (m *Manager) CancelAllDeployments() {
	if m == nil {
		return
	}
	m.deployCancels.Range(func(_, value any) bool {
		if cancel, ok := value.(context.CancelFunc); ok {
			cancel()
		}
		return true
	})
}
