package main

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

type waTransport struct {
	ctx                           context.Context
	cfg                           config
	db                            *postgresStore
	container                     *sqlstore.Container
	mu                            sync.RWMutex
	client                        *whatsmeow.Client
	current                       status
	synced, permanent, connecting bool
	connectedAt                   time.Time
	qrExpires                     time.Time
	sendMu                        sync.Mutex
}

func newWATransport(ctx context.Context, c config, db *postgresStore) (*waTransport, error) {
	container := sqlstore.NewWithDB(db.db, "postgres", waLog.Noop)
	devices, err := container.GetAllDevices(ctx)
	if err != nil {
		return nil, errors.New("could not load WhatsApp session")
	}
	if len(devices) > 1 {
		return nil, errors.New("bridge schema must contain only the arena account")
	}
	device := container.NewDevice()
	if len(devices) == 1 {
		device = devices[0]
	}
	t := &waTransport{ctx: ctx, cfg: c, db: db, container: container, current: status{State: "Disconnected", AccountID: c.AccountID, UpdatedAtUTC: time.Now().UTC()}}
	t.client = t.makeClient(device)
	if db.Suspended(ctx) {
		t.current.State = db.PreviousState(ctx)
		t.current.Detail = "Session suspended; verify the account before resuming"
		t.permanent = true
	}
	return t, nil
}

func (t *waTransport) makeClient(device *store.Device) *whatsmeow.Client {
	cli := whatsmeow.NewClient(device, waLog.Noop)
	cli.EnableAutoReconnect = false
	cli.InitialAutoReconnect = false
	cli.SynchronousAck = true
	cli.EnableDecryptedEventBuffer = true
	cli.ManualHistorySyncDownload = true
	cli.AddEventHandlerWithSuccessStatus(t.onEvent)
	return cli
}

func (t *waTransport) getClient() *whatsmeow.Client {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.client
}

func (t *waTransport) Start() {
	if cli := t.getClient(); cli.Store.ID != nil {
		t.mu.RLock()
		blocked := t.permanent
		t.mu.RUnlock()
		if !blocked {
			t.scheduleConnect()
		}
	}
}
func (t *waTransport) Stop() { t.getClient().Disconnect() }

func (t *waTransport) Status() status {
	t.mu.RLock()
	s := t.current
	synced := t.synced
	expiry := t.qrExpires
	t.mu.RUnlock()
	if s.QRCode != "" && time.Now().After(expiry) {
		s.QRCode = ""
	}
	if s.State == "Connected" {
		ctx, cancel := context.WithTimeout(t.ctx, 2*time.Second)
		defer cancel()
		n, err := t.db.Pending(ctx)
		if !synced || err != nil || n > 0 {
			s.State = "Unavailable"
			s.Detail = "Synchronizing messages with LongBeach"
		}
	}
	return s
}

func (t *waTransport) Ready(ctx context.Context) bool {
	t.mu.RLock()
	ready := t.current.State == "Connected" && t.synced && !t.permanent
	t.mu.RUnlock()
	if !ready || !t.getClient().IsLoggedIn() {
		return false
	}
	n, err := t.db.Pending(ctx)
	return err == nil && n == 0
}

func (t *waTransport) setState(state, detail string, permanent bool) bool {
	t.mu.Lock()
	t.current = status{State: state, Detail: detail, AccountID: t.cfg.AccountID, UpdatedAtUTC: time.Now().UTC()}
	t.permanent = permanent
	if state != "Connected" {
		t.synced = false
	}
	t.mu.Unlock()
	ctx, cancel := context.WithTimeout(t.ctx, 8*time.Second)
	defer cancel()
	if t.db.SaveState(ctx, state, detail, permanent) != nil {
		return false
	}
	return t.db.Enqueue(ctx, eventEnvelope{EventID: uuid.NewString(), Type: "connection", State: state, OccurredAtUTC: time.Now().UTC()}) == nil
}

