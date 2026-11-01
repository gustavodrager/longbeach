# WhatsApp transport for LongBeach

Private Go service using the pinned whatsmeow multi-device client. Business rules,
AI, identity authorization and the staff inbox remain in the .NET application.
The service is **disabled by default**. Tests never connect, pair or send to WhatsApp.
It is an unofficial WhatsApp Web integration; availability and account acceptance
are not guaranteed by Meta. The existing phone remains the primary device.

## Configuration

Production sets only the non-secret `WABRIDGE_CONFIG_FILE` path (and optional Go
memory settings). Mount the host's private JSON at `/run/secrets/whatsapp-bridge.json`
read-only. The image runs as **65532:65532**: the host file is **root:65532, 0640**,
a regular file with one link, never a symlink. The reader accepts 0600 for local
development or 0640 for the protected runtime mount, and rejects other modes,
unknown/duplicate keys, trailing data and files larger than 64 KiB. Error messages
never echo the JSON, database URL or secret.

The JSON file is authoritative: when present, every other `WABRIDGE_*` variable
is ignored. Environment values cannot override an explicitly configured private
file. A missing `enabled` field defaults to false. The existing
variables below remain a fallback for isolated development without a configuration
file; do not use secret environment variables in production or put them in Compose
`environment`, image metadata or command lines.

| JSON field | Development variable | Meaning |
| --- | --- | --- |
| `enabled` | `WABRIDGE_ENABLED` | Boolean, `false` by default; only `true` enables database/session startup. |
| `address` | `WABRIDGE_ADDRESS` | `127.0.0.1:8091` by default; use `0.0.0.0:8091` inside the private container network. Do not publish this port. |
| `secret` | `WABRIDGE_SECRET` | Random secret with at least 32 bytes, shared only with the backend. Bearer authentication in both directions. |
| `databaseUrl` | `WABRIDGE_DATABASE_URL` | Dedicated runtime login, same client's PostgreSQL, no access to business tables. Never put this URL in the repo or logs. |
| `schema` | `WABRIDGE_SCHEMA` | Dedicated schema, default `whatsapp_transport`; `public` is rejected. |
| `runtimeRole` | `WABRIDGE_RUNTIME_ROLE` | NOLOGIN role, default `longbeach_whatsapp_bridge`; grant it to dedicated login `longbeach_whatsapp_runtime`. |
| `accountId` | `WABRIDGE_ACCOUNT_ID` | Stable singleton identifier, default `arena`. |
| `backendUrl` | `WABRIDGE_BACKEND_URL` | Full private events URL ending in `/api/v1/messaging/bridge/events`. No redirects followed. |
| `backendHost` | `WABRIDGE_BACKEND_HOST` | Canonical HTTP Host, e.g. `api.longbeach.quebranunca.com.br`. TCP still uses the private URL; API host filtering sees this approved host. No scheme, path or credentials. |

Run `whatsapp-bridge migrate` explicitly with a **separate private configuration
file containing the migration-only connection**, mounted at the same path for
that one-off command. Keep `enabled:false` in this migration file. Never mount
the migrator's JSON into the long-running container.
It creates its schema, applies the pinned sqlstore upgrades, creates the durable
event/operation/state tables, and grants DML/sequence access to the dedicated
runtime role. Provision that NOLOGIN role beforehand if the migrator lacks
CREATEROLE. The runtime login must not own the schema, inherit an application role,
or receive grants on business tables. The runtime uses `NewWithDB` and never calls
`Upgrade`; it refuses an absent bridge schema. Do not share production credentials
with local tests. Review and approve hosted migrations separately from this code.

The pinned schema proof is `bridge_version.version=1` and
`whatsmeow_version.version=16`. The image declares these as
`com.longbeach.whatsapp.schema.version` and
`com.longbeach.whatsapp.sqlstore.version`, along with transport `v1` and schema
`whatsapp_transport`. The runtime gate binds the admitted image digest to the real
database versions and restricted login before startup.

Only one process may hold the account's PostgreSQL advisory lock. A dedicated
connection owns the lock; losing that connection suspends the client and exits.
Do not start a second process with a copied session. SQLStore holds cryptographic
keys: restrict database access and backups accordingly. It does not replace the
application's durable inbox/outbox. Library diagnostic logging is disabled so QR,
keys, messages and phone numbers cannot be printed by protocol logs.

## Internal HTTP contract

