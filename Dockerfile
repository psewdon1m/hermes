# Multi-stage build for Node.js server and Python bot
FROM node:18-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy Node.js source code
COPY server/ ./server/
COPY public/ ./public/

# Python stage for bot
FROM python:3.11-alpine AS python-builder

WORKDIR /app

# Install system dependencies for Alpine
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code
COPY bot/ ./bot/

# Final stage
FROM node:18-alpine

WORKDIR /app

# Install Python in Alpine
RUN apk add --no-cache python3 py3-pip

# Copy Node.js app from builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/server ./server
COPY --from=node-builder /app/public ./public
COPY --from=node-builder /app/package*.json ./

# Copy Python bot from builder
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin
COPY --from=python-builder /app/bot ./bot
COPY --from=python-builder /app/requirements.txt ./

# Python dependencies already installed in python-builder stage

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'cd /app' >> /app/start.sh && \
    echo 'npm run start &' >> /app/start.sh && \
    echo 'cd /app && python3 bot/bot.py &' >> /app/start.sh && \
    echo 'wait' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose ports
EXPOSE 3000

# Start both server and bot
CMD ["/app/start.sh"]
