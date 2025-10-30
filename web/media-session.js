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
    this.connectionStartTime = 0; // Track when connection was established
    this.lastRebuildTime = 0; // Track last rebuild to prevent too frequent rebuilds
    this.pendingMediaRetry = null; // Function for retrying media requests
    this.cameraTrackBackup = null; // Stored camera track when screen sharing
    this.screenShareStream = null; // Active screen share stream
  }

  async prepareLocalMedia(retry = false) {
    this.setState('preparing');
    this.setStatus('media-request', 'requesting local devices');
    this.log('[media] preparing local media');
    
    // Очищаем предыдущие попытки
    this.pendingMediaRetry = null;
    if (window.uiControls) {
      window.uiControls.hidePermissionPrompt?.();
    }
    
    this.localStream = null;
    let audioOk = false;
    let videoOk = false;
    
    try {
      await this.logPermissionsInfo();
      
      // Шаг 1: Запрашиваем аудио
      this.log('[media] requesting audio permission...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioOk = true;
      this.log('[media] audio permission granted');
      
      // Шаг 2: Запрашиваем видео и добавляем к существующему потоку
      this.log('[media] requesting video permission...');
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        videoStream.getVideoTracks().forEach(track => {
          this.localStream.addTrack(track);
        });
        videoOk = true;
        this.log('[media] video permission granted');
      } catch (videoError) {
        this.log('[media] video permission denied', videoError?.name || videoError?.message || String(videoError));
        // Продолжаем без видео
      }
      
    } catch (audioError) {
      this.log('[media] audio permission denied', audioError?.name || audioError?.message || String(audioError));
      
      // Если аудио не удалось, пробуем только видео
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        videoOk = true;
        this.log('[media] video-only permission granted');
      } catch (videoError) {
        this.log('[media] video permission also denied', videoError?.name || videoError?.message || String(videoError));
      }
    }

    // Если ничего не получилось, создаем пустой поток
    if (!audioOk && !videoOk) {
      this.log('[media] entering recvonly mode');
      this.localStream = new MediaStream();
      
      // Сохраняем функцию для повторной попытки
      this.pendingMediaRetry = () => this.prepareLocalMedia(true);
      this.setStatus('media-permission', 'awaiting user approval');
      
      // Показываем промпт для разрешений
      if (window.uiControls) {
        window.uiControls.showPermissionPrompt?.();
      }
    }

    this.vLocal.srcObject = this.localStream;
    this.setupTrackHandlers();
    this.resumePlay(this.vLocal);
    
    // Вызываем колбэк для локального потока
    if (this.onLocalStream && this.localStream) {
      this.onLocalStream(this.localStream);
    }
    
    // Attach tracks to existing PC if it exists
    this.attachLocalTracksToPC();
    
    // Вычисляем общий статус успеха
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
  attachLocalTracksToPC() {
    if (!this.pc || !this.localStream) return;
    
    const tracks = this.localStream.getTracks();
    if (tracks.length === 0) {
      this.log('[media] attachLocalTracksToPC: no tracks to attach (recvonly mode)');
      this.localTracksReady = true; // Ready for recvonly negotiation
      return;
    }
    
    tracks.forEach(track => {
      // Use stored transceiver reference
      const transceiver = this.transceivers.get(track.kind);
      
      if (transceiver && transceiver.sender) {
        // Replace track in existing sender
        transceiver.sender.replaceTrack(track);
        this.log('[media] replaceTrack', track.kind, 'currentDirection=', transceiver.currentDirection);
      } else {
        // Fallback to addTrack if no stored transceiver
        this.pc.addTrack(track, this.localStream);
        this.log('[media] addTrack fallback', track.kind);
      }
    });
    
    this.localTracksReady = true;
    
    try {
      const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
      this.log('[media] attachLocalTracksToPC senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
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
      this.localStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.localStream);
      });
      this.localTracksReady = true; // Set flag after successful track attachment
      try {
        const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
        this.log('[media] newPC after addTrack senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
      } catch {}
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

    try {
      this.localStream.getVideoTracks()
        .filter(existing => existing !== track)
        .forEach(existing => {
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
    return true;
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
    
    // Start monitoring after a delay to allow connection to stabilize
    setTimeout(() => {
      if (!this.pc) return; // Check if PC still exists
      this.statsTimer = setInterval(async () => {
      const stats = await this.sampleStats();
      if (!stats) return;
      this.log('[media] stats', 'in_a=' + stats.inboundAudio + 'kbps', 'in_v=' + stats.inboundVideo + 'kbps', 'out_a=' + stats.outboundAudio + 'kbps', 'out_v=' + stats.outboundVideo + 'kbps');
      
      // Check for outbound traffic issues (only after connection is stable)
      const connectionAge = Date.now() - this.connectionStartTime;
      if (this.localTracksReady && stats.outboundAudio === 0 && stats.outboundVideo === 0 && connectionAge > 10000) {
        // Check if tracks are intentionally disabled
        const senders = this.pc.getSenders();
        const hasEnabledTracks = senders.some(sender => 
          sender.track && sender.track.readyState === 'live' && sender.track.enabled
        );
        
        if (hasEnabledTracks && this.stallRetryCount < 3) {
          this.log('[media] WARNING: outbound stalled with enabled tracks');
          this.setStatus('media-stalled', 'outbound traffic stopped');
          this.stallRetryCount += 1;
          this.requestNegotiation('outbound stalled');
        } else if (!hasEnabledTracks) {
          this.log('[media] outbound zero: all tracks disabled by user');
        } else {
          this.log('[media] outbound stalled: max retries reached');
        }
      } else if (stats.outboundAudio > 0 || stats.outboundVideo > 0) {
        // Reset counter when traffic is flowing
        this.stallRetryCount = 0;
      } else if (connectionAge <= 10000) {
        this.log('[media] outbound zero: connection still establishing (age=', Math.round(connectionAge/1000), 's)');
      }
      }, 5000);
    }, 3000); // 3 second delay before starting stats monitoring
  }

  stopStatsMonitor() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.statsPrev.clear();
  }

  close() {
    this.safeClosePC();
    this.setState('idle');
    this.setStatus('idle', 'media session closed');
  }
}
