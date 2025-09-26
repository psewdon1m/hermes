'use strict';

// ---------- DOM ----------
const logEl   = document.getElementById('log');
const vLocal  = document.getElementById('local');
const vRemote = document.getElementById('remote');
const btnJoin = document.getElementById('joinBtn');
const btnCam  = document.getElementById('camBtn');
const btnMic  = document.getElementById('micBtn');
const diagEl  = document.getElementById('diag');

// ---------- Helpers ----------
const url   = new URL(location.href);
const token = url.searchParams.get('token') || '';
const debugSDP = url.searchParams.get('debug') === '1';
const wsRetryLimit = Number(url.searchParams.get('wsRetryLimit') ?? 5);
const wsRetryDelayMs = Number(url.searchParams.get('wsRetryDelayMs') ?? 1500);

function formatLogPart(part){
  if (typeof part === 'string') return part;
  if (part === null || part === undefined) return String(part);
  if (typeof part === 'number' || typeof part === 'boolean') return String(part);
  try { return JSON.stringify(part); }
  catch { return String(part); }
}

function log(...a){
  const text = a.map(formatLogPart).join(' ');
  if (logEl) logEl.textContent += text + '\n';
  sendLogEvent(text, a);
}

function sendLogEvent(text, args = []){
  if (!wsUrl) return;
  const payload = {
    ts: Date.now(),
    callId: callId ?? null,
    peerId: myPeerId ?? null,
    role: role ?? null,
    message: text
  };
  if (args.length) payload.detail = args.map(formatLogPart);
  bufferedSend({ type: 'log', payload });
}
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

function detectClient(){
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const vendor = navigator.vendor || "";
  let device = "desktop";
  if (/Android/i.test(ua)) device = "android";
  else if (/iPhone|iPad|iPod/i.test(ua)) device = "ios";
  else if (/Macintosh|MacIntel/i.test(ua)) device = "mac";
  else if (/Windows/i.test(ua)) device = "windows";
  const browserMatch = ua.match(/(Firefox|Chrome|Edg|Safari|OPR)\/(\d+\.?[\d]*)/i);
  const browser = browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : "unknown";
  return { ua, platform, vendor, device, browser };
}

function logClientInfo(){
  const info = detectClient();
  log('client info', JSON.stringify(info));
}

async function logPermissionsInfo(){
  try {
    if (!navigator.permissions || !navigator.permissions.query) return;
    const mic = await navigator.permissions.query({ name:'microphone' });
    const cam = await navigator.permissions.query({ name:'camera' });
    log('permissions', { mic: mic?.state || 'unknown', cam: cam?.state || 'unknown' });
  } catch {}
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
let joinSigToken=null;
let lastJoinRefresh=0;
const peers = new Set();
let pendingCandidates = [];
let wsRetryCount = 0;
let statsTimer = null;
const statsPrev = new Map();
let gumFailCount = 0;

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

function safeClosePC(){
  stopStatsMonitor();
  try { if (pc) pc.ontrack = pc.onicecandidate = pc.oniceconnectionstatechange = pc.onconnectionstatechange = null; } catch {}
  try { if (pc) pc.close(); } catch {}
  pc = null;
}

function tryRollback(){
  try {
    if (pc && pc.signalingState && pc.signalingState !== 'stable') {
      return pc.setLocalDescription({ type:'rollback' }).catch(() => {});
    }
  } catch {}
  return Promise.resolve();
}

async function rebuildPCAndRenegotiate(){
  log('rebuild PC and renegotiate');
  await tryRollback();
  safeClosePC();
  newPC();
  if (otherPeer) {
    (async () => {
      try {
        makingOffer = true;
        try {
          const senders = (pc.getSenders && pc.getSenders()) || [];
          log('before createOffer senders', { count: senders.length, tracks: senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) });
        } catch {}
        const offer = await pc.createOffer();
        if (debugSDP) {
          const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
          log('[SDP] offer created (rebuild)', head);
        }
        await pc.setLocalDescription(offer);
        bufferedSend({ type:'offer', target:otherPeer, payload:pc.localDescription });
        log('offer sent (rebuild)');
      } catch (e) {
        log('rebuild offer ERR', e?.message || e);
      } finally { makingOffer = false; }
    })();
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
  stopStatsMonitor();
  pc = new RTCPeerConnection({ iceServers });
  pendingCandidates = [];
  try {
    const total = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
    const ac = (localStream && localStream.getAudioTracks) ? localStream.getAudioTracks().length : 0;
    const vc = (localStream && localStream.getVideoTracks) ? localStream.getVideoTracks().length : 0;
    log('newPC start', 'localTracks=', total, 'audio=', ac, 'video=', vc);
  } catch {}

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
    try {
      const senders = (pc.getSenders && pc.getSenders()) || [];
      log('newPC after addTrack senders', senders.map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })));
    } catch {}
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
    if (st==='connected') { attachRemoteStreamDebug(remoteStream); startStatsMonitor(); }
    if (st==='disconnected'||st==='failed') {
      stopStatsMonitor();
      rebuildPCAndRenegotiate();
    }
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    log('pcState', st);
    if (st==='connected') { attachRemoteStreamDebug(remoteStream); startStatsMonitor(); }
    if (st==='disconnected'||st==='failed') {
      stopStatsMonitor();
      rebuildPCAndRenegotiate();
    }
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
    if (debugSDP) {
      const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
      log('[SDP] offer received', head);
    }
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
    if (debugSDP) {
      const head = (answer.sdp || '').split('\n').slice(0, 40).join('\\n');
      log('[SDP] answer created', head);
    }
    await pc.setLocalDescription(answer);
    bufferedSend({ type:'answer', target:from, payload:pc.localDescription });
    log('answer sent');
    otherPeer = from;
  } catch(e){
    log('handleOffer ERR', e?.message || e);
    if (/m-?lines?/i.test(String(e?.message || ''))) {
      rebuildPCAndRenegotiate();
    }
  }
}

