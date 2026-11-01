package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type postgresStore struct {
	db      *sql.DB
	lock    *sql.Conn
	lockPID int
	account string
}

func openDatabase(c config) (*sql.DB, error) {
	pc, err := pgx.ParseConfig(c.DatabaseURL)
	if err != nil {
		return nil, errors.New("invalid bridge database configuration")
	}
	pc.RuntimeParams["search_path"] = c.Schema
	db := stdlib.OpenDB(*pc)
	db.SetMaxOpenConns(6)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(0)
	return db, nil
}

func migrate(ctx context.Context, c config) error {
	db, err := openDatabase(c)
	if err != nil {
		return err
	}
	defer db.Close()
	conn, err := db.Conn(ctx)
	if err != nil {
		return errors.New("bridge database unavailable")
	}
	defer conn.Close()
	if _, err = conn.ExecContext(ctx, `SELECT pg_advisory_lock(hashtextextended($1,0))`, c.Schema+":migration"); err != nil {
		return errors.New("could not lock bridge migrations")
	}
	defer conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock(hashtextextended($1,0))`, c.Schema+":migration")
	if _, err = conn.ExecContext(ctx, `CREATE SCHEMA IF NOT EXISTS "`+c.Schema+`"`); err != nil {
		return errors.New("could not prepare bridge schema")
	}
	container := sqlstore.NewWithDB(db, "postgres", waLog.Noop)
	if err = container.Upgrade(ctx); err != nil {
		return fmt.Errorf("whatsmeow migration failed: %w", err)
	}
	_, err = db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS bridge_version (version integer PRIMARY KEY CHECK(version=1));
INSERT INTO bridge_version VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS bridge_operations (
 account text NOT NULL, operation_id uuid NOT NULL, message_id text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('Sent','Uncertain','Failed')), error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account,operation_id), UNIQUE(account,message_id));
CREATE TABLE IF NOT EXISTS bridge_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account text NOT NULL, event_id text NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 UNIQUE(account,event_id));
CREATE INDEX IF NOT EXISTS bridge_events_pending ON bridge_events(account,sequence) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS bridge_account_state (
 account text PRIMARY KEY, state text NOT NULL, detail text NOT NULL DEFAULT '', suspended boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());`)
	if err != nil {
		return errors.New("bridge migration failed")
	}
	// The login is provisioned separately by the operator, with this NOLOGIN role granted to it.
	var exists bool
	if err = db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1)`, c.RuntimeRole).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		if _, err = db.ExecContext(ctx, `CREATE ROLE "`+c.RuntimeRole+`" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`); err != nil {
			return errors.New("create the dedicated runtime role before migration, or grant the migrator CREATEROLE")
		}
	}
	for _, statement := range []string{
		`REVOKE ALL ON SCHEMA "` + c.Schema + `" FROM PUBLIC`,
		`GRANT USAGE ON SCHEMA "` + c.Schema + `" TO "` + c.RuntimeRole + `"`,
		`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "` + c.Schema + `" TO "` + c.RuntimeRole + `"`,
		`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "` + c.Schema + `" TO "` + c.RuntimeRole + `"`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			return errors.New("bridge runtime grants failed")
		}
	}
	return nil
}

func acquireStore(ctx context.Context, db *sql.DB, account string) (*postgresStore, error) {
	var version int
	if err := db.QueryRowContext(ctx, `SELECT version FROM bridge_version`).Scan(&version); err != nil || version != 1 {
		return nil, errors.New("bridge schema is missing or incompatible; run the explicit migrate command")
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, errors.New("bridge database unavailable")
	}
	var locked bool
	var pid int
	if err = conn.QueryRowContext(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0)),pg_backend_pid()`, "longbeach:whatsapp:"+account).Scan(&locked, &pid); err != nil || !locked {
		conn.Close()
		return nil, errors.New("another bridge owns this account, or its lock cannot be acquired")
	}
	s := &postgresStore{db: db, lock: conn, lockPID: pid, account: account}
	// A process may have died after submitting to WhatsApp but before recording its acknowledgement.
	_, err = db.ExecContext(ctx, `UPDATE bridge_operations SET error='Previous send requires verification',updated_at=now() WHERE account=$1 AND state='Uncertain'`, account)
	if err != nil {
		s.Close()
		return nil, errors.New("could not recover bridge operations")
	}
	_, err = db.ExecContext(ctx, `UPDATE bridge_events SET payload=jsonb_set(payload,'{isHistory}','true'::jsonb) WHERE account=$1 AND delivered_at IS NULL AND payload->>'type'='message'`, account)
	if err != nil {
		s.Close()
		return nil, errors.New("could not fence old pending messages")
	}
	return s, nil
}

