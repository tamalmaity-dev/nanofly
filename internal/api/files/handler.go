// internal/api/files/handler.go — File manager backend handler
package files

import (
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
	r.Post("/save", h.Save)
	r.Post("/create", h.Create)
	r.Post("/upload", h.Upload)
	r.Delete("/delete", h.Delete)
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
	)
	switch {
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
