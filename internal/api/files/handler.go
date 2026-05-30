// internal/api/files/handler.go — File manager backend handler
package files

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

type FileItem struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	IsDir     bool      `json:"is_dir"`
	Size      int64     `json:"size"`
	SizeHuman string    `json:"size_human"`
	ModTime   time.Time `json:"mod_time"`
	Mode      string    `json:"mode"`
}

type FileContent struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
}

type CreateReq struct {
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
}

type SaveReq struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type Handler struct {
	baseDir string
}

func NewHandler() *Handler {
	base := string(os.PathSeparator)
	if runtime.GOOS == "windows" {
		var err error
		base, err = os.UserHomeDir()
		if err != nil {
			base, err = os.Getwd()
			if err != nil {
				base = "."
			}
		}
	}
	return &Handler{baseDir: base}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/list", h.List)
	r.Get("/view", h.View)
	r.Get("/raw", h.Raw)
	r.Post("/save", h.Save)
	r.Post("/create", h.Create)
	r.Post("/upload", h.Upload)
	r.Delete("/delete", h.Delete)
	r.Get("/drives", h.Drives)
	r.Post("/zip", h.Zip)
	r.Post("/unzip", h.Unzip)
	r.Post("/rename", h.Rename)
}

func (h *Handler) resolvePath(target string) string {
	if target == "" {
		return h.baseDir
	}
	cleaned := filepath.Clean(target)
	if filepath.IsAbs(cleaned) {
		return cleaned
	}
	return filepath.Join(h.baseDir, cleaned)
}

// humanBytes converts bytes to a human-readable string.
func humanBytes(b int64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
		TB = 1024 * GB
	)
	switch {
	case b >= TB:
		return fmt.Sprintf("%.2f TB", float64(b)/float64(TB))
	case b >= GB:
		return fmt.Sprintf("%.2f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.2f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.2f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

// GET /api/v1/files/list?path=...
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	pathQuery := r.URL.Query().Get("path")
	resolved := h.resolvePath(pathQuery)

	entries, err := os.ReadDir(resolved)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to read directory: "+err.Error())
		return
	}

	var items []FileItem
	for _, entry := range entries {
		info, err := entry.Info()
		var size int64
		var modTime time.Time
		var mode fs.FileMode
		if err == nil {
			size = info.Size()
			modTime = info.ModTime()
			mode = info.Mode()
		}

		itemPath := filepath.Join(resolved, entry.Name())

		items = append(items, FileItem{
			Name:      entry.Name(),
			Path:      itemPath,
			IsDir:     entry.IsDir(),
			Size:      size,
			SizeHuman: humanBytes(size),
			ModTime:   modTime,
			Mode:      mode.String(),
		})
	}

	if items == nil {
		items = []FileItem{}
	}

	response.Success(w, map[string]interface{}{
		"current_path": resolved,
		"root_path":    h.baseDir,
		"items":        items,
	})
}

// GET /api/v1/files/view?path=...
func (h *Handler) View(w http.ResponseWriter, r *http.Request) {
	pathQuery := r.URL.Query().Get("path")
	resolved := h.resolvePath(pathQuery)

	info, err := os.Stat(resolved)
	if err != nil {
		response.Error(w, http.StatusNotFound, "file not found")
		return
	}
	if info.IsDir() {
		response.Error(w, http.StatusBadRequest, "cannot view a directory")
		return
	}

	content, err := os.ReadFile(resolved)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to read file: "+err.Error())
		return
	}

	response.Success(w, FileContent{
		Path:    resolved,
		Content: string(content),
		Size:    info.Size(),
	})
}

// POST /api/v1/files/save
func (h *Handler) Save(w http.ResponseWriter, r *http.Request) {
	var req SaveReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resolved := h.resolvePath(req.Path)
	err := os.WriteFile(resolved, []byte(req.Content), 0644)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save file: "+err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "saved"})
}

// POST /api/v1/files/create
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resolved := h.resolvePath(req.Path)

	if req.IsDir {
		if err := os.MkdirAll(resolved, 0755); err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to create directory: "+err.Error())
			return
		}
	} else {
		// Ensure parent directories exist
		if err := os.MkdirAll(filepath.Dir(resolved), 0755); err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to create parent directory: "+err.Error())
			return
		}
		if err := os.WriteFile(resolved, []byte(""), 0644); err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to create file: "+err.Error())
			return
		}
	}

	response.Success(w, map[string]string{"status": "created"})
}

// POST /api/v1/files/upload
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid upload: "+err.Error())
		return
	}

	destination := h.resolvePath(r.FormValue("path"))
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		response.Error(w, http.StatusBadRequest, "no files uploaded")
		return
	}

	uploaded := 0
	for _, header := range files {
		rel := header.Filename
		if rel == "" {
			continue
		}
		rel = filepath.Clean(strings.ReplaceAll(rel, "\\", "/"))
		if filepath.IsAbs(rel) || strings.HasPrefix(rel, "..") {
			response.Error(w, http.StatusBadRequest, "invalid upload path")
			return
		}

		target := filepath.Join(destination, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to create upload directory: "+err.Error())
			return
		}

		src, err := header.Open()
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to open uploaded file: "+err.Error())
			return
		}
		dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			src.Close() //nolint:errcheck
			response.Error(w, http.StatusInternalServerError, "failed to create uploaded file: "+err.Error())
			return
		}
		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		src.Close() //nolint:errcheck
		if copyErr != nil {
			response.Error(w, http.StatusInternalServerError, "failed to save uploaded file: "+copyErr.Error())
			return
		}
		if closeErr != nil {
			response.Error(w, http.StatusInternalServerError, "failed to close uploaded file: "+closeErr.Error())
			return
		}
		uploaded++
	}

	response.Success(w, map[string]any{"status": "uploaded", "count": uploaded})
}

