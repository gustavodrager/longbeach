package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

func newHandler(c config, e *engine) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /v1/status", func(w http.ResponseWriter, r *http.Request) {
		if !c.Enabled || e == nil {
			writeJSON(w, 200, status{State: "Unavailable", Detail: "Bridge disabled", UpdatedAtUTC: time.Now().UTC()})
			return
		}
		writeJSON(w, 200, e.transport.Status())
	})
	for _, route := range []string{"POST /v1/pair", "POST /v1/reconnect"} {
		mux.HandleFunc(route, func(w http.ResponseWriter, r *http.Request) {
			if !c.Enabled || e == nil {
				writeJSON(w, 503, map[string]string{"error": "Bridge disabled"})
				return
			}
			var err error
			if r.URL.Path == "/v1/pair" {
				err = e.transport.Pair(r.Context())
			} else {
				err = e.transport.Reconnect(r.Context())
			}
			if err != nil {
				writeJSON(w, 409, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, 200, e.transport.Status())
		})
	}
	mux.HandleFunc("POST /v1/messages", func(w http.ResponseWriter, r *http.Request) {
		if !c.Enabled || e == nil {
			writeJSON(w, 503, map[string]string{"error": "Bridge disabled"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, int64(15*1024*1024))
		defer r.Body.Close()
		var input sendRequest
		d := json.NewDecoder(r.Body)
		d.DisallowUnknownFields()
		if err := d.Decode(&input); err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid message payload"})
			return
		}
		var extra any
		if d.Decode(&extra) != io.EOF {
			writeJSON(w, 400, map[string]string{"error": "Only one JSON value is allowed"})
			return
		}
		if err := validateRequest(input); err != nil {
			writeJSON(w, 400, map[string]string{"error": err.Error()})
			return
		}
		result, err := e.Send(input)
		if errors.Is(err, errConflict) {
			writeJSON(w, 409, map[string]string{"error": err.Error()})
			return
		}
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "Send operation could not be recorded"})
			return
		}
		writeJSON(w, 200, result)
	})
	mux.HandleFunc("GET /v1/messages/{operationId}", func(w http.ResponseWriter, r *http.Request) {
		if !c.Enabled || e == nil {
			writeJSON(w, 503, map[string]string{"error": "Bridge disabled"})
			return
		}
		id := r.PathValue("operationId")
		if _, err := uuid.Parse(id); err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid operationId"})
			return
		}
		result, err := e.store.GetOperation(r.Context(), id)
		if errors.Is(err, errNotFound) {
			writeJSON(w, 404, map[string]string{"error": "Operation not found"})
			return
		}
		if err != nil {
			writeJSON(w, 503, map[string]string{"error": "Operation unavailable"})
			return
		}
		writeJSON(w, 200, result)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path != "/health/live" {
			authorization := r.Header.Get("Authorization")
			candidate := strings.TrimPrefix(authorization, "Bearer ")
			want := sha256.Sum256([]byte(c.Secret))
			got := sha256.Sum256([]byte(candidate))
			if len(c.Secret) < 32 || !strings.HasPrefix(authorization, "Bearer ") || subtle.ConstantTimeCompare(want[:], got[:]) != 1 {
				w.Header().Set("WWW-Authenticate", "Bearer")
				writeJSON(w, 401, map[string]string{"error": "Unauthorized"})
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(value)
}
