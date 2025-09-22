# TGCall Project Overview

## Repository Structure

```
/infra
  /nginx        - Nginx reverse proxy configuration
  /turnserver.conf - coturn configuration
/services
  /api          - REST API service (Node.js)
  /signal       - WebSocket signaling service (Node.js)
/redis           - Redis Dockerfile/config
/web             - Static frontend (HTML/JS served by nginx)
```

## Services and Containers

| Service | Path | Ports | Purpose |
|---------|------|-------|---------|
| web     | web/Dockerfile | 3000->80 | Static UI, diagnostics page |
| api     | services/api    | 3001     | REST API: create/resolve/join calls, rate-limited |
| signal  | services/signal | 3002     | WebSocket signaling, JWT-verified peers |
| redis   | redis           | 6379     | State storage (calls, peers, codes) |
| coturn  | infra/turnserver.conf | 3478/3478udp/5349 | TURN/STUN server |
| nginx   | infra/nginx     | 8080/8443 -> 80/443 | TLS termination and routing |

## Service Interaction

- **Client** requests `POST /api/call/create`, receives `joinUrl` + code.
- Optional `POST /api/call/resolve` consumes the code for participant.
- `POST /api/join` verifies token, returns `wsUrl` and TURN credentials.
- Frontend opens `wss://<domain>/ws` (proxied to signal service) with `callId`, `peerId`, `sig` (JWT).
- Signal service validates JWT, coordinates peers via Redis pub/sub.
- Turn credentials issued with HMAC secret; expires after TTL.

## Redis Keys

- `call:<id>` - hash (status, timestamps, initiator)
- `call:<id>:peers` - set of peer IDs
- `otc:<code>` - ephemeral mapping code->callId

## Environment Variables (core)

- `DOMAIN`, `API_ORIGIN`, `WS_PUBLIC`
- `JWT_SECRET`, `TURN_SECRET`, `TURN_DOMAIN`, `TURN_TTL_SECONDS`, `JOIN_TOKEN_TTL_SECONDS`
- `REDIS_URL`
- `SIGNAL_PATH`
- Service ports `FRONTEND_PORT`, `API_PORT`, `SIGNAL_PORT`, `REDIS_PORT`, `TURN_UDP_PORT`, `TURN_TLS_PORT`, `NGINX_HTTP_PORT`, `NGINX_HTTPS_PORT`
- TLS paths: `SSL_CERT_PATH`, `SSL_KEY_PATH`

## Request Flow

1. User hits UI (`web/index.html`), enters token or follows join link.
2. UI calls `/api/join` -> receives `callId`, `role`, `wsUrl`, `iceServers`.
3. UI connects to WebSocket with params, receives peer list, negotiates WebRTC.
4. Signal service updates Redis during lifecycle, notifies other peers (`peer-joined`, `peer-left`).
5. TURN server assists P2P media via credentials.

## Deployment Notes

- Docker Compose orchestrates all containers; `nginx` frontends traffic to `web`, `api`, `signal`.
- `redis` persists data volume `redis_data`.
- TLS certificates mounted from host into `infra/nginx` and `coturn`.
- `.env` defines production values (JWT/turn secrets, domain, ports).

## Useful Commands

```
docker compose build --no-cache
$env:JWT_SECRET=$(openssl rand -hex 32)
python scripts/generate_token.py
curl -X POST http://localhost:3001/api/call/create -H "Content-Type: application/json" -d '{"initiator_telegram_id":"test"}'
```
