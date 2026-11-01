package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types"
)

type memoryStore struct {
	mu           sync.Mutex
	hashes       map[string]string
	results      map[string]sendResult
	lease        bool
	failComplete bool
}

func newMemoryStore() *memoryStore {
	return &memoryStore{hashes: map[string]string{}, results: map[string]sendResult{}, lease: true}
}
func (s *memoryStore) BeginOperation(_ context.Context, r sendRequest, hash string) (sendResult, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.hashes[r.OperationID]; ok {
		if old != hash {
			return sendResult{}, false, errConflict
		}
		return s.results[r.OperationID], false, nil
	}
	s.hashes[r.OperationID] = hash
	s.results[r.OperationID] = sendResult{MessageID: r.MessageID, State: "Uncertain"}
	return s.results[r.OperationID], true, nil
}
func (s *memoryStore) CompleteOperation(_ context.Context, id string, r sendResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failComplete {
		return errors.New("storage failure")
	}
	s.results[id] = r
	return nil
}
func (s *memoryStore) GetOperation(_ context.Context, id string) (sendResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.results[id]
	if !ok {
		return r, errNotFound
	}
	return r, nil
}
func (s *memoryStore) LeaseValid(context.Context) bool { return s.lease }

type fakeTransport struct {
	calls   atomic.Int32
	ready   bool
	outcome string
}

func (t *fakeTransport) Status() status                  { return status{State: "Connected"} }
func (t *fakeTransport) Ready(context.Context) bool      { return t.ready }
func (t *fakeTransport) Pair(context.Context) error      { return nil }
func (t *fakeTransport) Reconnect(context.Context) error { return nil }
func (t *fakeTransport) Send(_ context.Context, r sendRequest) sendResult {
	t.calls.Add(1)
	return sendResult{MessageID: r.MessageID, State: t.outcome}
}
func requestFixture() sendRequest {
	return sendRequest{OperationID: uuid.NewString(), MessageID: "3EB0TEST123", ChatID: "5511999999999@s.whatsapp.net", Text: "Test message"}
}

func TestConcurrentRetriesSendAtMostOnce(t *testing.T) {
	s := newMemoryStore()
	sender := &fakeTransport{ready: true, outcome: "Sent"}
	e := &engine{ctx: context.Background(), store: s, transport: sender}
	r := requestFixture()
	var wg sync.WaitGroup
	for range 30 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := e.Send(r); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if sender.calls.Load() != 1 {
		t.Fatalf("duplicate sends: %d", sender.calls.Load())
	}
	result, _ := s.GetOperation(context.Background(), r.OperationID)
	if result.State != "Sent" {
		t.Fatalf("unexpected result: %+v", result)
	}
	r.Text = "changed"
	if _, err := e.Send(r); !errors.Is(err, errConflict) {
		t.Fatalf("changed operation accepted: %v", err)
	}
}

func TestUncertainAndUnrecordedResultsAreNeverResent(t *testing.T) {
	for _, storageFailure := range []bool{false, true} {
		t.Run(map[bool]string{false: "network uncertainty", true: "ack persistence failure"}[storageFailure], func(t *testing.T) {
			s := newMemoryStore()
			s.failComplete = storageFailure
			sender := &fakeTransport{ready: true, outcome: "Uncertain"}
			if storageFailure {
				sender.outcome = "Sent"
			}
			e := &engine{ctx: context.Background(), store: s, transport: sender}
			r := requestFixture()
			for range 3 {
				result, err := e.Send(r)
				if err != nil || result.State != "Uncertain" {
					t.Fatalf("result=%+v error=%v", result, err)
				}
			}
			if sender.calls.Load() != 1 {
				t.Fatal("uncertain message resent")
			}
		})
	}
}

func TestDisconnectedOrLostLeaseNeverSends(t *testing.T) {
	for _, lease := range []bool{false, true} {
		s := newMemoryStore()
		s.lease = lease
		sender := &fakeTransport{ready: !lease, outcome: "Sent"}
		e := &engine{ctx: context.Background(), store: s, transport: sender}
		result, err := e.Send(requestFixture())
		if err != nil || result.State != "Failed" || sender.calls.Load() != 0 {
			t.Fatalf("unsafe send: %+v, %v", result, err)
		}
	}
}

