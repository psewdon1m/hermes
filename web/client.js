'use strict';

// ---------- DOM ----------
const logEl   = document.getElementById('log');
const vLocal  = document.getElementById('local');
const vRemote = document.getElementById('remote');
const btnJoin = document.getElementById('joinBtn');

// ---------- Helpers ----------
const url   = new URL(location.href);
const token = url.searchParams.get('token') || '';

function log(...a){ if (logEl) logEl.textContent += a.join(' ') + '\n'; }
function rid(){ return Math.random().toString(36).slice(2, 10); }

async function api(path, body){
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function resumePlay(el){
  if (!el) return;
  try { await el.play(); } catch {}
}

// Auto-resume playback after user interaction or when returning to the tab
['click','touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { resumePlay(vLocal); resumePlay(vRemote); }, { passive:true })
);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    resumePlay(vLocal); resumePlay(vRemote);
    if (pc && pc.iceConnectionState !== 'connected') scheduleIceRestart();
  }
});

// ---------- Call state ----------
let pc=null, ws=null, wsReady=false;
let sendQueue=[];
let localStream=null;
let callId=null, role=null, iceServers=[], wsUrl=null;
let myPeerId=null, otherPeer=null;
const peers = new Set();
let pendingCandidates = [];

// perfect negotiation
let makingOffer=false;
let polite=false; // Initial value comes from the role; tie-break can override it

// ICE restart
let wantIceRestart=false;
let iceRestartTimer=null;

function bufferedSend(obj){
  if (!obj) return;
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch {}
  } else {
    sendQueue.push(obj);
  }
}

async function doIceRestart(){
  try {
    if (!pc) return;
    log('ICE restart...');
    makingOffer = true;
    const offer = await pc.createOffer({ iceRestart:true });
    await pc.setLocalDescription(offer);
    makingOffer = false;
    if (otherPeer) bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
  } catch(e){
    makingOffer=false;
    log('ICE restart failed:', e?.message || e);
  }
}
function scheduleIceRestart(){
  if (iceRestartTimer) return;
  iceRestartTimer = setTimeout(() => {
    iceRestartTimer=null;
    if (!wsReady) { wantIceRestart = true; return; }
    doIceRestart();
  }, 3000);
}

// ---------- RTCPeerConnection ----------
function attachRemoteStreamDebug(stream){
  const tracks = stream.getTracks()
    .map(t => `${t.kind}:${t.readyState}:${t.enabled}`)
    .join(',');
  log('[remote attach] tracks=[', tracks, ']',
      'paused=', vRemote?.paused, 'readyState=', vRemote?.readyState ?? '?');
}

function newPC(){
  pc = new RTCPeerConnection({ iceServers });
  pendingCandidates = [];

  // Pre-create bidirectional m-lines (some WebViews need this)
  try {
    pc.addTransceiver('video', { direction:'sendrecv' });
    pc.addTransceiver('audio', { direction:'sendrecv' });
  } catch {}

  // Attach local tracks
  if (localStream) {
    localStream.getTracks().forEach(t => {
      pc.addTrack(t, localStream);
    });
  }

  // Prepare remote stream
  const remoteStream = new MediaStream();
  vRemote.srcObject = remoteStream;
  attachRemoteStreamDebug(remoteStream);
  resumePlay(vRemote);

  pc.ontrack = (ev) => {
    const s = ev.streams?.[0];
    log('ontrack kind=', ev.track?.kind, 'state=', ev.track?.readyState, 'enabled=', ev.track?.enabled);
    if (s) {
      s.getTracks().forEach(t => remoteStream.addTrack(t));
      attachRemoteStreamDebug(remoteStream);
      resumePlay(vRemote);
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && otherPeer) {
      bufferedSend({ type:'candidate', target:otherPeer, payload:e.candidate });
    }
    if (!e.candidate) log('ICE gathering complete');
    else {
      const s = e.candidate.candidate || '';
      const parts = s.split(' '); const ti = parts.indexOf('typ');
      const typ = ti > -1 ? parts[ti+1] : '?';
      log('candidate', typ);
    }
  };

  pc.oniceconnectionstatechange = () => {
    const st = pc.iceConnectionState;
    log('iceState', st);
    if (st==='connected') attachRemoteStreamDebug(remoteStream);
    if (st==='disconnected'||st==='failed') scheduleIceRestart();
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    log('pcState', st);
    if (st==='connected') attachRemoteStreamDebug(remoteStream);
    if (st==='disconnected'||st==='failed') scheduleIceRestart();
  };
}

function pickOtherPeer(){
  for (const id of peers) if (id !== myPeerId) return id;
  return null;
}

// ---------- Perfect Negotiation ----------
async function flushPendingCandidates(){
  if (!pc || !pendingCandidates.length) return;
  const queued = pendingCandidates;
  pendingCandidates = [];
  for (const cand of queued) {
    try { await pc.addIceCandidate(cand); }
    catch (e) { log('addIce ERR queued', e?.message || e); }
  }
}

