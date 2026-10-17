package mcp

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

const (
	mcpPath         = "/mcp"
	mcpHost         = "127.0.0.1"
	maxRequestBytes = 1_000_000
	serverName      = "kamehadb-mcp"
	serverVersion   = "1.0.0"
)

// serverState is the per-request tool dispatch context.
type serverState struct {
	st      *store.Store
	manager *AdapterManager
}

// Status mirrors McpListenerStatus.
type Status struct {
	Status   string `json:"status"` // listening | unavailable | stopped
	Port     int64  `json:"port"`
	Endpoint string `json:"endpoint"`
	Message  string `json:"message,omitempty"`
}

// SettingsResponse is the credential-free settings snapshot — except token,
// which the desktop app is allowed to display (same as the TS route).
type SettingsResponse struct {
	Status          string           `json:"status"`
	Port            int64            `json:"port"`
	Endpoint        string           `json:"endpoint"`
	Token           string           `json:"token"`
	HistoryEnabled  bool             `json:"historyEnabled"`
	EnabledProfiles []map[string]any `json:"enabledProfiles"`
	Message         string           `json:"message,omitempty"`
}

// Runtime owns the dedicated loopback MCP listener and its lifecycle.
type Runtime struct {
	st      *store.Store
	Manager *AdapterManager

	mu      sync.Mutex
	server  *http.Server
	port    int64
	token   string
	status  string
	message string
}

// NewRuntime loads settings and restores ready-account credentials from
// local storage — the McpRuntime constructor.
func NewRuntime(st *store.Store) (*Runtime, error) {
	settings, err := st.GetMCPSettings()
	if err != nil {
		return nil, err
	}
	r := &Runtime{
		st:      st,
		Manager: NewAdapterManager(st),
		port:    settings.Port,
		token:   settings.Token,
		status:  "stopped",
	}
	accounts, err := st.ListMCPManagedAccounts()
	if err != nil {
		return nil, err
	}
	for _, account := range accounts {
		if account.State != store.MCPStateReady {
			continue
		}
		profile, err := st.GetProfile(account.ProfileID)
		if err != nil || profile == nil || !engines.IsMCPServerKind(profile.Kind) {
			continue
		}
		credential, err := st.LoadMCPManagedCredential(account.ProfileID)
		if err != nil || credential == nil ||
			!IsManagedCredentialForProfile(profile, account.AccountRef, credential) {
			logs.Warn("mcp", fmt.Sprintf("stored MCP credential for profile %s is missing or invalid", account.ProfileID))
			continue
		}
		r.Manager.SetCredential(account.ProfileID, credential)
	}
	return r, nil
}

func (r *Runtime) Endpoint() string {
	return fmt.Sprintf("http://%s:%d%s", mcpHost, r.port, mcpPath)
}

func (r *Runtime) Token() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.token
}

func (r *Runtime) GetStatus() Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	return Status{Status: r.status, Port: r.port, Endpoint: r.Endpoint(), Message: r.message}
}

// SettingsResponse mirrors runtime.settingsResponse().
func (r *Runtime) SettingsResponse() (*SettingsResponse, error) {
	profiles, err := r.st.ListProfiles()
	if err != nil {
		return nil, err
	}
	enabled := []map[string]any{}
	for i := range profiles {
		p := &profiles[i]
		if p.MCPEnabled && engines.IsMCPSupportedKind(p.Kind) {
			enabled = append(enabled, map[string]any{
				"id": p.ID, "name": p.Name, "kind": p.Kind, "database": p.Database,
			})
		}
	}
	status := r.GetStatus()
	historyEnabled := true
	if s, err := r.st.GetMCPSettings(); err == nil && s != nil {
		historyEnabled = s.HistoryEnabled
	}
	return &SettingsResponse{
		Status:          status.Status,
		Port:            status.Port,
		Endpoint:        status.Endpoint,
		Token:           r.Token(),
		HistoryEnabled:  historyEnabled,
		EnabledProfiles: enabled,
		Message:         status.Message,
	}, nil
}