func TestHTTPRequiresBearerAndProtectsAgainstChangedPayload(t *testing.T) {
	s := newMemoryStore()
	sender := &fakeTransport{ready: true, outcome: "Sent"}
	e := &engine{ctx: context.Background(), store: s, transport: sender}
	c := config{Enabled: true, Secret: strings.Repeat("x", 32)}
	handler := newHandler(c, e)
	for _, authorization := range []string{"", "Bearer wrong"} {
		req := httptest.NewRequest("GET", "/v1/status", nil)
		req.Header.Set("Authorization", authorization)
		req.AddCookie(&http.Cookie{Name: "session", Value: c.Secret})
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		if out.Code != 401 {
			t.Fatalf("unauthorized status=%d", out.Code)
		}
	}
	r := requestFixture()
	payload, _ := json.Marshal(r)
	for index, body := range [][]byte{payload, payload, []byte(strings.Replace(string(payload), "Test message", "different", 1)), append(payload, []byte("garbage")...)} {
		req := httptest.NewRequest("POST", "/v1/messages", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+c.Secret)
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		want := 200
		if index == 2 {
			want = 409
		} else if index == 3 {
			want = 400
		}
		if out.Code != want {
			t.Fatalf("request %d: status=%d response=%s", index, out.Code, out.Body.String())
		}
	}
	if sender.calls.Load() != 1 {
		t.Fatal("HTTP retries duplicated send")
	}
}

func TestDisabledBridgeNeverPairs(t *testing.T) {
	c := config{Secret: strings.Repeat("x", 32)}
	h := newHandler(c, nil)
	for _, path := range []string{"/v1/pair", "/v1/reconnect", "/v1/messages"} {
		req := httptest.NewRequest("POST", path, nil)
		req.Header.Set("Authorization", "Bearer "+c.Secret)
		out := httptest.NewRecorder()
		h.ServeHTTP(out, req)
		if out.Code != 503 {
			t.Fatalf("disabled route %s: %d", path, out.Code)
		}
	}
}

func TestValidationRejectsGroupsOversizedOrMismatchedMedia(t *testing.T) {
	r := requestFixture()
	r.ChatID = "123@g.us"
	if validateRequest(r) == nil {
		t.Fatal("group accepted")
	}
	r = requestFixture()
	r.ChatID = "5511999999999:1@s.whatsapp.net"
	if validateRequest(r) == nil {
		t.Fatal("device-specific recipient accepted")
	}
	r = requestFixture()
	r.Media = &attachment{Kind: "image", ContentType: "image/png", FileName: "image.png", DataBase64: base64.StdEncoding.EncodeToString([]byte("not a PNG"))}
	if validateRequest(r) == nil {
		t.Fatal("mismatched image accepted")
	}
	r.Media = &attachment{Kind: "document", ContentType: "application/pdf", FileName: "../secret.pdf", DataBase64: base64.StdEncoding.EncodeToString([]byte("%PDF-1.7\nexample"))}
	if validateRequest(r) == nil {
		t.Fatal("path traversal filename accepted")
	}
	r.Media.FileName = "bill.pdf"
	if err := validateRequest(r); err != nil {
		t.Fatal(err)
	}
	r.Media.DataBase64 = strings.Repeat("A", base64.StdEncoding.EncodedLen(maxMediaBytes)+4)
	if validateRequest(r) == nil {
		t.Fatal("oversized attachment accepted")
	}
}

func TestAliasesDoNotTreatLIDAsPhoneOrArenaAsCustomer(t *testing.T) {
	lid := types.NewJID("1234567890", types.HiddenUserServer)
	pn := types.NewJID("5511999999999", types.DefaultUserServer)
	arena := types.NewJID("5511888888888", types.DefaultUserServer)
	aliases, phone := messageAliases(types.MessageSource{Chat: lid, Sender: lid})
	if phone != "" || len(aliases) != 1 {
		t.Fatalf("LID became phone: %s %v", phone, aliases)
	}
	aliases, phone = messageAliases(types.MessageSource{Chat: lid, Sender: arena, RecipientAlt: pn, IsFromMe: true})
	if phone != pn.User || len(aliases) != 2 {
		t.Fatalf("bad own-message mapping: %s %v", phone, aliases)
	}
	for _, a := range aliases {
		if a == arena.String() {
			t.Fatal("arena identity leaked into customer aliases")
		}
	}
}

