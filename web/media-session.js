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
    this.pendingNegotiation = false; // Flag for delayed negotiation
    this.pendingRemoteOffer = null; // Store remote offer when PC is not ready
  }

  async prepareLocalMedia() {
    this.setState('preparing');
    this.log('[media] preparing local media');
    
    this.localStream = null;
    let gumOk = false;
    
    try {
      await this.logPermissionsInfo();
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      gumOk = true;
      this.log('[media] local media ready (audio+video)');
    } catch (e1) {
      this.log('[media] media error', e1?.name || e1?.message || String(e1));
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        gumOk = true;
        this.log('[media] local media ready (audio only)');
      } catch (e2) {
        this.log('[media] media error (audio only)', e2?.name || e2?.message || String(e2));
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          gumOk = true;
          this.log('[media] local media ready (video only)');
        } catch (e3) {
          this.log('[media] media error (video only)', e3?.name || e3?.message || String(e3));
          this.log('[media] proceeding without local media (recvonly)');
        }
      }
    }

    if (!gumOk && (!this.localStream || (!this.localStream.getAudioTracks().length && !this.localStream.getVideoTracks().length))) {
      this.log('[media] entering recvonly mode');
      this.localStream = new MediaStream();
    }

    this.vLocal.srcObject = this.localStream;
    this.setupTrackHandlers();
    this.resumePlay(this.vLocal);
    
    // Attach tracks to existing PC if it exists
    this.attachLocalTracksToPC();
    
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
    
    this.localStream.getTracks().forEach(t => {
      this.pc.addTrack(t, this.localStream);
    });
    
    try {
      const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
      this.log('[media] attachLocalTracksToPC senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
    } catch {}
  }

  async handleTrackEnded(t) {
    this.log('[media] track ended', t.kind, 'state=', t.readyState);
    
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
      this.log('[media] state change', oldState, '→', newState);
      if (this.onStateChange) this.onStateChange(newState, oldState);
    }
  }

  newPC() {
    this.stopStatsMonitor();
    this.pc = new RTCPeerConnection({ iceServers: this.signaling.iceServers });
    this.pendingCandidates = [];
    
    try {
      const total = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      const ac = (this.localStream && this.localStream.getAudioTracks) ? this.localStream.getAudioTracks().length : 0;
      const vc = (this.localStream && this.localStream.getVideoTracks) ? this.localStream.getVideoTracks().length : 0;
      this.log('[media] newPC start', 'localTracks=', total, 'audio=', ac, 'video=', vc);
    } catch {}

    // Pre-create bidirectional m-lines
    try {
      this.pc.addTransceiver('video', { direction: 'sendrecv' });
      this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    } catch {}

    // Attach local tracks (if available)
    if (this.localStream && this.localStream.getTracks().length > 0) {
      this.localStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.localStream);
      });
      try {
        const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
        this.log('[media] newPC after addTrack senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
      } catch {}
    } else {
      this.log('[media] newPC: no local tracks to attach yet');
    }

    // Prepare remote stream
    const remoteStream = new MediaStream();
    this.vRemote.srcObject = remoteStream;
    this.attachRemoteStreamDebug(remoteStream);
    this.resumePlay(this.vRemote);

    this.pc.ontrack = (ev) => {
      const s = ev.streams?.[0];
      this.log('[media] ontrack kind=', ev.track?.kind, 'state=', ev.track?.readyState, 'enabled=', ev.track?.enabled);
      if (s) {
        s.getTracks().forEach(t => remoteStream.addTrack(t));
        this.attachRemoteStreamDebug(remoteStream);
        this.resumePlay(this.vRemote);
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
        this.startStatsMonitor(); 
        this.setState('active');
      }
      if (st === 'disconnected' || st === 'failed') {
        this.stopStatsMonitor();
        this.rebuildPCAndRenegotiate();
      }
    };

    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      this.log('[media] pcState', st);
      if (st === 'connected') { 
        this.attachRemoteStreamDebug(remoteStream); 
        this.startStatsMonitor(); 
        this.setState('active');
      }
      if (st === 'disconnected' || st === 'failed') {
        this.stopStatsMonitor();
        this.rebuildPCAndRenegotiate();
      }
    };

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
    this.log('[media] rebuild PC and renegotiate');
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
  }

  async startNegotiation() {
    // Protect against missing PC
    if (!this.pc) {
      this.log('[media] startNegotiation skipped: pc not ready');
      this.pendingNegotiation = true;
      return;
    }
    
    if (!this.signaling.otherPeer || this.makingOffer) return;
    
    try {
      this.makingOffer = true;
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
    if (this.pendingNegotiation && this.pc && this.signaling.otherPeer && !this.makingOffer) {
      this.log('[media] executing pending negotiation');
      this.pendingNegotiation = false;
      this.startNegotiation();
    } else if (this.pendingNegotiation) {
      this.log('[media] startNegotiation pending', { 
        hasPC: !!this.pc, 
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
    this.statsTimer = setInterval(async () => {
      const stats = await this.sampleStats();
      if (!stats) return;
      this.log('[media] stats', 'in_a=' + stats.inboundAudio + 'kbps', 'in_v=' + stats.inboundVideo + 'kbps', 'out_a=' + stats.outboundAudio + 'kbps', 'out_v=' + stats.outboundVideo + 'kbps');
    }, 5000);
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
  }
}
