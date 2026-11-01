package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Print(err.Error())
		os.Exit(1)
	}
}

func run() error {
	c, err := loadConfig()
	if err != nil {
		return err
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if len(os.Args) > 1 {
		if len(os.Args) != 2 || os.Args[1] != "migrate" {
			return errors.New("usage: whatsapp-bridge [migrate]")
		}
		if c.DatabaseURL == "" {
			return errors.New("migration requires WABRIDGE_DATABASE_URL")
		}
		return migrate(ctx, c)
	}
	var e *engine
	if c.Enabled {
		db, err := openDatabase(c)
		if err != nil {
			return err
		}
		defer db.Close()
		s, err := acquireStore(ctx, db, c.AccountID)
		if err != nil {
			return err
		}
		defer s.Close()
		t, err := newWATransport(ctx, c, s)
		if err != nil {
			return err
		}
		defer t.Stop()
		e = &engine{ctx: ctx, store: s, transport: t}
		go deliverEvents(ctx, c, s)
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					checkCtx, done := context.WithTimeout(ctx, 3*time.Second)
					valid := s.LeaseValid(checkCtx)
					done()
					if !valid {
						t.setState("Unavailable", "Account lock lost", true)
						t.Stop()
						cancel()
						return
					}
				}
			}
		}()
		t.Start()
	}
	server := &http.Server{Addr: c.Address, Handler: newHandler(c, e), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 110 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 * 1024}
	go func() {
		<-ctx.Done()
		shutdownCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		server.Shutdown(shutdownCtx)
	}()
	log.Print("WhatsApp bridge started; private transport only")
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return errors.New("bridge HTTP server failed")
	}
	return nil
}

type eventDeliveryStore interface {
	NextEvent(context.Context) (int64, []byte, error)
	Delivered(context.Context, int64) error
	Sweep(context.Context)
}

func deliverEvents(ctx context.Context, c config, s eventDeliveryStore) {
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	delay := time.Second
	lastSweep := time.Now()
	for {
		if ctx.Err() != nil {
			return
		}
		seq, payload, err := s.NextEvent(ctx)
		if err == nil {
			request, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, c.BackendURL, bytes.NewReader(payload))
			if requestErr == nil {
				// Routing stays on the private URL. Host filtering sees the canonical API name.
				if c.BackendHost != "" {
					request.Host = c.BackendHost
				}
				request.Header.Set("Authorization", "Bearer "+c.Secret)
				request.Header.Set("Content-Type", "application/json")
				response, sendErr := client.Do(request)
				if sendErr == nil {
					io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
					response.Body.Close()
					if response.StatusCode >= 200 && response.StatusCode < 300 && s.Delivered(ctx, seq) == nil {
						delay = time.Second
						continue
					}
				}
			}
		} else if errors.Is(err, sql.ErrNoRows) {
			delay = time.Second
			if time.Since(lastSweep) > time.Hour {
				s.Sweep(ctx)
				lastSweep = time.Now()
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		if err == nil || !errors.Is(err, sql.ErrNoRows) {
			delay = min(delay*2, 60*time.Second)
		}
	}
}