async function handleAnswer(_from, sdp){
  try {
    const answerDesc = new RTCSessionDescription(sdp);
    if (debugSDP) {
      const head = (answerDesc.sdp || '').split('\n').slice(0, 40).join('\\n');
      log('[SDP] answer received', head);
    }
    await pc.setRemoteDescription(answerDesc);
    await flushPendingCandidates();
    log('answer set');
  } catch(e){
    log('handleAnswer ERR', e?.message || e);
    if (/m-?lines?/i.test(String(e?.message || ''))) {
      rebuildPCAndRenegotiate();
    }
  }
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
    wsRetryCount = 0;
    log('WS open');
    while (sendQueue.length) {
      const m = sendQueue.shift();
      try { ws.send(JSON.stringify(m)); } catch {}
    }
    if (wantIceRestart) { wantIceRestart = false; doIceRestart(); }
  };

  ws.onclose = (ev) => {
    wsReady = false;
    // reset PC to avoid stale transceivers/m-line ordering issues
    safeClosePC();
    // clear signaling state
    makingOffer = false;
    otherPeer = null;
    pendingCandidates = [];
    peers.clear();

    // Do not retry if server replied "room full" (or bad request).
    if (ev && (ev.code === 4403 || ev.code === 4400)) {
      log('WS closed:', ev.code, ev.reason || 'room_full');
      alert('Room already full: maximum 2 participants.');
      return; // Disable auto retry
    }

    if (wsRetryCount >= wsRetryLimit) {
      log('WS close - retries exhausted');
      alert('Connection lost. Please reload the page.');
      return;
    }
    wsRetryCount += 1;
    log('WS close - retry', wsRetryCount, 'of', wsRetryLimit, 'in', wsRetryDelayMs, 'ms');
    setTimeout(async () => {
      try {
        const now = Date.now();
        if (joinSigToken && (now - lastJoinRefresh > 120000)) {
          const resp = await api('/join', { token: joinSigToken });
          callId = resp.callId;
          role   = resp.role;
          iceServers = resp.iceServers || [];
          wsUrl  = resp.wsUrl;
          lastJoinRefresh = now;
          polite = (role === 'answerer');
          makingOffer = false;
          otherPeer = null;
          pendingCandidates = [];
          peers.clear();
          log('refreshed join on retry');
        }
      } catch (e) { log('join refresh failed', e?.message || e); }
      // Ensure role/politeness reset even without refresh window
      polite = (role === 'answerer');
      makingOffer = false;
      otherPeer = null;
      pendingCandidates = [];
      peers.clear();
      newPC();
      setupWS(joinSigToken);
    }, wsRetryDelayMs);
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

      // Initiate offer only when rightful initiator
      const rightfulInitiator = otherPeer && (!polite);
      if (rightfulInitiator) {
        try {
          makingOffer = true;
          const offer = await pc.createOffer();
          if (debugSDP) {
            const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
            log('[SDP] offer created', head);
          }
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

      if (otherPeer && !polite) {
        const before = polite;
        polite = (myPeerId > otherPeer);
        if (before !== polite) log('polite reassigned by tie-break:', polite);

        try {
          makingOffer = true;
          const offer = await pc.createOffer();
          if (debugSDP) {
            const head = (offer.sdp || '').split('\n').slice(0, 40).join('\\n');
            log('[SDP] offer created', head);
          }
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
      // optional: rebuild to reset state for upcoming peer
      try { await rebuildPCAndRenegotiate(); } catch {}
      return;
    }

    if (msg.type === 'room-full') {
      log('room-full received');
      alert('Room already full: maximum 2 participants.');
      try { ws.close(4403, 'room-full'); } catch {}
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
  joinSigToken = token;
  try { sessionStorage.setItem('joinToken', token); } catch {}
  lastJoinRefresh = Date.now();

  // Pre-set politeness from role: answerer starts polite
  polite = (role === 'answerer');

  // Stable peerId per tab/browser (for tie-break and auto re-invite)
  const storageKey = `peerId:${callId}`;
  myPeerId = sessionStorage.getItem(storageKey) || rid();
  sessionStorage.setItem(storageKey, myPeerId);

  log('join ok', callId, role, 'polite=', polite);
  logClientInfo();

  // Acquire local media (tolerant)
  localStream = null;
  let gumOk = false;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:true });
    gumOk = true;
  } catch (e1) {
    log('media error', e1?.name || e1?.message || String(e1));
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
      gumOk = true;
      log('fallback media: audio only');
    } catch (e2) {
      log('media error (audio only)', e2?.name || e2?.message || String(e2));
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio:false, video:true });
        gumOk = true;
        log('fallback media: video only');
      } catch (e3) {
        log('media error (video only)', e3?.name || e3?.message || String(e3));
        log('proceed without local media');
      }
    }
  }
  vLocal.srcObject = localStream;
  if (localStream) {
    localStream.getTracks().forEach(t => {
      log('local track', t.kind, 'live', t.readyState, 'enabled=', t.enabled);
      t.onended = async () => {
        log('recover start', { kind: t.kind, trackState: t.readyState });
        // Immediate recvonly switch for stability
        try {
          const before = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
          try { if (localStream) localStream.removeTrack(t); } catch {}
          const after = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
          log('recover pre-recvonly cleanup', { tracksBefore: before, tracksAfter: after });
          if (after === 0) {
            localStream = new MediaStream();
            vLocal.srcObject = localStream;
            log('entered recvonly immediately after track end');
            await rebuildPCAndRenegotiate();
          }
        } catch {}

        let didRenegotiate = false;
        let constraints = t.kind === 'video' ? { video:true } : { audio:true };
        // Timeout guard
        let gumTimeoutId;
        const gumTimeoutMs = 4000;
        const timeoutPromise = new Promise((resolve) => {
          gumTimeoutId = setTimeout(() => {
            log('recover track TIMEOUT', { kind: t.kind, constraints });
            try {
              const count = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
              if (count === 0) {
                localStream = new MediaStream();
                vLocal.srcObject = localStream;
                rebuildPCAndRenegotiate().catch(() => {});
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
          if (!fresh) { log('recover exit', { kind: t.kind, didRenegotiate }); return; }
          const newTrack = t.kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
          if (newTrack) {
            // Try replace on sender first
            const sender = pc && pc.getSenders ? pc.getSenders().find(s => s.track && s.track.kind === t.kind) : null;
            if (sender && sender.replaceTrack) {
              log('replaceTrack attempt', { kind: t.kind, senderTrackState: sender?.track?.readyState || null, hasDTMF: !!sender?.dtmf });
              await sender.replaceTrack(newTrack);
              log('replaceTrack success', { kind: t.kind, readyState: newTrack.readyState });
              // Update localStream only after successful replace
              try { if (localStream) localStream.removeTrack(t); } catch {}
              try { if (localStream) localStream.addTrack(newTrack); } catch {}
              vLocal.srcObject = localStream;
              log('track recovered via replaceTrack', t.kind);
              // Clean up extra fresh tracks
              try { fresh.getTracks().forEach(x => { if (x !== newTrack) x.stop(); }); } catch {}
              try {
                const senderStates = (pc.getSenders && pc.getSenders()) ? pc.getSenders().map(s => ({ kind: s.track?.kind || null, state: s.track?.readyState || null })) : [];
                log('sender states after replace', senderStates);
              } catch {}
              await rebuildPCAndRenegotiate();
              log('renegotiate done', { callbacks:'replaceTrack' });
              didRenegotiate = true;
              log('recover exit', { kind: t.kind, didRenegotiate });
              return;
            } else {
              log('recover track ERR', 'no sender for kind=' + t.kind, constraints);
            }
          } else {
            log('recover track ERR', 'gum returned no tracks', constraints);
          }
        } catch (err) {
          gumFailCount += 1;
          log('recover track ERR', err?.name || err?.message || String(err), constraints);
          try { if (gumFailCount >= 1 && diagEl) diagEl.textContent = 'Разрешите доступ к камере/микрофону и нажмите «Разрешить».'; } catch {}
        } finally {
          try { clearTimeout(gumTimeoutId); } catch {}
          // Always remove the ended track from localStream so it doesn't block recvonly detection
          const before = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
          try { if (localStream) localStream.removeTrack(t); } catch {}
          vLocal.srcObject = localStream;
          try {
            const count = (localStream && localStream.getTracks) ? localStream.getTracks().length : 0;
            log('recover finally', { tracksBefore: before, tracksAfter: count });
            if (count === 0) {
              localStream = new MediaStream();
              vLocal.srcObject = localStream;
              log('entered recvonly after track end (no local tracks)');
              if (!didRenegotiate) await rebuildPCAndRenegotiate();
              log('renegotiate done', { callbacks:'recvonly' });
              didRenegotiate = true;
            }
          } catch {}
        }
        log('recover exit', { kind: t.kind, didRenegotiate });
      };
      t.onmute = () => log('local track mute', t.kind);
      t.onunmute = () => log('local track unmute', t.kind);
    });
  }
  resumePlay(vLocal);

  // PC + WS
  if (!gumOk && (!localStream || (!localStream.getAudioTracks().length && !localStream.getVideoTracks().length))) {
    log('entering recvonly mode: starting signaling without local tracks');
    localStream = new MediaStream();
  }
  newPC();
  setupWS(joinSigToken);
}

btnJoin.onclick = () => { join().catch(e => { log('ERR', e?.message || String(e)); alert('Join failed'); }); };

// Mic/Cam toggles: do not stop tracks; use enabled=false to keep RTP alive
btnCam.onclick = () => {
  try {
    const videoTracks = (localStream && localStream.getVideoTracks()) || [];
    if (videoTracks.length) {
      const t = videoTracks[0];
      t.enabled = !t.enabled;
      log('video toggle', t.enabled ? 'on' : 'off');
    } else {
      log('video toggle: no video track');
    }
  } catch (e) { log('video toggle ERR', e?.message || e); }
};

btnMic.onclick = () => {
  try {
    const audioTracks = (localStream && localStream.getAudioTracks()) || [];
    if (audioTracks.length) {
      const t = audioTracks[0];
      t.enabled = !t.enabled;
      log('audio toggle', t.enabled ? 'on' : 'off');
    } else {
      log('audio toggle: no audio track');
    }
  } catch (e) { log('audio toggle ERR', e?.message || e); }
};

// Auto-join when token already in URL
if (token) {
  join().catch(e => { log('ERR', e?.message || String(e)); });
} else {
  try {
    const saved = sessionStorage.getItem('joinToken');
    if (saved) {
      const u = new URL(location.href);
      u.searchParams.set('token', saved);
      location.replace(u.toString());
    }
  } catch {}
}

// ---------- Media stats (periodic) ----------
async function sampleStats(){
  if (!pc) return null;
  try {
    const report = await pc.getStats();
    const now = Date.now();
    let inboundAudio = 0, inboundVideo = 0, outboundAudio = 0, outboundVideo = 0;
    report.forEach(stat => {
      if (!stat || typeof stat.type !== 'string') return;
      if (stat.type === 'inbound-rtp' && !stat.isRemote) {
        const key = stat.id;
        const prev = statsPrev.get(key);
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
        statsPrev.set(key, { bytes, ts: now });
      }
      if (stat.type === 'outbound-rtp' && !stat.isRemote) {
        const key = stat.id;
        const prev = statsPrev.get(key);
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
        statsPrev.set(key, { bytes, ts: now });
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
    log('stats error', err?.message || err);
    return null;
  }
}

function startStatsMonitor(){
  if (statsTimer || !pc) return;
  statsTimer = setInterval(async () => {
    const stats = await sampleStats();
    if (!stats) return;
    log('[stats]', 'in_a=' + stats.inboundAudio + 'kbps', 'in_v=' + stats.inboundVideo + 'kbps', 'out_a=' + stats.outboundAudio + 'kbps', 'out_v=' + stats.outboundVideo + 'kbps');
  }, 5000);
}

function stopStatsMonitor(){
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  statsPrev.clear();
}








