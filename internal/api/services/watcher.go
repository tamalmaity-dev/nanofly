package services

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"log/slog"

	"github.com/bmatcuk/doublestar/v4"
)

type fileWatcher struct {
	serviceID string
	localPath string
	patterns  []string
	stopCh    chan struct{}
	m         *Manager
}

var (
	watcherMu sync.Mutex
	watchers  = map[string]*fileWatcher{}
)

func parseWatchPatterns(raw string) []string {
	var out []string
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func shouldIgnoreWatchPath(rel string) bool {
	rel = filepath.ToSlash(rel)
	if strings.HasPrefix(rel, ".git/") || rel == ".git" {
		return true
	}
	if strings.Contains(rel, "node_modules/") || rel == "node_modules" {
		return true
	}
	if strings.Contains(rel, ".venv/") || rel == ".venv" {
		return true
	}
	if strings.HasSuffix(rel, ".log") {
		return true
	}
	return false
}

func (w *fileWatcher) matchesWatch(rel string) bool {
	if len(w.patterns) == 0 {
		return false
	}
	for _, pat := range w.patterns {
		ok, _ := doublestar.PathMatch(pat, rel)
		if ok {
			return true
		}
		// Fallback to simple suffix/prefix for patterns without **
		if ok2, _ := filepath.Match(pat, rel); ok2 {
			return true
		}
		if ok2, _ := filepath.Match(pat, filepath.Base(rel)); ok2 {
			return true
		}
	}
	return false
}

func (w *fileWatcher) run() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	lastMtimes := map[string]time.Time{}
	var lastDeploy time.Time
	var pending bool
	var pendingAt time.Time

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			changed := false
			_ = filepath.Walk(w.localPath, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}
				rel, _ := filepath.Rel(w.localPath, path)
				rel = filepath.ToSlash(rel)
				if shouldIgnoreWatchPath(rel) {
					return nil
				}
				if !w.matchesWatch(rel) {
					return nil
				}
				mt := info.ModTime()
				if prev, ok := lastMtimes[rel]; !ok || mt.After(prev) {
					lastMtimes[rel] = mt
					if ok {
						changed = true
					}
				}
				return nil
			})
			// Prune deleted files from map
			for k := range lastMtimes {
				if _, err := os.Stat(filepath.Join(w.localPath, filepath.FromSlash(k))); os.IsNotExist(err) {
					delete(lastMtimes, k)
				}
			}

			if changed {
				if time.Since(lastDeploy) < 2*time.Second {
					pending = true
					pendingAt = time.Now()
					continue
				}
				// Debounce: wait 750ms after last change before deploying
				if pending && time.Since(pendingAt) < 750*time.Millisecond {
					continue
				}
				pending = false
				lastDeploy = time.Now()
				slog.Info("watch: triggering redeploy", "service", w.serviceID, "path", w.localPath)
				go func() {
					if _, err := w.m.Deploy(context.Background(), w.serviceID); err != nil {
						slog.Warn("watch deploy failed", "service", w.serviceID, "err", err)
					}
				}()
			} else if pending && time.Since(pendingAt) >= 750*time.Millisecond && time.Since(lastDeploy) >= 2*time.Second {
				pending = false
				lastDeploy = time.Now()
				slog.Info("watch: triggering debounced redeploy", "service", w.serviceID)
				go func() {
					if _, err := w.m.Deploy(context.Background(), w.serviceID); err != nil {
						slog.Warn("watch deploy failed", "service", w.serviceID, "err", err)
					}
				}()
			}
		}
	}
}

func (m *Manager) startWatcherLocked(svc *Service) {
	if svc.GitRepoURL == "" || !strings.HasPrefix(svc.GitRepoURL, "file://") {
		return
	}
	if strings.TrimSpace(svc.BuildWatchPaths) == "" {
		return
	}
	// Gate on build_use_server if env requires it
	if os.Getenv("NANOFLY_WATCH_REQUIRE_FLAG") == "1" && !svc.BuildUseServer {
		return
	}
	localPath := strings.TrimPrefix(svc.GitRepoURL, "file://")
	if localPath == "" {
		return
	}
	if _, err := os.Stat(localPath); err != nil {
		return
	}
	// Restart existing watcher for same service
	if w, ok := watchers[svc.ID]; ok {
		close(w.stopCh)
		delete(watchers, svc.ID)
	}
	patterns := parseWatchPatterns(svc.BuildWatchPaths)
	if len(patterns) == 0 {
		return
	}
	w := &fileWatcher{
		serviceID: svc.ID,
		localPath: localPath,
		patterns:  patterns,
		stopCh:    make(chan struct{}),
		m:         m,
	}
	watchers[svc.ID] = w
	go w.run()
	slog.Info("watch: started", "service", svc.ID, "path", localPath, "patterns", strings.Join(patterns, ","))
}

func (m *Manager) stopWatcherLocked(serviceID string) {
	if w, ok := watchers[serviceID]; ok {
		close(w.stopCh)
		delete(watchers, serviceID)
		slog.Info("watch: stopped", "service", serviceID)
	}
}

// StartWatchers scans existing file:// services and starts watchers.
func (m *Manager) StartWatchers(ctx context.Context) {
	rows, err := m.db.QueryContext(ctx, `SELECT id, git_repo_url, build_watch_paths, build_use_server FROM services WHERE git_repo_url LIKE 'file://%' AND build_watch_paths != ''`)
	if err != nil {
		return
	}
	defer rows.Close()
	watcherMu.Lock()
	defer watcherMu.Unlock()
	for rows.Next() {
		var id, gitURL, watchPaths string
		var useServer int
		if err := rows.Scan(&id, &gitURL, &watchPaths, &useServer); err != nil {
			continue
		}
		svc := &Service{ID: id, GitRepoURL: gitURL, BuildWatchPaths: watchPaths, BuildUseServer: useServer != 0}
		m.startWatcherLocked(svc)
	}
}

// SyncWatcher reconciles watcher state after create/update/delete.
func (m *Manager) SyncWatcher(ctx context.Context, serviceID string) {
	svc, err := m.Get(ctx, serviceID)
	if err != nil {
		watcherMu.Lock()
		m.stopWatcherLocked(serviceID)
		watcherMu.Unlock()
		return
	}
	watcherMu.Lock()
	m.stopWatcherLocked(serviceID)
	m.startWatcherLocked(svc)
	watcherMu.Unlock()
}

func (m *Manager) StopAllWatchers() {
	watcherMu.Lock()
	for id, w := range watchers {
		close(w.stopCh)
		delete(watchers, id)
	}
	watcherMu.Unlock()
}
