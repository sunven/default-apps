package manual

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/sunven/default-apps/internal/catalog"
)

// IdentifiedFile is transient: paths are never added to configuration by identification.
type IdentifiedFile struct {
	Path    string          `json:"path"`
	Name    string          `json:"name"`
	Entries []catalog.Entry `json:"entries"`
	Error   string          `json:"error"`
}

// IdentifyFiles accepts native drop paths without opening a picker. A bad input
// does not hide usable files from the same drop; no file contents are read.
func (s *Service) IdentifyFiles(ctx context.Context, paths []string) ([]IdentifiedFile, error) {
	results := make([]IdentifiedFile, 0, len(paths))
	seen := map[string]bool{}
	for _, path := range paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if seen[path] {
			continue
		}
		seen[path] = true
		file := IdentifiedFile{Path: path, Name: filepath.Base(path), Entries: []catalog.Entry{}}
		if !filepath.IsAbs(path) {
			file.Error = "只支持拖入本机普通文件，不支持文字或链接。"
		} else if info, err := os.Stat(path); err != nil {
			file.Error = "无法访问文件：" + err.Error()
		} else if !info.Mode().IsRegular() {
			file.Error = "只支持普通文件，不支持文件夹、应用包或其他特殊文件。"
		} else {
			typ, err := s.system.IdentifyFile(ctx, path)
			if err != nil {
				file.Error = "无法识别文件类型：" + err.Error()
			} else {
				file.Entries, err = s.catalog.Resolve(ctx, []catalog.Input{{Kind: "identifier", Value: typ.Identifier, Label: typ.Name, Source: "file", Origin: "file"}})
				if err != nil {
					file.Error = err.Error()
				} else {
					resolved := false
					var problems []string
					for _, entry := range file.Entries {
						resolved = resolved || entry.Resolved
						if entry.UnresolvedReason != "" {
							problems = append(problems, entry.UnresolvedReason)
						}
					}
					if !resolved {
						file.Error = "无法确定文件类型"
						if len(problems) > 0 {
							file.Error += "：" + strings.Join(problems, "；")
						}
					}
				}
			}
		}
		results = append(results, file)
	}
	return results, nil
}
