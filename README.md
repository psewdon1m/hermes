# TGCall - WebRTC Video Calling Platform

A modern, secure video calling platform built with WebRTC, featuring P2P connections with TURN fallback, Docker containerization, and a beautiful user interface.

## 🚀 Features

- **P2P Video Calls**: Direct peer-to-peer connections for optimal performance
- **TURN Fallback**: Automatic fallback to TURN server when P2P fails
- **Secure**: HTTPS with SSL certificates and security headers
- **Modern UI**: Beautiful, responsive interface with real-time controls
- **Docker Ready**: Complete containerization for easy deployment
- **Redis Storage**: Efficient call state management
- **Auto-cleanup**: Calls expire after 60 minutes of inactivity
- **Link Sharing**: Simple URL-based call joining

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   TURN Server   │
│   (React SPA)   │◄──►│   (Node.js)     │◄──►│   (coturn)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx         │    │   Redis         │    │   SSL Certs     │
│   (Proxy)       │    │   (Storage)     │    │   (Security)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Docker and Docker Compose
- Node.js (for development)
- SSL certificates (for production)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd hermes
```

### 2. Configure Environment

Create and configure the `.env` file:

```bash
cp .env.example .env
# Edit .env with your domain and SSL certificate paths
```

### 3. Deploy with Docker

```bash
docker-compose up -d
```

## 🎯 Usage

### Creating a Call

Use the provided script to generate call links:

```bash
node scripts/create-call.js
```

### Joining a Call

1. Share the generated link with participants
2. Open the link in a modern web browser
3. Allow camera and microphone permissions
4. Start your video call!

### API Endpoints

- `POST /api/create` - Create a new call
- `GET /api/join?call_id=<id>` - Check call status
- WebSocket `/socket.io/` - Signaling server

## 🔧 Configuration

### Environment Variables

```bash
# Backend
NODE_ENV=production
REDIS_URL=redis://redis:6379
TURN_SERVER=turn:coturn:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass

# TURN Server
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
TURN_REALM=tgcall.us
```

### Ports

- `80/443` - Nginx (HTTP/HTTPS)
- `3001` - Backend API
- `3478` - TURN/STUN (UDP/TCP)
- `5349` - TURN TLS
- `6379` - Redis

## 🔒 Security

- HTTPS with SSL certificates
- Security headers (HSTS, CSP, etc.)
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure WebSocket connections

## 📱 Browser Support

- Chrome 56+
- Firefox 52+
- Safari 11+
- Edge 79+

## 🐛 Troubleshooting

### Common Issues

1. **Camera/Microphone not working**
   - Check browser permissions
   - Ensure HTTPS is enabled
   - Verify media device availability

2. **Connection failed**
   - Check firewall settings
   - Verify TURN server configuration
   - Ensure proper SSL certificates

3. **Docker issues**
   - Check container logs: `docker-compose logs`
   - Verify port availability
   - Check network connectivity

### Debug Mode

Enable debug logging:

```bash
# Backend
NODE_ENV=development docker-compose up

# Frontend
npm run dev
```

## 📊 Monitoring

### Health Checks

- Backend: `GET /api/health`
- Nginx: `GET /health`
- Docker: Built-in health checks

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f nginx
```

## 🚀 Production Deployment

### 1. SSL Certificates

Ensure your SSL certificates are available at the paths specified in `.env`:

```bash
# Example for Let's Encrypt
/etc/letsencrypt/live/yourdomain.com/fullchain.pem
/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 2. Environment Configuration

Update `.env` file with your production settings:

```bash
NODE_ENV=production
DOMAIN=yourdomain.com
SERVER_IP=38.180.153.25
TURN_EXTERNAL_IP=38.180.153.25
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 3. Deploy

```bash
docker-compose up -d
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review Docker logs
3. Open an issue on GitHub
4. Contact support

---

**TGCall** - Secure, modern video calling made simple.