async function handleOffer(from, sdp){
  try {
    const offer = new RTCSessionDescription(sdp);
    const offerCollision = (makingOffer || pc.signalingState !== 'stable');

    const ignoreOffer = !polite && offerCollision;
    log('offer from', from, 'collision=', offerCollision, 'ignore=', ignoreOffer, 'polite=', polite);

    if (ignoreOffer) return;

    if (offerCollision) {
      await Promise.all([
        pc.setLocalDescription({ type:'rollback' }),
        pc.setRemoteDescription(offer),
      ]);
    } else {
      await pc.setRemoteDescription(offer);
    }

    await flushPendingCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    bufferedSend({ type:'answer', target:from, payload:pc.localDescription });
    log('answer sent');
    otherPeer = from;
  } catch(e){ log('handleOffer ERR', e?.message || e); }
}

async function handleAnswer(_from, sdp){
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingCandidates();
    log('answer set');
  } catch(e){ log('handleAnswer ERR', e?.message || e); }
}

// ---------- WebSocket (signaling) ----------
function setupWS(sigToken){
  const u = new URL(wsUrl);
  u.searchParams.set('callId', callId);
  u.searchParams.set('peerId', myPeerId);
  u.searchParams.set('sig', sigToken);

  ws = new WebSocket(u.toString());

  ws.onopen = () => {
    wsReady = true;
    log('WS open');
    while (sendQueue.length) {
      const m = sendQueue.shift();
      try { ws.send(JSON.stringify(m)); } catch {}
    }
    if (wantIceRestart) { wantIceRestart = false; doIceRestart(); }
  };

  ws.onclose = (ev) => {
    wsReady = false;

    // Do not retry if server replied "room full" (or bad request).
    if (ev && (ev.code === 4403 || ev.code === 4400)) {
      log('WS closed:', ev.code, ev.reason || 'room_full');
      alert('Room already full: maximum 2 participants.');
      return; // Disable auto retry
    }

    log('WS close - retry in 1.5s');
    setTimeout(() => setupWS(sigToken), 1500);
  };

  ws.onerror = (e) => log('WS error', e?.message || e);

  ws.onmessage = async (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'peers') {
      // Full snapshot
      peers.clear();
      (msg.peers || []).forEach(id => peers.add(id));
      otherPeer = pickOtherPeer();

      // tie-break: lexicographically larger peerId becomes polite=true
      if (otherPeer) {
        const before = polite;
        polite = (myPeerId > otherPeer);
        if (before !== polite) log('polite reassigned by tie-break:', polite);
      }

      if (otherPeer) {
        try {
          makingOffer = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          log('offer sent');
        } finally { makingOffer = false; }
        bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
      }
      return;
    }

    if (msg.type === 'peer-joined') {
      peers.add(msg.peerId);
      otherPeer = pickOtherPeer();

      if (otherPeer) {
        const before = polite;
        polite = (myPeerId > otherPeer);
        if (before !== polite) log('polite reassigned by tie-break:', polite);

        try {
          makingOffer = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          log('offer sent');
        } finally { makingOffer = false; }
        bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
      }
      return;
    }

    if (msg.type === 'peer-left') {
      peers.delete(msg.peerId);
      if (otherPeer === msg.peerId) otherPeer = pickOtherPeer();
      return;
    }

    if (msg.type === 'offer')   return handleOffer(msg.from, msg.payload);
    if (msg.type === 'answer')  return handleAnswer(msg.from, msg.payload);

    if (msg.type === 'candidate') {
      if (!pc.remoteDescription || pc.remoteDescription.type === 'rollback') {
        pendingCandidates.push(msg.payload);
        return;
      }
      try { await pc.addIceCandidate(msg.payload); }
      catch (e) { log('addIce ERR', e.message); }
      return;
    }
  };
}

// ---------- Join flow ----------
async function join(){
  if (!token) { alert('Token is missing in URL'); return; }

  const resp = await api('/join', { token });
  callId     = resp.callId;
  role       = resp.role;
  iceServers = resp.iceServers || [];
  wsUrl      = resp.wsUrl;

  // Pre-set politeness from role: answerer starts polite
  polite = (role === 'answerer');

  log('join ok', callId, role, 'polite=', polite);

  // Stable peerId per tab/browser (for tie-break and auto re-invite)
  const storageKey = `peerId:${callId}`;
  myPeerId = sessionStorage.getItem(storageKey) || rid();
  sessionStorage.setItem(storageKey, myPeerId);

  // Acquire local media
  localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:true });
  vLocal.srcObject = localStream;
  localStream.getTracks().forEach(t => {
    log('local track', t.kind, 'live', t.readyState, 'enabled=', t.enabled);
  });
  resumePlay(vLocal);

  // PC + WS
  newPC();
  setupWS(token);
}

btnJoin.onclick = () => { join().catch(e => { log('ERR', e?.message || String(e)); alert('Join failed'); }); };

// Auto-join when token already in URL
if (token) {
  join().catch(e => { log('ERR', e?.message || String(e)); });
}
