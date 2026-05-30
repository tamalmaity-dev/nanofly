//go:build !windows

package files

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

type LsblkOutput struct {
	Blockdevices []LsblkDevice `json:"blockdevices"`
}

//LsblkDevice struct used for getting the drives
type LsblkDevice struct {
	Name       string        `json:"name"`
	Fstype     string        `json:"fstype"`
	Size       string        `json:"size"`
	Mountpoint string        `json:"mountpoint"`
	Label      string        `json:"label"`
	Type       string        `json:"type"`
	Children   []LsblkDevice `json:"children"`
}

func GetDrives() []DriveInfo {
	drives := []DriveInfo{}

	// Always add system root
	if size, free, err := getDiskSpace("/"); err == nil {
		drives = append(drives, DriveInfo{
			Name:      "System Root (/) / SD Card",
			Path:      "/",
			Type:      "system",
			SizeHuman: humanBytes(int64(size)),
			FreeHuman: humanBytes(int64(free)),
			SizeBytes: int64(size),
			FreeBytes: int64(free),
		})
	}

	devices, err := queryLsblk()
	
	// Helper to extract disk name from partition name
	getDiskName := func(base string) string {
		if idx := strings.Index(base, "p"); idx > 0 {
			if idx+1 < len(base) && base[idx+1] >= '0' && base[idx+1] <= '9' {
				return base[:idx]
			}
		}
		return strings.TrimFunc(base, func(r rune) bool {
			return r >= '0' && r <= '9'
		})
	}

	// Helper to find root partition name
	var findRootPartitionName func([]LsblkDevice) string
	findRootPartitionName = func(devs []LsblkDevice) string {
		for _, d := range devs {
			if d.Mountpoint == "/" {
				return d.Name
			}
			if len(d.Children) > 0 {
				if name := findRootPartitionName(d.Children); name != "" {
					return name
				}
			}
		}
		return ""
	}

	systemDisk := ""
	if err == nil && len(devices) > 0 {
		if rootPart := findRootPartitionName(devices); rootPart != "" {
			systemDisk = getDiskName(rootPart)
		}
	}

	// Try using lsblk -J first to detect physical partitions and auto-mount if needed
	if err == nil && len(devices) > 0 {
		var collected []LsblkDevice
		collectDevices(devices, &collected)

		for _, d := range collected {
			// Filter loop, zram, etc. and check if it has a filesystem (not swap, not empty)
			if d.Fstype == "" || d.Fstype == "swap" {
				continue
			}
			if d.Type != "part" && d.Type != "disk" {
				continue
			}
			
			// isPhysical check
			name := d.Name
			isPhysical := strings.HasPrefix(name, "sd") ||
				strings.HasPrefix(name, "nvme") ||
				strings.HasPrefix(name, "mmcblk") ||
				strings.HasPrefix(name, "vd")
			if !isPhysical {
				continue
			}

			// Skip partitions belonging to the system disk
			if systemDisk != "" && getDiskName(name) == systemDisk {
				continue
			}

			// If it's already mounted on system directories, we skip to avoid cluttering
			mp := d.Mountpoint
			if mp == "/" || mp == "/boot" || strings.HasPrefix(mp, "/boot/") || strings.HasPrefix(mp, "/efi") || mp == "/recovery" {
				continue
			}

			// If not mounted, try auto-mounting it!
			if mp == "" {
				mountDir := "/mnt/nanofly-" + name
				_ = os.MkdirAll(mountDir, 0755)
				// Try mounting it
				cmd := exec.Command("mount", "/dev/"+name, mountDir)
				if err := cmd.Run(); err == nil {
					mp = mountDir
				} else {
					continue
				}
			}

			// Now d is mounted at `mp`
			if size, free, err := getDiskSpace(mp); err == nil {
				label := d.Label
				if label == "" {
					label = "External Disk"
				}
				drives = append(drives, DriveInfo{
					Name:      fmt.Sprintf("%s (%s)", label, name),
					Path:      mp,
					Type:      "external",
					SizeHuman: humanBytes(int64(size)),
					FreeHuman: humanBytes(int64(free)),
					SizeBytes: int64(size),
					FreeBytes: int64(free),
				})
			}
		}
		// Return if we successfully populated drives list using lsblk
		if len(drives) > 1 {
			return drives
		}
	}

	// Fallback to /proc/mounts if lsblk failed or didn't return any external drives
	file, err := os.Open("/proc/mounts")
	if err != nil {
		return drives
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	// Track already added mount paths to avoid duplicates
	addedMounts := make(map[string]bool)
	addedMounts["/"] = true

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}
		device := parts[0]
		mountPath := parts[1]

		isPhysical := strings.HasPrefix(device, "/dev/sd") ||
			strings.HasPrefix(device, "/dev/nvme") ||
			strings.HasPrefix(device, "/dev/mmcblk") ||
			strings.HasPrefix(device, "/dev/mapper")

		if !isPhysical {
			continue
		}

		deviceName := filepath.Base(device)
		if systemDisk != "" && getDiskName(deviceName) == systemDisk {
			continue
		}

		if mountPath == "/" || mountPath == "/boot" || strings.HasPrefix(mountPath, "/boot/") || strings.HasPrefix(mountPath, "/efi") || mountPath == "/recovery" {
			continue
		}

		if addedMounts[mountPath] {
			continue
		}

		name := filepath.Base(mountPath)
		if size, free, err := getDiskSpace(mountPath); err == nil {
			drives = append(drives, DriveInfo{
				Name:      fmt.Sprintf("%s (%s)", name, filepath.Base(device)),
				Path:      mountPath,
				Type:      "external",
				SizeHuman: humanBytes(int64(size)),
				FreeHuman: humanBytes(int64(free)),
				SizeBytes: int64(size),
				FreeBytes: int64(free),
			})
			addedMounts[mountPath] = true
		}
	}
	return drives
}

func queryLsblk() ([]LsblkDevice, error) {
	cmd := exec.Command("lsblk", "-o", "NAME,FSTYPE,SIZE,MOUNTPOINT,LABEL,TYPE", "-J")
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var res LsblkOutput
	if err := json.Unmarshal(out, &res); err != nil {
		return nil, err
	}
	return res.Blockdevices, nil
}

func collectDevices(devs []LsblkDevice, list *[]LsblkDevice) {
	for _, d := range devs {
		*list = append(*list, d)
		if len(d.Children) > 0 {
			collectDevices(d.Children, list)
		}
	}
}

func getDiskSpace(path string) (uint64, uint64, error) {
	var stat syscall.Statfs_t
	err := syscall.Statfs(path, &stat)
	if err != nil {
		return 0, 0, err
	}
	size := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	return size, free, nil
}
