package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Only an explicitly selected, disposable loopback test database is accepted.
func TestPostgresPersistenceSingletonMigrationAndRestrictedRole(t *testing.T) {
	dsn := os.Getenv("WABRIDGE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set WABRIDGE_TEST_DATABASE_URL to a disposable local messaging_test database")
	}
	u, err := url.Parse(dsn)
	if err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || u.Path != "/messaging_test" {
		t.Fatal("integration database must be loopback and named messaging_test")
	}
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	c := config{DatabaseURL: dsn, Schema: "wa_test_" + suffix, RuntimeRole: "wa_runtime_" + suffix, AccountID: "test-" + suffix}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	db, err := openDatabase(c)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	defer func() {
		db.ExecContext(context.Background(), `DROP SCHEMA IF EXISTS "`+c.Schema+`" CASCADE`)
		db.ExecContext(context.Background(), `DROP ROLE IF EXISTS "`+c.RuntimeRole+`"`)
	}()
	if err = migrate(ctx, c); err != nil {
		t.Fatal(err)
	}
	if err = migrate(ctx, c); err != nil {
		t.Fatalf("migration not repeatable: %v", err)
	}
	s, err := acquireStore(ctx, db, c.AccountID)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if !s.LeaseValid(ctx) {
		t.Fatal("singleton lease not held")
	}
	if second, err := acquireStore(ctx, db, c.AccountID); err == nil {
		second.Close()
		t.Fatal("second bridge acquired same account")
	}
	r := requestFixture()
	result, created, err := s.BeginOperation(ctx, r, fingerprint(r))
	if err != nil || !created || result.State != "Uncertain" {
		t.Fatalf("reservation failed: %+v %v", result, err)
	}
	if _, created, err = s.BeginOperation(ctx, r, fingerprint(r)); err != nil || created {
		t.Fatalf("operation replay failed: %v", err)
	}
	r.Text = "changed"
	if _, _, err = s.BeginOperation(ctx, r, fingerprint(r)); !errors.Is(err, errConflict) {
		t.Fatal("changed payload accepted")
	}
	if err = s.ConfirmDelivery(ctx, r.MessageID); err != nil {
		t.Fatal(err)
	}
	result, err = s.GetOperation(ctx, r.OperationID)
	if err != nil || result.State != "Sent" {
		t.Fatal("receipt did not reconcile uncertain operation")
	}
	e := eventEnvelope{EventID: "stable-event", Type: "message", Text: "synthetic text", OccurredAtUTC: time.Now().UTC()}
	if err = s.Enqueue(ctx, e); err != nil {
		t.Fatal(err)
	}
	if err = s.Enqueue(ctx, e); err != nil {
		t.Fatal(err)
	}
	if n, err := s.Pending(ctx); err != nil || n != 1 {
		t.Fatal("duplicate event queued")
	}
	if err = s.SaveState(ctx, "Unavailable", "Synthetic suspension", true); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = acquireStore(ctx, db, c.AccountID)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if !s.Suspended(ctx) {
		t.Fatal("suspension lost on restart")
	}
	seq, payload, err := s.NextEvent(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var recovered eventEnvelope
	if json.Unmarshal(payload, &recovered) != nil || !recovered.IsHistory {
		t.Fatal("pending live event was not fenced as historical on restart")
	}
	if err = s.Delivered(ctx, seq); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.Pending(ctx); n != 0 {
		t.Fatal("delivery not recorded")
	}
	var cleared string
	if err = db.QueryRowContext(ctx, `SELECT payload::text FROM bridge_events WHERE sequence=$1`, seq).Scan(&cleared); err != nil || cleared != "{}" {
		t.Fatal("delivered private payload was retained")
	}
	// Restricted runtime may read its transport tables but cannot create schema objects.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.ExecContext(ctx, `SET LOCAL ROLE "`+c.RuntimeRole+`"`); err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	var n int
	if err = tx.QueryRowContext(ctx, `SELECT count(*) FROM bridge_operations`).Scan(&n); err != nil {
		tx.Rollback()
		t.Fatal("runtime lacks transport access")
	}
	if _, err = tx.ExecContext(ctx, `CREATE TABLE forbidden_runtime_ddl(id integer)`); err == nil {
		tx.Rollback()
		t.Fatal("runtime unexpectedly owns DDL rights")
	}
	tx.Rollback()

	// Delivery persists across transient failures and never follows redirects with the Bearer secret.
	var trapCalls atomic.Int32
	trap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { trapCalls.Add(1); w.WriteHeader(200) }))
	defer trap.Close()
	var calls atomic.Int32
	attempts := make(chan int32, 4)
	secret := strings.Repeat("s", 32)
	canonicalHost := "api.longbeach.quebranunca.com.br"
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(io.LimitReader(r.Body, 4096))
		var event eventEnvelope
		if r.Host != canonicalHost || r.Header.Get("Authorization") != "Bearer "+secret || json.Unmarshal(body, &event) != nil || event.EventID != "callback-event" {
			w.WriteHeader(400)
			return
		}
		n := calls.Add(1)
		attempts <- n
		if n == 1 {
			w.WriteHeader(503)
		} else if n == 2 {
			w.Header().Set("Location", trap.URL)
			w.WriteHeader(302)
		} else {
			w.WriteHeader(202)
		}
	}))
	defer endpoint.Close()
	e.EventID = "callback-event"
	if err = s.Enqueue(ctx, e); err != nil {
		t.Fatal(err)
	}
	deliveryCtx, stopDelivery := context.WithCancel(ctx)
	defer stopDelivery()
	done := make(chan struct{})
	go func() {
		defer close(done)
		deliverEvents(deliveryCtx, config{BackendURL: endpoint.URL, BackendHost: canonicalHost, Secret: secret}, s)
	}()
	for range 3 {
		select {
		case <-attempts:
		case <-time.After(8 * time.Second):
			t.Fatal("event was not retried")
		}
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		n, err := s.Pending(ctx)
		if err == nil && n == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("durable HTTP 202 was not acknowledged")
		}
		time.Sleep(10 * time.Millisecond)
	}
	stopDelivery()
	<-done
	if trapCalls.Load() != 0 {
		t.Fatal("private event delivery followed redirect")
	}
}
