# Hermes

Hermes is a self-hosted WebRTC stack for private peer-to-peer video calls. The repository ships every service that the platform needs: REST API, WebSocket signalling, TURN/STUN, static web client, Telegram bot, and log observer. Everything is wired together through Docker Compose so the stack can run on a single VPS or be split across dedicated hosts.

## Architecture

- **Caddy** terminates TLS for `${SERVER_NAME}` and proxies requests to the API (`/api/*`), signalling (`/ws`), and the static web client (landing + `/join`).
- **API service** (Node/Express) issues one-time call codes, 24-hour join tokens/codes, and ICE credentials derived from the CoTURN secret.
- **Signal service** (Node/ws) validates JWTs, orchestrates SDP/ICE exchange between peers, and forwards client-side logs to Redis Pub/Sub.
- **CoTURN** provides STUN/TURN on ports 3478/5349; credentials are short-lived HMAC-SHA1 tuples generated per join request.
- **Redis** stores call state (`call:{id}`), join codes, rate-limit counters, and `logs:*` channels.
- **Web client** (vanilla JS) serves the landing page and the `/join` UI that drives the browser WebRTC session.
- **Telegram bot** (Aiogram + httpx) exposes `/start` and `/createCall`, generates short join links, and supports inline sharing with copy helpers.
- **Logger** subscribes to `logs:*`, prints colorised output, and persists everything under `log-output/observer.log`.

Documentation lives under `docs/`:

- `docs/api_usage.md` - HTTP contract and error semantics.
- `docs/project_passport.md` - Russian technical passport for the whole platform.
- `docs/directory_tree.md` - current repository structure.
- `docs/versions.md` - changelog for the web client and supporting scripts.

## Getting started

1. Copy the sample environment file:
   ```powershell
   Copy-Item example.env .env
   ```
2. Edit `.env` and provide:
   - `SERVER_NAME`, `API_ORIGIN`, `WS_PUBLIC`, `CALL_API_BASE`
   - secrets: `JWT_SECRET`, `TURN_SECRET`, `TG_BOT_TOKEN`
   - TLS paths: `SSL_CERT_HOST_PATH`, `SSL_KEY_HOST_PATH`
3. Issue TLS certificates (optional helper):
   ```bash
   ./scripts/issue-cert.sh
   ```
4. Start the stack:
   ```bash
   docker compose up -d --build
   ```
5. Visit `https://SERVER_NAME/` for the landing page or `https://SERVER_NAME/join` to test the call UI. The Telegram bot container reloads automatically whenever you edit files under `bot/`.

### Local web client preview

Use the provided PowerShell helper to serve the `web/` folder on `http://localhost:3000` (landing) and `http://localhost:3000/join`:

```powershell
./scripts/start-web-test-server.ps1
```

## Development notes

- **API testing** - handy curl snippets live in `scripts/commands.txt`. Rate limiting is enabled even in development (60 req/min/IP plus brute-force guard on `/api/call/resolve`).
- **Join codes** - each `POST /api/call/create` and `/api/call/resolve` response contains both a JWT (`joinToken`) and a 16-character `joinCode`. `/api/join` accepts either `token` or `code`.
- **Logging** - run `./scripts/logs.sh` to tail `log-output/observer.log` locally. The logger container creates the folder automatically when the compose stack starts.
- **Redis data** - joins are tracked under `call:{callId}` and `call:{callId}:peers`. OTC codes use the `otc:{code}` namespace, while short join codes use `join:code:{code}`.
- **Signal service** - accepts at most two peers per call. Additional peers receive `room-full` and are logged via Redis Pub/Sub.

## Scripts and helpers

- `scripts/issue-cert.sh` - certbot wrapper that copies cert/key files into the locations referenced by `.env`.
- `scripts/logs.sh` - tails the logger output and keeps a copy in `project-logs.log`.
- `scripts/replace-domain.sh` - replaces all occurrences of an old domain with a new one across the repository.
- `scripts/start-web-test-server.ps1` - lightweight HTTP server for the static client (no build step required).

## Useful commands

```bash
# rebuild a single service
docker compose build api && docker compose up -d api

# view API logs
docker compose logs -f api

# run the Telegram bot locally (requires pip deps)
cd bot && python -m venv .venv && .\.venv\Scripts\activate && pip install -r requirements.txt && python main.py
```

## Support and contributions

- Use the sample `.env` as the canonical list of required variables.
- Keep `docs/` in sync when changing external behaviour (API contracts, directory layout, deployment instructions).
- Prefer updating `docs/versions.md` when touching the web client or visual assets.
