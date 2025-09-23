// services/api/src/lib/errors.js
export function badRequest(res, details) {
  return res.status(400).json({ error: 'bad_request', details });
}
export function unauthorized(res, msg = 'unauthorized') {
  return res.status(401).json({ error: msg });
}
export function tooMany(res, msg = 'too_many_requests') {
  return res.status(429).json({ error: msg });
}
export function internal(res) {
  return res.status(500).json({ error: 'internal_error' });
}
