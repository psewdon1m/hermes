// ---------- SignalingSession Class ----------
class SignalingSession {
  constructor() {
    this.ws = null;
    this.wsReady = false;
    this.sendQueue = [];
    this.callId = null;
    this.role = null;
    this.iceServers = [];
    this.wsUrl = null;
    this.myPeerId = null;
    this.otherPeer = null;
    this.joinSigToken = null;
    this.lastJoinRefresh = 0;
    this.peers = new Set();
    this.wsRetryCount = 0;
    this.polite = false;
    this.onPeerUpdate = null;
    this.onMessage = null;
  }

  async join(token) {
    try {
      const resp = await api('/join', { token });
      this.callId = resp.callId;
      this.role = resp.role;
      this.iceServers = resp.iceServers || [];
      this.wsUrl = resp.wsUrl;
      this.joinSigToken = token;
      this.lastJoinRefresh = Date.now();
      
      // Pre-set politeness from role: answerer starts polite
      this.polite = (this.role === 'answerer');
      
      // Stable peerId per tab/browser
      const storageKey = `peerId:${this.callId}`;
      this.myPeerId = sessionStorage.getItem(storageKey) || rid();
      sessionStorage.setItem(storageKey, this.myPeerId);
      
      try { sessionStorage.setItem('joinToken', token); } catch {}
      
      log('[signal] join ok', this.callId, this.role, 'polite=', this.polite);
      return true;
    } catch (e) {
      log('[signal] join ERR', e?.message || e);
      return false;
    }
  }

  attachWS() {
    if (!this.wsUrl || !this.callId || !this.myPeerId) {
      log('[signal] attachWS ERR: missing params');
      return false;
    }

    const u = new URL(this.wsUrl);
    u.searchParams.set('callId', this.callId);
    u.searchParams.set('peerId', this.myPeerId);
    u.searchParams.set('sig', this.joinSigToken);

    this.ws = new WebSocket(u.toString());

    this.ws.onopen = () => {
      this.wsReady = true;
      this.wsRetryCount = 0;
      log('[signal] ws open');
      while (this.sendQueue.length) {
        const m = this.sendQueue.shift();
        try { this.ws.send(JSON.stringify(m)); } catch {}
      }
    };

    this.ws.onclose = (ev) => {
      this.wsReady = false;
      log('[signal] ws close', ev?.code, ev?.reason);

      // Do not retry if server replied "room full"
      if (ev && (ev.code === 4403 || ev.code === 4400)) {
        log('[signal] room full, stopping retries');
        alert('Room already full: maximum 2 participants.');
        return;
      }

      if (this.wsRetryCount >= wsRetryLimit) {
        log('[signal] retries exhausted');
        alert('Connection lost. Please reload the page.');
        return;
      }

      this.wsRetryCount += 1;
      log('[signal] retry', this.wsRetryCount, 'of', wsRetryLimit, 'in', wsRetryDelayMs, 'ms');
      
      setTimeout(async () => {
        await this.refreshIfNeeded();
        this.attachWS();
      }, wsRetryDelayMs);
    };

    this.ws.onerror = (e) => log('[signal] ws error', e?.message || e);

    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'peers') {
        this.peers.clear();
        (msg.peers || []).forEach(id => this.peers.add(id));
        this.otherPeer = this.pickOtherPeer();
        this.updatePoliteness();
        log('[signal] peers', Array.from(this.peers), 'otherPeer=', this.otherPeer, 'polite=', this.polite);
        if (this.onPeerUpdate) this.onPeerUpdate('peers', this.peers, this.otherPeer);
        return;
      }

      if (msg.type === 'peer-joined') {
        this.peers.add(msg.peerId);
        this.otherPeer = this.pickOtherPeer();
        this.updatePoliteness();
        log('[signal] peer joined', msg.peerId, 'otherPeer=', this.otherPeer, 'polite=', this.polite);
        if (this.onPeerUpdate) this.onPeerUpdate('peer-joined', this.peers, this.otherPeer);
        return;
      }

      if (msg.type === 'peer-left') {
        this.peers.delete(msg.peerId);
        this.otherPeer = this.pickOtherPeer();
        log('[signal] peer left', msg.peerId, 'otherPeer=', this.otherPeer);
        if (this.onPeerUpdate) this.onPeerUpdate('peer-left', this.peers, this.otherPeer);
        return;
      }

      if (msg.type === 'room-full') {
        log('[signal] room full received');
        alert('Room already full: maximum 2 participants.');
        try { this.ws.close(4403, 'room-full'); } catch {}
        return;
      }

      if (this.onMessage) this.onMessage(msg);
    };

    return true;
  }

  pickOtherPeer() {
    for (const id of this.peers) if (id !== this.myPeerId) return id;
    return null;
  }

  updatePoliteness() {
    if (this.otherPeer) {
      const before = this.polite;
      this.polite = (this.myPeerId > this.otherPeer);
      if (before !== this.polite) log('[signal] polite reassigned by tie-break:', this.polite);
    }
  }

  async refreshIfNeeded() {
    const now = Date.now();
    if (this.joinSigToken && (now - this.lastJoinRefresh > 120000)) {
      try {
        const resp = await api('/join', { token: this.joinSigToken });
        this.callId = resp.callId;
        this.role = resp.role;
        this.iceServers = resp.iceServers || [];
        this.wsUrl = resp.wsUrl;
        this.lastJoinRefresh = now;
        this.polite = (this.role === 'answerer');
        log('[signal] refreshed join params');
      } catch (e) {
        log('[signal] join refresh failed', e?.message || e);
      }
    }
  }

  send(obj) {
    if (!obj) return;
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch {}
    } else {
      this.sendQueue.push(obj);
    }
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.wsReady = false;
  }
}