// DELETE /api/v1/files/delete?path=...
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	pathQuery := r.URL.Query().Get("path")
	resolved := h.resolvePath(pathQuery)

	if err := os.RemoveAll(resolved); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to delete: "+err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "deleted"})
}

type DriveInfo struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Type      string `json:"type"` // "system", "external"
	SizeHuman string `json:"size_human"`
	FreeHuman string `json:"free_human"`
	SizeBytes int64  `json:"size_bytes"`
	FreeBytes int64  `json:"free_bytes"`
}

// GET /api/v1/files/drives
func (h *Handler) Drives(w http.ResponseWriter, r *http.Request) {
	drives := GetDrives()
	response.Success(w, drives)
}

// GET /api/v1/files/raw?path=...
func (h *Handler) Raw(w http.ResponseWriter, r *http.Request) {
	pathQuery := r.URL.Query().Get("path")
	resolved := h.resolvePath(pathQuery)

	info, err := os.Stat(resolved)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	if info.IsDir() {
		http.Error(w, "cannot serve a directory", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, resolved)
}

type ZipReq struct {
	Path string `json:"path"`
	Dest string `json:"dest"`
}

type UnzipReq struct {
	Path string `json:"path"`
	Dest string `json:"dest"`
}

// POST /api/v1/files/zip
func (h *Handler) Zip(w http.ResponseWriter, r *http.Request) {
	var req ZipReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	srcResolved := h.resolvePath(req.Path)
	destResolved := ""
	if req.Dest != "" {
		destResolved = h.resolvePath(req.Dest)
	} else {
		destResolved = srcResolved + ".zip"
	}

	if _, err := os.Stat(srcResolved); err != nil {
		response.Error(w, http.StatusNotFound, "source path not found: "+err.Error())
		return
	}

	if err := os.MkdirAll(filepath.Dir(destResolved), 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to create destination directory: "+err.Error())
		return
	}

	if err := zipSource(srcResolved, destResolved); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to zip: "+err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "zipped", "dest": destResolved})
}

// POST /api/v1/files/unzip
func (h *Handler) Unzip(w http.ResponseWriter, r *http.Request) {
	var req UnzipReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	srcResolved := h.resolvePath(req.Path)
	destResolved := ""
	if req.Dest != "" {
		destResolved = h.resolvePath(req.Dest)
	} else {
		base := filepath.Base(srcResolved)
		ext := filepath.Ext(base)
		folderName := strings.TrimSuffix(base, ext)
		destResolved = filepath.Join(filepath.Dir(srcResolved), folderName)
	}

	if _, err := os.Stat(srcResolved); err != nil {
		response.Error(w, http.StatusNotFound, "zip file not found: "+err.Error())
		return
	}

	if err := unzipSource(srcResolved, destResolved); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to unzip: "+err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "unzipped", "dest": destResolved})
}

func unzipSource(source, destination string) error {
	r, err := zip.OpenReader(source)
	if err != nil {
		return err
	}
	defer r.Close()

	if err := os.MkdirAll(destination, 0755); err != nil {
		return err
	}

	for _, f := range r.File {
		err := func() error {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()

			path := filepath.Join(destination, f.Name)
			// Guard against Zip Slip path traversal
			if !strings.HasPrefix(filepath.Clean(path), filepath.Clean(destination)) {
				return fmt.Errorf("illegal file path in zip: %s", f.Name)
			}

			if f.FileInfo().IsDir() {
				return os.MkdirAll(path, f.Mode())
			}

			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return err
			}

			fVar, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
			if err != nil {
				return err
			}
			defer fVar.Close()

			_, err = io.Copy(fVar, rc)
			return err
		}()
		if err != nil {
			return err
		}
	}
	return nil
}

func zipSource(source, destination string) error {
	archive, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer archive.Close()

	zipWriter := zip.NewWriter(archive)
	defer zipWriter.Close()

	info, err := os.Stat(source)
	if err != nil {
		return err
	}

	var baseDir string
	if info.IsDir() {
		baseDir = filepath.Base(source)
	}

	err = filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if path == destination {
			return nil
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		if baseDir != "" {
			relPath, err := filepath.Rel(source, path)
			if err != nil {
				return err
			}
			if relPath == "." {
				return nil
			}
			header.Name = filepath.ToSlash(filepath.Join(baseDir, relPath))
		} else {
			header.Name = filepath.Base(path)
		}

		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})

	return err
}

type RenameReq struct {
	OldPath string `json:"old_path"`
	NewPath string `json:"new_path"`
}

// POST /api/v1/files/rename
func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var req RenameReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	oldResolved := h.resolvePath(req.OldPath)
	newResolved := h.resolvePath(req.NewPath)

	if _, err := os.Stat(oldResolved); err != nil {
		response.Error(w, http.StatusNotFound, "source path not found: "+err.Error())
		return
	}

	if err := os.MkdirAll(filepath.Dir(newResolved), 0755); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to create destination parent folder: "+err.Error())
		return
	}

	if err := os.Rename(oldResolved, newResolved); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to rename: "+err.Error())
		return
	}

	response.Success(w, map[string]string{"status": "renamed"})
}
