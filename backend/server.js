const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const redis = require('redis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Call management
class CallManager {
  constructor() {
    this.calls = new Map();
    this.callTimeout = (process.env.CALL_TIMEOUT_MINUTES || 60) * 60 * 1000; // minutes to ms
  }

  async createCall() {
    const callId = uuidv4();
    const callData = {
      id: callId,
      participants: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'waiting'
    };

    await redisClient.setEx(`call:${callId}`, this.callTimeout / 1000, JSON.stringify(callData));
    return callData;
  }

  async getCall(callId) {
    const callData = await redisClient.get(`call:${callId}`);
    return callData ? JSON.parse(callData) : null;
  }

  async updateCallActivity(callId) {
    const callData = await this.getCall(callId);
    if (callData) {
      callData.lastActivity = Date.now();
      await redisClient.setEx(`call:${callId}`, this.callTimeout / 1000, JSON.stringify(callData));
    }
  }

  async addParticipant(callId, socketId) {
    const callData = await this.getCall(callId);
    if (callData && callData.participants.length < 2) {
      callData.participants.push(socketId);
      callData.status = callData.participants.length === 2 ? 'active' : 'waiting';
      await redisClient.setEx(`call:${callId}`, this.callTimeout / 1000, JSON.stringify(callData));
      await this.updateCallActivity(callId);
      return callData;
    }
    return null;
  }

  async removeParticipant(callId, socketId) {
    const callData = await this.getCall(callId);
    if (callData) {
      callData.participants = callData.participants.filter(id => id !== socketId);
      callData.status = callData.participants.length === 0 ? 'ended' : 'waiting';
      await redisClient.setEx(`call:${callId}`, this.callTimeout / 1000, JSON.stringify(callData));
      return callData;
    }
    return null;
  }
}

const callManager = new CallManager();

// REST API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/create', async (req, res) => {
  try {
    const call = await callManager.createCall();
    const domain = process.env.DOMAIN || 'tgcall.us';
    res.json({
      callId: call.id,
      url: `https://${domain}/call?${call.id}`,
      status: 'created'
    });
  } catch (error) {
    console.error('Error creating call:', error);
    res.status(500).json({ error: 'Failed to create call' });
  }
});

app.get('/join', async (req, res) => {
  try {
    const { call_id } = req.query;
    if (!call_id) {
      return res.status(400).json({ error: 'call_id is required' });
    }

    const call = await callManager.getCall(call_id);
    if (!call) {
      return res.status(404).json({ error: 'Call not found or expired' });
    }

    const domain = process.env.DOMAIN || 'tgcall.us';
    res.json({
      callId: call.id,
      status: call.status,
      participants: call.participants.length,
      url: `https://${domain}/call?${call.id}`
    });
  } catch (error) {
    console.error('Error joining call:', error);
    res.status(500).json({ error: 'Failed to join call' });
  }
});

// WebSocket signaling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-call', async (data) => {
    const { callId } = data;
    const call = await callManager.addParticipant(callId, socket.id);
    
    if (call) {
      socket.join(callId);
      socket.emit('call-joined', { callId, status: call.status });
      
      // Notify other participants
      socket.to(callId).emit('participant-joined', { 
        participantId: socket.id,
        status: call.status 
      });
    } else {
      socket.emit('call-error', { message: 'Call not found or full' });
    }
  });

  socket.on('offer', async (data) => {
    const { callId, offer } = data;
    await callManager.updateCallActivity(callId);
    socket.to(callId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', async (data) => {
    const { callId, answer } = data;
    await callManager.updateCallActivity(callId);
    socket.to(callId).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', async (data) => {
    const { callId, candidate } = data;
    await callManager.updateCallActivity(callId);
    socket.to(callId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    // Find and remove from all calls
    const rooms = Array.from(socket.rooms);
    for (const room of rooms) {
      if (room !== socket.id) {
        const call = await callManager.removeParticipant(room, socket.id);
        if (call) {
          socket.to(room).emit('participant-left', { 
            participantId: socket.id,
            status: call.status 
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