// SetHistoryEnabled toggles persisted MCP call history and returns current settings.
func (r *Runtime) SetHistoryEnabled(enabled bool) (*SettingsResponse, error) {
	if _, err := r.st.SetMCPHistoryEnabled(enabled); err != nil {
		return nil, err
	}
	return r.SettingsResponse()
}

// Start binds the stored port; failure flips status to unavailable, never
// falls back to another port.
func (r *Runtime) Start() { r.bind(r.port) }

// Retry rebinds after an unavailable state.
func (r *Runtime) Retry() { r.bind(r.port) }

// UpdatePort persists the new port and rebinds.
func (r *Runtime) UpdatePort(port int64) error {
	if _, err := r.st.UpdateMCPPort(port); err != nil {
		return err
	}
	r.bind(port)
	return nil
}

func (r *Runtime) RotateToken() (string, error) {
	token, err := r.st.RotateMCPToken()
	if err != nil {
		return "", err
	}
	r.mu.Lock()
	r.token = token
	r.mu.Unlock()
	return token, nil
}

// bind serializes lifecycle through r.mu — same guarantee as the TS
// lifecycleQueue.
func (r *Runtime) bind(port int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.port = port
	if r.server != nil {
		r.server.Close()
		r.server = nil
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", mcpHost, port))
	if err != nil {
		r.status = "unavailable"
		if isAddrInUse(err) {
			r.message = fmt.Sprintf("MCP unavailable: port %d is in use", port)
		} else {
			r.message = "MCP unavailable: " + err.Error()
		}
		logs.Warn("mcp", r.message)
		return
	}
	if port == 0 {
		r.port = int64(listener.Addr().(*net.TCPAddr).Port)
	}
	state := &serverState{st: r.st, manager: r.Manager}
	r.server = &http.Server{Handler: r.handler(state)}
	go r.server.Serve(listener)
	r.status = "listening"
	r.message = ""
	logs.Info("mcp", fmt.Sprintf("MCP listener listening on 127.0.0.1:%d", r.port))
}

func isAddrInUse(err error) bool {
	var opErr *net.OpError
	if errors.As(err, &opErr) && opErr.Err != nil {
		return strings.Contains(opErr.Err.Error(), "address already in use")
	}
	return strings.Contains(err.Error(), "address already in use")
}

// Close stops the listener and every adapter.
func (r *Runtime) Close() {
	r.mu.Lock()
	if r.server != nil {
		r.server.Close()
		r.server = nil
	}
	r.status = "stopped"
	r.mu.Unlock()
	r.Manager.CloseAll()
}

func (r *Runtime) authorized(req *http.Request) bool {
	header := req.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return false
	}
	provided := strings.TrimSpace(header[len("Bearer "):])
	expected := r.Token()
	if len(provided) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func (r *Runtime) handler(state *serverState) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(mcpPath, func(w http.ResponseWriter, req *http.Request) {
		// Stateless transport: only POST carries JSON-RPC messages — no SSE
		// stream (GET) and no session to delete (DELETE).
		if req.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "METHOD_NOT_ALLOWED"})
			return
		}
		if !r.authorized(req) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "UNAUTHORIZED"})
			return
		}
		body, err := io.ReadAll(io.LimitReader(req.Body, maxRequestBytes+1))
		if err != nil || len(body) > maxRequestBytes {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "INVALID_JSON"})
			return
		}
		trimmed := strings.TrimSpace(string(body))
		if trimmed == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "INVALID_JSON"})
			return
		}
		var raw json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "INVALID_JSON"})
			return
		}
		r.serveRPC(w, req, state, raw)
	})
	// Everything else is a 404 — same as the TS pathname check.
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != mcpPath {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "NOT_FOUND"})
			return
		}
		mux.ServeHTTP(w, req)
	})
}
