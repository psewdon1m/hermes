/**
 * UI Manager for tgcall
 * Handles UI interactions, timer, and integration with existing modules
 */

export class UIManager {
  constructor() {
    this.callStartTime = null;
    this.timerInterval = null;
    this.isCallActive = false;
    
    // UI Elements
    this.elements = {
      callTimer: document.getElementById('callTimer'),
      linkBtn: document.getElementById('linkBtn'),
      camBtn: document.getElementById('camBtn'),
      micBtn: document.getElementById('micBtn'),
      exitBtn: document.getElementById('exitBtn'),
      remoteVideo: document.getElementById('remote'),
      localVideo: document.getElementById('local'),
      remoteVideoArea: document.getElementById('remoteVideoArea'),
      localVideoArea: document.getElementById('localVideoArea'),
      debugInfo: document.getElementById('debugInfo'),
      debugPcState: document.getElementById('debugPcState'),
      debugIceState: document.getElementById('debugIceState'),
      debugCandType: document.getElementById('debugCandType')
    };

    this.initializeEventListeners();
    this.checkDebugMode();
  }

  /**
   * Initialize event listeners for UI controls
   */
  initializeEventListeners() {
    // Link button - copy call URL
    this.elements.linkBtn.addEventListener('click', () => {
      this.copyCallLink();
      this.addPulseAnimation(this.elements.linkBtn);
    });

    // Camera button - toggle camera
    this.elements.camBtn.addEventListener('click', () => {
      this.toggleCamera();
      this.addPulseAnimation(this.elements.camBtn);
    });

    // Microphone button - toggle microphone
    this.elements.micBtn.addEventListener('click', () => {
      this.toggleMicrophone();
      this.addPulseAnimation(this.elements.micBtn);
    });

    // Exit button - end call
    this.elements.exitBtn.addEventListener('click', () => {
      this.endCall();
      this.addPulseAnimation(this.elements.exitBtn);
    });

    // Join button - start call
    const joinCallBtn = document.getElementById('joinCallBtn');
    if (joinCallBtn) {
      joinCallBtn.addEventListener('click', () => {
        this.startCall();
        this.addPulseAnimation(joinCallBtn);
      });
    }
  }

  /**
   * Add pulse animation to button
   */
  addPulseAnimation(button) {
    button.classList.add('pulse');
    setTimeout(() => button.classList.remove('pulse'), 300);
  }

