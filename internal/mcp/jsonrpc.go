package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

// Minimal Streamable-HTTP JSON-RPC surface matching the TS SDK transport in
// enableJsonResponse mode: POST-only, plain-JSON responses, no SSE stream.
// Surface: initialize, ping, tools/list, tools/call, notifications/*.

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return e.Message }

const (
	rpcParseError     = -32700
	rpcInvalidRequest = -32600
	rpcMethodNotFound = -32601
	rpcInvalidParams  = -32602
)

var protocolVersionDefault = "2025-03-26"

// serveRPC handles one POST body — a single request, a notification, or a
// batch. Notification-only payloads answer 202 with an empty body.
func (r *Runtime) serveRPC(w http.ResponseWriter, req *http.Request, state *serverState, raw json.RawMessage) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		writeJSON(w, http.StatusBadRequest, rpcResponse{
			JSONRPC: "2.0", Error: &rpcError{Code: rpcParseError, Message: "Parse error"},
		})
		return
	}
	if trimmed[0] == '[' {
		var batch []json.RawMessage
		if err := json.Unmarshal(raw, &batch); err != nil || len(batch) == 0 {
			writeJSON(w, http.StatusOK, rpcResponse{
				JSONRPC: "2.0", Error: &rpcError{Code: rpcInvalidRequest, Message: "Invalid Request"},
			})
			return
		}
		var responses []rpcResponse
		for _, item := range batch {
			if resp := r.handleOne(req.Context(), item, state); resp != nil {
				responses = append(responses, *resp)
			}
		}
		if len(responses) == 0 {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSON(w, http.StatusOK, responses)
		return
	}
	if resp := r.handleOne(req.Context(), raw, state); resp != nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}
	// Notification-only body.
	w.WriteHeader(http.StatusAccepted)
}

// handleOne dispatches one JSON-RPC message; returns nil for notifications.
func (r *Runtime) handleOne(ctx context.Context, raw json.RawMessage, state *serverState) *rpcResponse {
	var req rpcRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return &rpcResponse{JSONRPC: "2.0", Error: &rpcError{Code: rpcParseError, Message: "Parse error"}}
	}
	if strings.HasPrefix(req.Method, "notifications/") {
		return nil
	}
	resp := &rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if req.ID == nil {
		resp.Error = &rpcError{Code: rpcInvalidRequest, Message: "Invalid Request"}
		return resp
	}
	result, err := r.callMethod(ctx, req.Method, req.Params, state)
	if err != nil {
		if rpcErr, ok := err.(*rpcError); ok {
			resp.Error = rpcErr
		} else {
			resp.Error = &rpcError{Code: rpcInvalidParams, Message: err.Error()}
		}
		return resp
	}
	resp.Result = result
	return resp
}

func (r *Runtime) callMethod(ctx context.Context, method string, params json.RawMessage, state *serverState) (any, error) {
	switch method {
	case "initialize":
		version := protocolVersionDefault
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		if len(params) > 0 {
			_ = json.Unmarshal(params, &p)
		}
		if p.ProtocolVersion != "" {
			version = p.ProtocolVersion
		}
		return map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": serverName, "version": serverVersion},
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		return map[string]any{"tools": state.tools()}, nil
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(params, &p); err != nil {
			return nil, &rpcError{Code: rpcInvalidParams, Message: "Invalid params"}
		}
		handler := state.dispatch(p.Name)
		if handler == nil {
			return nil, &rpcError{Code: rpcInvalidParams, Message: "Unknown tool: " + p.Name}
		}
		payload, err := handler(ctx, p.Arguments)
		if err != nil {
			return errorContent(err), nil
		}
		return jsonContent(payload), nil
	}
	return nil, &rpcError{Code: rpcMethodNotFound, Message: "Method not found"}
}
