function normalizeFacingModeValue(facing) {
  if (!facing) return null;
  const value = String(facing).toLowerCase();
  if (value.includes('env') || value.includes('back') || value.includes('rear') || value.includes('world')) {
    return 'environment';
  }
  if (value.includes('user') || value.includes('front') || value.includes('face')) {
    return 'user';
  }
  return value;
}

function getTrackFacingMode(track) {
  if (!track || typeof track.getSettings !== 'function') return null;
  return normalizeFacingModeValue(track.getSettings().facingMode);
}

// ---------- MediaSession Class ----------
export class MediaSession {
  constructor(signalingSession, logger, logPermissionsInfo, resumePlay, debugSDP, vLocal, vRemote, diagEl) {
    this.signaling = signalingSession;
    this.log = logger;
    this.logPermissionsInfo = logPermissionsInfo;
    this.resumePlay = resumePlay;
    this.debugSDP = debugSDP;
    this.vLocal = vLocal;
    this.vRemote = vRemote;
    this.diagEl = diagEl;
    this.pc = null;
    this.localStream = null;
    this.pendingCandidates = [];
    this.statsTimer = null;
    this.statsPrev = new Map();
    this.gumFailCount = 0;
    this.makingOffer = false;
    this.state = 'idle'; // idle, preparing, active
    this.onStateChange = null;
    this.onLocalStream = null; // Callback for local stream
    this.onRemoteStream = null; // Callback for remote stream
    this.pendingNegotiation = false; // Flag for delayed negotiation
    this.pendingRemoteOffer = null; // Store remote offer when PC is not ready
    this.localTracksReady = false; // Flag indicating local tracks are ready for negotiation
    this.status = 'idle'; // Detailed status tracking
    this.transceivers = new Map(); // Store transceivers by kind for easy access
    this.stallRetryCount = 0; // Counter for outbound stall retries
    this.politeStallTimer = null; // Timer for polite-side stall recovery
    this.politeStallRetry = 0; // Counter for polite stall retries
    this.stallFailureNotified = false; // Guard for repeated failure overlay
    this.connectionStartTime = 0; // Track when connection was established
    this.lastRebuildTime = 0; // Track last rebuild to prevent too frequent rebuilds
    this.pendingMediaRetry = null; // Function for retrying media requests
    this.cameraTrackBackup = null; // Stored camera track when screen sharing
    this.screenShareStream = null; // Active screen share stream
    this.currentCameraFacing = 'user'; // Track preferred camera facing
    this.videoDevices = new Map(); // Cache video deviceIds by facing
  }

  async updateVideoDevices(stream) {
    if (!navigator?.mediaDevices?.enumerateDevices) return;
    const activeTrack = stream?.getVideoTracks?.()[0] || null;
    let activeDeviceId = null;
    const facingFromTrack = getTrackFacingMode(activeTrack);
    if (activeTrack && typeof activeTrack.getSettings === 'function') {
      const settings = activeTrack.getSettings();
      activeDeviceId = settings.deviceId || null;
      if (activeDeviceId && facingFromTrack) {
        this.videoDevices.set(facingFromTrack, activeDeviceId);
      }
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devices
        .filter((device) => device?.kind === 'videoinput')
        .forEach((device) => {
          const label = (device.label || '').toLowerCase();
          let facing = null;
          if (label.includes('front') || label.includes('user')) facing = 'user';
          else if (label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('world')) facing = 'environment';
          if (!facing && device.deviceId === activeDeviceId && facingFromTrack) {
            facing = facingFromTrack;
          }
          if (!facing && !this.videoDevices.has('user')) facing = 'user'; // fallback mapping
          if (facing && !this.videoDevices.has(facing)) {
            this.videoDevices.set(facing, device.deviceId);
          }
        });
    } catch (err) {
      this.log('[media] enumerateDevices ERR', err?.name || err?.message || String(err));
    }
  }