  /**
   * Check if debug mode is enabled via URL parameter
   */
  checkDebugMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === '1') {
      this.elements.debugInfo.classList.remove('hidden');
    }
  }

  /**
   * Start the call timer
   */
  startCallTimer() {
    this.callStartTime = Date.now();
    this.isCallActive = true;
    
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
  }

  /**
   * Stop the call timer
   */
  stopCallTimer() {
    this.isCallActive = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.elements.callTimer.textContent = '00:00';
  }

  /**
   * Update the timer display
   */
  updateTimer() {
    if (!this.callStartTime) return;
    
    const totalSeconds = Math.floor((Date.now() - this.callStartTime) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    this.elements.callTimer.textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Start a call
   */
  startCall() {
    console.log('[UI] Start call button clicked');
    if (typeof window.join === 'function') {
      window.join().catch(e => {
        console.error('[UI] Join failed:', e);
        alert('Failed to join call: ' + (e?.message || String(e)));
      });
    } else {
      console.error('[UI] window.join function not available');
      alert('Join function not available');
    }
  }

  /**
   * Copy call link to clipboard
   */
  async copyCallLink() {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      
      // Visual feedback
      const originalText = this.elements.linkBtn.textContent;
      this.elements.linkBtn.textContent = 'copied!';
      setTimeout(() => {
        this.elements.linkBtn.textContent = originalText;
      }, 1000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  /**
   * Toggle camera state
   */
  toggleCamera() {
    console.log('[UI] Toggle camera clicked');
    
    // Use the global toggle function to avoid recursion
    if (typeof window.toggleCameraMedia === 'function') {
      console.log('[UI] Calling window.toggleCameraMedia()');
      const isEnabled = window.toggleCameraMedia();
      console.log('[UI] Camera enabled:', isEnabled);
      this.updateCameraState(isEnabled);
    } else {
      console.log('[UI] window.toggleCameraMedia not available, using fallback');
      // Fallback: just update UI state
      const isActive = this.elements.camBtn.classList.contains('active');
      this.updateCameraState(!isActive);
    }
  }

  /**
   * Toggle microphone state
   */
  toggleMicrophone() {
    console.log('[UI] Toggle microphone clicked');
    
    // Use the global toggle function to avoid recursion
    if (typeof window.toggleMicrophoneMedia === 'function') {
      console.log('[UI] Calling window.toggleMicrophoneMedia()');
      const isEnabled = window.toggleMicrophoneMedia();
      console.log('[UI] Microphone enabled:', isEnabled);
      this.updateMicrophoneState(isEnabled);
    } else {
      console.log('[UI] window.toggleMicrophoneMedia not available, using fallback');
      // Fallback: just update UI state
      const isActive = this.elements.micBtn.classList.contains('active');
      this.updateMicrophoneState(!isActive);
    }
  }

  /**
   * End the call
   */
  endCall() {
    console.log('[UI] Exit button clicked');
    this.stopCallTimer();
    
    // Trigger leave in existing client code
    const leaveBtn = document.getElementById('leaveBtn');
    if (leaveBtn) {
      console.log('[UI] Clicking leaveBtn');
      leaveBtn.click();
    } else {
      console.log('[UI] leaveBtn not found');
    }
    
    // Redirect to home page instead of trying to close window
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  }

  /**
   * Update camera button state based on actual camera status
   */
  updateCameraState(isEnabled) {
    if (isEnabled) {
      this.elements.camBtn.classList.remove('inactive');
      this.elements.camBtn.classList.add('active');
    } else {
      this.elements.camBtn.classList.remove('active');
      this.elements.camBtn.classList.add('inactive');
    }
  }

  /**
   * Update microphone button state based on actual microphone status
   */
  updateMicrophoneState(isEnabled) {
    if (isEnabled) {
      this.elements.micBtn.classList.remove('inactive');
      this.elements.micBtn.classList.add('active');
    } else {
      this.elements.micBtn.classList.remove('active');
      this.elements.micBtn.classList.add('inactive');
    }
  }

  /**
   * Handle video stream changes
   */
  onVideoStreamChanged(stream, isLocal = false) {
    const videoElement = isLocal ? this.elements.localVideo : this.elements.remoteVideo;
    const videoArea = isLocal ? this.elements.localVideoArea : this.elements.remoteVideoArea;
    const placeholder = videoArea.querySelector('.video-placeholder');
    
    if (stream) {
      // Show video stream
      videoElement.srcObject = stream;
      videoElement.classList.add('show');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    } else {
      // Hide video stream and show placeholder
      videoElement.srcObject = null;
      videoElement.classList.remove('show');
      if (placeholder) {
        placeholder.style.display = 'flex';
      }
    }
  }

  /**
   * Update debug information
   */
  updateDebugInfo(pcState, iceState, candType) {
    if (this.elements.debugPcState) {
      this.elements.debugPcState.textContent = pcState || 'new';
    }
    if (this.elements.debugIceState) {
      this.elements.debugIceState.textContent = iceState || 'new';
    }
    if (this.elements.debugCandType) {
      this.elements.debugCandType.textContent = candType || '-';
    }
  }

  /**
   * Handle call state changes
   */
  onCallStarted() {
    this.startCallTimer();
  }

  onCallEnded() {
    this.stopCallTimer();
  }

  /**
   * Handle media state changes
   */
  onMediaStateChanged(mediaState) {
    // Update button states based on media state
    if (mediaState.camera !== undefined) {
      this.updateCameraState(mediaState.camera);
    }
    if (mediaState.microphone !== undefined) {
      this.updateMicrophoneState(mediaState.microphone);
    }
  }

  /**
   * Handle video stream changes
   */
  onVideoStreamChanged(stream, isLocal = false) {
    const videoElement = isLocal ? this.elements.localVideo : this.elements.remoteVideo;
    
    if (stream) {
      videoElement.srcObject = stream;
      this.showVideoStream(videoElement, isLocal);
    } else {
      this.hideVideoStream(isLocal);
    }
  }
}

// Export for use in other modules
export default UIManager;
