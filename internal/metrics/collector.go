// internal/metrics/collector.go — System metrics via gopsutil
package metrics

import (
	"fmt"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// Snapshot holds one reading of all system metrics.
type Snapshot struct {
	Timestamp   int64          `json:"timestamp"`
	CPU         CPUStats       `json:"cpu"`
	Memory      MemStats       `json:"memory"`
	Disk        DiskStats      `json:"disk"`
	Temperature []TempSensor   `json:"temperature"`
	Network     NetStats       `json:"network"`
	System      SystemInfo     `json:"system"`
}

type CPUStats struct {
	UsagePercent float64   `json:"usage_percent"`
	CoreCount    int       `json:"core_count"`
	Percents     []float64 `json:"percents"` // per-core usage
}

type MemStats struct {
	TotalBytes     uint64  `json:"total_bytes"`
	UsedBytes      uint64  `json:"used_bytes"`
	FreeBytes      uint64  `json:"free_bytes"`
	UsagePercent   float64 `json:"usage_percent"`
	TotalHuman     string  `json:"total_human"`
	UsedHuman      string  `json:"used_human"`
}

type DiskStats struct {
	TotalBytes   uint64  `json:"total_bytes"`
	UsedBytes    uint64  `json:"used_bytes"`
	FreeBytes    uint64  `json:"free_bytes"`
	UsagePercent float64 `json:"usage_percent"`
	TotalHuman   string  `json:"total_human"`
	UsedHuman    string  `json:"used_human"`
}

type TempSensor struct {
	Label       string  `json:"label"`
	Temperature float64 `json:"temperature"`
}

type NetStats struct {
	BytesSent uint64 `json:"bytes_sent"`
	BytesRecv uint64 `json:"bytes_recv"`
}

type SystemInfo struct {
	Hostname  string `json:"hostname"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	UptimeSec uint64 `json:"uptime_sec"`
	Platform  string `json:"platform"`
}

// Collect gathers a full metrics snapshot from the OS.
func Collect() (*Snapshot, error) {
	snap := &Snapshot{
		Timestamp: time.Now().UnixMilli(),
	}

	// ── CPU ──────────────────────────────────────────────────────────────────
	// cpu.Percent(interval, perCPU) — 100ms interval gives accurate reading
	percents, err := cpu.Percent(100*time.Millisecond, true)
	if err == nil && len(percents) > 0 {
		var total float64
		for _, p := range percents {
			total += p
		}
		snap.CPU.Percents = percents
		snap.CPU.UsagePercent = total / float64(len(percents))
		snap.CPU.CoreCount = len(percents)
	}

	// ── Memory ───────────────────────────────────────────────────────────────
	vmStat, err := mem.VirtualMemory()
	if err == nil {
		snap.Memory = MemStats{
			TotalBytes:   vmStat.Total,
			UsedBytes:    vmStat.Used,
			FreeBytes:    vmStat.Free,
			UsagePercent: vmStat.UsedPercent,
			TotalHuman:   humanBytes(vmStat.Total),
			UsedHuman:    humanBytes(vmStat.Used),
		}
	}

	// ── Disk ─────────────────────────────────────────────────────────────────
	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	}
	diskStat, err := disk.Usage(diskPath)
	if err == nil {
		snap.Disk = DiskStats{
			TotalBytes:   diskStat.Total,
			UsedBytes:    diskStat.Used,
			FreeBytes:    diskStat.Free,
			UsagePercent: diskStat.UsedPercent,
			TotalHuman:   humanBytes(diskStat.Total),
			UsedHuman:    humanBytes(diskStat.Used),
		}
	}

	// ── Temperature ──────────────────────────────────────────────────────────
	// Returns [] if the OS doesn't support it (Windows, some VMs)
	temps, err := host.SensorsTemperatures()
	if err == nil {
		for _, t := range temps {
			if t.Temperature > 0 {
				snap.Temperature = append(snap.Temperature, TempSensor{
					Label:       t.SensorKey,
					Temperature: t.Temperature,
				})
			}
		}
	}

	// ── Network ──────────────────────────────────────────────────────────────
	netStats, err := net.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		snap.Network = NetStats{
			BytesSent: netStats[0].BytesSent,
			BytesRecv: netStats[0].BytesRecv,
		}
	}

	// ── System Info ──────────────────────────────────────────────────────────
	info, err := host.Info()
	if err == nil {
		snap.System = SystemInfo{
			Hostname:  info.Hostname,
			OS:        info.OS,
			Arch:      info.KernelArch,
			UptimeSec: info.Uptime,
			Platform:  info.Platform,
		}
	}

	return snap, nil
}

// humanBytes converts bytes to a human-readable string (GB/MB/KB).
func humanBytes(b uint64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}
