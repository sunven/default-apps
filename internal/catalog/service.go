// Package catalog resolves catalog inputs into distinct system associations.
package catalog

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/sunven/default-apps/internal/association"
)

type Input struct {
	Kind   string `json:"kind"`
	Value  string `json:"value"`
	Label  string `json:"label"`
	Source string `json:"source"`
}

type Source struct {
	Kind            string `json:"kind"`
	InputKind       string `json:"inputKind"`
	RawInput        string `json:"rawInput"`
	NormalizedInput string `json:"normalizedInput"`
	Label           string `json:"label"`
}

type ResolvedType struct {
	Identifier string   `json:"identifier"`
	Name       string   `json:"name"`
	Extensions []string `json:"extensions"`
	MIMETypes  []string `json:"mimeTypes"`
	Declared   bool     `json:"declared"`
	Dynamic    bool     `json:"dynamic"`
}

type Entry struct {
	ID                    string                  `json:"id"`
	Association           association.Association `json:"association"`
	Name                  string                  `json:"name"`
	Extensions            []string                `json:"extensions"`
	MIMETypes             []string                `json:"mimeTypes"`
	Sources               []Source                `json:"sources"`
	Resolved              bool                    `json:"resolved"`
	UnresolvedReason      string                  `json:"unresolvedReason"`
	DiagnosticIdentifiers []string                `json:"diagnosticIdentifiers"`
}

type TypeResolver interface {
	ResolveExtension(context.Context, string) ([]ResolvedType, error)
}

type Service struct{ resolver TypeResolver }

func NewService(resolver TypeResolver) *Service { return &Service{resolver: resolver} }

func (s *Service) List(ctx context.Context) ([]Entry, error) {
	inputs := []Input{}
	for _, seed := range []struct {
		name       string
		extensions []string
	}{
		{"PDF 文稿", []string{"pdf"}}, {"纯文本", []string{"txt", "text"}},
		{"RTF 文稿", []string{"rtf"}}, {"Markdown", []string{"md", "markdown"}},
		{"JPEG 图像", []string{"jpg", "jpeg"}}, {"PNG 图像", []string{"png"}},
		{"GIF 图像", []string{"gif"}}, {"TIFF 图像", []string{"tif", "tiff"}},
		{"HEIC 图像", []string{"heic"}}, {"SVG 图像", []string{"svg"}},
		{"HTML 网页", []string{"html", "htm"}}, {"JSON 数据", []string{"json"}},
	} {
		for _, ext := range seed.extensions {
			inputs = append(inputs, Input{Kind: "extension", Value: ext, Label: seed.name, Source: "common"})
		}
	}
	for _, scheme := range []string{"http", "https", "mailto", "webcal"} {
		inputs = append(inputs, Input{Kind: "scheme", Value: scheme, Label: scheme, Source: "common"})
	}
	return s.Resolve(ctx, inputs)
}

var schemePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.-]*$`)

func (s *Service) Resolve(ctx context.Context, inputs []Input) ([]Entry, error) {
	entries := []Entry{}
	indices := map[string]int{}
	for _, input := range inputs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if input.Kind == "scheme" {
			scheme := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(input.Value), ":"))
			source := Source{Kind: input.Source, InputKind: input.Kind, RawInput: input.Value, NormalizedInput: scheme, Label: input.Label}
			if !schemePattern.MatchString(scheme) {
				entries = addUnresolved(entries, indices, unresolved(input, source, "请输入有效的 URL 协议名称，而非完整网址"))
				continue
			}
			id := "scheme:" + scheme
			index, exists := indices[id]
			if !exists {
				index = len(entries)
				indices[id] = index
				entries = append(entries, Entry{ID: id, Association: association.Association{Kind: "scheme", Key: scheme}, Name: scheme, Resolved: true, Extensions: []string{}, MIMETypes: []string{}, Sources: []Source{}, DiagnosticIdentifiers: []string{}})
			}
			entries[index].Sources = appendSource(entries[index].Sources, source)
			continue
		}
		extension := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(input.Value), "."))
		source := Source{Kind: input.Source, InputKind: input.Kind, RawInput: input.Value, NormalizedInput: extension, Label: input.Label}
		if input.Kind != "extension" || extension == "" || strings.ContainsAny(extension, "/\\:*?") || strings.HasPrefix(extension, ".") || strings.ContainsFunc(extension, unicode.IsSpace) {
			entries = addUnresolved(entries, indices, unresolved(input, source, "请输入单个扩展名；不能使用路径、网址或通配符"))
			continue
		}
		matches, err := s.resolver.ResolveExtension(ctx, extension)
		if err != nil {
			entries = addUnresolved(entries, indices, unresolved(input, source, err.Error()))
			continue
		}
		usable := make([]ResolvedType, 0, len(matches))
		for _, match := range matches {
			if match.Identifier == "" || match.Dynamic || !match.Declared {
				continue
			}
			usable = append(usable, match)
		}
		if len(usable) == 0 {
			reason := "系统未返回已声明的文件类型"
			if len(matches) > 0 {
				reason = "系统返回的类型未声明或为动态类型"
			}
			entry := unresolved(input, source, reason)
			for _, match := range matches {
				if match.Identifier != "" {
					entry.DiagnosticIdentifiers = union(entry.DiagnosticIdentifiers, match.Identifier)
				}
			}
			entries = addUnresolved(entries, indices, entry)
			continue
		}
		for _, match := range usable {
			id := "file:" + match.Identifier
			index, exists := indices[id]
			if !exists {
				index = len(entries)
				indices[id] = index
				entries = append(entries, Entry{ID: id, Association: association.Association{Kind: "file", Key: match.Identifier}, Name: match.Name, Resolved: true, Extensions: []string{}, MIMETypes: []string{}, Sources: []Source{}, DiagnosticIdentifiers: []string{}})
			}
			entry := &entries[index]
			entry.Extensions = union(entry.Extensions, append([]string{extension}, match.Extensions...)...)
			entry.MIMETypes = union(entry.MIMETypes, match.MIMETypes...)
			entry.Sources = appendSource(entry.Sources, source)
		}
	}
	return entries, nil
}

func appendSource(sources []Source, source Source) []Source {
	for _, existing := range sources {
		if existing == source {
			return sources
		}
	}
	return append(sources, source)
}

func unresolved(input Input, source Source, reason string) Entry {
	raw := source.NormalizedInput
	kind := "file"
	if input.Kind == "scheme" {
		kind = "scheme"
	}
	return Entry{ID: fmt.Sprintf("unresolved:%s:%s", input.Kind, raw), Association: association.Association{Kind: kind}, Name: input.Label, Extensions: []string{}, MIMETypes: []string{}, Sources: []Source{source}, UnresolvedReason: reason, DiagnosticIdentifiers: []string{}}
}

func union(values []string, additions ...string) []string {
	for _, addition := range additions {
		found := false
		for _, value := range values {
			if value == addition {
				found = true
				break
			}
		}
		if !found {
			values = append(values, addition)
		}
	}
	return values
}

func addUnresolved(entries []Entry, indices map[string]int, entry Entry) []Entry {
	if index, exists := indices[entry.ID]; exists {
		entries[index].Sources = appendSource(entries[index].Sources, entry.Sources[0])
		entries[index].DiagnosticIdentifiers = union(entries[index].DiagnosticIdentifiers, entry.DiagnosticIdentifiers...)
		return entries
	}
	indices[entry.ID] = len(entries)
	return append(entries, entry)
}