func (t *waTransport) Pair(context.Context) error {
	t.mu.Lock()
	if t.current.State == "Pairing" {
		t.mu.Unlock()
		return nil
	}
	if t.client.Store.ID != nil && !t.client.Store.Deleted {
		t.mu.Unlock()
		return errors.New("session already exists; use reconnect")
	}
	if t.client.Store.Deleted {
		t.client = t.makeClient(t.container.NewDevice())
	}
	cli := t.client
	t.permanent = false
	t.current.State = "Pairing"
	t.mu.Unlock()
	ctx, cancel := context.WithTimeout(t.ctx, 3*time.Minute)
	channel, err := cli.GetQRChannel(ctx)
	if err != nil {
		cancel()
		t.setState("Disconnected", "Pairing could not start", false)
		return errors.New("pairing could not start")
	}
	if err = cli.ConnectContext(t.ctx); err != nil {
		cancel()
		t.setState("Disconnected", "Pairing connection failed", false)
		return errors.New("pairing connection failed")
	}
	go func() {
		defer cancel()
		for item := range channel {
			if item.Event == "code" {
				t.mu.Lock()
				t.current = status{State: "Pairing", AccountID: t.cfg.AccountID, QRCode: item.Code, Detail: "Scan the QR code in Linked devices", UpdatedAtUTC: time.Now().UTC()}
				t.qrExpires = time.Now().Add(item.Timeout)
				t.mu.Unlock()
			} else if item.Event == "success" {
				t.mu.Lock()
				t.current.QRCode = ""
				t.current.Detail = "Waiting for authentication and offline synchronization"
				t.mu.Unlock()
				return
			} else {
				t.setState("Disconnected", "Pairing expired or could not complete", false)
				return
			}
		}
		t.mu.Lock()
		if t.current.State == "Pairing" {
			t.current.QRCode = ""
			t.current.State = "Disconnected"
			t.current.Detail = "Pairing expired"
		}
		t.mu.Unlock()
	}()
	return nil
}

func (t *waTransport) Reconnect(context.Context) error {
	cli := t.getClient()
	if cli.Store.ID == nil || cli.Store.Deleted {
		return errors.New("pairing is required")
	}
	t.mu.Lock()
	if t.permanent {
		t.mu.Unlock()
		return errors.New("session is suspended; verify the account before pairing again")
	}
	t.synced = false
	t.mu.Unlock()
	cli.Disconnect()
	t.scheduleConnect()
	return nil
}

func (t *waTransport) scheduleConnect() {
	t.mu.Lock()
	if t.connecting || t.permanent {
		t.mu.Unlock()
		return
	}
	t.connecting = true
	t.mu.Unlock()
	go func() {
		defer func() {
			t.mu.Lock()
			t.connecting = false
			retry := t.current.State == "Disconnected" && !t.permanent
			t.mu.Unlock()
			if retry && t.ctx.Err() == nil {
				time.AfterFunc(time.Second, t.scheduleConnect)
			}
		}()
		delay := time.Second
		for {
			if t.ctx.Err() != nil {
				return
			}
			t.mu.RLock()
			blocked := t.permanent
			t.mu.RUnlock()
			if blocked {
				return
			}
			ctx, cancel := context.WithTimeout(t.ctx, 5*time.Second)
			lease := t.db.LeaseValid(ctx)
			cancel()
			if !lease {
				t.setState("Unavailable", "Account lock lost; restart after investigation", true)
				return
			}
			t.setState("Unavailable", "Connecting to WhatsApp", false)
			if err := t.getClient().ConnectContext(t.ctx); err == nil || errors.Is(err, whatsmeow.ErrAlreadyConnected) {
				return
			}
			t.setState("Disconnected", "Connection unavailable; retrying", false)
			select {
			case <-t.ctx.Done():
				return
			case <-time.After(delay):
			}
			delay = min(delay*2, 60*time.Second)
		}
	}()
}

