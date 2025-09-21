import crypto from 'crypto';

export async function createTurnCredentials(callId) {
  const turnSecret = process.env.TURN_SECRET || 'default-turn-secret';
  const turnDomain = process.env.TURN_DOMAIN || process.env.DOMAIN || 'tgcall.us';
  const turnPort = process.env.TURN_PORT || '3479';
  const turnTlsPort = process.env.TURN_TLS_PORT || '5350';

  const username = call__;
  const password = crypto.createHmac('sha256', turnSecret)
    .update(username)
    .digest('base64');

  const iceServers = [
    { urls: stun:: },
    {
      urls: 	urn::,
      username,
      credential: password
    },
    {
      urls: 	urns::,
      username,
      credential: password
    }
  ];

  return {
    iceServers,
    username,
    password
  };
}
