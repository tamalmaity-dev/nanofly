// internal/metrics/collector.go — System metrics via gopsutil
package metrics

import (
	"fmt"
	stdnet "net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// Snapshot holds one reading of all system metrics.
type Snapshot struct {
	Timestamp   int64        `json:"timestamp"`
	CPU         CPUStats     `json:"cpu"`
	Memory      MemStats     `json:"memory"`
	Disk        DiskStats    `json:"disk"`
	Temperature []TempSensor `json:"temperature"`
	Network     NetStats     `json:"network"`
	System      SystemInfo   `json:"system"`
}

type CPUStats struct {
	UsagePercent float64   `json:"usage_percent"`
	CoreCount    int       `json:"core_count"`
	Percents     []float64 `json:"percents"`
	LoadAvg1     float64   `json:"load_avg_1"`
	LoadAvg5     float64   `json:"load_avg_5"`
	LoadAvg15    float64   `json:"load_avg_15"`
}

type MemStats struct {
	TotalBytes   uint64  `json:"total_bytes"`
	UsedBytes    uint64  `json:"used_bytes"`
	FreeBytes    uint64  `json:"free_bytes"`
	UsagePercent float64 `json:"usage_percent"`
	TotalHuman   string  `json:"total_human"`
	UsedHuman    string  `json:"used_human"`
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

type NetInterface struct {
	Name        string   `json:"name"`
	IPs         []string `json:"ips"`
	MAC         string   `json:"mac"`
	Flags       []string `json:"flags"`
	MTU         int      `json:"mtu"`
	BytesSent   uint64   `json:"bytes_sent"`
	BytesRecv   uint64   `json:"bytes_recv"`
	PacketsSent uint64   `json:"packets_sent"`
	PacketsRecv uint64   `json:"packets_recv"`
}

type NetStats struct {
	BytesSent  uint64         `json:"bytes_sent"`
	BytesRecv  uint64         `json:"bytes_recv"`
	Interfaces []NetInterface `json:"interfaces"`
}

type SystemInfo struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Arch         string `json:"arch"`
	UptimeSec    uint64 `json:"uptime_sec"`
	Platform     string `json:"platform"`
	ProcessCount int    `json:"process_count"`
	DockerCount  int    `json:"docker_count"`
}

// Collect gathers a full metrics snapshot from the OS.
func Collect() (*Snapshot, error) {
	snap := &Snapshot{
		Timestamp: time.Now().UnixMilli(),
	}

	// ── CPU ──────────────────────────────────────────────────────────────────
	// Use 500ms interval for ARM compatibility (100ms was too short for Pi)
	percents, err := cpu.Percent(500*time.Millisecond, true)
	if err == nil && len(percents) > 0 {
		var total float64
		for _, p := range percents {
			total += p
		}
		snap.CPU.Percents = percents
		snap.CPU.UsagePercent = total / float64(len(percents))
		snap.CPU.CoreCount = len(percents)
	}

	// Load averages (Linux/macOS only)
	if avg, err := load.Avg(); err == nil {
		snap.CPU.LoadAvg1 = avg.Load1
		snap.CPU.LoadAvg5 = avg.Load5
		snap.CPU.LoadAvg15 = avg.Load15
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
	var interfaces []NetInterface
	ioCounters, ioErr := psnet.IOCounters(true)
	countersMap := make(map[string]psnet.IOCountersStat)
	if ioErr == nil {
		for _, c := range ioCounters {
			countersMap[c.Name] = c
		}
	}

	overallCounters, _ := psnet.IOCounters(false)
	var totalSent, totalRecv uint64
	if len(overallCounters) > 0 {
		totalSent = overallCounters[0].BytesSent
		totalRecv = overallCounters[0].BytesRecv
	}

	sysInterfaces, sysErr := stdnet.Interfaces()
	if sysErr == nil {
		for _, ifi := range sysInterfaces {
			var flags []string
			if (ifi.Flags & stdnet.FlagUp) != 0 {
				flags = append(flags, "up")
			}
			if (ifi.Flags & stdnet.FlagLoopback) != 0 {
				flags = append(flags, "loopback")
			}
			if (ifi.Flags & stdnet.FlagMulticast) != 0 {
				flags = append(flags, "multicast")
			}
			if (ifi.Flags & stdnet.FlagPointToPoint) != 0 {
				flags = append(flags, "point-to-point")
			}
			if (ifi.Flags & stdnet.FlagBroadcast) != 0 {
				flags = append(flags, "broadcast")
			}

			var ips []string
			addrs, addrErr := ifi.Addrs()
			if addrErr == nil {
				for _, addr := range addrs {
					ips = append(ips, addr.String())
				}
			}

			// Don't show interface if it has no IP and is DOWN (e.g. inactive virtual)
			if len(ips) == 0 && (ifi.Flags&stdnet.FlagUp) == 0 {
				continue
			}

			sent := uint64(0)
			recv := uint64(0)
			packetsSent := uint64(0)
			packetsRecv := uint64(0)
			if c, ok := countersMap[ifi.Name]; ok {
				sent = c.BytesSent
				recv = c.BytesRecv
				packetsSent = c.PacketsSent
				packetsRecv = c.PacketsRecv
			}

			interfaces = append(interfaces, NetInterface{
				Name:        ifi.Name,
				IPs:         ips,
				MAC:         ifi.HardwareAddr.String(),
				Flags:       flags,
				MTU:         ifi.MTU,
				BytesSent:   sent,
				BytesRecv:   recv,
				PacketsSent: packetsSent,
				PacketsRecv: packetsRecv,
			})
		}
	}

	snap.Network = NetStats{
		BytesSent:  totalSent,
		BytesRecv:  totalRecv,
		Interfaces: interfaces,
	}

	// ── System Info ──────────────────────────────────────────────────────────
	info, err := host.Info()
	if err == nil {
		snap.System = SystemInfo{
			Hostname: info.Hostname,
			OS:       info.OS,
			Arch:     info.KernelArch,
			UptimeSec: info.Uptime,
			Platform: info.Platform,
		}
	}

	// Process count
	procs, err := process.Pids()
	if err == nil {
		snap.System.ProcessCount = len(procs)
	}

	// Docker container count (running)
	snap.System.DockerCount = dockerRunningCount()

	return snap, nil
}

// dockerRunningCount returns the number of running Docker containers.
func dockerRunningCount() int {
	cmd := exec.Command("docker", "ps", "-q")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	lines := strings.TrimSpace(string(out))
	if lines == "" {
		return 0
	}
	return len(strings.Split(lines, "\n"))
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

// suppress unused import warning
var _ = strconv.Itoa
