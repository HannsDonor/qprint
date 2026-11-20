# QPrint — What's Next: Local Printing Service Handoff

**Audience:** the developer who will connect the physical printers to QPrint.

**Goal:** build the Windows-side printing agent (recommended: Python) and the small set of backend APIs it needs, so a paid, queued job can be claimed, downloaded, printed, and tracked safely.

The web app is at `web/`. The local service must live in its own folder/repo (for example `agent/`) and be built separately from Next.js.

---

## 1. Where QPrint is today

Implemented in the web app:

- Shop owner registration/login and shop-scoped sessions.
- Shop active/inactive toggle and priority printing toggle.
- Services and per-color pricing (Document Printing, per page).
- Customer order creation with multi-file upload, per-file page ranges, copies, paper size, orientation, color mode, and priority.
- Server-side price calculation and order snapshot (`print_jobs`, `print_job_items`, `payments`, `transactions`).
- QR token generation (hash stored only), QR scanner, payment confirmation.
- Payment confirmation moves a job from `awaiting_payment` to `queued` and writes the queue history.
- Owner queue page read model (priority first, then FIFO).
- Owner dashboard, orders, scanner, services, queue pages.

Not built yet:

- Device registration/activation page and APIs.
- Printer management page and APIs.
- Agent authentication, heartbeat, job claim, document download, status reporting.
- The Python local printing service itself.
- Owner confirmation of actual print completion/ready-for-pickup.
- Any real printer status display.

Relevant tables already exist: `shop_devices`, `printers`, `print_jobs`, `documents`, `print_settings`, `print_job_items`, `print_attempts`, `job_status_history`, `transactions`.

> Always inspect the live MySQL schema before coding. The canonical file is `qprint_complete_database.sql`, but there are pending migrations in the repo root and the production DB may differ.

---

## 2. Target end-to-end flow

```
Customer uploads  ->  order created (awaiting_payment)
Customer gets QR  ->  owner scans QR, records cash/GCash
Backend confirms  ->  job status = queued, paid_at set
Python agent      ->  heartbeat + poll/claim
Backend claim     ->  locks job, job status = printing, creates print_attempts row
Agent downloads   ->  authorized document bytes + settings
Agent prints      ->  Windows Print Spooler on the shop PC
Agent reports     ->  submitted / printed / failed + spooler job id
Owner/browser     ->  sees live status, marks ready_for_pickup/completed
```

Architecture rules from `workflow.md`:

- The browser never sends a print command to the agent. The agent only prints jobs the backend authorizes.
- The agent must not manage customers, prices, payments, or QR tokens.
- Successful spooler submission is **not** proof paper came out.
- One shop may have several devices and printers, but data must stay scoped to that shop.
- Priority jobs print first; a job already printing is never interrupted; FIFO inside each priority class.

---

## 3. Blockers to fix before (or while) building the agent

### 3.1 Document expiry deletes paid jobs

`web/lib/document-cleanup.ts` sets `documents.expires_at` to **30 minutes after order creation** and deletes files past that time. Payment confirmation does **not** extend it. A job paid after 30 minutes (or printed later) has no file.

Fix before the agent can rely on files:

- On payment confirmation, extend `documents.expires_at` (for example +24 hours), or stop expiring documents for `queued`/`printing` jobs.
- Keep a retention policy for completed/cancelled jobs.
- Update `web/app/api/owner/payments/confirm/route.ts` inside the same transaction.

### 3.2 Schema gaps for devices and printers

Suggested additions (new migration, do not edit the live DB by hand):

```sql
ALTER TABLE shop_devices
  ADD COLUMN activation_token_hash VARCHAR(255) NULL,
  ADD COLUMN activation_expires_at TIMESTAMP NULL,
  ADD COLUMN activated_at TIMESTAMP NULL;

ALTER TABLE printers
  ADD UNIQUE KEY uq_printer_identifier (shop_id, printer_identifier);

ALTER TABLE print_attempts
  ADD KEY idx_attempt_active (job_id, status);
```

`device_identifier` is already unique. Decide whether a device can be reassigned to another shop (currently no).

### 3.3 Uploaded files are not all print-ready

`web/app/api/orders/route.ts` accepts `.pdf`, `.doc`, `.docx`, `.jpg`, `.jpeg`, `.png`, `.webm` and stores the original bytes. The agent must not send random formats to the spooler.

Decide and document who normalizes to PDF. Recommended: the agent creates a temporary, flattened PDF per job:

