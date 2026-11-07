package discovery

import (
	"strings"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
)

type ReparseResult struct {
	Token string `json:"token"`
	// Status is matched, ambiguous or missing. Only matched has an EntryID,
	// which may still refer to an unresolved entry in the completed snapshot.
	Status  string `json:"status"`
	EntryID string `json:"entryID,omitempty"`
}

type reparseRequest struct {
	entry catalog.Entry
	token string
}

// Reparse accepts immediately and publishes the correspondence in a completed
// snapshot. If a scan is running, the request belongs to the queued full scan.
// Token is an opaque caller value used to ignore results after navigation.
func (s *Service) Reparse(entry catalog.Entry, token string) Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry.Sources = append([]catalog.Source{}, entry.Sources...)
	s.reparses = append(s.reparses, reparseRequest{entry: entry, token: token})
	return s.startScanLocked()
}

const unavailablePrefix = "unavailable:"

func unavailableEntry(saved config.ManualAssociation) catalog.Entry {
	return catalog.Entry{
		ID: unavailablePrefix + saved.SelectedID, Association: association.Association{Kind: "file"},
		Name: saved.Input.Label, Extensions: []string{}, MIMETypes: []string{},
		Sources:          []catalog.Source{{Kind: "manual", InputKind: saved.Input.Kind, RawInput: saved.Input.Value}},
		UnresolvedReason: "先前选择的类型现在无法解析：" + saved.SelectedID, DiagnosticIdentifiers: []string{saved.SelectedID},
	}
}

func matchReparse(request reparseRequest, entries []catalog.Entry) ReparseResult {
	result := ReparseResult{Token: request.token, Status: "missing"}
	original := request.entry
	savedID, unavailable := strings.CutPrefix(original.ID, unavailablePrefix)
	if unavailable || original.Resolved {
		if !unavailable {
			savedID = original.ID
		}
		// An explicit choice follows its identity, even if another source now
		// provides it. Its unavailable placeholder is only the fallback.
		for _, id := range []string{savedID, unavailablePrefix + savedID} {
			for _, entry := range entries {
				if entry.ID == id {
					result.Status, result.EntryID = "matched", id
					return result
				}
			}
		}
		return result
	}
	for _, entry := range entries {
		if entry.ID != original.ID && !sharesSource(original.Sources, entry.Sources) {
			continue
		}
		if result.Status == "matched" {
			result.Status, result.EntryID = "ambiguous", ""
			return result
		}
		result.Status, result.EntryID = "matched", entry.ID
	}
	return result
}

func sharesSource(original, current []catalog.Source) bool {
	for _, a := range original {
		for _, b := range current {
			if a.Kind == b.Kind && a.InputKind == b.InputKind && a.RawInput == b.RawInput && a.AppPath == b.AppPath && a.Origin == b.Origin {
				return true
			}
		}
	}
	return false
}
