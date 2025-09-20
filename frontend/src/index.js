import io from 'socket.io-client';
import './styles.css';

class VideoCallApp {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.callId = null;
        this.isMuted = false;
        this.isVideoOff = false;
        
        // ICE servers configuration
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:38.180.153.25:3478',
                    username: 'turnuser',
                    credential: 'turnpass'
                },
                {
                    urls: 'turns:38.180.153.25:5349',
                    username: 'turnuser',
                    credential: 'turnpass'
                }
            ]
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.getCallIdFromURL();
        await this.initializeMedia();
        this.connectToSignalingServer();
    }

    setupEventListeners() {
        // Control buttons
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
        document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('hangupBtn').addEventListener('click', () => this.hangup());
        document.getElementById('retry-btn').addEventListener('click', () => this.retry());

        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    async getCallIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        this.callId = urlParams.get('call_id') || urlParams.get('id');
        
        if (!this.callId) {
            this.showError('No call ID provided in URL');
            return;
        }

        document.getElementById('call-id').textContent = this.callId;
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            this.updateConnectionStatus('Media ready', 'connected');
        } catch (error) {
            console.error('Error accessing media devices:', error);
            this.showError('Unable to access camera and microphone. Please check permissions.');
        }
    }

    connectToSignalingServer() {
        // Get domain from current location or use default
        const domain = window.location.hostname === 'localhost' ? 
            'localhost' : 
            window.location.hostname;
        
        const backendUrl = window.location.protocol === 'https:' ? 
            `https://${domain}` : 
            `http://${domain}:3001`;

        this.socket = io(backendUrl, {
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.updateConnectionStatus('Connected to server', 'connected');
            this.joinCall();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from signaling server');
            this.updateConnectionStatus('Disconnected', 'error');
        });

        this.socket.on('call-joined', (data) => {
            console.log('Joined call:', data);
            this.updateCallStatus(data.status);
            this.initializePeerConnection();
        });

        this.socket.on('participant-joined', (data) => {
            console.log('Participant joined:', data);
            this.updateCallStatus(data.status);
        });

        this.socket.on('participant-left', (data) => {
            console.log('Participant left:', data);
            this.updateCallStatus(data.status);
            this.handleParticipantLeft();
        });

        this.socket.on('offer', (data) => {
            this.handleOffer(data.offer, data.from);
        });

        this.socket.on('answer', (data) => {
            this.handleAnswer(data.answer, data.from);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data.candidate, data.from);
        });

        this.socket.on('call-error', (data) => {
            this.showError(data.message);
        });
    }

    joinCall() {
        if (this.socket && this.callId) {
            this.socket.emit('join-call', { callId: this.callId });
        }
    }

    async initializePeerConnection() {
        try {
            this.peerConnection = new RTCPeerConnection(this.iceServers);

            // Add local stream to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote stream');
                this.remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remoteVideo');
                remoteVideo.srcObject = this.remoteStream;
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        callId: this.callId,
                        candidate: event.candidate
                    });
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                this.updateConnectionStatus(
                    this.peerConnection.connectionState,
                    this.peerConnection.connectionState === 'connected' ? 'connected' : 'error'
                );
            };

        } catch (error) {
            console.error('Error initializing peer connection:', error);
            this.showError('Failed to initialize peer connection');
        }
    }

    async handleOffer(offer, from) {
        try {
            if (!this.peerConnection) {
                await this.initializePeerConnection();
            }

            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('answer', {
                callId: this.callId,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer, from) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(candidate, from) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    handleParticipantLeft() {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = null;
        this.remoteStream = null;
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isMuted = !audioTrack.enabled;
                
                const muteBtn = document.getElementById('muteBtn');
                muteBtn.classList.toggle('active', this.isMuted);
            }
        }
    }

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoOff = !videoTrack.enabled;
                
                const videoBtn = document.getElementById('videoBtn');
                videoBtn.classList.toggle('active', this.isVideoOff);
            }
        }
    }

    hangup() {
        this.cleanup();
        window.close();
    }

    cleanup() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    updateCallStatus(status) {
        const statusElement = document.getElementById('call-status');
        const statusMap = {
            'waiting': 'Waiting for participant...',
            'active': 'Call active',
            'ended': 'Call ended'
        };
        statusElement.textContent = statusMap[status] || status;
    }

    updateConnectionStatus(message, type) {
        const statusElement = document.getElementById('connection-status');
        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('span');
        
        text.textContent = message;
        indicator.className = `status-indicator ${type}`;
    }

    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-interface').classList.add('hidden');
        document.getElementById('error-screen').classList.remove('hidden');
        document.getElementById('error-message').textContent = message;
    }

    retry() {
        document.getElementById('error-screen').classList.add('hidden');
        document.getElementById('loading').classList.remove('hidden');
        this.init();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VideoCallApp();
});