  async prepareLocalMedia(retry = false, options = {}) {
    const candidateStream = options ? options.initialStream : null;
    const reuseInitialStream =
      !!(candidateStream && typeof candidateStream.getTracks === 'function');
    const initialStream = reuseInitialStream ? candidateStream : null;
    this.setState('preparing');
    this.setStatus(
      reuseInitialStream ? 'media-adopt' : 'media-request',
      reuseInitialStream ? 'reusing initial preview media' : 'requesting local devices'
    );
    this.log(
      '[media] preparing local media',
      reuseInitialStream ? '(reuse initial stream)' : ''
    );
    
    // ? ?? ? ?? ?
    this.pendingMediaRetry = null;
    if (window.uiControls) {
      window.uiControls.hidePermissionPrompt?.();
    }
    
    this.localStream = null;
    let audioOk = false;
    let videoOk = false;
    
    try {
      await this.logPermissionsInfo();
    } catch {}
    
    if (reuseInitialStream) {
      let adoptInitialStream = false;
      let videoTracks = [];
      let audioTracks = [];
      try {
        videoTracks = initialStream.getVideoTracks ? initialStream.getVideoTracks() : [];
        audioTracks = initialStream.getAudioTracks ? initialStream.getAudioTracks() : [];
        const liveVideoTracks = videoTracks.filter(track => track && track.readyState === 'live');
        const liveAudioTracks = audioTracks.filter(track => track && track.readyState === 'live');
        videoOk = liveVideoTracks.length > 0;
        audioOk = liveAudioTracks.length > 0;
        adoptInitialStream = videoOk || audioOk;
        if (videoTracks.length !== liveVideoTracks.length || audioTracks.length !== liveAudioTracks.length) {
          this.log('[media] initial stream pruning ended tracks', {
            videoTotal: videoTracks.length,
            videoLive: liveVideoTracks.length,
            audioTotal: audioTracks.length,
            audioLive: liveAudioTracks.length
          });
        }
        // Strip ended tracks from the initial stream
        videoTracks
          .filter(track => track && track.readyState !== 'live')
          .forEach(track => {
            try { initialStream.removeTrack(track); } catch {}
          });
        audioTracks
          .filter(track => track && track.readyState !== 'live')
          .forEach(track => {
            try { initialStream.removeTrack(track); } catch {}
          });
        // Rebuild arrays with live tracks only for downstream logic
        videoTracks = liveVideoTracks;
        audioTracks = liveAudioTracks;
        if (videoTracks.length) {
          const primaryFacing = getTrackFacingMode(videoTracks[0]);
          if (primaryFacing) {
            this.currentCameraFacing = primaryFacing;
          }
        }
      } catch {}

      if (adoptInitialStream) {
        this.localStream = new MediaStream([
          ...videoTracks,
          ...audioTracks
        ]);
        this.setupTrackHandlers();
        this.vLocal.srcObject = this.localStream;
        await this.resumePlay(this.vLocal);

        if (this.onLocalStream && this.localStream) {
          this.onLocalStream(this.localStream);
        }

        if (videoTracks.length) {
          const adoptedFacing = getTrackFacingMode(videoTracks[0]);
          if (adoptedFacing) {
            this.currentCameraFacing = adoptedFacing;
          }
        }

        await this.updateVideoDevices(this.localStream);
        await this.attachLocalTracksToPC();
        this.setStatus('media-ready', 'local tracks adopted');
        this.requestNegotiation('local tracks adopted');
        return audioOk || videoOk;
      }

      this.log('[media] initial preview stream had no tracks, requesting devices again');
    }
    
    try {
      // ? 1: -????
      this.log('[media] requesting audio permission...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioOk = true;
      this.log('[media] audio permission granted');
      
      // ? 2: -????
      this.log('[media] requesting video permission...');
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        const videoTracks = videoStream.getVideoTracks();
        videoTracks.forEach(track => {
          this.localStream.addTrack(track);
        });
        const primaryTrack = videoTracks[0];
        const facing = getTrackFacingMode(primaryTrack);
        if (facing) {
          this.currentCameraFacing = facing;
        }
        videoOk = true;
        this.log('[media] video permission granted');
      } catch (videoError) {
        this.log('[media] video permission denied', videoError?.name || videoError?.message || String(videoError));
        // ?
      }
      
    } catch (audioError) {
      this.log('[media] audio permission denied', audioError?.name || audioError?.message || String(audioError));
      
      // ?
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        videoOk = true;
        this.log('[media] video-only permission granted');
      } catch (videoError) {
        this.log('[media] video permission also denied', videoError?.name || videoError?.message || String(videoError));
      }
    }

    if (!audioOk && !videoOk) {
      this.log('[media] entering recvonly mode');
      this.localStream = new MediaStream();
      
      // ���?�:�?���?�?��? �"�?�?��Ő�? �?�>�? ���?�?�'�?�?�?�?�� ���?���<�'���
      this.pendingMediaRetry = () => this.prepareLocalMedia(true);
      this.setStatus('media-permission', 'awaiting user approval');
      
      // �?�?������<�?����? ���?�?�?���' �?�>�? �?�����?��?��?���
      if (window.uiControls) {
        window.uiControls.showPermissionPrompt?.();
      }
    }

    this.vLocal.srcObject = this.localStream;
    this.setupTrackHandlers();
    this.resumePlay(this.vLocal);
    await this.updateVideoDevices(this.localStream);
    
    // �'�<���<�?����? ��?�>�+�?�� �?�>�? �>�?����>�?�?�?�?�? ���?�'�?���
    if (this.onLocalStream && this.localStream) {
      this.onLocalStream(this.localStream);
    }
    
    // Attach tracks to existing PC if it exists
    await this.attachLocalTracksToPC();
    
    // �'�<�ؐ�?�>�?��? �?�+�%��� �?�'���'�?�? �?�?����:��
    const gumOk = audioOk || videoOk;
    
    // Set media-ready status
    this.setStatus('media-ready', gumOk ? 'local tracks obtained' : 'recvonly mode');
    
    // Request negotiation after tracks are ready
    this.requestNegotiation('local tracks attached');
    
