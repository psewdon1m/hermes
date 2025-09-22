import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3001);

const app = createApp();

app.listen(PORT, () => {
  console.log(API server running on port );
});
