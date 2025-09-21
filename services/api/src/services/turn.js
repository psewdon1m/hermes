import crypto from 'crypto';

// Создание TURN credentials
export async function createTurnCredentials(callId) {
  const turnSecret = process.env.TURN_SECRET || 'default-turn-secret';
  const turnDomain = process.env.TURN_DOMAIN || process.env.DOMAIN || 'tgcall.us';
  const turnPort = process.env.TURN_PORT || '3479';
  const turnTlsPort = process.env.TURN_TLS_PORT || '5350';
  
  // Генерируем временные credentials для TURN сервера
  const username = `call_${callId}_${Date.now()}`;
  const password = crypto.createHmac('sha256', turnSecret)
    .update(username)
    .digest('base64');
  
  const iceServers = [
    {
      urls: `stun:${turnDomain}:${turnPort}`
    },
    {
      urls: `turn:${turnDomain}:${turnPort}`,
      username: username,
      credential: password
    },
    {
      urls: `turns:${turnDomain}:${turnTlsPort}`,
      username: username,
      credential: password
    }
  ];
  
  return {
    iceServers,
    username,
    password
  };
}
