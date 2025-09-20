import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createApp } from './app.js';

const port = process.env.PORT || 3001;
const app = createApp();

app.listen(port, () => {
  console.log(`API server running on port ${port}`);
});
