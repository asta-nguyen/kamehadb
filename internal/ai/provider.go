// Package ai ports the sidecar's ai/provider.ts: OpenAI-compatible chat
// providers, embeddings with a deterministic local fallback, and the schema
// context/index machinery the chat route builds prompts from.
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
)

// ChatMessage mirrors AIChatMessage in shared.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ProviderConfig is the per-provider settings record (enabled, model,
// baseUrl, apiKey) — same shape as store.AIProviderConfig.
type ProviderConfig struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
}

type resolvedConfig struct {
	APIKey  string
	Model   string
	BaseURL string
}

// ResolveConfig mirrors resolveProviderConfig: provider-specific defaults
// applied over the persisted config.
func ResolveConfig(provider string, config ProviderConfig) resolvedConfig {
	baseURL := strings.TrimRight(config.BaseURL, "/")
	apiKey := config.APIKey

	switch provider {
	case "ollama-local":
		if baseURL == "" {
			baseURL = "http://localhost:11434/v1"
		}
		if apiKey == "" {
			apiKey = "ollama"
		}
	case "openai":
		if baseURL == "" {
			baseURL = "https://api.openai.com/v1"
		}
	case "deepseek":
		if baseURL == "" {
			baseURL = "https://api.deepseek.com/v1"
		}
	case "gemini":
		if baseURL == "" {
			baseURL = "https://generativelanguage.googleapis.com/v1beta/openai"
		}
	}
	return resolvedConfig{APIKey: apiKey, Model: strings.TrimSpace(config.Model), BaseURL: baseURL}
}

// ValidateConfig mirrors validateProviderConfig — returns "" when valid.
func ValidateConfig(provider string, config ProviderConfig) string {
	if config.Model == "" {
		return "Model is required"
	}
	switch provider {
	case "ollama-local":
		return ""
	case "openai":
		if config.APIKey == "" {
			return "API key is required for OpenAI"
		}
	case "ollama-cloud":
		if config.BaseURL == "" {
			return "Base URL is required for Ollama Cloud"
		}
		if config.APIKey == "" {
			return "API key is required for Ollama Cloud"
		}
	case "9router":
		if config.BaseURL == "" {
			return "Base URL is required for 9Router"
		}
		if config.APIKey == "" {
			return "API key is required for 9Router"
		}
	case "deepseek":
		if config.APIKey == "" {
			return "API key is required for DeepSeek"
		}
	case "gemini":
		if config.APIKey == "" {
			return "API key is required for Gemini"
		}
	}
	return ""
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

func postChat(ctx context.Context, rc resolvedConfig, messages []ChatMessage, stream bool) (*http.Response, error) {
	body, err := json.Marshal(chatRequest{Model: rc.Model, Messages: messages, Stream: stream})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rc.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if rc.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+rc.APIKey)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		defer res.Body.Close()
		errBody, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		msg := strings.TrimSpace(string(errBody))
		if msg == "" {
			msg = res.Status
		}
		return nil, fmt.Errorf("AI API error (%d): %s", res.StatusCode, msg)
	}
	return res, nil
}

// ChatResult mirrors the TS ChatResult.
type ChatResult struct {
	Content      string `json:"content"`
	InputTokens  int    `json:"inputTokens"`
	OutputTokens int    `json:"outputTokens"`
}

// Chat performs a non-streaming completion.
func Chat(ctx context.Context, provider string, config ProviderConfig, messages []ChatMessage) (*ChatResult, error) {
	rc := ResolveConfig(provider, config)
	res, err := postChat(ctx, rc, messages, false)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var body struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage *struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return nil, err
	}
	content := ""
	if len(body.Choices) > 0 {
		content = body.Choices[0].Message.Content
	}
	inputTokens := 0
	if body.Usage != nil {
		inputTokens = body.Usage.PromptTokens
	}
	if inputTokens == 0 {
		total := 0
		for _, m := range messages {
			total += len(m.Content)
		}
		inputTokens = (total + 3) / 4
	}
	outputTokens := 0
	if body.Usage != nil {
		outputTokens = body.Usage.CompletionTokens
	}
	if outputTokens == 0 {
		outputTokens = (len(content) + 3) / 4
	}
	return &ChatResult{Content: content, InputTokens: inputTokens, OutputTokens: outputTokens}, nil
}

// ChatStream yields content deltas from a streaming completion. It mirrors
// chatStream in provider.ts: SSE `data:` lines, `[DONE]` terminator, malformed
// JSON lines skipped.
func ChatStream(ctx context.Context, provider string, config ProviderConfig, messages []ChatMessage, yield func(delta string)) error {
	rc := ResolveConfig(provider, config)
	res, err := postChat(ctx, rc, messages, true)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		trimmed := strings.TrimSpace(scanner.Text())
		if trimmed == "" || !strings.HasPrefix(trimmed, "data: ") {
			continue
		}
		data := trimmed[6:]
		if data == "[DONE]" {
			return nil
		}
		var parsed struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &parsed); err != nil {
			continue
		}
		if len(parsed.Choices) > 0 && parsed.Choices[0].Delta.Content != "" {
			yield(parsed.Choices[0].Delta.Content)
		}
	}
	return scanner.Err()
}

// localEmbedding is the deterministic 256-dim hashing fallback ported
// verbatim from provider.ts (same token split, same hash).
func localEmbedding(text string) []float64 {
	const dimensions = 256
	vec := make([]float64, dimensions)
	for _, token := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	}) {
		hash := int32(0)
		for _, r := range token {
			hash = (hash << 5) - hash + int32(r)
		}
		idx := int(math.Abs(float64(hash))) % dimensions
		vec[idx] += 1
	}
	var mag float64
	for _, v := range vec {
		mag += v * v
	}
	mag = math.Sqrt(mag)
	if mag > 0 {
		for i := range vec {
			vec[i] /= mag
		}
	}
	return vec
}

// CreateEmbedding calls the provider's /embeddings endpoint and falls back to
// localEmbedding on any failure, like the TS original.
func CreateEmbedding(ctx context.Context, provider string, config ProviderConfig, text string, embeddingModel string) []float64 {
	rc := ResolveConfig(provider, config)
	model := embeddingModel
	if model == "" {
		if provider == "9router" {
			model = "nomic-embed-text"
		} else {
			model = config.Model
		}
	}

	payload, err := json.Marshal(map[string]any{"model": model, "input": text})
	if err != nil {
		return localEmbedding(text)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rc.BaseURL+"/embeddings", bytes.NewReader(payload))
	if err != nil {
		return localEmbedding(text)
	}
	req.Header.Set("Content-Type", "application/json")
	if rc.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+rc.APIKey)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return localEmbedding(text)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return localEmbedding(text)
	}
	var body struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil || len(body.Data) == 0 || len(body.Data[0].Embedding) == 0 {
		return localEmbedding(text)
	}
	return body.Data[0].Embedding
}
