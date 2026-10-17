package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/logs"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// IndexAllConnections ports ai/indexer.ts — embeds changed tables for every
// SQL profile at startup. Errors per profile are logged, never fatal.
func IndexAllConnections(ctx context.Context, s *store.Store, reg *engines.Registry) {
	settings, err := s.GetAISettings()
	if err != nil {
		logs.Error("ai-indexer", fmt.Sprintf("settings unavailable: %v", err))
		return
	}
	activeConfig, ok := settings.Providers[settings.ActiveProvider]
	if !ok || !activeConfig.Enabled {
		logs.Info("ai-indexer", "no active provider configured, skipping schema indexing")
		return
	}

	profiles, err := s.ListProfiles()
	if err != nil {
		logs.Error("ai-indexer", fmt.Sprintf("list profiles: %v", err))
		return
	}
	var sqlProfiles []store.Profile
	for _, p := range profiles {
		if engines.IsSQLKind(p.Kind) {
			sqlProfiles = append(sqlProfiles, p)
		}
	}
	if len(sqlProfiles) == 0 {
		logs.Info("ai-indexer", "no SQL connections to index")
		return
	}

	logs.Info("ai-indexer", fmt.Sprintf("indexing schemas for %d SQL connections", len(sqlProfiles)))
	for _, profile := range sqlProfiles {
		adapter, err := reg.Get(ctx, profile.ID)
		if err != nil {
			logs.Warn("ai-indexer", fmt.Sprintf("%s: adapter: %v", profile.Name, err))
			continue
		}
		count, err := BuildSchemaIndex(ctx, s, adapter, profile.ID, settings.ActiveProvider,
			ProviderConfig(activeConfig), false)
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "ECONNREFUSED") || strings.Contains(msg, "ENOTFOUND") || strings.Contains(msg, "connection refused") {
				logs.Warn("ai-indexer", fmt.Sprintf("%s: skipping — provider unavailable: %s", profile.Name, msg))
			} else {
				logs.Error("ai-indexer", fmt.Sprintf("%s: failed to index: %v", profile.Name, err))
			}
			continue
		}
		if count > 0 {
			logs.Info("ai-indexer", fmt.Sprintf("%s: indexed %d tables", profile.Name, count))
		} else {
			logs.Debug("ai-indexer", fmt.Sprintf("%s: schema unchanged", profile.Name))
		}
	}
	logs.Info("ai-indexer", "schema indexing complete")
}