func TestBoundedDownloadFileRejectsExcessBeforeWriting(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "media")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	bounded := &boundedFile{File: f, limit: 10}
	if _, err = bounded.Write([]byte("12345678901")); err == nil {
		t.Fatal("overflow accepted")
	}
	if _, err = bounded.WriteAt([]byte("xx"), 9); err == nil {
		t.Fatal("random access overflow accepted")
	}
	if err = bounded.Truncate(11); err == nil {
		t.Fatal("oversize allocation accepted")
	}
	stat, _ := f.Stat()
	if stat.Size() != 0 {
		t.Fatal("oversized data written")
	}
}

func TestDisabledDefaultAndExpiredQR(t *testing.T) {
	t.Setenv("WABRIDGE_CONFIG_FILE", "")
	t.Setenv("WABRIDGE_ENABLED", "")
	t.Setenv("WABRIDGE_SECRET", "")
	t.Setenv("WABRIDGE_DATABASE_URL", "")
	t.Setenv("WABRIDGE_BACKEND_URL", "")
	t.Setenv("WABRIDGE_BACKEND_HOST", "")
	t.Setenv("WABRIDGE_ACCOUNT_ID", "arena")
	t.Setenv("WABRIDGE_ADDRESS", "127.0.0.1:8091")
	t.Setenv("WABRIDGE_SCHEMA", "whatsapp_transport")
	t.Setenv("WABRIDGE_RUNTIME_ROLE", "longbeach_whatsapp_bridge")
	c, err := loadConfig()
	if err != nil || c.Enabled {
		t.Fatalf("unsafe defaults: %+v %v", c, err)
	}
	t.Setenv("WABRIDGE_ENABLED", "true")
	if _, err = loadConfig(); err == nil {
		t.Fatal("enabled bridge accepted missing credentials")
	}
	wa := &waTransport{current: status{State: "Pairing", QRCode: "synthetic-qr"}, qrExpires: time.Now().Add(-time.Second)}
	if wa.Status().QRCode != "" {
		t.Fatal("expired QR leaked")
	}
}