func (s *postgresStore) Close() {
	if s.lock != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		s.lock.ExecContext(ctx, `SELECT pg_advisory_unlock(hashtextextended($1,0))`, "longbeach:whatsapp:"+s.account)
		s.lock.Close()
	}
}

func (s *postgresStore) LeaseValid(ctx context.Context) bool {
	var pid int
	return s.lock != nil && s.lock.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&pid) == nil && pid == s.lockPID
}

func (s *postgresStore) BeginOperation(ctx context.Context, r sendRequest, hash string) (sendResult, bool, error) {
	res, err := s.db.ExecContext(ctx, `INSERT INTO bridge_operations(account,operation_id,message_id,fingerprint,state,error) VALUES($1,$2,$3,$4,'Uncertain','Send in progress; do not retry blindly') ON CONFLICT(account,operation_id) DO NOTHING`, s.account, r.OperationID, r.MessageID, hash)
	if err != nil {
		if strings.Contains(err.Error(), "23505") {
			return sendResult{}, false, errConflict
		}
		return sendResult{}, false, errors.New("could not reserve send operation")
	}
	count, _ := res.RowsAffected()
	var oldHash string
	var result sendResult
	err = s.db.QueryRowContext(ctx, `SELECT message_id,state,error,fingerprint FROM bridge_operations WHERE account=$1 AND operation_id=$2`, s.account, r.OperationID).Scan(&result.MessageID, &result.State, &result.Error, &oldHash)
	if err != nil {
		return result, false, errors.New("could not read send operation")
	}
	if hash != oldHash {
		return result, false, errConflict
	}
	return result, count == 1, nil
}

func (s *postgresStore) CompleteOperation(ctx context.Context, id string, r sendResult) error {
	_, err := s.db.ExecContext(ctx, `UPDATE bridge_operations SET state=$3,error=$4,updated_at=now() WHERE account=$1 AND operation_id=$2`, s.account, id, r.State, r.Error)
	return err
}

func (s *postgresStore) GetOperation(ctx context.Context, id string) (sendResult, error) {
	var r sendResult
	err := s.db.QueryRowContext(ctx, `SELECT message_id,state,error FROM bridge_operations WHERE account=$1 AND operation_id=$2`, s.account, id).Scan(&r.MessageID, &r.State, &r.Error)
	if errors.Is(err, sql.ErrNoRows) {
		err = errNotFound
	}
	return r, err
}

func (s *postgresStore) Enqueue(ctx context.Context, e eventEnvelope) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO bridge_events(account,event_id,payload) VALUES($1,$2,$3) ON CONFLICT(account,event_id) DO NOTHING`, s.account, e.EventID, b)
	return err
}

func (s *postgresStore) Pending(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM bridge_events WHERE account=$1 AND delivered_at IS NULL`, s.account).Scan(&n)
	return n, err
}

func (s *postgresStore) NextEvent(ctx context.Context) (int64, []byte, error) {
	var seq int64
	var b []byte
	err := s.db.QueryRowContext(ctx, `SELECT sequence,payload FROM bridge_events WHERE account=$1 AND delivered_at IS NULL ORDER BY sequence LIMIT 1`, s.account).Scan(&seq, &b)
	return seq, b, err
}

func (s *postgresStore) Delivered(ctx context.Context, seq int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE bridge_events SET delivered_at=now(),payload='{}'::jsonb WHERE account=$1 AND sequence=$2`, s.account, seq)
	return err
}

func (s *postgresStore) SaveState(ctx context.Context, state, detail string, suspended bool) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO bridge_account_state(account,state,detail,suspended) VALUES($1,$2,$3,$4) ON CONFLICT(account) DO UPDATE SET state=$2,detail=$3,suspended=$4,updated_at=now()`, s.account, state, detail, suspended)
	return err
}

func (s *postgresStore) PreviousState(ctx context.Context) string {
	var state string
	s.db.QueryRowContext(ctx, `SELECT state FROM bridge_account_state WHERE account=$1`, s.account).Scan(&state)
	return state
}

func (s *postgresStore) Suspended(ctx context.Context) bool {
	var blocked bool
	s.db.QueryRowContext(ctx, `SELECT suspended FROM bridge_account_state WHERE account=$1`, s.account).Scan(&blocked)
	return blocked
}

func (s *postgresStore) ConfirmDelivery(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE bridge_operations SET state='Sent',error='',updated_at=now() WHERE account=$1 AND message_id=$2 AND state='Uncertain'`, s.account, id)
	return err
}

func (s *postgresStore) Sweep(ctx context.Context) {
	s.db.ExecContext(ctx, `DELETE FROM bridge_events WHERE account=$1 AND delivered_at < $2`, s.account, time.Now().UTC().Add(-7*24*time.Hour))
}
