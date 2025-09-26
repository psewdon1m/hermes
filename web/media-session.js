// ---------- MediaSession Class ----------
class MediaSession {
  constructor(signalingSession) {
    this.signaling = signalingSession;
    this.pc = null;
    this.localStream = null;
    this.pendingCandidates = [];
    this.statsTimer = null;
    this.statsPrev = new Map();
    this.gumFailCount = 0;
    this.makingOffer = false;
    this.state = 'idle'; // idle, preparing, active
    this.onStateChange = null;
  }

  async prepareLocalMedia() {
    this.setState('preparing');
    log('[media] preparing local media');
    
    this.localStream = null;
    let gumOk = false;
    
    try {
      await logPermissionsInfo();
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      gumOk = true;
      log('[media] local media ready (audio+video)');
    } catch (e1) {
      log('[media] media error', e1?.name || e1?.message || String(e1));
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        gumOk = true;
        log('[media] local media ready (audio only)');
      } catch (e2) {
        log('[media] media error (audio only)', e2?.name || e2?.message || String(e2));
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          gumOk = true;
          log('[media] local media ready (video only)');
        } catch (e3) {
          log('[media] media error (video only)', e3?.name || e3?.message || String(e3));
          log('[media] proceeding without local media (recvonly)');
        }
      }
    }

    if (!gumOk && (!this.localStream || (!this.localStream.getAudioTracks().length && !this.localStream.getVideoTracks().length))) {
      log('[media] entering recvonly mode');
      this.localStream = new MediaStream();
    }

    vLocal.srcObject = this.localStream;
    this.setupTrackHandlers();
    resumePlay(vLocal);
    
    return gumOk;
  }

  setupTrackHandlers() {
    if (!this.localStream) return;
    
    this.localStream.getTracks().forEach(t => {
      log('[media] local track', t.kind, 'live', t.readyState, 'enabled=', t.enabled);
      t.onended = () => this.handleTrackEnded(t);
      t.onmute = () => log('[media] local track mute', t.kind);
      t.onunmute = () => log('[media] local track unmute', t.kind);
    });
  }

  async handleTrackEnded(t) {
    log('[media] track ended', t.kind, 'state=', t.readyState);
    
    // Immediate recvonly switch for stability
    try {
      const before = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
      const after = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      log('[media] pre-recvonly cleanup', { tracksBefore: before, tracksAfter: after });
      if (after === 0) {
        this.localStream = new MediaStream();
        vLocal.srcObject = this.localStream;
        log('[media] entered recvonly immediately after track end');
        await this.rebuildPCAndRenegotiate();
      }
    } catch {}

    // Try to recover the track
    await this.recoverTrack(t);
  }

  async recoverTrack(t) {
    log('[media] recover start', { kind: t.kind, trackState: t.readyState });
    
    let constraints = t.kind === 'video' ? { video: true } : { audio: true };
    let gumTimeoutId;
    const gumTimeoutMs = 4000;
    
    const timeoutPromise = new Promise((resolve) => {
      gumTimeoutId = setTimeout(() => {
        log('[media] recover track TIMEOUT', { kind: t.kind, constraints });
        try {
          const count = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
          if (count === 0) {
            this.localStream = new MediaStream();
            vLocal.srcObject = this.localStream;
            this.rebuildPCAndRenegotiate().catch(() => {});
          }
        } catch {}
        resolve(null);
      }, gumTimeoutMs);
    });

    try {
      await logPermissionsInfo();
      const fresh = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutPromise
      ]);
      
      if (!fresh) {
        log('[media] recover exit (timeout)');
        return;
      }

      const newTrack = t.kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
      if (newTrack) {
        const sender = this.pc && this.pc.getSenders ? this.pc.getSenders().find(s => s.track && s.track.kind === t.kind) : null;
        if (sender && sender.replaceTrack) {
          log('[media] replaceTrack attempt', { kind: t.kind, senderTrackState: sender?.track?.readyState || null });
          await sender.replaceTrack(newTrack);
          log('[media] replaceTrack success', { kind: t.kind, readyState: newTrack.readyState });
          
          try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
          try { if (this.localStream) this.localStream.addTrack(newTrack); } catch {}
          vLocal.srcObject = this.localStream;
          
          try {
            const senderStates = (this.pc.getSenders && this.pc.getSenders()) ? this.pc.getSenders().map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) : [];
            log('[media] sender states after replace', senderStates);
          } catch {}
          
          log('[media] track recovered via replaceTrack', t.kind);
          try { fresh.getTracks().forEach(x => { if (x !== newTrack) x.stop(); }); } catch {}
          await this.rebuildPCAndRenegotiate();
          return;
        } else {
          log('[media] recover track ERR', 'no sender for kind=' + t.kind, constraints);
        }
      } else {
        log('[media] recover track ERR', 'gum returned no tracks', constraints);
      }
    } catch (err) {
      this.gumFailCount += 1;
      log('[media] recover track ERR', err?.name || err?.message || String(err), constraints);
      try { if (this.gumFailCount >= 1 && diagEl) diagEl.textContent = 'Разрешите доступ к камере/микрофону и нажмите «Разрешить».'; } catch {}
    } finally {
      try { clearTimeout(gumTimeoutId); } catch {}
      
      const before = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
      try { if (this.localStream) this.localStream.removeTrack(t); } catch {}
      vLocal.srcObject = this.localStream;
      
      try {
        const count = (this.localStream && this.localStream.getTracks) ? this.localStream.getTracks().length : 0;
        log('[media] recover finally', { tracksBefore: before, tracksAfter: count });
        if (count === 0) {
          this.localStream = new MediaStream();
          vLocal.srcObject = this.localStream;
          log('[media] entered recvonly after track end (no local tracks)');
          await this.rebuildPCAndRenegotiate();
        }
      } catch {}
    }
    
    log('[media] recover exit');
  }

  setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      log('[media] state change', oldState, '→', newState);
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
      log('[media] newPC start', 'localTracks=', total, 'audio=', ac, 'video=', vc);
    } catch {}

    // Pre-create bidirectional m-lines
    try {
      this.pc.addTransceiver('video', { direction: 'sendrecv' });
      this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    } catch {}

    // Attach local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        this.pc.addTrack(t, this.localStream);
      });
      try {
        const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
        log('[media] newPC after addTrack senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
      } catch {}
    }

    // Prepare remote stream
    const remoteStream = new MediaStream();
    vRemote.srcObject = remoteStream;
    this.attachRemoteStreamDebug(remoteStream);
    resumePlay(vRemote);

    this.pc.ontrack = (ev) => {
      const s = ev.streams?.[0];
      log('[media] ontrack kind=', ev.track?.kind, 'state=', ev.track?.readyState, 'enabled=', ev.track?.enabled);
      if (s) {
        s.getTracks().forEach(t => remoteStream.addTrack(t));
        this.attachRemoteStreamDebug(remoteStream);
        resumePlay(vRemote);
      }
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.signaling.otherPeer) {
        this.signaling.send({ type: 'candidate', target: this.signaling.otherPeer, payload: e.candidate });
      }
      if (!e.candidate) log('[media] ICE gathering complete');
      else {
        const s = e.candidate.candidate || '';
        const parts = s.split(' '); const ti = parts.indexOf('typ');
        const typ = ti > -1 ? parts[ti+1] : '?';
        log('[media] candidate', typ);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc.iceConnectionState;
      log('[media] iceState', st);
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
      log('[media] pcState', st);
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
  }

  attachRemoteStreamDebug(stream) {
    const tracks = stream.getTracks()
      .map(t => `${t.kind}:${t.readyState}:${t.enabled}`)
      .join(',');
    log('[media] remote attach tracks=[', tracks, ']',
        'paused=', vRemote?.paused, 'readyState=', vRemote?.readyState ?? '?');
  }

  async rebuildPCAndRenegotiate() {
    log('[media] rebuild PC and renegotiate');
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
    if (!this.signaling.otherPeer || this.makingOffer) return;
    
    try {
      this.makingOffer = true;
      try {
        const senders = (this.pc.getSenders && this.pc.getSenders()) || [];
        log('[media] before createOffer senders', { count: senders.length, tracks: senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) });
      } catch {}
      const offer = await this.pc.createOffer();
      if (debugSDP) {
        const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
        log('[media] SDP offer created', head);
      }
      await this.pc.setLocalDescription(offer);
      this.signaling.send({ type: 'offer', target: this.signaling.otherPeer, payload: this.pc.localDescription });
      log('[media] offer sent');
    } catch (e) {
      log('[media] offer ERR', e?.message || e);
    } finally { 
      this.makingOffer = false; 
    }
  }

  async handleOffer(from, sdp) {
    try {
      const offer = new RTCSessionDescription(sdp);
      if (debugSDP) {
        const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
        log('[media] SDP offer received', head);
      }
      const offerCollision = (this.makingOffer || this.pc.signalingState !== 'stable');
      const ignoreOffer = !this.signaling.polite && offerCollision;
      log('[media] offer from', from, 'collision=', offerCollision, 'ignore=', ignoreOffer, 'polite=', this.signaling.polite);

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
      if (debugSDP) {
        const head = (answer.sdp || '').split('\n').slice(0, 40).join('\\n');
        log('[media] SDP answer created', head);
      }
      await this.pc.setLocalDescription(answer);
      this.signaling.send({ type: 'answer', target: from, payload: this.pc.localDescription });
      log('[media] answer sent');
    } catch (e) {
      log('[media] handleOffer ERR', e?.message || e);
      if (/m-?lines?/i.test(String(e?.message || ''))) {
        this.rebuildPCAndRenegotiate();
      }
    }
  }

  async handleAnswer(_from, sdp) {
    try {
      const answerDesc = new RTCSessionDescription(sdp);
      if (debugSDP) {
        const head = (answerDesc.sdp || '').split('\n').slice(0, 40).join('\\n');
        log('[media] SDP answer received', head);
      }
      await this.pc.setRemoteDescription(answerDesc);
      await this.flushPendingCandidates();
      log('[media] answer set');
    } catch (e) {
      log('[media] handleAnswer ERR', e?.message || e);
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
      catch (e) { log('[media] addIce ERR queued', e?.message || e); }
    }
  }

  async handleCandidate(payload) {
    if (!this.pc.remoteDescription || this.pc.remoteDescription.type === 'rollback') {
      this.pendingCandidates.push(payload);
      return;
    }
    try { await this.pc.addIceCandidate(payload); }
    catch (e) { log('[media] addIce ERR', e.message); }
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
      log('[media] stats error', err?.message || err);
      return null;
    }
  }

  startStatsMonitor() {
    if (this.statsTimer || !this.pc) return;
    this.statsTimer = setInterval(async () => {
      const stats = await this.sampleStats();
      if (!stats) return;
      log('[media] stats', 'in_a=' + stats.inboundAudio + 'kbps', 'in_v=' + stats.inboundVideo + 'kbps', 'out_a=' + stats.outboundAudio + 'kbps', 'out_v=' + stats.outboundVideo + 'kbps');
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
