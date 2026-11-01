package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/types"
)

var errConflict = errors.New("operation already exists with a different payload")
var errNotFound = errors.New("operation not found")
var messageIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type status struct {
	State        string    `json:"state"`
	AccountID    string    `json:"accountId,omitempty"`
	Detail       string    `json:"detail,omitempty"`
	QRCode       string    `json:"qrCode,omitempty"`
	UpdatedAtUTC time.Time `json:"updatedAtUtc"`
}

type attachment struct {
	DataBase64  string `json:"dataBase64"`
	ContentType string `json:"contentType"`
	FileName    string `json:"fileName"`
	Kind        string `json:"kind"`
}

type sendRequest struct {
	OperationID string      `json:"operationId"`
	MessageID   string      `json:"messageId"`
	ChatID      string      `json:"chatId"`
	Text        string      `json:"text"`
	Media       *attachment `json:"media,omitempty"`
}

type sendResult struct {
	MessageID string `json:"messageId"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
}

type eventEnvelope struct {
	EventID       string      `json:"eventId"`
	Type          string      `json:"type"`
	ChatID        string      `json:"chatId,omitempty"`
	MessageID     string      `json:"messageId,omitempty"`
	SenderID      string      `json:"senderId,omitempty"`
	SenderPhone   string      `json:"senderPhone,omitempty"`
	Aliases       []string    `json:"aliases,omitempty"`
	FromMe        bool        `json:"fromMe"`
	IsHistory     bool        `json:"isHistory"`
	OccurredAtUTC time.Time   `json:"occurredAtUtc"`
	Text          string      `json:"text,omitempty"`
	Media         *attachment `json:"media,omitempty"`
	State         string      `json:"state,omitempty"`
	MessageIDs    []string    `json:"messageIds,omitempty"`
}

type transport interface {
	Status() status
	Ready(context.Context) bool
	Pair(context.Context) error
	Reconnect(context.Context) error
	Send(context.Context, sendRequest) sendResult
}

type operationStore interface {
	BeginOperation(context.Context, sendRequest, string) (sendResult, bool, error)
	CompleteOperation(context.Context, string, sendResult) error
	GetOperation(context.Context, string) (sendResult, error)
	LeaseValid(context.Context) bool
}

func validateRequest(r sendRequest) error {
	if _, err := uuid.Parse(r.OperationID); err != nil {
		return errors.New("operationId must be a UUID")
	}
	if !messageIDPattern.MatchString(r.MessageID) {
		return errors.New("invalid messageId")
	}
	jid, err := types.ParseJID(r.ChatID)
	if err != nil || jid.User == "" || jid.Device != 0 || (jid.Server != types.DefaultUserServer && jid.Server != types.HiddenUserServer) {
		return errors.New("only individual WhatsApp chats are supported")
	}
	if !utf8.ValidString(r.Text) || utf8.RuneCountInString(r.Text) > 16000 || (strings.TrimSpace(r.Text) == "" && r.Media == nil) {
		return errors.New("provide text or supported media, within the text limit")
	}
	if r.Media != nil {
		if r.Media.Kind == "audio" && strings.TrimSpace(r.Text) != "" {
			return errors.New("audio cannot have a caption; send text in a separate operation")
		}
		_, err = decodeAttachment(r.Media)
		return err
	}
	return nil
}

func decodeAttachment(m *attachment) ([]byte, error) {
	if len(m.DataBase64) > base64.StdEncoding.EncodedLen(maxMediaBytes) {
		return nil, errors.New("attachment exceeds 10 MiB")
	}
	data, err := base64.StdEncoding.Strict().DecodeString(m.DataBase64)
	if err != nil || len(data) == 0 || len(data) > maxMediaBytes {
		return nil, errors.New("invalid attachment data or size")
	}
	contentType, _, err := mime.ParseMediaType(m.ContentType)
	if err != nil || !allowedMedia(m.Kind, contentType) {
		return nil, errors.New("unsupported attachment type")
	}
	if m.Kind != "audio" && http.DetectContentType(data) != contentType {
		return nil, errors.New("attachment content does not match its declared type")
	}
	if m.Kind == "audio" {
		detected := http.DetectContentType(data)
		if !strings.HasPrefix(detected, "audio/") && detected != "application/ogg" && !(contentType == "audio/mp4" && len(data) > 8 && string(data[4:8]) == "ftyp") {
			return nil, errors.New("attachment content is not supported audio")
		}
	}
	if len(m.FileName) > 160 || strings.ContainsAny(m.FileName, "\r\n\x00") || filepath.Base(m.FileName) != m.FileName {
		return nil, errors.New("invalid attachment filename")
	}
	return data, nil
}

func allowedMedia(kind, contentType string) bool {
	switch kind {
	case "image":
		return contentType == "image/png" || contentType == "image/jpeg"
	case "document":
		return contentType == "application/pdf"
	case "audio":
		return contentType == "audio/ogg" || contentType == "audio/mpeg" || contentType == "audio/mp4" || contentType == "audio/wav" || contentType == "audio/x-wav" || contentType == "audio/aac" || contentType == "audio/amr"
	}
	return false
}

func fingerprint(r sendRequest) string {
	b, _ := json.Marshal(r)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func eventID(parts ...string) string {
	h := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(h[:])
}