    return gumOk;
  }
  setupTrackHandlers() {
    if (!this.localStream) return;
    
    this.localStream.getTracks().forEach(t => {
      this.log('[media] local track', t.kind, 'live', t.readyState, 'enabled=', t.enabled);
      t.onended = () => this.handleTrackEnded(t);
      t.onmute = () => this.log('[media] local track mute', t.kind);
      t.onunmute = () => this.log('[media] local track unmute', t.kind);
    });
  }

  // Add local tracks to existing PC
  async attachLocalTracksToPC() {
    if (!this.pc || !this.localStream) return false;
    
    const allTracks = this.localStream.getTracks();
    const liveTracks = allTracks.filter(track => track && track.readyState === 'live');
    if (liveTracks.length !== allTracks.length) {
      this.log('[media] attachLocalTracksToPC pruning ended tracks', {
        before: allTracks.length,
        after: liveTracks.length
      });
      allTracks
        .filter(track => track && track.readyState !== 'live')
        .forEach(track => {
          try { this.localStream.removeTrack(track); } catch {}
          try { track.stop(); } catch {}
        });
    }

    if (liveTracks.length === 0) {
      this.log('[media] attachLocalTracksToPC: no tracks to attach (recvonly mode)');
      this.localTracksReady = true; // Ready for recvonly negotiation
      this.checkPendingNegotiation();
      this.checkPendingRemoteOffer();
      return false;
    }
    
    let needsNegotiation = false;

    const attachmentTasks = liveTracks.map(track => {
      // Use stored transceiver reference
      const transceiver = this.transceivers.get(track.kind);
      
      if (transceiver && transceiver.sender) {
        try {
          if (typeof transceiver.direction === 'string' && transceiver.direction !== 'sendrecv') {
            transceiver.direction = 'sendrecv';
            needsNegotiation = true;
            this.log('[media] transceiver direction normalized', track.kind, '-> sendrecv');
          } else if (typeof transceiver.setDirection === 'function' && transceiver.currentDirection && transceiver.currentDirection !== 'sendrecv') {
            transceiver.setDirection('sendrecv');
            needsNegotiation = true;
            this.log('[media] transceiver.setDirection applied', track.kind, 'sendrecv');
          }
        } catch (err) {
          this.log('[media] transceiver direction adjust ERR', track.kind, err?.message || err);
        }

        // Replace track in existing sender
        if (typeof transceiver.sender.replaceTrack === 'function') {
          return transceiver.sender.replaceTrack(track)
            .then(() => {
              this.log('[media] replaceTrack', track.kind, 'currentDirection=', transceiver.currentDirection);
            })
            .catch(err => {
              this.log('[media] replaceTrack ERR', track.kind, err?.message || err);
            });
        }
        return Promise.resolve();
      } else {
        // Fallback to addTrack if no stored transceiver
        try {
          this.pc.addTrack(track, this.localStream);
          this.log('[media] addTrack fallback', track.kind);
          needsNegotiation = true;
        } catch (err) {
          this.log('[media] addTrack fallback ERR', track.kind, err?.message || err);
        }
        return Promise.resolve();
      }
    });
    
    try {
      await Promise.all(attachmentTasks);
    } catch (err) {
      this.log('[media] attachLocalTracksToPC await ERR', err?.message || err);
    }

    this.localTracksReady = true;
    
    try {
      const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
      this.log('[media] attachLocalTracksToPC senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
    } catch {}

    this.checkPendingNegotiation();
    this.checkPendingRemoteOffer();

    if (needsNegotiation) {
      this.requestNegotiation('local track direction sync');
    }

    return true;
  }

  clearPoliteStallTimer(resetCounter = false) {
    if (this.politeStallTimer) {
      try { clearTimeout(this.politeStallTimer); } catch {}
      this.politeStallTimer = null;
    }
    if (resetCounter) {
      this.politeStallRetry = 0;
      this.stallFailureNotified = false;
    }
  }

  schedulePoliteStallRecovery() {
    if (!this.signaling?.polite) return;
    if (this.politeStallTimer) return;
    if (this.politeStallRetry >= 3) {
      this.log('[media] outbound stalled (polite): retry limit reached');
      this.notifyStallFailure();
      return;
    }
    const delay = Math.min(3000, 1000 + Math.round(Math.random() * 1500)); // 1-2.5s
    this.politeStallRetry += 1;
    this.log('[media] outbound stalled (polite): scheduling recovery in', delay, 'ms');
    this.politeStallTimer = setTimeout(() => {
      this.politeStallTimer = null;
      if (!this.signaling?.polite) return;
      if (!this.localTracksReady || !this.pc) return;
      this.log('[media] outbound stalled (polite): attempting renegotiation');
      this.requestNegotiation('polite stall recovery');
    }, delay);
  }

  notifyStallFailure(reason = 'reconnect-failed') {
    if (this.stallFailureNotified) return;
    this.stallFailureNotified = true;
    try {
      window.showRecoveryOverlay?.(reason);
    } catch {}
  }

  async handleTrackEnded(t) {
    this.log('[media] track ended', t.kind, 'state=', t.readyState);
    this.setStatus('recovering', `track ended: ${t.kind}`);
    
    // Immediate recvonly switch for stability
    try {
      const before = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
      const after = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      this.log('[media] pre-recvonly cleanup', { tracksBefore: before, tracksAfter: after });
      if (after === 0) {
        this.localStream = new MediaStream();
        this.vLocal.srcObject = this.localStream;
        this.log('[media] entered recvonly immediately after track end');
        await this.rebuildPCAndRenegotiate();
      }
    } catch {}

    // Try to recover the track
    await this.recoverTrack(t);
  }

  async recoverTrack(t) {
    this.log('[media] recover start', { kind: t.kind, trackState: t.readyState });
    
    let constraints = t.kind === 'video' ? { video: true } : { audio: true };
    let gumTimeoutId;
    const gumTimeoutMs = 4000;
    
    const timeoutPromise = new Promise((resolve) => {
      gumTimeoutId = setTimeout(() => {
        this.log('[media] recover track TIMEOUT', { kind: t.kind, constraints });
        try {
          const count = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
          if (count === 0) {
            this.localStream = new MediaStream();
            this.vLocal.srcObject = this.localStream;
            this.rebuildPCAndRenegotiate().catch(() => {});
          }
        } catch {}
        resolve(null);
      }, gumTimeoutMs);
    });

    try {
      await this.logPermissionsInfo();
      const fresh = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutPromise
      ]);
      
      if (!fresh) {
        this.log('[media] recover exit (timeout)');
        return;
      }

      const newTrack = t.kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
      if (newTrack) {
        const sender = this.pc && this.pc.getSenders ? this.pc.getSenders().find(s => s.track && s.track.kind === t.kind) : null;
        if (sender && sender.replaceTrack) {
          this.log('[media] replaceTrack attempt', { kind: t.kind, senderTrackState: sender?.track?.readyState || null });
          await sender.replaceTrack(newTrack);
          this.log('[media] replaceTrack success', { kind: t.kind, readyState: newTrack.readyState });
          
          try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
          try { if (this.localStream) this.localStream.addTrack(newTrack); } catch {}
          this.vLocal.srcObject = this.localStream;
          
          try {
            const senderStates = (this.pc.getSenders && this.pc.getSenders()) ? this.pc.getSenders().map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) : [];
            this.log('[media] sender states after replace', senderStates);
          } catch {}
          
          this.log('[media] track recovered via replaceTrack', t.kind);
          try { fresh.getTracks().forEach(x => { if (x !== newTrack) x.stop(); }); } catch {}
          await this.rebuildPCAndRenegotiate();
          this.requestNegotiation('track recovered');
          return;
        } else {
          this.log('[media] recover track ERR', 'no sender for kind=' + t.kind, constraints);
        }
      } else {
        this.log('[media] recover track ERR', 'gum returned no tracks', constraints);
      }
    } catch (err) {
      this.gumFailCount += 1;
      this.log('[media] recover track ERR', err?.name || err?.message || String(err), constraints);
      try { if (this.gumFailCount >= 1 && this.diagEl) this.diagEl.textContent = 'Разрешите доступ к камере/микрофону и нажмите «Разрешить».'; } catch {}
    } finally {
      try { clearTimeout(gumTimeoutId); } catch {}
      
      const before = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
      this.vLocal.srcObject = this.localStream;
      
      try {
        const count = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
        this.log('[media] recover finally', { tracksBefore: before, tracksAfter: count });
        if (count === 0) {
          this.localStream = new MediaStream();
          this.vLocal.srcObject = this.localStream;
          this.log('[media] entered recvonly after track end (no local tracks)');
          await this.rebuildPCAndRenegotiate();
        }
      } catch {}
    }
    
    this.log('[media] recover exit');
  }

  setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.log('[media] state change', oldState, '->', newState);
      if (this.onStateChange) this.onStateChange(newState, oldState);
    }
  }

  setStatus(newStatus, reason = '') {
    if (this.status !== newStatus) {
      const oldStatus = this.status;
      this.status = newStatus;
      this.log('[status]', oldStatus, '->', newStatus, reason ? `(${reason})` : '');
    }
  }

  newPC() {
    this.stopStatsMonitor();
    this.pc = new RTCPeerConnection({ iceServers: this.signaling.iceServers });
    this.pendingCandidates = [];
    this.localTracksReady = false; // Reset flag for new PC
    this.stallRetryCount = 0; // Reset stall retry counter
    this.stallFailureNotified = false;
    
    try {
      const total = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      const ac = (this.localStream && this.localStream.getAudioTracks) ? this.localStream.getAudioTracks().length : 0;
      const vc = (this.localStream && this.localStream.getVideoTracks) ? this.localStream.getVideoTracks().length : 0;
      this.log('[media] newPC start', 'localTracks=', total, 'audio=', ac, 'video=', vc);
    } catch {}

    // Pre-create bidirectional m-lines and store references
    try {
      const videoTransceiver = this.pc.addTransceiver('video', { direction: 'sendrecv' });
      const audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.transceivers.set('video', videoTransceiver);
      this.transceivers.set('audio', audioTransceiver);
    } catch {}

    // Attach local tracks (if available)
    if (this.localStream && this.localStream.getTracks().length > 0) {
      this.attachLocalTracksToPC().catch(err => {
        this.log('[media] attachLocalTracksToPC ERR', err?.message || err);
      });
    } else {
      this.log('[media] newPC: no local tracks to attach yet');
      // Keep localTracksReady = false until tracks are actually ready
    }

    // Prepare remote stream
    const remoteStream = new MediaStream();
    this.vRemote.srcObject = remoteStream;
    this.attachRemoteStreamDebug(remoteStream);
    this.resumePlay(this.vRemote);

    const notifyRemoteStreamUpdate = () => {
      if (!this.onRemoteStream) return;
      const totalTracks = remoteStream.getTracks().length;
      try {
        if (totalTracks > 0) {
          this.onRemoteStream(remoteStream);
        } else {
          this.onRemoteStream(null);
        }
      } catch (err) {
        this.log('[media] onRemoteStream notify ERR', err?.message || err);
      }
    };

    this.pc.ontrack = (ev) => {
      this.log('[media] ontrack kind=', ev.track?.kind, 'state=', ev.track?.readyState, 'enabled=', ev.track?.enabled);
      
      const stream = ev.streams?.[0];
      if (stream) {
        // Primary path: use provided stream
        stream.getTracks().forEach(t => {
          if (!remoteStream.getTracks().includes(t)) {
            remoteStream.addTrack(t);
          }
        });
        this.log('[media] ontrack stream', stream.getTracks().length, 'tracks');
      } else if (ev.track) {
        // Fallback path: add track directly
        if (!remoteStream.getTracks().includes(ev.track)) {
          remoteStream.addTrack(ev.track);
          this.log('[media] ontrack fallback', ev.track.kind, 'state=', ev.track.readyState);
        } else {
          this.log('[media] ontrack duplicate', ev.track.kind, 'already exists');
        }
      }
      
      // Always update debug and resume playback
      this.attachRemoteStreamDebug(remoteStream);
      this.resumePlay(this.vRemote);
      
      notifyRemoteStreamUpdate();

      if (ev.track && !ev.track.__hermesOnTrackListeners) {
        ev.track.__hermesOnTrackListeners = true;
        const teardown = () => {
          try { remoteStream.removeTrack(ev.track); } catch {}
          notifyRemoteStreamUpdate();
        };
        ev.track.addEventListener('ended', teardown);
        ev.track.addEventListener('mute', notifyRemoteStreamUpdate);
        ev.track.addEventListener('unmute', notifyRemoteStreamUpdate);
      }
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.signaling.otherPeer) {
        this.signaling.send({ type: 'candidate', target: this.signaling.otherPeer, payload: e.candidate });
      }
      if (!e.candidate) this.log('[media] ICE gathering complete');
      else {
        const s = e.candidate.candidate || '';
        const parts = s.split(' '); const ti = parts.indexOf('typ');
        const typ = ti > -1 ? parts[ti+1] : '?';
        this.log('[media] candidate', typ);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc.iceConnectionState;
      this.log('[media] iceState', st);
      if (st === 'connected') { 
        this.attachRemoteStreamDebug(remoteStream); 
        this.connectionStartTime = Date.now(); // Record connection time
        this.startStatsMonitor(); 
        this.setState('active');
        this.setStatus('connected', 'ICE connection established');
      }
      if (st === 'disconnected' || st === 'failed') {
        this.stopStatsMonitor();
        this.setStatus('disconnected', `ICE ${st}`);
        this.rebuildPCAndRenegotiate();
      }
    };

    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      this.log('[media] pcState', st);
      if (st === 'connected') { 
        this.attachRemoteStreamDebug(remoteStream); 
        this.connectionStartTime = Date.now(); // Record connection time
        this.startStatsMonitor(); 
        this.setState('active');
        this.setStatus('connected', 'PeerConnection established');
      }
      if (st === 'disconnected' || st === 'failed') {
        this.stopStatsMonitor();
        this.setStatus('disconnected', `PeerConnection ${st}`);
        this.rebuildPCAndRenegotiate();
      }
    };

    // Set pc-ready status
    this.setStatus('pc-ready', 'RTCPeerConnection created and configured');
    
    // Check for pending operations after PC is ready
    this.checkPendingNegotiation();
    this.checkPendingRemoteOffer();
  }

  attachRemoteStreamDebug(stream) {
    const tracks = stream.getTracks()
      .map(t => `${t.kind}:${t.readyState}:${t.enabled}`)
      .join(',');
    this.log('[media] remote attach tracks=[', tracks, ']',
        'paused=', this.vRemote?.paused, 'readyState=', this.vRemote?.readyState ?? '?');
  }

  async rebuildPCAndRenegotiate() {
    const now = Date.now();
    const timeSinceLastRebuild = now - this.lastRebuildTime;
    
    // Prevent too frequent rebuilds (minimum 5 seconds between rebuilds)
    if (timeSinceLastRebuild < 5000) {
      this.log('[media] rebuild skipped: too soon (', Math.round(timeSinceLastRebuild/1000), 's ago)');
      return;
    }
    
    this.log('[media] rebuild PC and renegotiate');
    this.setStatus('recovering', 'rebuilding PC');
    this.lastRebuildTime = now;
    await this.tryRollback();
    this.safeClosePC();
    this.newPC();
    if (this.signaling.otherPeer) {
      await this.startNegotiation();
    }
  }

  async tryRollback() {
    try {
      if (this.pc && this.pc.signalingState && this.pc.signalingState !== 'stable') {
        return this.pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      }
    } catch {}
    return Promise.resolve();
  }

  safeClosePC() {
    this.stopStatsMonitor();
    try { if (this.pc) this.pc.ontrack = this.pc.onicecandidate = this.pc.oniceconnectionstatechange = this.pc.onconnectionstatechange = null; } catch {}
    try { if (this.pc) this.pc.close(); } catch {}
    this.pc = null;
    this.transceivers.clear(); // Clear transceiver references
  }

  async startNegotiation() {
    // Reset pending flag at the start
    this.pendingNegotiation = false;
    
    // Protect against missing PC
    if (!this.pc) {
      this.log('[media] startNegotiation skipped: pc not ready');
      this.pendingNegotiation = true;
      return;
    }
    
    // Don't send offer until local tracks are ready
    if (!this.localTracksReady) {
      this.log('[media] startNegotiation skipped: local tracks not ready');
      this.pendingNegotiation = true;
      return;
    }
    
    if (!this.signaling.otherPeer || this.makingOffer) return;
    
    try {
      this.makingOffer = true;
      this.setStatus('negotiating', 'sending offer');
      try {
        const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
        this.log('[media] before createOffer senders', { count: senders.length, tracks: senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) });
      } catch {}
      const offer = await this.pc.createOffer();
      if (this.debugSDP) {
        const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
        this.log('[media] SDP offer created', head);
      }
      await this.pc.setLocalDescription(offer);
      this.signaling.send({ type: 'offer', target: this.signaling.otherPeer, payload: this.pc.localDescription });
      this.log('[media] offer sent');
    } catch (e) {
      this.log('[media] offer ERR', e?.message || e);
    } finally { 
      this.makingOffer = false; 
    }
  }

  // Check and execute pending negotiation
  checkPendingNegotiation() {
    if (this.pendingNegotiation && this.pc && this.localTracksReady && this.signaling.otherPeer && !this.makingOffer) {
      this.log('[media] executing pending negotiation');
      this.pendingNegotiation = false;
      this.startNegotiation();
    } else if (this.pendingNegotiation) {
      this.log('[media] startNegotiation pending', { 
        hasPC: !!this.pc, 
        localTracksReady: this.localTracksReady,
        hasOtherPeer: !!this.signaling.otherPeer, 
        makingOffer: this.makingOffer 
      });
    }
  }

  // Check and execute pending remote offer
  checkPendingRemoteOffer() {
    if (this.pendingRemoteOffer && this.pc) {
      this.log('[media] executing pending remote offer');
      const { from, sdp } = this.pendingRemoteOffer;
      this.pendingRemoteOffer = null;
      this.handleOffer(from, sdp);
    }
  }

  // Request negotiation with reason
  requestNegotiation(reason) {
    this.log('[media] requestNegotiation', reason);
    this.pendingNegotiation = true;
    if (this.pc && this.pc.signalingState === 'stable') {
      this.startNegotiation();
    }
  }

  getVideoSender() {
    if (!this.pc || !this.pc.getSenders) return null;
    try {
      return this.pc.getSenders().find(sender => sender.track && sender.track.kind === 'video') || null;
    } catch {
      return null;
    }
  }

  async switchVideoSource(track, reason = 'video source change') {
    if (!track) return false;
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const removedTracks = [];
    try {
      const existingTracks = this.localStream.getVideoTracks ? this.localStream.getVideoTracks() : [];
      existingTracks
        .filter(existing => existing !== track)
        .forEach(existing => {
          removedTracks.push(existing);
          try { this.localStream.removeTrack(existing); } catch {}
        });
      if (!this.localStream.getVideoTracks().includes(track)) {
        this.localStream.addTrack(track);
      }
      this.vLocal.srcObject = this.localStream;
      await this.resumePlay(this.vLocal);
    } catch (err) {
      this.log('[media] switchVideoSource ERR local stream', err?.message || err);
    }

    try {
      const sender = this.getVideoSender();
      if (sender && sender.replaceTrack) {
        await sender.replaceTrack(track);
      } else if (this.pc) {
        this.log('[media] switchVideoSource: addTrack fallback');
        this.pc.addTrack(track, this.localStream);
      }
    } catch (err) {
      this.log('[media] switchVideoSource ERR replace', err?.message || err);
    }

    this.localTracksReady = true;
    this.requestNegotiation(reason);

    removedTracks.forEach((oldTrack) => {
      if (oldTrack && oldTrack !== track) {
        try { oldTrack.stop(); } catch {}
      }
    });

    if (this.onLocalStream && this.localStream) {
      this.onLocalStream(this.localStream);
    }

    return true;
  }

  async switchCameraFacing(targetFacing = 'user') {
    if (!navigator?.mediaDevices?.getUserMedia) return null;
    const normalizedTarget = normalizeFacingModeValue(targetFacing) || 'user';
    const activeTrack = this.localStream?.getVideoTracks?.()[0] || null;
    const previousFacing = getTrackFacingMode(activeTrack) || this.currentCameraFacing || 'user';
    let releasedTrack = false;
    const restoreAfterFailure = async () => {
      if (!releasedTrack) return;
      try {
        await this.prepareLocalMedia(true);
      } catch (restoreErr) {
        this.log('[media] switchCameraFacing restore ERR', restoreErr?.name || restoreErr?.message || String(restoreErr));
      }
    };

    if (activeTrack?.applyConstraints) {
      let constraintsApplied = false;
      try {
        await activeTrack.applyConstraints({ facingMode: { exact: normalizedTarget } });
        constraintsApplied = true;
      } catch (exactErr) {
        try {
          await activeTrack.applyConstraints({ facingMode: { ideal: normalizedTarget } });
          constraintsApplied = true;
        } catch (idealErr) {
          this.log('[media] switchCameraFacing applyConstraints ERR', idealErr?.name || idealErr?.message || String(idealErr));
        }
      }

      if (constraintsApplied) {
        const appliedFacing = getTrackFacingMode(activeTrack) || previousFacing;
        if (appliedFacing === normalizedTarget) {
          this.currentCameraFacing = appliedFacing;
          this.localTracksReady = true;
          if (this.onLocalStream && this.localStream) {
            this.onLocalStream(this.localStream);
          }
          this.requestNegotiation(`camera facing -> ${appliedFacing} (constraints)`);
          return appliedFacing;
        }
        this.log('[media] switchCameraFacing applyConstraints no-op', appliedFacing, 'expected', normalizedTarget);
      }
    }

    const previousEnabled = activeTrack ? activeTrack.enabled !== false : true;

    const requestStream = async (constraints, label) => {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        this.log('[media] switchCameraFacing', label, 'ERR', err?.name || err?.message || String(err));
        throw err;
      }
    };

    const releaseActiveTrack = () => {
      if (activeTrack) {
        try { if (this.localStream) this.localStream.removeTrack(activeTrack); } catch {}
        try { activeTrack.stop(); } catch {}
        releasedTrack = true;
      }
    };

    if (activeTrack) {
      releaseActiveTrack();
    }

    const videoConstraints = { facingMode: { ideal: normalizedTarget } };
    if (normalizedTarget) {
      videoConstraints.advanced = [{ facingMode: normalizedTarget }];
    }
    let stream = null;
    try {
      stream = await requestStream({ video: videoConstraints, audio: false }, 'preferred');
    } catch (err) {
      await restoreAfterFailure();
      this.log('[media] switchCameraFacing final ERR', err?.name || err?.message || String(err));
      return null;
    }

    const track = stream?.getVideoTracks?.()[0] || null;
    if (!track) {
      try { stream?.getTracks?.().forEach(t => t.stop()); } catch {}
      await restoreAfterFailure();
      this.log('[media] switchCameraFacing ERR', 'no video track');
      return null;
    }

    track.enabled = previousEnabled;

    const switched = await this.switchVideoSource(track, `camera facing -> ${normalizedTarget}`);
    if (!switched) {
      try { track.stop(); } catch {}
      await restoreAfterFailure();
      return null;
    }

    try {
      stream?.getTracks?.().forEach((t) => {
        if (t !== track) {
          try { t.stop(); } catch {}
        }
      });
    } catch {}

    const resultingFacing = getTrackFacingMode(track) || normalizedTarget;
    this.currentCameraFacing = resultingFacing;
    if (typeof window !== 'undefined' && window.uiControls?.updateMobileTurnButton) {
      window.uiControls.updateMobileTurnButton(resultingFacing);
    }
    return resultingFacing;
  }

  async startScreenShare() {
    if (this.screenShareStream) {
      this.log('[media] screen share already active');
      return true;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) {
        displayStream.getTracks().forEach(t => t.stop());
        this.log('[media] screen share ERR', 'no video track');
        return false;
      }

      this.cameraTrackBackup = this.localStream?.getVideoTracks?.()[0] || this.cameraTrackBackup || null;
      if (this.cameraTrackBackup) {
        this.cameraTrackBackup.enabled = true;
      }

      displayTrack.onended = () => {
        this.log('[media] screen share track ended by user');
        this.stopScreenShare().catch(() => {});
      };

      this.screenShareStream = displayStream;
      try {
        displayStream.getTracks().forEach(track => {
          if (track !== displayTrack) {
            try { track.stop(); } catch {}
          }
        });
      } catch {}
      await this.switchVideoSource(displayTrack, 'screen-share start');
      this.log('[media] screen share started', displayTrack.label || '');
      if (window.setScreenShareState) {
        window.setScreenShareState(true);
      } else if (window.uiControls) {
        window.uiControls.updateScreenState(true);
      }
      return true;
    } catch (err) {
      this.log('[media] screen share start ERR', err?.name || err?.message || String(err));
      return false;
    }
  }

  async stopScreenShare() {
    if (!this.screenShareStream && !this.cameraTrackBackup) {
      this.log('[media] stop screen share: nothing to stop');
      if (window.uiControls) {
        window.uiControls.updateScreenState(false);
      }
      return false;
    }
    try {
      if (this.screenShareStream) {
        this.screenShareStream.getTracks().forEach(track => {
          try { track.stop(); } catch {}
        });
      }
    } finally {
      this.screenShareStream = null;
    }

    let restored = false;
    const cameraTrack = this.cameraTrackBackup && this.cameraTrackBackup.readyState === 'live'
      ? this.cameraTrackBackup
      : (this.localStream?.getVideoTracks?.().find(t => t.readyState === 'live') || null);

    if (cameraTrack) {
      try {
        cameraTrack.enabled = true;
        await this.switchVideoSource(cameraTrack, 'screen-share stop');
        restored = true;
      } catch (err) {
        this.log('[media] restore camera after screen share ERR', err?.message || err);
      }
    } else {
      this.log('[media] screen share stop: no camera track available, attempting media recovery');
      try {
        await this.prepareLocalMedia(true);
        restored = true;
      } catch (err) {
        this.log('[media] screen share stop recovery ERR', err?.message || err);
      }
    }

    this.cameraTrackBackup = null;
    if (window.setScreenShareState) {
      window.setScreenShareState(false);
    } else if (window.uiControls) {
      window.uiControls.updateScreenState(false);
    }
    if (!restored) {
      this.log('[media] screen share stop: camera not restored, remaining in recvonly');
    }
    return true;
  }

  async handleOffer(from, sdp) {
    try {
      const offer = new RTCSessionDescription(sdp);
      if (this.debugSDP) {
        const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
        this.log('[media] SDP offer received', head);
      }

      // Second line of defense: check if PC is ready
      if (!this.pc) {
        this.log('[media] handleOffer: PC not ready, storing offer for later');
        this.pendingRemoteOffer = { from, sdp };
        return;
      }

      const offerCollision = (this.makingOffer || this.pc.signalingState !== 'stable');
      const ignoreOffer = !this.signaling.polite && offerCollision;
      this.log('[media] offer from', from, 'collision=', offerCollision, 'ignore=', ignoreOffer, 'polite=', this.signaling.polite);

      if (ignoreOffer) return;

      this.setStatus('negotiating', 'received offer');

      if (offerCollision) {
        await Promise.all([
          this.pc.setLocalDescription({ type: 'rollback' }),
          this.pc.setRemoteDescription(offer),
        ]);
      } else {
        await this.pc.setRemoteDescription(offer);
      }

      await this.flushPendingCandidates();

      const answer = await this.pc.createAnswer();
      if (this.debugSDP) {
        const head = (answer.sdp || '').split('\n').slice(0, 40).join('\\n');
        this.log('[media] SDP answer created', head);
      }
      await this.pc.setLocalDescription(answer);
      this.signaling.send({ type: 'answer', target: from, payload: this.pc.localDescription });
      this.log('[media] answer sent');
    } catch (e) {
      this.log('[media] handleOffer ERR', e?.message || e);
      if (/m-?lines?/i.test(String(e?.message || ''))) {
        this.rebuildPCAndRenegotiate();
      }
    }
  }

  async handleAnswer(_from, sdp) {
    try {
      const answerDesc = new RTCSessionDescription(sdp);
      if (this.debugSDP) {
        const head = (answerDesc.sdp || '').split('\n').slice(0, 40).join('\\n');
        this.log('[media] SDP answer received', head);
      }
      await this.pc.setRemoteDescription(answerDesc);
      await this.flushPendingCandidates();
      this.log('[media] answer set');
    } catch (e) {
      this.log('[media] handleAnswer ERR', e?.message || e);
      if (/m-?lines?/i.test(String(e?.message || ''))) {
        this.rebuildPCAndRenegotiate();
      }
    }
  }

  async flushPendingCandidates() {
    if (!this.pc || !this.pendingCandidates.length) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const cand of queued) {
      try { await this.pc.addIceCandidate(cand); }
      catch (e) { this.log('[media] addIce ERR queued', e?.message || e); }
    }
  }

  async handleCandidate(payload) {
    if (!this.pc.remoteDescription || this.pc.remoteDescription.type === 'rollback') {
      this.pendingCandidates.push(payload);
      return;
    }
    try { await this.pc.addIceCandidate(payload); }
    catch (e) { this.log('[media] addIce ERR', e.message); }
  }

  async sampleStats() {
    if (!this.pc) return null;
    try {
      const report = await this.pc.getStats();
      const now = Date.now();
      let inboundAudio = 0, inboundVideo = 0, outboundAudio = 0, outboundVideo = 0;
      report.forEach(stat => {
        if (!stat || typeof stat.type !== 'string') return;
        if (stat.type === 'inbound-rtp' && !stat.isRemote) {
          const key = stat.id;
          const prev = this.statsPrev.get(key);
          const bytes = stat.bytesReceived ?? 0;
          if (prev) {
            const deltaBytes = bytes - prev.bytes;
            const deltaMs = now - prev.ts;
            if (deltaBytes > 0 && deltaMs > 0) {
              const kbps = (deltaBytes * 8) / deltaMs;
              if ((stat.kind || stat.mediaType) === 'audio') inboundAudio += kbps;
              if ((stat.kind || stat.mediaType) === 'video') inboundVideo += kbps;
            }
          }
          this.statsPrev.set(key, { bytes, ts: now });
        }
        if (stat.type === 'outbound-rtp' && !stat.isRemote) {
          const key = stat.id;
          const prev = this.statsPrev.get(key);
          const bytes = stat.bytesSent ?? 0;
          if (prev) {
            const deltaBytes = bytes - prev.bytes;
            const deltaMs = now - prev.ts;
            if (deltaBytes > 0 && deltaMs > 0) {
              const kbps = (deltaBytes * 8) / deltaMs;
              if ((stat.kind || stat.mediaType) === 'audio') outboundAudio += kbps;
              if ((stat.kind || stat.mediaType) === 'video') outboundVideo += kbps;
            }
          }
          this.statsPrev.set(key, { bytes, ts: now });
        }
      });
      const round = value => Math.round(value * 10) / 10;
      return {
        inboundAudio: round(inboundAudio),
        inboundVideo: round(inboundVideo),
        outboundAudio: round(outboundAudio),
        outboundVideo: round(outboundVideo)
      };
    } catch (err) {
      this.log('[media] stats error', err?.message || err);
      return null;
    }
  }

  startStatsMonitor() {
    if (this.statsTimer || !this.pc) return;
    
    const initialDelayMs = 1000;
    const sampleIntervalMs = 2000;
    const stallThresholdMs = 4000;
    // Start monitoring after a short delay to allow connection to stabilize
    setTimeout(() => {
      if (!this.pc) return; // Check if PC still exists
      this.statsTimer = setInterval(async () => {
      const stats = await this.sampleStats();
      if (!stats) return;
      this.log('[media] stats', 'in_a=' + stats.inboundAudio + 'kbps', 'in_v=' + stats.inboundVideo + 'kbps', 'out_a=' + stats.outboundAudio + 'kbps', 'out_v=' + stats.outboundVideo + 'kbps');
      
      // Check for outbound traffic issues (only after connection is stable)
      const connectionAge = Date.now() - this.connectionStartTime;
      if (this.localTracksReady && stats.outboundAudio === 0 && stats.outboundVideo === 0 && connectionAge > stallThresholdMs) {
        // Check if tracks are intentionally disabled
        const senders = this.pc.getSenders();
        const hasEnabledTracks = senders.some(sender => 
          sender.track && sender.track.readyState === 'live' && sender.track.enabled
        );
        
        const canInitiateStallRecovery = !this.signaling?.polite;
        
        if (hasEnabledTracks && this.stallRetryCount < 3) {
          if (canInitiateStallRecovery) {
            this.log('[media] WARNING: outbound stalled with enabled tracks');
            this.setStatus('media-stalled', 'outbound traffic stopped');
            this.stallRetryCount += 1;
            this.requestNegotiation('outbound stalled');
          } else {
            this.log('[media] outbound stalled detected (polite peer waiting for remote recovery)');
            this.schedulePoliteStallRecovery();
          }
        } else if (!hasEnabledTracks) {
          this.log('[media] outbound zero: all tracks disabled by user');
        } else {
          this.log('[media] outbound stalled: max retries reached');
          this.notifyStallFailure();
        }
      } else if (stats.outboundAudio > 0 || stats.outboundVideo > 0) {
        // Reset counter when traffic is flowing
        this.stallRetryCount = 0;
        this.clearPoliteStallTimer(true);
      } else if (connectionAge <= stallThresholdMs) {
        this.log('[media] outbound zero: connection still establishing (age=', Math.round(connectionAge/1000), 's)');
      }
      }, sampleIntervalMs);
    }, initialDelayMs); // quicker delay before starting stats monitoring
  }

  stopStatsMonitor() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.statsPrev.clear();
    this.clearPoliteStallTimer(true);
  }

  close() {
    this.safeClosePC();
    this.clearPoliteStallTimer(true);
    this.setState('idle');
    this.setStatus('idle', 'media session closed');
  }
}


