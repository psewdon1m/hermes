'use strict';

const logEl   = document.getElementById('log');
const vLocal  = document.getElementById('local');
const vRemote = document.getElementById('remote');
const btnJoin = document.getElementById('joinBtn');
const btnLeave = document.getElementById('leaveBtn');
const btnCam = document.getElementById('camBtn');
const btnMic = document.getElementById('micBtn');

const tokenInput = document.getElementById('token');
const qs    = new URL(location.href).searchParams;
let token = qs.get('token') || '';
if (tokenInput) tokenInput.value = token;

function log(...a){ if (logEl) logEl.textContent += a.join(' ') + '\n'; }
function rid(){ return Math.random().toString(36).slice(2, 10); }

// ---------- API ----------
async function api(path, body){
  const r = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ---------- Autoplay helpers / webview ----------
function isTelegramWebView(){ return /Telegram/i.test(navigator.userAgent||''); }
function resumePlay(el, label){
  if (!el) return;
  el.play().catch(e => log('play() fail', label||'', e?.name||e, e?.message||''));
}
['click','touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { resumePlay(vLocal,'local'); resumePlay(vRemote,'remote'); }, { passive:true })
);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    resumePlay(vLocal,'local'); resumePlay(vRemote,'remote');
    if (pc && pc.iceConnectionState !== 'connected') scheduleIceRestart();
  }
});
function showTgHintBanner(){
  if (!isTelegramWebView() || document.getElementById('tg_hint')) return;
  const box = document.createElement('div');
  box.id = 'tg_hint';
  box.style.cssText = 'background:#222;color:#eee;padding:10px;border-radius:8px;margin:10px 0;font:14px system-ui';
  box.innerHTML = `We detected Telegram WebView. Please allow camera/mic access in system settings. If the call still fails, open the link in a regular browser.`;
  document.body.prepend(box);
}

// ---------- State ----------
let pc=null, ws=null, wsReady=false;
let sendQueue=[];
let localStream=null, remoteStream=null;
let callId=null, role=null, iceServers=[], wsUrl=null;
let myPeerId=null, otherPeer=null;
const peers = new Set();
let joinInProgress = false;
let allowWsReconnect = false;

// perfect negotiation
let makingOffer=false;
let polite=false;
let isOfferer=false;

// ICE restart
let wantIceRestart=false;
let iceRestartTimer=null;

// Queue ICE candidates until we have a remote description
let pendingRemoteCandidates = [];

// ---- helpers ----
function bufferedSend(obj){
  if (!obj) return;
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch {} }
  else sendQueue.push(obj);
}
function scheduleIceRestart(){
  if (iceRestartTimer) return;
  iceRestartTimer = setTimeout(() => {
    iceRestartTimer=null;
    if (!wsReady) { wantIceRestart = true; return; }
    doIceRestart();
  }, 3000);
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
  } catch(e){ makingOffer=false; log('ICE restart failed:', e?.message||e); }
}

function updateMediaButton(button, track, label) {
  if (!button) return;
  if (!track) {
    button.disabled = true;
    button.classList.add('muted');
    button.removeAttribute('aria-pressed');
    button.textContent = label;
    return;
  }
  const enabled = track.enabled !== false;
  button.disabled = false;
  button.classList.toggle('muted', !enabled);
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  button.textContent = enabled ? label + ' On' : label + ' Off';
}

function updateControls() {
  const inCall = Boolean(pc && callId && localStream);
  if (btnJoin) btnJoin.disabled = joinInProgress || inCall;
  if (btnLeave) btnLeave.disabled = !inCall;
  const videoTracks = localStream ? localStream.getVideoTracks() : [];
  const audioTracks = localStream ? localStream.getAudioTracks() : [];
  const videoTrack = videoTracks[0];
  const audioTrack = audioTracks[0];
  updateMediaButton(btnCam, videoTrack, 'Cam');
  updateMediaButton(btnMic, audioTrack, 'Mic');
}

function toggleLocalTrack(kind) {
  if (!localStream) return;
  const tracks = kind === 'video' ? localStream.getVideoTracks() : localStream.getAudioTracks();
  const track = tracks && tracks[0];
  if (!track) return;
  track.enabled = !track.enabled;
  log(kind + ' track ' + (track.enabled ? 'enabled' : 'disabled'));
  updateControls();
}

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try { track.stop(); } catch {}
  });
}