func (t *waTransport) onEvent(value any) bool {
	switch v := value.(type) {
	case *events.Connected:
		t.mu.Lock()
		t.connectedAt = time.Now().UTC()
		t.mu.Unlock()
		return t.setState("Unavailable", "Synchronizing offline messages", false)
	case *events.OfflineSyncPreview:
		t.mu.Lock()
		t.synced = false
		t.mu.Unlock()
		return true
	case *events.OfflineSyncCompleted:
		t.mu.Lock()
		t.synced = true
		t.current = status{State: "Connected", AccountID: t.cfg.AccountID, UpdatedAtUTC: time.Now().UTC()}
		t.mu.Unlock()
		ctx, cancel := context.WithTimeout(t.ctx, 8*time.Second)
		defer cancel()
		if t.db.SaveState(ctx, "Connected", "", false) != nil {
			return false
		}
		return t.db.Enqueue(ctx, eventEnvelope{EventID: uuid.NewString(), Type: "connection", State: "Connected", OccurredAtUTC: time.Now().UTC()}) == nil
	case *events.LoggedOut:
		return t.setState("LoggedOut", "Device unlinked; pairing is required", true)
	case *events.StreamReplaced:
		return t.setState("Unavailable", "Session replaced; another client may be using these keys", true)
	case *events.ClientOutdated:
		return t.setState("Unavailable", "WhatsApp client update required", true)
	case *events.TemporaryBan:
		return t.setState("Unavailable", "WhatsApp account temporarily suspended", true)
	case *events.ConnectFailure:
		return t.setState("Unavailable", "WhatsApp authentication failed", true)
	case *events.CATRefreshError:
		return t.setState("Unavailable", "WhatsApp credentials require investigation", true)
	case *events.StreamError:
		return t.setState("Unavailable", "WhatsApp session failed; staff investigation required", true)
	case *events.Disconnected:
		t.mu.RLock()
		blocked := t.permanent
		t.mu.RUnlock()
		if blocked {
			return true
		}
		ok := t.setState("Disconnected", "Connection interrupted", false)
		t.scheduleConnect()
		return ok
	case *events.Message:
		return t.incoming(v)
	case *events.Receipt:
		return t.receipt(v)
	case *events.HistorySync:
		return true // History never enters the automation inbox.
	case *events.KeepAliveTimeout:
		return t.setState("Unavailable", "WhatsApp connection is not responding", false)
	case *events.KeepAliveRestored:
		// Re-establish offline synchronization rather than declaring the socket ready prematurely.
		go func() { t.getClient().Disconnect(); t.scheduleConnect() }()
		return true
	}
	return true
}

func individual(jid types.JID) bool {
	return jid.Server == types.DefaultUserServer || jid.Server == types.HiddenUserServer
}

func messageAliases(info types.MessageSource) ([]string, string) {
	values := []types.JID{info.Chat, info.SenderAlt, info.Sender}
	if info.IsFromMe {
		values = []types.JID{info.Chat, info.RecipientAlt}
	}
	seen := map[string]bool{}
	aliases := []string{}
	phone := ""
	for _, v := range values {
		if !individual(v) || v.User == "" {
			continue
		}
		v = v.ToNonAD()
		key := v.String()
		if !seen[key] {
			aliases = append(aliases, key)
			seen[key] = true
		}
		if v.Server == types.DefaultUserServer {
			phone = v.User
		}
	}
	return aliases, phone
}

func (t *waTransport) resolvedAliases(ctx context.Context, info types.MessageSource) ([]string, string) {
	aliases, phone := messageAliases(info)
	lids := t.getClient().Store.LIDs
	if lids == nil {
		return aliases, phone
	}
	seen := map[string]bool{}
	for _, a := range aliases {
		seen[a] = true
	}
	initial := append([]string(nil), aliases...)
	for _, a := range initial {
		jid, err := types.ParseJID(a)
		if err != nil {
			continue
		}
		var other types.JID
		if jid.Server == types.HiddenUserServer {
			other, err = lids.GetPNForLID(ctx, jid)
		} else {
			other, err = lids.GetLIDForPN(ctx, jid)
		}
		if err != nil || other.IsEmpty() || !individual(other) {
			continue
		}
		key := other.ToNonAD().String()
		if !seen[key] {
			aliases = append(aliases, key)
			seen[key] = true
		}
		if other.Server == types.DefaultUserServer {
			phone = other.User
		}
	}
	return aliases, phone
}

