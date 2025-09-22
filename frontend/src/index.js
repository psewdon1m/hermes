import './styles.css';

class VideoCallApp {
    constructor() {
        this.ws = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.callId = null;
        this.joinToken = null;
        this.peerId = this.generatePeerId();
        this.remotePeerId = null;
        this.isOfferer = false;
        this.isMuted = false;
        this.isVideoOff = false;
        this.pendingCandidates = [];
        this.iceConfig = { iceServers: this.getDefaultIceServers() };
        this.role = 'participant';

        this.init();
    }

    generatePeerId() {
        return 'peer_' + Math.random().toString(36).slice(2, 10);
    }

    getDefaultIceServers() {
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    async init() {
        try {
            this.setupEventListeners();
            await this.extractTokenFromURL();
            await this.joinCall();
            await this.initializeMedia();
            this.createPeerConnection();
            this.connectToSignalingServer();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError(error.message || 'Initialization failed');
        }
    }

    setupEventListeners() {
        document.getElementById('muteBtn')?.addEventListener('click', () => this.toggleMute());
        document.getElementById('videoBtn')?.addEventListener('click', () => this.toggleVideo());
        document.getElementById('hangupBtn')?.addEventListener('click', () => this.hangup());
        document.getElementById('retry-btn')?.addEventListener('click', () => this.retry());
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    async extractTokenFromURL() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (!token) {
            throw new Error('No token provided in URL');
        }
        this.joinToken = token;
    }

    getApiBaseUrl() {
        const { protocol, hostname, host, port } = window.location;
        const isLocalDev = (hostname === 'localhost' || hostname === '127.0.0.1') && (!port || port === '3000' || port === '5173');
        if (isLocalDev) {
            return http://:3001;
        }
        return ${protocol}//System.Management.Automation.Internal.Host.InternalHost;
    }

    getWebSocketUrl() {
        const { protocol, hostname, host, port } = window.location;
        const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
        const isLocalDev = (hostname === 'localhost' || hostname === '127.0.0.1') && (port === '3000' || port === '5173');
        const base = isLocalDev ? ${wsProtocol}://:3002 : ${wsProtocol}://System.Management.Automation.Internal.Host.InternalHost;
        return ${base}/ws?callId=&peerId=&token=;
    }

    async joinCall() {
        const response = await fetch(${this.getApiBaseUrl()}/api/join, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: this.joinToken })
        });

        if (!response.ok) {
            let message = 'Failed to join call';
            try {
                const error = await response.json();
                message = error?.error || message;
            } catch (err) {
                console.warn('Failed to parse join error payload', err);
            }
            throw new Error(message);
        }

        const data = await response.json();
        this.callId = data.callId;
        this.role = data.role || 'participant';

        if (data.turnCredentials && Array.isArray(data.turnCredentials.iceServers) && data.turnCredentials.iceServers.length > 0) {
            this.iceConfig = { iceServers: data.turnCredentials.iceServers };
        } else {
            this.iceConfig = { iceServers: this.getDefaultIceServers() };
        }

        const callIdElement = document.getElementById('call-id');
        if (callIdElement) {
            callIdElement.textContent = this.callId;
        }

        this.updateCallStatus(data.status || 'pending');
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            document.getElementById('loading')?.classList.add('hidden');
            document.getElementById('error-screen')?.classList.add('hidden');
            document.getElementById('main-interface')?.classList.remove('hidden');

            this.updateConnectionStatus('Media ready', 'connected');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw new Error('Unable to access camera and microphone. Please check permissions.');
        }
    }

    createPeerConnection() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }

        this.peerConnection = new RTCPeerConnection(this.iceConfig);
        this.remoteStream = new MediaStream();
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = this.remoteStream;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        this.peerConnection.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach((track) => this.remoteStream.addTrack(track));
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                if (this.remotePeerId && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.sendSignal(this.remotePeerId, 'ice-candidate', event.candidate);
                } else {
                    this.pendingCandidates.push(event.candidate);
                }
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (!this.peerConnection) return;
            const state = this.peerConnection.connectionState;
            if (state === 'connected') {
                this.updateConnectionStatus('Peer connected', 'connected');
            } else if (state === 'failed' || state === 'disconnected') {
                this.updateConnectionStatus('Peer disconnected', 'error');
            }
        };
    }

    connectToSignalingServer() {
        if (!this.callId || !this.joinToken) {
            throw new Error('Missing call information for signaling');
        }

        const url = this.getWebSocketUrl();
        this.updateConnectionStatus('Connecting to server...', '');

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log('Connected to signaling server');
            this.updateConnectionStatus('Connected to server', 'connected');
            this.flushPendingCandidates();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleSignalMessage(message);
            } catch (error) {
                console.error('Failed to parse signaling message:', error);
            }
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus('Disconnected', 'error');
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('Connection error', 'error');
        };
    }

    handleSignalMessage(message) {
        switch (message.type) {
            case 'peers':
                this.handlePeers(message.peers || []);
                break;
            case 'peer_joined':
                this.handlePeerJoined(message.peerId);
                break;
            case 'peer_left':
                this.handlePeerLeft(message.peerId);
                break;
            case 'offer':
                this.handleOffer(message.payload, message.from);
                break;
            case 'answer':
                this.handleAnswer(message.payload, message.from);
                break;
            case 'ice-candidate':
                this.handleRemoteIceCandidate(message.payload);
                break;
            case 'room_full':
            case 'room_expired':
            case 'unauthorized':
            case 'error':
                this.showError('Unable to join call. Please try again later.');
                break;
            default:
                break;
        }
    }

    handlePeers(peers) {
        if (!Array.isArray(peers) || peers.length === 0) {
            this.remotePeerId = null;
            this.isOfferer = false;
            this.updateCallStatus('waiting');
            return;
        }

        this.remotePeerId = peers[0];
        this.isOfferer = true;
        this.updateCallStatus('active');
        this.flushPendingCandidates();
        this.startNegotiation();
    }

    handlePeerJoined(peerId) {
        if (!peerId) return;

        this.updateCallStatus('active');
        if (!this.remotePeerId) {
            this.remotePeerId = peerId;
        }

        if (!this.isOfferer) {
            this.flushPendingCandidates();
            return;
        }

        if (this.remotePeerId === peerId) {
            this.flushPendingCandidates();
            this.startNegotiation();
        }
    }

    handlePeerLeft(peerId) {
        if (peerId && this.remotePeerId === peerId) {
            this.remotePeerId = null;
            this.isOfferer = false;
            this.updateCallStatus('waiting');

            if (this.remoteStream) {
                this.remoteStream.getTracks().forEach((track) => track.stop());
                this.remoteStream = new MediaStream();
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) {
                    remoteVideo.srcObject = this.remoteStream;
                }
            }
        }
    }

    async startNegotiation() {
        if (!this.peerConnection || !this.remotePeerId || !this.isOfferer) {
            return;
        }

        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.sendSignal(this.remotePeerId, 'offer', offer);
        } catch (error) {
            console.error('Error starting negotiation:', error);
        }
    }

    sendSignal(target, type, payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        this.ws.send(JSON.stringify({ target, type, payload }));
    }

    flushPendingCandidates() {
        if (!this.remotePeerId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        while (this.pendingCandidates.length > 0) {
            const candidate = this.pendingCandidates.shift();
            this.sendSignal(this.remotePeerId, 'ice-candidate', candidate);
        }
    }

    async handleOffer(offer, from) {
        try {
            this.isOfferer = false;
            this.remotePeerId = from || this.remotePeerId;

            if (!this.peerConnection) {
                this.createPeerConnection();
            }

            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.sendSignal(this.remotePeerId, 'answer', answer);
            this.flushPendingCandidates();
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer, from) {
        try {
            if (!this.peerConnection) {
                return;
            }
            this.remotePeerId = from || this.remotePeerId;
            await this.peerConnection.setRemoteDescription(answer);
            this.flushPendingCandidates();
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleRemoteIceCandidate(candidate) {
        try {
            if (this.peerConnection && candidate) {
                await this.peerConnection.addIceCandidate(candidate);
            }
        } catch (error) {
            console.error('Error handling remote ICE candidate:', error);
        }
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                document.getElementById('muteBtn')?.classList.toggle('active', this.isMuted);
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoOff = !videoTrack.enabled;
                document.getElementById('videoBtn')?.classList.toggle('active', this.isVideoOff);
            }
        }
    }

    hangup() {
        this.cleanup();
        window.close();
    }

    cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach((track) => track.stop());
            this.remoteStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
    }

    updateCallStatus(status) {
        const statusElement = document.getElementById('call-status');
        if (!statusElement) {
            return;
        }

        const statusMap = {
            waiting: 'Waiting for participant...',
            active: 'Call active',
            ended: 'Call ended',
            joined: 'Joining call...',
            pending: 'Preparing call...'
        };

        statusElement.textContent = statusMap[status] || status;
    }

    updateConnectionStatus(message, type) {
        const statusElement = document.getElementById('connection-status');
        if (!statusElement) {
            return;
        }

        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('span');

        if (text) {
            text.textContent = message;
        }

        if (indicator) {
            indicator.className = type ? status-indicator  : 'status-indicator';
        }
    }

    showError(message) {
        this.cleanup();
        document.getElementById('loading')?.classList.add('hidden');
        document.getElementById('main-interface')?.classList.add('hidden');
        document.getElementById('error-screen')?.classList.remove('hidden');

        const errorMessage = document.getElementById('error-message');
        if (errorMessage) {
            errorMessage.textContent = message;
        }
    }

    retry() {
        window.location.reload();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VideoCallApp();
});
