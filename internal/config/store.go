// Package config persists user additions and one opaque pending request atomically.
package config

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
)

type ManualAssociation struct {
	Input      catalog.Input `json:"input"`
	SelectedID string        `json:"selectedID"`
}
type Document struct {
	Version      int                   `json:"version"`
	Associations []ManualAssociation   `json:"associations"`
	Applications []association.AppCopy `json:"applications"`
	// Pending belongs to the change coordinator. Manual updates preserve its data.
	Pending json.RawMessage `json:"pending,omitempty"`
}
type Repository interface {
	Load(context.Context) (Document, error)
	Update(context.Context, func(*Document) error) error
}
type AtomicWriter func(string, []byte) error
type Store struct {
	mu    sync.Mutex
	path  string
	write AtomicWriter
}

func NewStore(path string) *Store { return NewStoreWithWriter(path, AtomicWrite) }
func NewStoreWithWriter(path string, write AtomicWriter) *Store {
	return &Store{path: path, write: write}
}
func (s *Store) Load(ctx context.Context) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load(ctx)
}
func (s *Store) load(ctx context.Context) (Document, error) {
	empty := Document{Version: 1, Associations: []ManualAssociation{}, Applications: []association.AppCopy{}}
	if err := ctx.Err(); err != nil {
		return empty, err
	}
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return empty, nil
	}
	if err != nil {
		return empty, fmt.Errorf("无法读取配置 %s：%w", s.path, err)
	}
	var doc Document
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&doc); err != nil {
		return empty, fmt.Errorf("配置损坏，已保留原文件 %s：%w", s.path, err)
	}
	var trailing any
	if err = decoder.Decode(&trailing); err != io.EOF {
		return empty, fmt.Errorf("配置包含额外内容，已保留原文件 %s", s.path)
	}
	if doc.Version != 1 {
		return empty, fmt.Errorf("无法安全读取配置版本 %d，已保留原文件 %s", doc.Version, s.path)
	}
	if err := validate(doc); err != nil {
		return empty, fmt.Errorf("配置内容无效，已保留原文件 %s：%w", s.path, err)
	}
	if doc.Associations == nil {
		doc.Associations = []ManualAssociation{}
	}
	if doc.Applications == nil {
		doc.Applications = []association.AppCopy{}
	}
	return doc, nil
}

// Update serializes all writers and reloads the complete document. It never replaces
// unreadable data with an empty configuration, and failed updates have no in-memory commit.
func (s *Store) Update(ctx context.Context, change func(*Document) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.load(ctx)
	if err != nil {
		return err
	}
	if err = change(&doc); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	if err := validate(doc); err != nil {
		return err
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	if err = s.write(s.path, append(data, '\n')); err != nil {
		return fmt.Errorf("未能保存配置 %s：%w", s.path, err)
	}
	return nil
}

// AtomicWrite stages and syncs in the destination directory before one rename.
func AtomicWrite(path string, data []byte) (err error) {
	dir := filepath.Dir(path)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".config-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	if err = os.Rename(file.Name(), path); err != nil {
		return err
	}
	parent, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer parent.Close()
	return parent.Sync()
}

func validate(doc Document) error {
	if doc.Version != 1 {
		return fmt.Errorf("不支持的配置版本 %d", doc.Version)
	}
	for _, item := range doc.Associations {
		if item.Input.Source != "manual" || item.Input.Value == "" {
			return fmt.Errorf("手动关联缺少输入或来源")
		}
		prefix := "file:"
		switch item.Input.Kind {
		case "scheme":
			prefix = "scheme:"
		case "extension", "identifier":
		default:
			return fmt.Errorf("手动关联输入种类无效")
		}
		if !strings.HasPrefix(item.SelectedID, prefix) || len(item.SelectedID) == len(prefix) {
			return fmt.Errorf("手动关联缺少已选择的身份")
		}
	}
	for _, app := range doc.Applications {
		if !filepath.IsAbs(app.Path) {
			return fmt.Errorf("手动应用缺少绝对路径")
		}
	}
	return nil
}
