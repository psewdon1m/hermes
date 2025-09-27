'use strict';

import { SignalingSession } from './signaling-session.js';
import { MediaSession } from './media-session.js';
import { UIManager } from './ui-manager.js';

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
  if (!signalingSession || !signalingSession.wsReady) return;
  const payload = {
    ts: Date.now(),
    callId: signalingSession.callId ?? null,
    peerId: signalingSession.myPeerId ?? null,
    role: signalingSession.role ?? null,
    message: text
  };
  if (args.length) payload.detail = args.map(formatLogPart);
  signalingSession.send({ type: 'log', payload });
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
    if (mediaSession && mediaSession.pc && mediaSession.pc.iceConnectionState !== 'connected') {
      // Trigger media session rebuild on visibility change
      mediaSession.rebuildPCAndRenegotiate();
    }
  }
});

// ---------- Global instances ----------
let signalingSession = null;
let mediaSession = null;
let uiManager = null;

// ICE restart functionality moved to MediaSession

// This function is now handled by SignalingSession.send()

// These functions are now handled by MediaSession class

// ICE restart functionality moved to MediaSession

// RTCPeerConnection functionality moved to MediaSession class

// Perfect Negotiation functionality moved to MediaSession class

// WebSocket functionality moved to SignalingSession class

// ---------- Join flow ----------
async function join(){
  if (!token) { alert('Token is missing in URL'); return; }

  logClientInfo();

  // Phase 1: Establish signaling session
  signalingSession = new SignalingSession(log, api, rid, wsRetryLimit, wsRetryDelayMs);
  const signalingOk = await signalingSession.join(token);
  if (!signalingOk) {
    alert('Failed to establish signaling session');
    return;
  }

  // Set up signaling callbacks
  signalingSession.onPeerUpdate = (eventType, peers, otherPeer) => {
    if (eventType === 'peers' && otherPeer && !signalingSession.polite) {
      // Start media negotiation when we're the rightful initiator
      if (mediaSession) {
        if (mediaSession.state === 'idle') {
          // Media session not ready yet, ensure PC is created first
          mediaSession.newPC();
        }
        mediaSession.requestNegotiation('peer update');
      }
    } else if (eventType === 'peer-joined' && otherPeer && !signalingSession.polite) {
      // Start media negotiation when peer joins
      if (mediaSession) {
        if (mediaSession.state === 'idle') {
          // Media session not ready yet, ensure PC is created first
          mediaSession.newPC();
        }
        mediaSession.requestNegotiation('peer update');
      }
    } else if (eventType === 'peer-left') {
      // Rebuild media session when peer leaves
      if (mediaSession) {
        mediaSession.rebuildPCAndRenegotiate();
      }
    }
    
    // Update UI based on peer status
    if (uiManager) {
      if (eventType === 'peer-joined' && otherPeer) {
        uiManager.onCallStarted();
      } else if (eventType === 'peer-left') {
        uiManager.onCallEnded();
      }
    }
  };

  signalingSession.onMessage = (msg) => {
    if (mediaSession) {
      if (msg.type === 'offer') {
        mediaSession.handleOffer(msg.from, msg.payload);
      } else if (msg.type === 'answer') {
        mediaSession.handleAnswer(msg.from, msg.payload);
      } else if (msg.type === 'candidate') {
        mediaSession.handleCandidate(msg.payload);
      }
    }
  };

  // Attach WebSocket
  signalingSession.attachWS();

  // Phase 2: Establish media session
  mediaSession = new MediaSession(signalingSession, log, logPermissionsInfo, resumePlay, debugSDP, vLocal, vRemote, diagEl);
  
  // Set up media state change callback
  mediaSession.onStateChange = (newState, oldState) => {
    if (diagEl) {
      switch (newState) {
        case 'preparing':
          diagEl.textContent = 'Подготовка медиа...';
          break;
        case 'active':
          diagEl.textContent = 'Медиа-поток установлен';
          break;
        case 'idle':
          diagEl.textContent = 'Ожидание медиа...';
          break;
      }
    }
    
    // Update UI based on media state
    if (uiManager) {
      if (newState === 'active') {
        uiManager.onCallStarted();
      } else if (newState === 'idle') {
        uiManager.onCallEnded();
      }
    }
  };

  // Add video stream callbacks to update UI
  const originalPrepareLocalMedia = mediaSession.prepareLocalMedia.bind(mediaSession);
  mediaSession.prepareLocalMedia = async function() {
    const result = await originalPrepareLocalMedia();
    
    // Show local video in UI
    if (uiManager && this.localStream) {
      uiManager.showVideoStream(this.vLocal, true);
    }
    
    return result;
  };

  // Override the method that handles remote streams
  const originalHandleRemoteStream = mediaSession.handleRemoteStream.bind(mediaSession);
  mediaSession.handleRemoteStream = function(remoteStream) {
    originalHandleRemoteStream(remoteStream);
    
    // Show remote video in UI
    if (uiManager && remoteStream) {
      uiManager.showVideoStream(this.vRemote, false);
    }
  };

  // First line of defense: Create PC immediately before media preparation
  mediaSession.newPC();
  
  // Prepare local media
  const gumOk = await mediaSession.prepareLocalMedia();
  
  // Start negotiation if we have a peer
  if (signalingSession.otherPeer && !signalingSession.polite) {
    // Request negotiation (will be executed when tracks are ready)
    mediaSession.requestNegotiation('initial peer detected');
  }
}

btnJoin.onclick = () => { join().catch(e => { log('ERR', e?.message || String(e)); alert('Join failed'); }); };

// Media toggle functions - extracted for reuse and made global
window.toggleCameraMedia = function() {
  try {
    if (!mediaSession || !mediaSession.localStream) {
      log('[media] video toggle: no media session');
      return false;
    }
    const videoTracks = mediaSession.localStream.getVideoTracks() || [];
    if (videoTracks.length) {
      const t = videoTracks[0];
      t.enabled = !t.enabled;
      log('[media] video toggle', t.enabled ? 'on' : 'off');
      return t.enabled;
    } else {
      log('[media] video toggle: no video track');
      return false;
    }
  } catch (e) { 
    log('[media] video toggle ERR', e?.message || e); 
    return false;
  }
};

window.toggleMicrophoneMedia = function() {
  try {
    if (!mediaSession || !mediaSession.localStream) {
      log('[media] audio toggle: no media session');
      return false;
    }
    const audioTracks = mediaSession.localStream.getAudioTracks() || [];
    if (audioTracks.length) {
      const t = audioTracks[0];
      t.enabled = !t.enabled;
      log('[media] audio toggle', t.enabled ? 'on' : 'off');
      return t.enabled;
    } else {
      log('[media] audio toggle: no audio track');
      return false;
    }
  } catch (e) { 
    log('[media] audio toggle ERR', e?.message || e); 
    return false;
  }
};

// Mic/Cam toggles: UIManager handles the click events
// These handlers are removed to avoid double-triggering
// UIManager will call the toggle functions directly

// Initialize UI Manager
uiManager = new UIManager();

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

// Media stats functionality moved to MediaSession class