func (t *waTransport) incoming(v *events.Message) bool {
	if v.Info.IsGroup || !individual(v.Info.Chat) || v.Message == nil {
		return true
	}
	t.mu.RLock()
	historical := !t.synced || v.Info.Timestamp.Before(t.connectedAt)
	t.mu.RUnlock()
	historical = historical || v.SourceWebMsg != nil
	aliasCtx, aliasCancel := context.WithTimeout(t.ctx, 3*time.Second)
	aliases, phone := t.resolvedAliases(aliasCtx, v.Info.MessageSource)
	aliasCancel()
	e := eventEnvelope{EventID: eventID(t.cfg.AccountID, "message", v.Info.Chat.String(), v.Info.Sender.String(), v.Info.ID), Type: "message", ChatID: v.Info.Chat.ToNonAD().String(), MessageID: v.Info.ID, SenderID: v.Info.Sender.ToNonAD().String(), SenderPhone: phone, Aliases: aliases, FromMe: v.Info.IsFromMe, IsHistory: historical, OccurredAtUTC: v.Info.Timestamp.UTC()}
	e.Text = v.Message.GetConversation()
	if e.Text == "" {
		e.Text = v.Message.GetExtendedTextMessage().GetText()
	}
	if v.IsEdit {
		e.IsHistory = true
	} // edits must not repeat actions or restart the bot.
	if !historical {
		media, caption, err := t.receiveMedia(v.Message)
		if e.Text == "" {
			e.Text = caption
		}
		if err != nil {
			e.Text = strings.TrimSpace(e.Text + " [Attachment unavailable: staff assistance required]")
		} else {
			e.Media = media
		}
	}
	if e.Text == "" && e.Media == nil {
		return true
	}
	ctx, cancel := context.WithTimeout(t.ctx, 10*time.Second)
	defer cancel()
	return t.db.Enqueue(ctx, e) == nil
}

func (t *waTransport) receipt(v *events.Receipt) bool {
	if !individual(v.Chat) {
		return true
	}
	state := ""
	switch v.Type {
	case types.ReceiptTypeDelivered:
		state = "Delivered"
	case types.ReceiptTypeRead:
		state = "Read"
	default:
		return true
	}
	ctx, cancel := context.WithTimeout(t.ctx, 10*time.Second)
	defer cancel()
	aliases, _ := t.resolvedAliases(ctx, v.MessageSource)
	for _, id := range v.MessageIDs {
		if t.db.ConfirmDelivery(ctx, id) != nil {
			return false
		}
		e := eventEnvelope{EventID: eventID(t.cfg.AccountID, "receipt", v.Chat.String(), id, state, v.Timestamp.UTC().Format(time.RFC3339Nano)), Type: "receipt", ChatID: v.Chat.ToNonAD().String(), Aliases: aliases, MessageID: id, MessageIDs: []string{id}, State: state, OccurredAtUTC: v.Timestamp.UTC()}
		if t.db.Enqueue(ctx, e) != nil {
			return false
		}
	}
	return true
}

func (t *waTransport) Send(ctx context.Context, r sendRequest) sendResult {
	t.sendMu.Lock()
	defer t.sendMu.Unlock()
	result := sendResult{MessageID: r.MessageID, State: "Failed"}
	if !t.db.LeaseValid(ctx) || !t.Ready(ctx) {
		result.Error = "WhatsApp is not ready; no message was sent"
		return result
	}
	jid, _ := types.ParseJID(r.ChatID)
	message := &waE2E.Message{Conversation: proto.String(r.Text)}
	if r.Media != nil {
		data, err := decodeAttachment(r.Media)
		if err != nil {
			result.Error = "Invalid attachment"
			return result
		}
		mediaType := whatsmeow.MediaImage
		if r.Media.Kind == "audio" {
			mediaType = whatsmeow.MediaAudio
		} else if r.Media.Kind == "document" {
			mediaType = whatsmeow.MediaDocument
		}
		upload, err := t.getClient().Upload(ctx, data, mediaType)
		if err != nil {
			result.Error = "Attachment upload failed; no message was sent"
			return result
		}
		message = &waE2E.Message{}
		switch r.Media.Kind {
		case "image":
			message.ImageMessage = &waE2E.ImageMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: proto.Uint64(uint64(len(data))), Mimetype: proto.String(r.Media.ContentType), Caption: proto.String(r.Text)}
		case "document":
			message.DocumentMessage = &waE2E.DocumentMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: proto.Uint64(uint64(len(data))), Mimetype: proto.String(r.Media.ContentType), FileName: proto.String(r.Media.FileName), Caption: proto.String(r.Text)}
		case "audio":
			message.AudioMessage = &waE2E.AudioMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: proto.Uint64(uint64(len(data))), Mimetype: proto.String(r.Media.ContentType), PTT: proto.Bool(false)}
		}
	}
	_, err := t.getClient().SendMessage(ctx, jid, message, whatsmeow.SendRequestExtra{ID: r.MessageID, Timeout: 75 * time.Second})
	if err != nil {
		result.State = "Uncertain"
		result.Error = "Send outcome requires verification; do not resend blindly"
		return result
	}
	result.State = "Sent"
	return result
}

