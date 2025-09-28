# Hermes - WebRTC Video Calling System

A modern, secure video calling system built with WebRTC, featuring P2P connections through TURN/STUN servers and a microservices architecture.

## 🚀 Features

- **Real-time video calls** with WebRTC technology
- **Secure authentication** using JWT tokens
- **NAT traversal** via TURN/STUN servers
- **Rate limiting** and brute force protection
- **Responsive design** for desktop, tablet, and mobile
- **Automatic reconnection** on connection loss
- **Comprehensive logging** and monitoring
- **Docker-based deployment** with microservices architecture

## 🏗️ Architecture

The system consists of several microservices:

- **API Server** - REST API for call management
- **Signal Server** - WebSocket server for WebRTC signaling
- **Caddy** - HTTP/HTTPS proxy and web server
- **CoTURN** - TURN/STUN server for NAT traversal
- **Redis** - Cache and state storage
- **Logger** - Call event logging system
- **Web Client** - Frontend application

## 🛠️ Technology Stack

- **Backend**: Node.js, Express, WebSocket
- **Frontend**: Vanilla JavaScript, WebRTC, ES6 Modules
- **Database**: Redis
- **Proxy**: Caddy
- **TURN/STUN**: CoTURN
- **Containerization**: Docker, Docker Compose
- **Security**: JWT, HMAC-SHA256, Rate Limiting

## 📋 Prerequisites

- Docker and Docker Compose
- SSL certificates (Let's Encrypt recommended)
- Domain name with DNS configuration

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hermes
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up SSL certificates**
   ```bash
   # Place your SSL certificates in the configured paths
   # Update SSL_CERT_HOST_PATH and SSL_KEY_HOST_PATH in .env
   ```

4. **Start the services**
   ```bash
   docker-compose up -d
   ```

5. **Access the application**
   - Open your browser and navigate to your configured domain
   - Create a call and share the code with another participant

## ⚙️ Configuration

### Environment Variables

Key configuration options in `.env`:

```env
SERVER_NAME=your-domain.com
JWT_SECRET=your-jwt-secret
TURN_SECRET=your-turn-secret
SSL_CERT_HOST_PATH=/path/to/cert.pem
SSL_KEY_HOST_PATH=/path/to/key.pem
```

### SSL Setup

The system requires SSL certificates for secure WebRTC connections. You can use Let's Encrypt:

```bash
# Install certbot
sudo apt install certbot

# Obtain certificates
sudo certbot certonly --standalone -d your-domain.com

# Update .env with certificate paths
SSL_CERT_HOST_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_HOST_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

## 📖 Usage

### Creating a Call

1. Open the application in your browser
2. The system automatically creates a call and generates a 6-character code
3. Share the code with the person you want to call
4. They enter the code to join the call

### Joining a Call

1. Enter the 6-character code provided by the call creator
2. Grant camera and microphone permissions when prompted
3. The call will start automatically

### Controls

- **Link** - Copy the call URL to share
- **Cam** - Toggle camera on/off
- **Mic** - Toggle microphone on/off
- **Exit** - Leave the call

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Rate Limiting** - Protection against abuse (60 requests/minute per IP)
- **Brute Force Protection** - Limits on code resolution attempts
- **CORS Protection** - Restricted to production domain only
- **TLS Encryption** - All communications encrypted
- **Input Validation** - Zod schema validation for all inputs

## 📊 Monitoring

The system includes comprehensive logging:

- **Real-time logs** in the console with color coding
- **File logging** to `/var/log/calls/observer.log`
- **Call filtering** by call ID
- **Detailed event tracking** for debugging

View logs:
```bash
docker-compose logs -f logger
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| Caddy | 80, 443 | HTTP/HTTPS proxy |
| API | 8080 | REST API server |
| Signal | 8081 | WebSocket server |
| CoTURN | 3478, 5349 | TURN/STUN server |
| Redis | 6379 | Cache and state storage |

## 🔧 Development

### Local Development

1. **Install dependencies**
   ```bash
   cd api && npm install
   cd ../signal && npm install
   cd ../logger && npm install
   ```

2. **Start Redis locally**
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

3. **Run services**
   ```bash
   # Terminal 1: API server
   cd api && npm start
   
   # Terminal 2: Signal server
   cd signal && npm start
   
   # Terminal 3: Logger
   cd logger && npm start
   ```

### Building Docker Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build api
```

## 📝 API Documentation

### Endpoints

- `POST /api/call/create` - Create a new call
- `POST /api/call/resolve` - Resolve code to join token
- `POST /api/join` - Get call parameters
- `GET /healthz` - Health check

### WebSocket Events

- `peer-joined` - New participant joined
- `peer-left` - Participant left
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - ICE candidate

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Check the logs for debugging information
- Review the technical documentation in `docs/`

## 🔄 Updates

To update the system:

```bash
git pull origin main
docker-compose down
docker-compose up -d --build
```

---

**Note**: This system is designed for production use with proper SSL certificates and domain configuration. Ensure all security measures are properly configured before deployment.
