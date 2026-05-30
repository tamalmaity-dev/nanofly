//go:build !windows

package files

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

func getDrives() []DriveInfo {
	drives := []DriveInfo{}

	// Always add system root
	if size, free, err := getDiskSpace("/"); err == nil {
		drives = append(drives, DriveInfo{
			Name:      "System Root (/) / SD Card",
			Path:      "/",
			Type:      "system",
			SizeHuman: humanBytes(int64(size)),
			FreeHuman: humanBytes(int64(free)),
		})
	}

	file, err := os.Open("/proc/mounts")
	if err != nil {
		return drives
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}
		device := parts[0]
		mountPath := parts[1]

		// Filter for physical drives: /dev/sd*, /dev/nvme*, /dev/mmcblk*, /dev/mapper*
		isPhysical := strings.HasPrefix(device, "/dev/sd") ||
			strings.HasPrefix(device, "/dev/nvme") ||
			strings.HasPrefix(device, "/dev/mmcblk") ||
			strings.HasPrefix(device, "/dev/mapper")

		if !isPhysical {
			continue
		}

		// Skip common system mount paths
		if mountPath == "/" || mountPath == "/boot" || strings.HasPrefix(mountPath, "/boot/") || strings.HasPrefix(mountPath, "/efi") || mountPath == "/recovery" {
			continue
		}

		// Determine a friendly name
		name := filepath.Base(mountPath)
		driveType := "external"

		if size, free, err := getDiskSpace(mountPath); err == nil {
			drives = append(drives, DriveInfo{
				Name:      fmt.Sprintf("%s (%s)", name, device),
				Path:      mountPath,
				Type:      driveType,
				SizeHuman: humanBytes(int64(size)),
				FreeHuman: humanBytes(int64(free)),
			})
		}
	}
	return drives
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