- PDF: copy selected pages.
- DOC/DOCX: LibreOffice headless (`soffice --headless --convert-to pdf`) — note page ranges are approximate for DOCX.
- JPG/PNG: wrap in a PDF page sized to the selected paper.
- WebM: reject for printing (show “unsupported for printing”) unless a separate frame-extraction feature is approved.

### 3.4 Completion semantics

Define when a job becomes `ready_for_pickup`:

- **Option A (recommended MVP):** agent reports `submitted`; owner visually confirms and clicks “Ready for pickup”.
- **Option B:** agent reports `printed` when the spooler job leaves the queue; backend moves the job automatically. Riskier: drivers lie and jobs can be retried.

Whichever is chosen, keep `print_attempts.status` and `job_status_history` as the audit trail.

### 3.5 Pairing/auth model must be chosen

Recommended: owner creates a one-time pairing code; the agent exchanges it for a device token; only the token hash is stored. Do not reuse owner sessions or QR tokens for the agent.

---

## 4. Backend APIs to implement

Add these as Next.js route handlers under `web/app/api/agent/` and `web/app/api/owner/devices|printers/`. All agent routes use `Authorization: Bearer <device_token>`.

General rules:

- Resolve device → shop on **every** request. Never accept a `shopId` from the agent.
- Use parameterized SQL and transactions.
- Return consistent JSON: `{ error }` with 4xx/5xx; never fake success.
- Make state-changing calls idempotent where retries are possible.
- Store only hashes of pairing codes and device tokens.
- Use constant-time comparison (`timingSafeEqual`).
- Add rate limiting/backoff guidance for claim/heartbeat.

### 4.1 Owner: devices

`POST /api/owner/devices/pairing` (owner session)

```json
{ "deviceName": "Front counter PC" }
```

Response:

```json
{ "deviceId": 12, "pairingCode": "QP-7F3K-92AD", "expiresAt": "2026-11-20T10:15:00.000Z" }
```

- Creates a `shop_devices` row in `unknown`/inactive-until-activated state for the owner’s shop.
- Stores `sha256(pairingCode)` and a 10-minute expiry.
- Owner UI displays the code; never show the device token.

`GET /api/owner/devices` — list devices with name, identifier, OS, version, status, last heartbeat, activated.

`PATCH /api/owner/devices/:id` — rename, activate/deactivate, revoke token.

### 4.2 Agent: activation

`POST /api/agent/activate` (no bearer token)

```json
{
  "pairingCode": "QP-7F3K-92AD",
  "deviceIdentifier": "sha256-of-windows-machine-guid",
  "deviceName": "Front counter PC",
  "operatingSystem": "Windows 11",
  "agentVersion": "0.1.0"
}
```

Response (shown once, agent stores securely):

```json
{ "deviceId": 12, "shopId": 3, "deviceToken": "base64url-32-bytes", "serverTime": "..." }
```

- Validate code hash + expiry + unused + shop match.
- Set `device_token_hash`, `activated_at`, clear the pairing fields, `connection_status = 'connected'`.
- A device that is deactivated must be rejected on every route.

### 4.3 Agent: heartbeat

`POST /api/agent/heartbeat`

```json
{ "agentVersion": "0.1.0", "operatingSystem": "Windows 11", "uptimeSeconds": 1234 }
```

Updates `last_seen_at`, `connection_status`, `agent_version`, `operating_system`. Return server time and optionally a `pollAfterSeconds` hint. Recommended every 30 seconds.

Consider a scheduled job that marks devices `disconnected` when `last_seen_at` is older than 90 seconds.

### 4.4 Agent: printer sync

`POST /api/agent/printers/sync`

```json
{
  "printers": [
    {
      "printerIdentifier": "EPSON L3250 Series",
      "printerName": "EPSON L3250 Series",
      "brand": "Epson",
      "model": "L3250",
      "printerType": "inkjet",
      "connectionType": "usb",
      "ipAddress": null,
      "supportsColor": true,
      "supportsDuplex": false,
      "supportedPaperSizes": ["A4", "Letter"],
      "isDefault": true,
      "availabilityStatus": "available",
      "connectionStatus": "connected"
    }
  ]
}
```

- Upsert by `(shop_id, printer_identifier)` and bind to `shop_device_id`.
- Never delete a printer that has historical `print_attempts`; mark it unavailable instead.
- Return server printer IDs so the agent can map local names to IDs.

