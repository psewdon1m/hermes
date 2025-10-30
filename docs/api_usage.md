# Hermes API Usage

This document lists the public HTTP endpoints exposed by the Hermes API service and how to call them. All routes are rooted at the API base URL, defined by the `CALL_API_BASE` environment variable of the consumer (defaults to `https://call.tgcall.us`).

## General Requirements

- Requests and responses use JSON.
- Clients must send the header `Content-Type: application/json` for all `POST` requests.
- Rate limiting is enforced (60 requests per minute per IP); handle `429` responses with exponential backoff.

## `POST /api/call/create`

Creates a new call session and returns the data required for the initiator.

- **Request body**

  ```json
  {
    "initiator_telegram_id": "123456789"
  }
  ```

  | Field | Type | Notes |
  |-------|------|-------|
  | `initiator_telegram_id` | string | Telegram user ID of the initiator (1-64 chars). |

- **Success response (`200`)**

  ```json
  {
    "callId": "c_ab12cd34ef56",
    "code": "A1B2C3",
    "joinUrl": "https://call.tgcall.us/join?token=..."
  }
  ```

  | Field | Type | Notes |
  |-------|------|-------|
  | `callId` | string | Internal call identifier (prefixed with `c_`). |
  | `code` | string | 6-character alphanumeric code (upper-case) valid for 15 minutes. |
  | `joinUrl` | string | Pre-signed join link for the initiator (JWT token valid for 24 hours). |

- **Error responses**

  | Status | Body | Meaning |
  |--------|------|---------|
  | `400` | `{"error":"bad_request","details":[...]}` | Payload validation failed. |
  | `429` | `{"error":"too_many_requests"}` | Rate limit exceeded. |
  | `500` | `{"error":"internal_error"}` | Unexpected server failure. |

## `POST /api/call/resolve`

Trades a previously issued call code for a join link intended for the answering participant.

- **Request body**

  ```json
  {
    "code": "A1B2C3"
  }
  ```

  | Field | Type | Notes |
  |-------|------|-------|
  | `code` | string | 6-character alphanumeric code (case-insensitive). |

- **Success response (`200`)**

  ```json
  {
    "joinUrl": "https://call.tgcall.us/join?token=..."
  }
  ```

  The returned JWT link is valid for 24 hours and grants the role `answerer`.

- **Error responses**

  | Status | Body | Meaning |
  |--------|------|---------|
  | `400` | `{"error":"bad_request","details":[...]}` | Payload validation failed. |
  | `404` | `{"error":"code_not_found_or_expired"}` | Code expired (15 min TTL) or never existed. |
  | `429` | `{"error":"too_many_requests"}` | Rate limit exceeded. |
  | `500` | `{"error":"internal_error"}` | Unexpected server failure. |

## `POST /api/join`

Exchanges a join token (JWT) for connection parameters used by the WebRTC client.

- **Request body**

  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

  | Field | Type | Notes |
  |-------|------|-------|
  | `token` | string | Join token received from `joinUrl`. Minimum length 10 characters. |

- **Success response (`200`)**

  ```json
  {
    "callId": "c_ab12cd34ef56",
    "role": "offerer",
    "iceServers": [
      { "urls": ["stun:call.tgcall.us:3478"] },
      {
        "urls": ["turn:call.tgcall.us:3478?transport=udp"],
        "username": "1730227200:user",
        "credential": "base64-hmac"
      },
      {
        "urls": ["turns:call.tgcall.us:5349?transport=tcp"],
        "username": "1730227200:user",
        "credential": "base64-hmac"
      }
    ],
    "wsUrl": "wss://call.tgcall.us/ws"
  }
  ```

  | Field | Type | Notes |
  |-------|------|-------|
  | `callId` | string | Call identifier linked to the token. |
  | `role` | string | Either `offerer` or `answerer` depending on join order. |
  | `iceServers` | array | STUN/TURN credentials valid for 10 minutes. |
  | `wsUrl` | string | Signaling WebSocket endpoint. |

- **Error responses**

  | Status | Body | Meaning |
  |--------|------|---------|
  | `400` | `{"error":"bad_request","details":[...]}` | Payload validation failed. |
  | `401` | `{"error":"bad_jwt" \| "bad_jwt_sig" \| "jwt_expired" \| "bad_jwt_payload"}` | Token invalid or expired. |
  | `500` | `{"error":"internal_error"}` | Unexpected server failure. |

## `GET /healthz`

Simple health probe endpoint.

- **Success response (`200`)**

  ```json
  { "ok": true }
  ```

  Any non-`200` response should be considered a failing health check.

---

For additional architectural details see `docs/technical-passport.md`. Contact the backend team before exposing new endpoints or altering request/response contracts.
