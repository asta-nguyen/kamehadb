package api

import (
	"errors"

	"github.com/asta-nguyen/kamehadb/internal/store"
)

// QueryHistoryService exposes saved-query history over Wails bindings.
type QueryHistoryService struct {
	s *store.Store
}

func NewQueryHistoryService(s *store.Store) *QueryHistoryService {
	return &QueryHistoryService{s: s}
}

// SaveQueryHistoryInput mirrors SaveQueryHistorySchema in shared.
type SaveQueryHistoryInput struct {
	Query      string `json:"query"`
	DurationMs *int64 `json:"durationMs,omitempty"`
	RowCount   *int64 `json:"rowCount,omitempty"`
}

func (q *QueryHistoryService) SaveQueryHistory(connectionID string, input SaveQueryHistoryInput) (*store.QueryHistoryEntry, error) {
	if input.Query == "" {
		return nil, errors.New("query is required")
	}
	return q.s.SaveQueryHistory(connectionID, input.Query, input.DurationMs, input.RowCount)
}

func (q *QueryHistoryService) GetQueryHistory(connectionID string, limit int, favoritesOnly bool) ([]store.QueryHistoryEntry, error) {
	return q.s.GetQueryHistory(connectionID, limit, favoritesOnly)
}

// UpdateQueryHistoryInput mirrors UpdateQueryHistorySchema in shared.
type UpdateQueryHistoryInput struct {
	Favorite *bool   `json:"favorite,omitempty"`
	Name     *string `json:"name,omitempty"`
}

func (q *QueryHistoryService) UpdateQueryHistory(id string, input UpdateQueryHistoryInput) error {
	return q.s.UpdateQueryHistory(id, input.Favorite, input.Name)
}

func (q *QueryHistoryService) DeleteQueryHistory(id string) error {
	return q.s.DeleteQueryHistory(id)
}
