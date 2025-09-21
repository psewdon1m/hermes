import http from 'http';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createSignalServer } from './signal/server.js';

dotenv.config();

const API_PORT = Number(process.env.PORT || 3001);
const SIGNAL_PORT = Number(process.env.SIGNAL_PORT || 3002);
const SIGNAL_PATH = process.env.SIGNAL_PATH || '/ws';

const app = createApp();
const apiServer = http.createServer(app);

createSignalServer(apiServer, { path: SIGNAL_PATH });

apiServer.listen(API_PORT, () => {
  console.log(API server running on port );
  if (SIGNAL_PORT === API_PORT) {
    console.log(WebSocket signaling available at path );
  }
});

if (SIGNAL_PORT !== API_PORT) {
  const signalServer = http.createServer();
  createSignalServer(signalServer, { path: SIGNAL_PATH });
  signalServer.listen(SIGNAL_PORT, () => {
    console.log(WebSocket signaling server running on port );
  });
}