func TestPrivateConfigFileIsAuthoritativeAndKeepsSecretsOutOfEnvironment(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.json")
	private := `{"enabled":true,"address":"0.0.0.0:8091","secret":"synthetic-file-secret-at-least-32-bytes","databaseUrl":"postgres://synthetic:only@test.invalid/bridge","schema":"whatsapp_transport","runtimeRole":"longbeach_whatsapp_bridge","accountId":"arena","backendUrl":"http://api:8080/api/v1/messaging/bridge/events","backendHost":"api.longbeach.quebranunca.com.br"}`
	if err := os.WriteFile(path, []byte(private), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("WABRIDGE_CONFIG_FILE", path)
	t.Setenv("WABRIDGE_ENABLED", "false")
	t.Setenv("WABRIDGE_SECRET", "ignored")
	t.Setenv("WABRIDGE_DATABASE_URL", "ignored")
	t.Setenv("WABRIDGE_BACKEND_HOST", "ignored")
	c, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !c.Enabled || c.Secret != "synthetic-file-secret-at-least-32-bytes" || c.DatabaseURL != "postgres://synthetic:only@test.invalid/bridge" || c.BackendHost != "api.longbeach.quebranunca.com.br" {
		t.Fatal("private file did not override legacy environment")
	}
	if err = os.WriteFile(path, []byte(`{"enabled":false}`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("WABRIDGE_ENABLED", "true")
	c, err = loadConfig()
	if err != nil || c.Enabled || c.Secret != "" || c.DatabaseURL != "" {
		t.Fatal("missing private values fell back to environment")
	}
}

func TestPrivateConfigRejectsInsecureFilesAndNeverPrintsPrivateData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.json")
	t.Setenv("WABRIDGE_CONFIG_FILE", path)
	for _, value := range []string{
		`{"secret":"private-test-marker","unknown":true}`,
		`{"enabled":false,"enabled":true,"secret":"private-test-marker"}`,
		`{"enabled":false,"Enabled":true,"secret":"private-test-marker"}`,
		`{"secret":"private-test-marker"} trailing-data`,
		`{"secret":"private-test-marker",`,
	} {
		if err := os.WriteFile(path, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
		_, err := loadConfig()
		if err == nil || strings.Contains(err.Error(), "private-test-marker") {
			t.Fatal("invalid private configuration was accepted or disclosed")
		}
	}
	if err := os.WriteFile(path, []byte(`{"enabled":false}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig(); err == nil {
		t.Fatal("world-readable private file accepted")
	}
	if err := os.Chmod(path, 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "bridge-link.json")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	t.Setenv("WABRIDGE_CONFIG_FILE", link)
	if _, err := loadConfig(); err == nil {
		t.Fatal("symlink private file accepted")
	}
	t.Setenv("WABRIDGE_CONFIG_FILE", path)
	hardlink := filepath.Join(filepath.Dir(path), "hardlink.json")
	if err := os.Link(path, hardlink); err != nil {
		t.Fatal(err)
	}
	if _, err := loadConfig(); err == nil {
		t.Fatal("hardlinked private file accepted")
	}
}

type deliveryFixture struct {
	payload   []byte
	delivered atomic.Bool
	ack       chan struct{}
}

func (s *deliveryFixture) NextEvent(context.Context) (int64, []byte, error) {
	if s.delivered.Load() {
		return 0, nil, sql.ErrNoRows
	}
	return 1, s.payload, nil
}
func (s *deliveryFixture) Delivered(context.Context, int64) error {
	if s.delivered.CompareAndSwap(false, true) {
		close(s.ack)
	}
	return nil
}
func (s *deliveryFixture) Sweep(context.Context) {}

func TestPrivateCallbackUsesCanonicalHostWithoutReroutingOrFollowingRedirects(t *testing.T) {
	const canonical = "api.longbeach.quebranunca.com.br"
	secret := strings.Repeat("s", 32)
	var requests, redirected atomic.Int32
	trap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected.Add(1); w.WriteHeader(200) }))
	defer trap.Close()
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != canonical || !strings.HasPrefix(r.RemoteAddr, "127.0.0.1:") || r.Header.Get("Authorization") != "Bearer "+secret {
			w.WriteHeader(400)
			return
		}
		if requests.Add(1) == 1 {
			w.Header().Set("Location", trap.URL)
			w.WriteHeader(302)
			return
		}
		w.WriteHeader(202)
	}))
	defer endpoint.Close()
	queue := &deliveryFixture{payload: []byte(`{"eventId":"synthetic-host-check","type":"connection","state":"Disconnected"}`), ack: make(chan struct{})}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	done := make(chan struct{})
	go func() {
		defer close(done)
		deliverEvents(ctx, config{BackendURL: endpoint.URL, BackendHost: canonical, Secret: secret}, queue)
	}()
	select {
	case <-queue.ack:
	case <-ctx.Done():
		t.Fatal("canonical Host callback did not receive acknowledgement")
	}
	cancel()
	<-done
	if requests.Load() != 2 || redirected.Load() != 0 || !queue.delivered.Load() {
		t.Fatal("callback was rerouted, not retried, or not acknowledged on 202")
	}
}

func TestBackendHostOnlyAcceptsAHostNotAURLOrInjectedHeader(t *testing.T) {
	for _, host := range []string{"api.longbeach.quebranunca.com.br", "api.longbeach.quebranunca.com.br:8080", "127.0.0.1:8080"} {
		if !validBackendHost(host) {
			t.Fatalf("valid Host rejected: %q", host)
		}
	}
	for _, host := range []string{"https://api.example.test", "api.example.test/path", "user@api.example.test", "api.example.test?x=1", "api.example.test#fragment", "api.example.test\r\nAuthorization: injected", "api example.test", "api.example.test:70000"} {
		if validBackendHost(host) {
			t.Fatalf("invalid Host accepted: %q", host)
		}
	}
}

func TestUnicodeTextLimitDoesNotTruncatePortuguese(t *testing.T) {
	r := requestFixture()
	r.Text = strings.Repeat("á", 16000)
	if err := validateRequest(r); err != nil {
		t.Fatal("valid accented text rejected")
	}
	r.Text += "á"
	if validateRequest(r) == nil {
		t.Fatal("overlong Unicode text accepted")
	}
}