type boundedFile struct {
	*os.File
	limit int64
}

func (f *boundedFile) Write(b []byte) (int, error) {
	pos, err := f.Seek(0, io.SeekCurrent)
	if err != nil {
		return 0, err
	}
	if pos+int64(len(b)) > f.limit {
		return 0, errors.New("media limit exceeded")
	}
	return f.File.Write(b)
}
func (f *boundedFile) WriteAt(b []byte, off int64) (int, error) {
	if off < 0 || off+int64(len(b)) > f.limit {
		return 0, errors.New("media limit exceeded")
	}
	return f.File.WriteAt(b, off)
}
func (f *boundedFile) Truncate(size int64) error {
	if size < 0 || size > f.limit {
		return errors.New("media limit exceeded")
	}
	return f.File.Truncate(size)
}

func (t *waTransport) receiveMedia(msg *waE2E.Message) (*attachment, string, error) {
	var downloadable whatsmeow.DownloadableMessage
	var size uint64
	kind, contentType, fileName, caption := "", "", "", ""
	switch {
	case msg.ImageMessage != nil:
		m := msg.ImageMessage
		downloadable = m
		size = m.GetFileLength()
		kind = "image"
		contentType = m.GetMimetype()
		caption = m.GetCaption()
		fileName = "image"
	case msg.DocumentMessage != nil:
		m := msg.DocumentMessage
		downloadable = m
		size = m.GetFileLength()
		kind = "document"
		contentType = m.GetMimetype()
		caption = m.GetCaption()
		fileName = filepath.Base(m.GetFileName())
		if fileName == "." || fileName == "" {
			fileName = "document.pdf"
		}
	case msg.AudioMessage != nil:
		m := msg.AudioMessage
		downloadable = m
		size = m.GetFileLength()
		kind = "audio"
		contentType = m.GetMimetype()
		fileName = "audio"
	default:
		if msg.VideoMessage != nil || msg.StickerMessage != nil || msg.LocationMessage != nil || msg.ContactMessage != nil || msg.ContactsArrayMessage != nil {
			return nil, "", errors.New("unsupported message attachment")
		}
		return nil, "", nil
	}
	contentType, _, _ = mime.ParseMediaType(contentType)
	if size > maxMediaBytes || !allowedMedia(kind, contentType) {
		return nil, caption, errors.New("unsupported attachment or size")
	}
	f, err := os.CreateTemp("", "longbeach-wa-media-*")
	if err != nil {
		return nil, caption, err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	ctx, cancel := context.WithTimeout(t.ctx, 45*time.Second)
	defer cancel()
	if err = t.getClient().DownloadToFile(ctx, downloadable, &boundedFile{File: f, limit: maxMediaBytes + 512}); err != nil {
		return nil, caption, errors.New("media download failed")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return nil, caption, err
	}
	data, err := io.ReadAll(io.LimitReader(f, maxMediaBytes+1))
	if err != nil || len(data) > maxMediaBytes {
		return nil, caption, errors.New("media size limit exceeded")
	}
	media := &attachment{DataBase64: base64.StdEncoding.EncodeToString(data), Kind: kind, ContentType: contentType, FileName: fileName}
	if _, err = decodeAttachment(media); err != nil {
		return nil, caption, err
	}
	return media, caption, nil
}
