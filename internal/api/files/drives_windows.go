//go:build windows

package files

import (
	"syscall"
	"unsafe"
)

func GetDrives() []DriveInfo {
	drives := []DriveInfo{}
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getLogicalDrives := kernel32.NewProc("GetLogicalDrives")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	bitmask, _, _ := getLogicalDrives.Call()
	for i := 0; i < 26; i++ {
		if (bitmask & (1 << i)) != 0 {
			driveLetter := string(rune('A' + i)) + ":\\"
			
			var freeBytes, totalBytes, totalFreeBytes int64
			drivePtr, _ := syscall.UTF16PtrFromString(driveLetter)
			
			r, _, _ := getDiskFreeSpaceEx.Call(
				uintptr(unsafe.Pointer(drivePtr)),
				uintptr(unsafe.Pointer(&freeBytes)),
				uintptr(unsafe.Pointer(&totalBytes)),
				uintptr(unsafe.Pointer(&totalFreeBytes)),
			)
			if r != 0 {
				driveType := "external"
				if driveLetter == "C:\\" {
					driveType = "system"
				}
				drives = append(drives, DriveInfo{
					Name:      "Local Disk (" + string(rune('A'+i)) + ":)",
					Path:      driveLetter,
					Type:      driveType,
					SizeHuman: humanBytes(totalBytes),
					FreeHuman: humanBytes(freeBytes),
					SizeBytes: totalBytes,
					FreeBytes: freeBytes,
				})
			}
		}
	}
	return drives
}