### 4.5 Agent: claim a job

`POST /api/agent/jobs/claim` (optionally `{ "printerId": 4 }`)

Transaction outline (MySQL 8):

```sql
START TRANSACTION;

SELECT id, job_code, print_type, paid_at
FROM print_jobs
WHERE shop_id = ?
  AND status = 'queued'
  AND paid_at IS NOT NULL
ORDER BY (print_type = 'priority') DESC, paid_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- if no row: COMMIT and return 204

UPDATE print_jobs SET status = 'printing' WHERE id = ? AND status = 'queued';

INSERT INTO print_attempts
  (job_id, printer_id, shop_device_id, attempt_number, status, started_at)
VALUES (?, ?, ?, (SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM print_attempts WHERE job_id = ?), 'processing', UTC_TIMESTAMP());

INSERT INTO job_status_history (job_id, previous_status, new_status, remarks)
VALUES (?, 'queued', 'printing', 'Claimed by local printing agent.');

COMMIT;
```

Return `204 No Content` when idle. Never claim `printing`, `ready_for_pickup`, `completed`, `cancelled`, `failed`, or expired jobs.

Response payload must include everything the agent needs:

```json
{
  "jobId": 501,
  "jobCode": "QP-ABC123",
  "attemptId": 88,
  "jobToken": "signed-short-lived-token",
  "printType": "priority",
  "settings": { "paperSize": "A4", "colorMode": "black_white", "copies": 2, "orientation": "portrait" },
  "printerId": 4,
  "documents": [
    {
      "id": 901,
      "filename": "notes.pdf",
      "mimeType": "application/pdf",
      "fileSize": 91234,
      "pageCount": 4,
      "pageRanges": [{ "start": 1, "end": 2 }, { "start": 4, "end": 4 }],
      "downloadPath": "/api/agent/jobs/QP-ABC123/documents/901"
    }
  ]
}
```

- `jobToken`: HMAC-signed, 10–15 minutes, scoped to `jobId + attemptId + deviceId`. Add `AGENT_JOB_SECRET` to `web/.env.local` (document in `.env.example`). Without it, rely on the device token plus job/attempt scoping, but a short-lived token is strongly preferred.
- The claim response must not contain direct filesystem paths or public URLs.
- If the agent crashes after claiming, add a recovery rule: an attempt stuck in `processing` without heartbeat/download for N minutes may be marked failed and the job returned to `queued` by an owner action or scheduled job. Do not blindly auto-retry a job that may already be on the spooler.

### 4.6 Agent: download a document

`GET /api/agent/jobs/:jobCode/documents/:documentId`

- Requires device token and (recommended) `X-Job-Token`.
- Verify job belongs to the device’s shop, attempt is active, job not expired, document not deleted.
- Stream the file from `web/storage/documents`; set `Content-Type`, `Content-Length`, `Content-Disposition`.
- Reject path traversal; resolve and confirm the path remains under `storage/documents`.
- Record “downloaded” on the attempt (see 4.7).
- Do not expose this route without auth; do not put files under `public/`.

### 4.7 Agent: report attempt events

`POST /api/agent/jobs/:jobCode/attempts/:attemptId/events`

```json
{ "event": "submitted", "spoolerJobId": "42", "message": null }
```

Allowed events and effects:

| Event        | `print_attempts.status` | Job status / notes                                      |
| ------------ | ----------------------- | ------------------------------------------------------- |
| `downloaded` | `processing`            | Audit only; no job change                               |
| `submitted`  | `submitted`             | `submitted_at`; job stays `printing`                    |
| `printed`    | `printed`               | `completed_at`; optionally `ready_for_pickup`           |
| `failed`     | `failed`                | `error_message`; job `failed` or back to `queued`       |
| `cancelled`  | `cancelled`             | Only if owner/backend cancels before spooling           |

- Validate legal transitions; reject duplicates idempotently (same event twice = 200, no duplicate history row).
- If job status changed underneath the agent (owner cancelled), return `409` and do not print.
- A retry must create a **new** `print_attempts` row, never reuse one.
- Keep `local_spooler_job_id`; if one print job merges several documents, store the single spooler job id (recommended) or extend the schema.

### 4.8 Owner: queue actions

Add owner endpoints for:

