package discovery

import (
	"fmt"
	"github.com/sunven/default-apps/internal/catalog"
)

type Declaration struct {
	Origin           string          `json:"origin"`
	Role             string          `json:"role"`
	Rank             string          `json:"rank"`
	Handling         bool            `json:"handling"`
	Inputs           []catalog.Input `json:"inputs"`
	LegacyExtensions []string        `json:"legacyExtensions"`
	MIMETypes        []string        `json:"mimeTypes"`
	OSTypes          []string        `json:"osTypes"`
}
type TypeDefinition struct {
	Identifier string   `json:"identifier"`
	Name       string   `json:"name"`
	Origin     string   `json:"origin"`
	Extensions []string `json:"extensions"`
	MIMETypes  []string `json:"mimeTypes"`
	ConformsTo []string `json:"conformsTo"`
}

func declarations(bundle Bundle) ([]Declaration, []TypeDefinition, []Issue) {
	issues := []Issue{}
	result := []Declaration{}
	definitions := []TypeDefinition{}
	issue := func(origin, message string) {
		issues = append(issues, Issue{Path: bundle.App.Path, Origin: origin, Message: message})
	}
	stringsAt := func(value any, origin string) []string {
		values := []string{}
		if value == nil {
			return values
		}
		if single, ok := value.(string); ok {
			return append(values, single)
		}
		array, ok := value.([]any)
		if !ok {
			issue(origin, "声明字段应为字符串或字符串列表")
			return values
		}
		for _, item := range array {
			if text, ok := item.(string); ok {
				values = append(values, text)
			} else {
				issue(origin, "声明列表包含非字符串值")
			}
		}
		return values
	}
	type plistEntry struct {
		index int
		value map[string]any
	}
	dictionaries := func(key string) []plistEntry {
		result := []plistEntry{}
		value, present := bundle.Info[key]
		if !present {
			return result
		}
		array, ok := value.([]any)
		if !ok {
			issue(key, "声明应为字典列表")
			return result
		}
		for index, value := range array {
			if dict, ok := value.(map[string]any); ok {
				result = append(result, plistEntry{index: index, value: dict})
			} else {
				issue(fmt.Sprintf("%s[%d]", key, index), "声明不是字典")
			}
		}
		return result
	}
	definitionIndex := map[string]int{}
	for _, key := range []string{"UTImportedTypeDeclarations", "UTExportedTypeDeclarations"} {
		for _, item := range dictionaries(key) {
			index, dict := item.index, item.value
			origin := fmt.Sprintf("%s[%d]", key, index)
			id, _ := dict["UTTypeIdentifier"].(string)
			if id == "" {
				issue(origin, "类型定义缺少标识符")
				continue
			}
			name, _ := dict["UTTypeDescription"].(string)
			tags, _ := dict["UTTypeTagSpecification"].(map[string]any)
			definition := TypeDefinition{Identifier: id, Name: name, Origin: origin, Extensions: stringsAt(tags["public.filename-extension"], origin), MIMETypes: stringsAt(tags["public.mime-type"], origin), ConformsTo: stringsAt(dict["UTTypeConformsTo"], origin)}
			if old, ok := definitionIndex[id]; ok {
				definitions[old] = definition
			} else {
				definitionIndex[id] = len(definitions)
				definitions = append(definitions, definition)
			}
		}
	}
	for _, key := range []string{"CFBundleDocumentTypes", "CFBundleURLTypes"} {
		for _, item := range dictionaries(key) {
			index, dict := item.index, item.value
			origin := fmt.Sprintf("%s[%d]", key, index)
			role, _ := dict["CFBundleTypeRole"].(string)
			rank, _ := dict["LSHandlerRank"].(string)
			d := Declaration{Origin: origin, Role: role, Rank: rank, Handling: role != "None" && rank != "None", Inputs: []catalog.Input{}, LegacyExtensions: stringsAt(dict["CFBundleTypeExtensions"], origin), MIMETypes: stringsAt(dict["CFBundleTypeMIMETypes"], origin), OSTypes: stringsAt(dict["CFBundleTypeOSTypes"], origin)}
			if key == "CFBundleDocumentTypes" && role == "" {
				issue(origin, "文稿声明缺少角色，保留可解析关联")
			}
			label, _ := dict["CFBundleTypeName"].(string)
			if label == "" {
				label = bundle.App.Name
			}
			add := func(kind, value, problem string) {
				d.Inputs = append(d.Inputs, catalog.Input{Kind: kind, Value: value, Label: label, Source: "declaration", AppPath: bundle.App.Path, Origin: origin, Role: role, Rank: rank, Problem: problem})
			}
			if key == "CFBundleURLTypes" {
				for _, scheme := range stringsAt(dict["CFBundleURLSchemes"], origin) {
					add("scheme", scheme, "")
				}
			} else if raw, present := dict["LSItemContentTypes"]; present {
				identifiers := stringsAt(raw, origin)
				for _, id := range identifiers {
					add("identifier", id, "")
				}
				if len(identifiers) == 0 {
					issue(origin, "现代类型声明为空或损坏；未使用旧扩展名替代")
					add("declaration", origin, "现代类型声明为空或损坏")
				}
			} else {
				for _, ext := range d.LegacyExtensions {
					problem := ""
					if ext == "*" || ext == "****" {
						problem = "宽泛文稿声明没有具体类型身份"
					}
					add("extension", ext, problem)
				}
				for _, mime := range d.MIMETypes {
					add("mime", mime, "")
				}
				if len(d.LegacyExtensions) == 0 && len(d.MIMETypes) == 0 {
					for _, value := range d.OSTypes {
						add("ostype", value, "旧式 OSType 声明尚未解析")
					}
				}
			}
			result = append(result, d)
		}
	}
	return result, definitions, issues
}
