// services/api/src/server.js
import { createApp } from './app.js';

const port = 8080;
const app = createApp();

app.listen(port, () => {
  console.log(`API on :${port}`);
});