- `PATCH /api/owner/orders/:jobCode/status` — `ready_for_pickup`, `completed`, `cancelled`, `failed`.
- `POST /api/owner/orders/:jobCode/retry` — only for `failed`; creates a new attempt and returns the job to `queued`.
- `GET /api/owner/queue` — already exists; extend it to show attempt status, printer, spooler id, and last error.

All must filter by `shops.owner_id = session.userId`.

---

## 5. Python agent design

### 5.1 Suggested layout

```
agent/
  pyproject.toml (or requirements.txt)
  qprint_agent/
    __main__.py
    config.py          # load/validate agent.json
    api.py             # authenticated HTTP client, retries
    device.py          # machine id, activation, token storage
    heartbeat.py
    printers.py        # EnumPrinters + capability mapping
    jobs.py            # claim loop, state machine
    documents.py       # download + verify + page-range extraction
    render.py          # docx/doc/image -> PDF
    spooler.py         # submit to Windows + monitor spooler
    state.py           # local SQLite/lock file for crash recovery
    logging.py
  installer/           # NSSM or pywin32 service, config template
  tests/
```

Recommended dependencies: `requests`, `pywin32`, `pypdf`, `Pillow`; optional `docx2pdf`/LibreOffice. Python 3.11+.

### 5.2 Config and secrets

`%ProgramData%\QPrint\agent.json` (example):

```json
{
  "baseUrl": "https://your-domain.example",
  "deviceIdentifier": "stable-hash-of-machine-guid",
  "deviceToken": "stored-securely",
  "pollSeconds": 3,
  "heartbeatSeconds": 30,
  "printerSyncSeconds": 60,
  "tempDir": "C:\\ProgramData\\QPrint\\temp"
}
```

- Prefer Windows Credential Manager or DPAPI over plaintext tokens.
- Restrict file ACLs to the service account.
- Never log the token or pairing code.
- Verify TLS certificates; do not disable verification.
- One agent instance per machine; use a named mutex or lock file.

### 5.3 Main loop

1. On start: validate config; activate if no token.
2. Heartbeat immediately, then every 30s.
3. Enumerate printers and sync immediately, then every 60s (only when changed, if possible).
4. Poll `POST /api/agent/jobs/claim` every 3–5s with jitter.
5. On a job: download all documents, record `downloaded`, build a temp PDF, submit to the selected printer.
6. Report `submitted` with the spooler job id.
7. Monitor `EnumJobs` until the job leaves the queue; report `printed` or `failed`.
8. Always clean temp files in `finally`.
9. Exponential backoff on network/5xx errors; never busy-loop.

Do not run two print jobs at once on the same printer unless explicitly designed. A simple global “one active job” lock is acceptable for the first version.

### 5.4 Windows printing specifics

- Enumerate printers: `win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS)`.
- Resolve the printer by **exact Windows printer name** (`printer_identifier`), not by index.
- Capabilities: `win32print.GetPrinter(handle, 2)` / DEVMODE for color, duplex, paper sizes. Normalize to QPrint values (`A4`, `A3`, `black_white`, `colored`, etc.).
- Page ranges: extract and merge selected pages with `pypdf` before printing. Do **not** print the whole file when the customer selected pages; the price already assumes selected pages × copies.
- Copies: set at the print settings level, not by printing the file N times, unless the driver is unreliable.
- Submission options:
  - SumatraPDF CLI: `SumatraPDF.exe -print-to "EPSON L3250 Series" -print-settings "paper=A4,color,portrait" -silent job.pdf` (recommended for PDFs; verify the exact syntax for your version).
  - `win32api.ShellExecute(0, "printto", pdf_path, f'"{printer_name}"', ".", 0)` (simple, less control).
  - Raw spooling is not appropriate for PDFs.
- Get the spooler job id by diffing `EnumJobs` before/after submission; store it in `local_spooler_job_id`.
- Monitor with `EnumJobs` for status (`JOB_STATUS_PRINTING`, `ERROR`, `OFFLINE`, `PAPEROUT`, etc.). Map to attempt errors.
- Service-session caveat: some USB printer drivers do not print from Windows session 0. If that happens, run the agent as a tray app or a scheduled task in the logged-in shop user session (still auto-start at logon) instead of a true service.
- Handle printer offline, paper out, jam, and paused queue explicitly; surface readable error messages.
- Never accept a file path or printer name from the backend beyond the authorized, stored values; validate against the synced printer list.

### 5.5 Crash/retry safety

