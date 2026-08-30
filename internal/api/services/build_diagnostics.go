package services

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

type buildContextFile struct {
	path string
	size int64
}

// logBuildContextSummary reports enough information to explain a quiet
// BuildKit "load build context" stage without flooding the deployment log.
func logBuildContextSummary(root string, log func(string)) {
	var totalSize int64
	var fileCount int
	var largest []buildContextFile

	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		fileCount++
		totalSize += info.Size()
		largest = append(largest, buildContextFile{path: path, size: info.Size()})
		return nil
	})
	if err != nil {
		log(fmt.Sprintf("Build context inspection failed: %v", err))
		return
	}

	sort.Slice(largest, func(i, j int) bool { return largest[i].size > largest[j].size })
	if len(largest) > 5 {
		largest = largest[:5]
	}
	log(fmt.Sprintf("Build context: %.1f MB (%d files)", float64(totalSize)/1024/1024, fileCount))
	for _, item := range largest {
		rel, relErr := filepath.Rel(root, item.path)
		if relErr != nil {
			rel = item.path
		}
		log(fmt.Sprintf("Build context largest file: %.1f MB %s", float64(item.size)/1024/1024, filepath.ToSlash(rel)))
	}
}