All `/v1/*` routes require `Authorization: Bearer <secret>`; cookies are ignored.
Responses use `Cache-Control: no-store`. `GET /health/live` only reports process
liveness and is unauthenticated. The public application must proxy and authorize
staff actions; never expose the bridge or its secret directly to a browser.
The VM callback connects to `http://api:8080`, with JSON field `backendHost` set
to the canonical API hostname. This does not change `AllowedHosts`, public DNS,
TLS settings or the destination of the private connection. A successful liveness
check alone does not prove callback ingress: confirm a synthetic connection event
gets HTTP 2xx and drains from the bridge queue before pairing.

- `GET /v1/status`: `{state,accountId,detail?,qrCode?,updatedAtUtc}`.
- `POST /v1/pair`: starts explicit QR pairing for an unpaired session; same status.
- `POST /v1/reconnect`: reconnects an existing, unsuspended session; same status.
- `POST /v1/messages`: `{operationId,messageId,chatId,text,media?}`. `operationId`
  is a UUID; caller generates and persists `messageId` **before** sending.
  `chatId` is an individual PN or LID JID. Result: `{messageId,state,error?}` where
  state is `Sent`, `Uncertain` or `Failed`.
- `GET /v1/messages/{operationId}`: same saved result, or HTTP 404.

`media` is `{dataBase64,contentType,fileName,kind}` with kind `image`, `document`,
or `audio`. PNG/JPEG, PDF and supported audio are capped at 10 MiB. Incoming
downloads use a bounded private temporary file, deleted after processing; media
bytes are forwarded privately, not through public URLs. Unsupported/unavailable
attachments become an explicit staff-assistance marker. Text is limited to 16,000
Unicode characters; HTTP JSON bodies to 15 MiB. Audio has no caption in WhatsApp: use text
in a separate operation when sending audio.

An operation is reserved durably before touching WhatsApp. Retries with the same
operation/payload return the saved result; a changed payload or reused message ID
returns conflict. A timeout after submission is **Uncertain**, never an automatic
resend. `Sent` means server acknowledgement, not delivery or reading. Delivery/read
receipts confirm uncertain operations without submitting again. Review uncertain
outcomes in the staff inbox. A crash between network submission and persistence
also remains uncertain. IDs do not create an exactly-once guarantee at WhatsApp.

## Events and reconnection

Events POST to the backend with the same Bearer secret:
`{eventId,type,chatId?,messageId?,senderId?,senderPhone?,aliases?,fromMe,isHistory,
occurredAtUtc,text?,media?,state?,messageIds?}`. Types: `message`, `receipt`,
`connection`. Message/receipt IDs are deterministic for deduplication. Events are
persisted before protocol acknowledgement and retried in order until HTTP **2xx**
(including the backend's durable-ingress HTTP 202).
Delivered payloads are erased; small deduplication tombstones expire after 7 days.
The backend must retain its own idempotency records. No payloads are logged.

Receipt states are `Delivered` and `Read`. A PN JID may yield `senderPhone`; a LID
never does. Aliases preserve PN/LID mappings; the backend must link contacts by an
explicit authorized identity, not names or a phone match alone. Own messages are
forwarded with `fromMe=true`; the backend recognizes known bot message IDs and
treats unknown own messages as a human takeover.

Groups, statuses, newsletters and historical synchronization never trigger the
bot. The transport waits for authenticated `Connected`, `OfflineSyncCompleted`,
and draining the durable event queue before it sends. Pending messages from a
previous process are fenced as historical. The backend must additionally reject
old messages by timestamp before any automatic action. Transient connection
failures back off exponentially; unpairing, replaced sessions, outdated clients,
temporary bans and authentication failures persist a suspension, stop sending,
and require staff investigation. Restart alone does not clear a suspension.
Pairing success alone is not readiness. An expired QR is no longer returned.

## Development checks

Pinned Go toolchain: 1.27.3. Dependency revision:
`go.mau.fi/whatsmeow v0.0.0-20261031222104-5d4657a5c29e`.

```sh
go test -race ./...
go vet ./...
go build ./...
docker build -t longbeach-whatsapp-bridge:local .
```

No command above should use arena credentials. Start disabled to inspect health;
real pairing, hosted migrations and promotion remain explicit operator actions.

Primary references: [whatsmeow](https://github.com/tulir/whatsmeow),
[API](https://pkg.go.dev/go.mau.fi/whatsmeow),
[SQLStore](https://pkg.go.dev/go.mau.fi/whatsmeow/store/sqlstore).