- Claiming sets the job to `printing`; a crash must not silently print twice.
- On startup, query the backend for the device’s active attempt. If it was already `submitted`, do not resubmit automatically.
- Track local state in SQLite (`jobCode`, `attemptId`, `stage`, `spoolerJobId`, `fileHash`).
- Only retry after a confirmed failure (spooler error/owner retry), not after an ambiguous timeout.
- Deduplicate downloads by hash/size if needed.

---

## 6. Security checklist

- [ ] Device tokens are random (≥32 bytes), hashed at rest, shown once, revocable, and never returned by read APIs.
- [ ] Pairing codes are one-time, short-lived, hashed, and rate-limited.
- [ ] Every agent request resolves the shop from the device, not from request data.
- [ ] Every document download verifies device → shop → job → attempt → document.
- [ ] Files stay outside `public/`; path traversal is blocked.
- [ ] Job claims use row locking/`SKIP LOCKED`; duplicate claims cannot happen.
- [ ] Retries create new attempts; repeated events are idempotent.
- [ ] Job token is short-lived, signed, and scoped to job + attempt + device.
- [ ] Agent validates TLS and stores credentials with OS-level protection.
- [ ] Logs redact tokens, QR payloads, filenames if sensitive, and document contents.
- [ ] Deactivated devices and inactive shops are rejected immediately.
- [ ] No mock/”pretend printed” success paths.

---

## 7. Test plan

1. **Pairing:** create device, activate with code, reject reused/expired codes, revoke and confirm 401.
2. **Heartbeat:** device shows connected, then disconnected after the timeout.
3. **Printer sync:** add/remove/rename a printer on Windows and confirm QPrint updates; historical attempts keep their printer row.
4. **Claim ordering:** create standard and priority paid jobs; priority claims first; FIFO inside each class; a `printing` job is never claimed.
5. **Concurrency:** two agents (or two threads) claim simultaneously; exactly one gets the job.
6. **Documents:** page ranges print only selected pages; multi-file job prints all files in order; copies are correct; DOCX/JPG/PNG convert; WebM is rejected cleanly.
7. **Status:** submitted → printed/failed updates attempt, job, and history; duplicate events do not duplicate rows.
8. **Failure:** printer offline / bad driver; owner sees the error and can retry; retry creates attempt #2.
9. **Expiry:** document still available after payment and until completion (after blocker 3.1 is fixed).
10. **Spooler simulation:** use “Microsoft Print to PDF” for automated tests before touching a real printer.

---

## 8. Suggested milestones

1. **Backend prerequisite (web):** fix document retention, add device/printer migration, add agent API routes + owner device/printer pages.
2. **Agent MVP:** activation, heartbeat, printer sync, claim, download, print to “Microsoft Print to PDF”, report submitted/failed.
3. **Real printing:** selected pages/copies/settings, spooler monitoring, printer capability mapping.
4. **Owner controls:** live queue status, retry failed jobs, ready-for-pickup/completed actions, device/printer management UI.
5. **Packaging:** installer, auto-start (service or scheduled task), config UI or CLI, logs, update path.

Definition of done for the first usable version: a paid job appears in the queue, is claimed exactly once, prints the selected pages on the chosen Windows printer with the chosen settings, and the owner sees accurate submitted/failed/ready status without touching a terminal.

---

## 9. Files worth reading first

- `workflow.md` — full spec, especially sections 9–12 and 15.
- `qprint_complete_database.sql` — schema and the example queue query.
- `web/app/api/orders/route.ts` — how orders/documents/settings are created.
- `web/app/api/owner/payments/confirm/route.ts` — how a job becomes `queued`.
- `web/app/api/owner/queue/route.ts` and `web/lib/owner-data.ts` — queue read model.
- `web/lib/document-cleanup.ts` — expiry logic that must change.
- `web/lib/db.ts` and `web/lib/session.ts` — DB/session conventions.
- `web/app/owner/` — owner UI patterns to reuse for Devices/Printers pages.

---

## 10. Open decisions (confirm before coding)

1. Does scanning the QR + confirming payment start printing immediately, or does the owner press “Print next”?
2. Who confirms physical completion — agent spooler monitoring, owner, or both?
3. Is document conversion done in the agent (recommended) or in the web backend?
4. Should a shop with multiple printers route jobs by capability, or does the owner choose the printer per job?
5. Polling only, or add Server-Sent Events/WebSocket for live queue updates?
6. Retention period for paid documents and completed jobs.
7. MySQL version (affects `SKIP LOCKED`) and production base URL/HTTPS setup.
