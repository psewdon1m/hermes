class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnections = new Map();
        this.socket = null;
        this.roomId = null;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isScreenSharing = false;
        
        // ICE servers for NAT traversal (STUN + TURN)
        this.iceServers = [
            // STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // TURN server (will be configured dynamically)
            {
                urls: `turn:${window.location.hostname}:3478`,
                username: 'turnuser',
                credential: 'turnpass'
            },
            {
                urls: `turns:${window.location.hostname}:5349`,
                username: 'turnuser',
                credential: 'turnpass'
            }
        ];
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadIceServers();
            await this.getUserMedia();
            this.setupSocket();
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to initialize WebRTC:', error);
            this.showToast('Ошибка инициализации', 'error');
        }
    }
    
    async loadIceServers() {
        try {
            const response = await fetch('/api/ice-servers');
            const data = await response.json();
            this.iceServers = data.iceServers;
            console.log('ICE servers loaded:', this.iceServers);
        } catch (error) {
            console.error('Failed to load ICE servers, using defaults:', error);
            // Keep default ICE servers if API fails
        }
    }
    
    async getUserMedia() {
        try {
            // Check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser');
            }
            
            // Show permission request message
            this.showToast('Запрашиваем разрешение на камеру и микрофон...', 'info');
            
            // Request media with specific constraints
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            
            // Check if we actually got video and audio tracks
            const videoTracks = this.localStream.getVideoTracks();
            const audioTracks = this.localStream.getAudioTracks();
            
            if (videoTracks.length === 0) {
                console.warn('No video track obtained');
                this.showToast('Видео недоступно', 'warning');
            }
            
            if (audioTracks.length === 0) {
                console.warn('No audio track obtained');
                this.showToast('Микрофон недоступен', 'warning');
            }
            
            console.log('Local stream obtained:', {
                videoTracks: videoTracks.length,
                audioTracks: audioTracks.length,
                videoEnabled: videoTracks.length > 0 ? videoTracks[0].enabled : false,
                audioEnabled: audioTracks.length > 0 ? audioTracks[0].enabled : false
            });
            
            this.showToast('Разрешения получены успешно!', 'success');
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            
            // Provide specific error messages
            let errorMessage = 'Ошибка доступа к камере/микрофону';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Доступ к камере/микрофону запрещен. Разрешите доступ в настройках браузера.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'Камера или микрофон не найдены. Проверьте подключение устройств.';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Камера или микрофон используются другим приложением.';
            } else if (error.name === 'OverconstrainedError') {
                errorMessage = 'Настройки камеры/микрофона не поддерживаются.';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Ошибка безопасности. Убедитесь, что сайт использует HTTPS.';
            }
            
            this.showToast(errorMessage, 'error');
            throw error;
        }
    }
    
    setupSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });
        
        this.socket.on('user-joined', (userId) => {
            console.log('User joined:', userId);
            this.createPeerConnection(userId);
        });
        
        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removePeerConnection(userId);
        });
        
        this.socket.on('current-participants', (participants) => {
            console.log('Current participants:', participants);
            participants.forEach(userId => {
                this.createPeerConnection(userId);
            });
        });
        
        this.socket.on('offer', async (data) => {
            console.log('Received offer from:', data.from);
            await this.handleOffer(data.offer, data.from);
        });
        
        this.socket.on('answer', async (data) => {
            console.log('Received answer from:', data.from);
            await this.handleAnswer(data.answer, data.from);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate from:', data.from);
            await this.handleIceCandidate(data.candidate, data.from);
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showToast(error, 'error');
        });
        
        this.socket.on('room-status', (status) => {
            console.log('Room status:', status);
            this.updateRoomStatus(status);
        });
    }
    
    setupEventListeners() {
        // Video toggle
        document.getElementById('toggleVideo').addEventListener('click', () => {
            this.toggleVideo();
        });
        
        // Audio toggle
        document.getElementById('toggleAudio').addEventListener('click', () => {
            this.toggleAudio();
        });
        
        // Screen sharing toggle
        document.getElementById('toggleScreen').addEventListener('click', () => {
            this.toggleScreenShare();
        });
        
        // Hang up
        document.getElementById('hangUp').addEventListener('click', () => {
            this.hangUp();
        });
        
        // Copy link
        document.getElementById('copy-link').addEventListener('click', () => {
            this.copyLink();
        });
    }
    
    joinRoom(roomId) {
        this.roomId = roomId;
        this.socket.emit('join-room', roomId);
        document.getElementById('room-id').textContent = roomId;
    }
    
    async createPeerConnection(userId) {
        if (this.peerConnections.has(userId)) {
            return;
        }
        
        const peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });
        
        // Add local stream tracks
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            this.remoteStreams.set(userId, remoteStream);
            this.addRemoteVideo(userId, remoteStream);
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`ICE candidate for ${userId}:`, event.candidate);
                this.socket.emit('ice-candidate', {
                    roomId: this.roomId,
                    candidate: event.candidate,
                    to: userId
                });
            } else {
                console.log(`ICE gathering complete for ${userId}`);
            }
        };
        
        // Handle ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${userId}:`, peerConnection.iceConnectionState);
            
            switch (peerConnection.iceConnectionState) {
                case 'connected':
                case 'completed':
                    // Check if we're using TURN or direct connection
                    const connectionType = this.getConnectionType(peerConnection);
                    this.showToast(`Соединение с ${userId.slice(0, 8)} установлено (${connectionType})`, 'success');
                    break;
                case 'disconnected':
                    this.showToast(`Соединение с ${userId.slice(0, 8)} потеряно`, 'warning');
                    break;
                case 'failed':
                    this.showToast(`Ошибка соединения с ${userId.slice(0, 8)}`, 'error');
                    break;
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
        };
        
        // Handle ICE gathering state changes
        peerConnection.onicegatheringstatechange = () => {
            console.log(`ICE gathering state with ${userId}:`, peerConnection.iceGatheringState);
        };
        
        this.peerConnections.set(userId, peerConnection);
        
        // Create and send offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                roomId: this.roomId,
                offer: offer,
                to: userId
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
    
    async handleOffer(offer, from) {
        const peerConnection = this.peerConnections.get(from);
        if (!peerConnection) {
            await this.createPeerConnection(from);
        }
        
        const pc = this.peerConnections.get(from);
        try {
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                roomId: this.roomId,
                answer: answer,
                to: from
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }
    
    async handleAnswer(answer, from) {
        const peerConnection = this.peerConnections.get(from);
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }
    
    async handleIceCandidate(candidate, from) {
        const peerConnection = this.peerConnections.get(from);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
            }
        }
    }
    
    removePeerConnection(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }
        
        this.remoteStreams.delete(userId);
        this.removeRemoteVideo(userId);
    }
    
    addRemoteVideo(userId, stream) {
        const remoteVideosContainer = document.getElementById('remoteVideos');
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'remote-video';
        videoContainer.id = `remote-${userId}`;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = `Участник ${userId.slice(0, 8)}`;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(label);
        remoteVideosContainer.appendChild(videoContainer);
        
        this.updateParticipantCount();
    }
    
    removeRemoteVideo(userId) {
        const videoElement = document.getElementById(`remote-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }
        this.updateParticipantCount();
    }
    
    updateParticipantCount() {
        const count = this.remoteStreams.size + 1; // +1 for local user
        document.getElementById('participant-count').innerHTML = 
            `<span>👥 Участников: ${count}/2</span>`;
    }
    
    updateRoomStatus(status) {
        const participantCount = document.getElementById('participant-count');
        if (participantCount) {
            participantCount.innerHTML = 
                `<span>👥 Участников: ${status.participantCount}/${status.maxParticipants}</span>`;
        }
        
        // Show room full message if needed
        if (status.isFull) {
            this.showToast('Комната заполнена (максимум 2 участника)', 'warning');
        }
    }
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoEnabled = videoTrack.enabled;
                
                const btn = document.getElementById('toggleVideo');
                if (this.isVideoEnabled) {
                    btn.classList.add('active');
                    btn.classList.remove('inactive');
                } else {
                    btn.classList.remove('active');
                    btn.classList.add('inactive');
                }
            }
        }
    }
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioEnabled = audioTrack.enabled;
                
                const btn = document.getElementById('toggleAudio');
                if (this.isAudioEnabled) {
                    btn.classList.add('active');
                    btn.classList.remove('inactive');
                } else {
                    btn.classList.remove('active');
                    btn.classList.add('inactive');
                }
            }
        }
    }
    
    async toggleScreenShare() {
        try {
            if (this.isScreenSharing) {
                // Stop screen sharing
                await this.localStream.getVideoTracks()[0].stop();
                await this.getUserMedia();
                this.isScreenSharing = false;
                
                const btn = document.getElementById('toggleScreen');
                btn.classList.remove('active');
                btn.classList.add('inactive');
            } else {
                // Start screen sharing
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                
                const videoTrack = screenStream.getVideoTracks()[0];
                const audioTrack = this.localStream.getAudioTracks()[0];
                
                this.localStream.removeTrack(this.localStream.getVideoTracks()[0]);
                this.localStream.addTrack(videoTrack);
                
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = this.localStream;
                
                this.isScreenSharing = true;
                
                const btn = document.getElementById('toggleScreen');
                btn.classList.add('active');
                btn.classList.remove('inactive');
                
                // Handle screen share end
                videoTrack.onended = () => {
                    this.toggleScreenShare();
                };
            }
        } catch (error) {
            console.error('Error toggling screen share:', error);
            this.showToast('Ошибка при переключении экрана', 'error');
        }
    }
    
    hangUp() {
        // Close all peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Redirect to home or show message
        window.location.href = '/';
    }
    
    copyLink() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            this.showToast('Ссылка скопирована!', 'success');
        }).catch(() => {
            this.showToast('Ошибка копирования', 'error');
        });
    }
    
    updateConnectionStatus(status) {
        const indicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('#connection-status span:last-child');
        
        indicator.className = 'status-indicator';
        
        switch (status) {
            case 'connected':
                indicator.classList.add('connected');
                statusText.textContent = 'Подключено';
                break;
            case 'disconnected':
                indicator.classList.add('error');
                statusText.textContent = 'Отключено';
                break;
            default:
                statusText.textContent = 'Подключение...';
        }
    }
    
    getConnectionType(peerConnection) {
        if (!peerConnection.getStats) {
            return 'Unknown';
        }
        
        // This is a simplified check - in a real implementation,
        // you'd need to use getStats() to determine the actual connection type
        // For now, we'll return a generic message
        return 'P2P/TURN';
    }
    
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Export for use in app.js
window.WebRTCManager = WebRTCManager;

