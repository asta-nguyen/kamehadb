package store

import (
	"database/sql"
	"strings"
	"sync"
	"time"
)

// defaultAIProvider mirrors DEFAULT_AI_PROVIDER in the old constants.ts.
const defaultAIProvider = "openai"

// Field name bound into the authenticated data of an encrypted provider key.
const aiAPIKeyField = "api_key"

// AIProviderConfig is one provider's persisted settings.
type AIProviderConfig struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
}

// AISettings mirrors the ai_settings + ai_provider_configs persistence.
type AISettings struct {
	ActiveProvider string                      `json:"activeProvider"`
	Providers      map[string]AIProviderConfig `json:"providers"`
}

func defaultAISettings() AISettings {
	return AISettings{
		ActiveProvider: defaultAIProvider,
		Providers: map[string]AIProviderConfig{
			"ollama-local": {Enabled: false, Model: "llama3.1", BaseURL: "http://localhost:11434/v1", APIKey: ""},
			"ollama-cloud": {Enabled: false, Model: "", BaseURL: "", APIKey: ""},
			"openai":       {Enabled: false, Model: "gpt-4o", BaseURL: "", APIKey: ""},
			"9router":      {Enabled: false, Model: "", BaseURL: "", APIKey: ""},
			"deepseek":     {Enabled: false, Model: "deepseek-chat", BaseURL: "https://api.deepseek.com/v1", APIKey: ""},
			"gemini":       {Enabled: false, Model: "gemini-2.5-flash", BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai", APIKey: ""},
		},
	}
}

// seedDefaultAIProviders inserts each provider row once (INSERT OR IGNORE).
func (s *Store) seedDefaultAIProviders() error {
	for provider, cfg := range defaultAISettings().Providers {
		enabled := 0
		if cfg.Enabled {
			enabled = 1
		}
		if _, err := s.db.Exec(`INSERT OR IGNORE INTO ai_provider_configs
			(provider, enabled, model, base_url, api_key) VALUES (?, ?, ?, ?, ?)`,
			provider, enabled, cfg.Model, cfg.BaseURL, cfg.APIKey); err != nil {
			return err
		}
	}
	return nil
}

// migrateLegacyAIConfig imports the ai_config key/value table from pre-1.x
// releases when no activeProvider was ever saved to ai_settings.
func (s *Store) migrateLegacyAIConfig() error {
	if s.tableSQL("ai_config") == "" {
		return nil
	}
	var legacyProvider string
	err := s.db.QueryRow(`SELECT value FROM ai_config WHERE key = 'provider'`).Scan(&legacyProvider)
	if err == sql.ErrNoRows || legacyProvider == "" {
		return nil
	}
	if err != nil {
		return err
	}
	var existing string
	err = s.db.QueryRow(`SELECT value FROM ai_settings WHERE key = 'activeProvider'`).Scan(&existing)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if existing != "" {
		return nil
	}

	readKey := func(key string) string {
		var v string
		if err := s.db.QueryRow(`SELECT value FROM ai_config WHERE key = ?`, key).Scan(&v); err != nil {
			return ""
		}
		return v
	}
	settings := defaultAISettings()
	mapped := "openai"
	if legacyProvider == "ollama" {
		mapped = "ollama-local"
	}
	settings.ActiveProvider = mapped
	cfg := settings.Providers[mapped]
	if v := readKey("model"); v != "" {
		cfg.Model = v
	}
	if v := readKey("baseUrl"); v != "" {
		cfg.BaseURL = v
	}
	if v := readKey("apiKey"); v != "" {
		cfg.APIKey = v
	}
	cfg.Enabled = true
	settings.Providers[mapped] = cfg
	return s.SaveAISettings(settings)
}

// normalizeAISettings trims values, strips trailing slashes on base URLs,
// and guarantees every provider key plus a valid activeProvider.
func normalizeAISettings(in AISettings) AISettings {
	normalized := defaultAISettings()
	for provider := range normalized.Providers {
		cfg, ok := in.Providers[provider]
		if !ok {
			cfg = normalized.Providers[provider]
		}
		normalized.Providers[provider] = AIProviderConfig{
			Enabled: cfg.Enabled,
			Model:   strings.TrimSpace(cfg.Model),
			BaseURL: strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"),
			APIKey:  strings.TrimSpace(cfg.APIKey),
		}
	}
	if _, ok := normalized.Providers[in.ActiveProvider]; !ok {
		normalized.ActiveProvider = defaultAIProvider
	} else {
		normalized.ActiveProvider = in.ActiveProvider
	}
	return normalized
}

// aiSettingsCache mirrors the sidecar's single-entry 5-minute LRU.
var aiSettingsCache = struct {
	sync.Mutex
	settings *AISettings
	expires  time.Time
}{}

// GetAISettings merges the activeProvider row with provider configs over
// the defaults, cached for 5 minutes like the TS LRU(1).
func (s *Store) GetAISettings() (*AISettings, error) {
	aiSettingsCache.Lock()
	defer aiSettingsCache.Unlock()
	if aiSettingsCache.settings != nil && time.Now().Before(aiSettingsCache.expires) {
		cached := *aiSettingsCache.settings
		return &cached, nil
	}

	settings := defaultAISettings()
	var active string
	err := s.db.QueryRow(`SELECT value FROM ai_settings WHERE key = 'activeProvider'`).Scan(&active)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if _, ok := settings.Providers[active]; ok && active != "" {
		settings.ActiveProvider = active
	}

	rows, err := s.db.Query(`SELECT provider, enabled, model, base_url, api_key FROM ai_provider_configs`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var provider, model string
		var enabled int64
		var baseURL, apiKey sql.NullString
		if err := rows.Scan(&provider, &enabled, &model, &baseURL, &apiKey); err != nil {
			return nil, err
		}
		if _, ok := settings.Providers[provider]; !ok {
			continue
		}
		apiKeyPlain := apiKey.String
		if apiKeyPlain != "" {
			if apiKeyPlain, err = s.decryptSecret(provider, aiAPIKeyField, apiKeyPlain); err != nil {
				return nil, err
			}
		}
		settings.Providers[provider] = AIProviderConfig{
			Enabled: enabled == 1,
			Model:   model,
			BaseURL: baseURL.String,
			APIKey:  apiKeyPlain,
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	aiSettingsCache.settings = &settings
	aiSettingsCache.expires = time.Now().Add(5 * time.Minute)
	cached := settings
	return &cached, nil
}

// SaveAISettings persists the normalized settings in one transaction.
// Secret encryption is performed before starting the transaction because the
// SQLite connection pool holds a single connection and encryption checks stored
// ciphertext presence against the database. (What / Why)
func (s *Store) SaveAISettings(settings AISettings) error {
	normalized := normalizeAISettings(settings)
	encryptedKeys := make(map[string]string, len(normalized.Providers))
	for provider, cfg := range normalized.Providers {
		apiKey, err := s.encryptSecret(provider, aiAPIKeyField, cfg.APIKey)
		if err != nil {
			return err
		}
		encryptedKeys[provider] = apiKey
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('activeProvider', ?)`,
		normalized.ActiveProvider); err != nil {
		tx.Rollback()
		return err
	}
	for provider, cfg := range normalized.Providers {
		enabled := 0
		if cfg.Enabled {
			enabled = 1
		}
		if _, err := tx.Exec(`INSERT OR REPLACE INTO ai_provider_configs
			(provider, enabled, model, base_url, api_key) VALUES (?, ?, ?, ?, ?)`,
			provider, enabled, cfg.Model, cfg.BaseURL, encryptedKeys[provider]); err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	aiSettingsCache.Lock()
	aiSettingsCache.settings = nil
	aiSettingsCache.expires = time.Time{}
	aiSettingsCache.Unlock()
	return nil
}