// ---- Remote stream helpers ----
function ensureRemoteStreamAttached() {
  if (!remoteStream) remoteStream = new MediaStream();
  // Avoid reassigning srcObject unless needed to dodge AbortError
  if (vRemote.srcObject !== remoteStream) {
    vRemote.srcObject = remoteStream;
  }
  resumePlay(vRemote, 'remote');
  const tracks = remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`).join(',');
  log(`[remote attach] tracks=[${tracks}] paused=${vRemote.paused} readyState=${vRemote.readyState}`);
}

// ---------- RTCPeerConnection ----------
function newPC(){
  pc = new RTCPeerConnection({ iceServers });

  // addTrack is more compatible here than addTransceiver on some browsers
  // Some mobile browsers misbehave when transceivers are created too early
  if (localStream) {
    localStream.getTracks().forEach(t => {
      log('addTrack local', t.kind, t.readyState, 'enabled=', t.enabled);
      pc.addTrack(t, localStream);
    });
  }

  // Reset remote stream so it always reflects the latest tracks
  remoteStream = new MediaStream();
  vRemote.srcObject = remoteStream;
  vRemote.muted = true; // Prevent echo from the remote video element
  resumePlay(vRemote,'remote');

  pc.ontrack = (ev) => {
    const tr = ev.track;
    log('ontrack kind=', tr?.kind, 'state=', tr?.readyState, 'enabled=', tr?.enabled);
    // Attach the track if the stream does not already contain it
    const exists = remoteStream.getTracks().some(x => x === tr);
    if (!exists && tr) remoteStream.addTrack(tr);
    ensureRemoteStreamAttached();
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && otherPeer) bufferedSend({ type:'candidate', target:otherPeer, payload:e.candidate });
    if (!e.candidate) log('ICE gathering complete');
    else {
      const s = e.candidate.candidate || '';
      const parts = s.split(' '); const ti = parts.indexOf('typ');
      log('candidate', ti>-1 ? parts[ti+1] : '?');
    }
  };
  pc.oniceconnectionstatechange = () => {
    const st = pc.iceConnectionState; log('iceState', st);
    if (st==='connected') ensureRemoteStreamAttached();
    if (st==='disconnected'||st==='failed') scheduleIceRestart();
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState; log('pcState', st);
    if (st==='connected') ensureRemoteStreamAttached();
    if (st==='disconnected'||st==='failed') scheduleIceRestart();
  };
  pc.onnegotiationneeded = async () => {
    if (!isOfferer || !otherPeer) return;
    try {
      makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } finally { makingOffer = false; }
    bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
    log('offer sent (onnegotiationneeded)');
  };
}

// ---------- perfect negotiation ----------
async function handleOffer(from, sdp){
  try {
    if (!otherPeer) {
      otherPeer = from;
      // Reassign polite/offerer flags when peerId changes
      const beforePolite = polite;
      polite = (myPeerId > otherPeer);
      if (beforePolite !== polite) log('polite reassigned by tie-break:', polite);
      const beforeOfferer = isOfferer;
      isOfferer = (myPeerId > otherPeer);
      if (beforeOfferer !== isOfferer) log('isOfferer=', isOfferer);
    }

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

    if (pendingRemoteCandidates.length) {
      for (const c of pendingRemoteCandidates) {
        try { await pc.addIceCandidate(c); } catch(e){ log('drainIce ERR', e.message); }
      }
      pendingRemoteCandidates = [];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    bufferedSend({ type:'answer', target:from, payload:pc.localDescription });
    log('answer sent');

    ensureRemoteStreamAttached();
  } catch(e){ log('handleOffer ERR', e?.message||e); }
}
async function handleAnswer(_from, sdp){
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    log('answer set');

    if (pendingRemoteCandidates.length) {
      for (const c of pendingRemoteCandidates) {
        try { await pc.addIceCandidate(c); } catch(e){ log('drainIce ERR', e.message); }
      }
      pendingRemoteCandidates = [];
    }

    ensureRemoteStreamAttached();
  } catch(e){ log('handleAnswer ERR', e?.message||e); }
}

// ---------- WS ----------
function pickOtherPeer(){ for (const id of peers) if (id !== myPeerId) return id; return null; }
function setupWS(sigToken){
  const u = new URL(wsUrl);
  u.searchParams.set('callId', callId);
  u.searchParams.set('peerId', myPeerId);
  u.searchParams.set('sig', sigToken);

  const socket = new WebSocket(u.toString());
  ws = socket;
  socket.onopen = () => {
    wsReady = true; log('WS open');
    while (sendQueue.length) {
      const m = sendQueue.shift();
      try { socket.send(JSON.stringify(m)); } catch {}
    }
    if (wantIceRestart) { wantIceRestart = false; doIceRestart(); }
  };
  socket.onclose = () => {
    wsReady = false;
    if (ws === socket) ws = null;
    const message = allowWsReconnect ? 'WS close - retry in 1.5s' : 'WS close';
    log(message);
    if (allowWsReconnect) {
      setTimeout(() => { if (allowWsReconnect) setupWS(sigToken); }, 1500);
    } else {
      updateControls();
    }
  };
  socket.onerror = (e) => log('WS error', e?.message||e);

  socket.onmessage = async (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'peers') {
      peers.clear(); (msg.peers||[]).forEach(id => peers.add(id));
      otherPeer = pickOtherPeer();

      if (otherPeer) {
        const bp = polite; polite = (myPeerId > otherPeer);
        if (bp !== polite) log('polite reassigned by tie-break:', polite);
        const bo = isOfferer; isOfferer = (myPeerId > otherPeer);
        if (bo !== isOfferer) log('isOfferer=', isOfferer);
      }

      if (otherPeer && isOfferer) {
        try { makingOffer = true; const offer = await pc.createOffer(); await pc.setLocalDescription(offer); }
        finally { makingOffer = false; }
        bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
        log('offer sent');
      }
      return;
    }

    if (msg.type === 'peer-joined') {
      peers.add(msg.peerId);
      otherPeer = pickOtherPeer();

      if (otherPeer) {
        const bp = polite; polite = (myPeerId > otherPeer);
        if (bp !== polite) log('polite reassigned by tie-break:', polite);
        const bo = isOfferer; isOfferer = (myPeerId > otherPeer);
        if (bo !== isOfferer) log('isOfferer=', isOfferer);

        if (isOfferer) {
          try { makingOffer = true; const offer = await pc.createOffer(); await pc.setLocalDescription(offer); }
          finally { makingOffer = false; }
          bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
          log('offer sent');
        }
      }
      return;
    }

    if (msg.type === 'peer-left') { peers.delete(msg.peerId); if (otherPeer === msg.peerId) otherPeer = pickOtherPeer(); return; }

    if (msg.type === 'offer')   return handleOffer(msg.from, msg.payload);
    if (msg.type === 'answer')  return handleAnswer(msg.from, msg.payload);

    if (msg.type === 'candidate') {
      try {
        if (!pc.remoteDescription) pendingRemoteCandidates.push(msg.payload);
        else await pc.addIceCandidate(msg.payload);
      } catch (e) { log('addIce ERR', e.message); }
      return;
    }
  };
}

function leave() {
  const hadSession = Boolean(pc || ws || localStream || remoteStream || callId);
  allowWsReconnect = false;
  joinInProgress = false;

  if (ws) {
    try {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.close();
      }
    } catch {}
  }
  ws = null;
  wsReady = false;
  sendQueue = [];

  if (iceRestartTimer) {
    clearTimeout(iceRestartTimer);
    iceRestartTimer = null;
  }
  wantIceRestart = false;

  if (pc) {
    try { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.oniceconnectionstatechange = null; pc.onnegotiationneeded = null; } catch {}
    try { pc.close(); } catch {}
  }
  pc = null;
  makingOffer = false;
  polite = false;
  isOfferer = false;

  peers.clear();
  otherPeer = null;
  pendingRemoteCandidates = [];

  callId = null;
  role = null;
  iceServers = [];
  wsUrl = null;

  stopStream(localStream);
  stopStream(remoteStream);
  localStream = null;
  remoteStream = null;

  if (vLocal) vLocal.srcObject = null;
  if (vRemote) vRemote.srcObject = null;

  updateControls();
  if (hadSession) log('Left call');
}
// ---------- Join flow ----------
async function join(){
  if (joinInProgress) return;
  const latestToken = (tokenInput?.value ?? token ?? '').trim();
  if (!latestToken) { alert('Provide token in the URL or fill the token field.'); return; }

  token = latestToken;
  if (tokenInput) tokenInput.value = token;

  joinInProgress = true;
  allowWsReconnect = false;
  updateControls();

  try {
    showTgHintBanner();

    const resp = await api('/join', { token });
    callId     = resp.callId;
    role       = resp.role;
    iceServers = resp.iceServers || [];
    wsUrl      = resp.wsUrl;

    // Determine polite flag ahead of tie-break comparisons
    polite = (role === 'answerer');
    log('join ok', callId, role, 'polite=', polite);

    const storageKey = 'peerId:' + callId;
    myPeerId = sessionStorage.getItem(storageKey) || rid();
    sessionStorage.setItem(storageKey, myPeerId);

    // Request camera and microphone before creating the peer connection
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:true });
    // Ensure local tracks start enabled so the UI reflects the real state
    localStream.getTracks().forEach(t => { log('local track', t.kind, t.readyState, 'enabled=', t.enabled); t.enabled = true; });

    vLocal.srcObject = localStream; vLocal.muted = true; resumePlay(vLocal,'local');

    allowWsReconnect = true;
    newPC();
    setupWS(token);
    updateControls();
  } catch (error) {
    log('join failed', error?.message || error);
    leave();
    throw error;
  } finally {
    joinInProgress = false;
    updateControls();
  }
}

if (btnJoin) {
  btnJoin.onclick = () => {
    join().catch(e => {
      log('ERR', e?.message || String(e));
      alert('Failed to establish the connection.');
    });
  };
}
if (btnLeave) {
  btnLeave.onclick = () => { leave(); };
}
if (btnCam) {
  btnCam.onclick = () => { toggleLocalTrack('video'); };
}
if (btnMic) {
  btnMic.onclick = () => { toggleLocalTrack('audio'); };
}

updateControls();

if (token) {
  join().catch(e => {
    log('ERR', e?.message || String(e));
  });
}



