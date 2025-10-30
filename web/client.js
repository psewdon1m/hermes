'use strict';

import { SignalingSession } from './signaling-session.js';
import { MediaSession } from './media-session.js';

// ---------- DOM ----------
const logEl   = document.getElementById('log');
const vLocal  = document.getElementById('local');
const vRemote = document.getElementById('remote');
const btnJoin = document.getElementById('joinBtn');
const btnCam  = document.getElementById('camBtn');
const btnMic  = document.getElementById('micBtn');
const diagEl  = document.getElementById('diag');

// ---------- State ----------
let remotePlaybackGranted = false; // Tracks whether remote playback has been unlocked (overlay flow removed)
let speakerOutputEnabled = true;
let screenShareActive = false;
let micNudgeHandlerRegistered = false;
let prejoinOverlayDismissed = false;

window.handleOverlayEnter = () => {
  prejoinOverlayDismissed = true;
  if (window.uiControls) {
    window.uiControls.hideCallOverlay();
  }
  resumePlay(vLocal);
  resumePlay(vRemote);
};

window.setScreenShareState = (isActive, updateUI = true) => {
  screenShareActive = !!isActive;
  if (updateUI && window.uiControls) {
    window.uiControls.updateScreenState(screenShareActive);
  updateLocalVideoActiveState();
  }
  return screenShareActive;
};

const fallbackMedia = {
  localStream: null,
  cameraOn: false,
  micOn: false,
  screenStream: null,
  prevCameraOn: false
};

let signalingSession = null;
let mediaSession = null;

function hasActiveVideoTrack(stream) {
  if (!stream || typeof stream.getVideoTracks !== 'function') return false;
  try {
    return stream.getVideoTracks().some(track =>
      track &&
      track.readyState === 'live' &&
      track.enabled !== false &&
      track.muted !== true
    );
  } catch {
    return false;
  }
}

function updateLocalVideoActiveState() {
  let active = false;
  if (screenShareActive) {
    if (mediaSession?.screenShareStream) {
      active = hasActiveVideoTrack(mediaSession.screenShareStream);
    } else if (hasActiveVideoTrack(fallbackMedia.screenStream)) {
      active = true;
    }
  }
  if (!active) {
    if (mediaSession?.localStream) {
      active = hasActiveVideoTrack(mediaSession.localStream);
    } else if (hasActiveVideoTrack(fallbackMedia.localStream)) {
      active = true;
    }
  }
  if (window.uiControls?.setLocalVideoActive) {
    window.uiControls.setLocalVideoActive(active);
  }
}

function updateRemoteVideoActiveState(stream = vRemote?.srcObject) {
  if (window.uiControls?.setRemoteVideoActive) {
    window.uiControls.setRemoteVideoActive(hasActiveVideoTrack(stream));
  }
}

function setLocalDisplayStream(stream, mirror = false) {
  const display = document.getElementById('localVideoDisplay');
  if (!display || !vLocal) return;
  if (!display.contains(vLocal)) {
    vLocal.setAttribute('playsinline', '');
    vLocal.muted = true;
    display.appendChild(vLocal);
  }

  if (stream) {
    display.classList.add('has-media');
    vLocal.style.display = 'block';
    vLocal.srcObject = stream;
    if (mirror) {
      vLocal.dataset.mirror = '1';
    } else {
      delete vLocal.dataset.mirror;
    }
    resumePlay(vLocal);
  } else {
    display.classList.remove('has-media');
    if (vLocal.srcObject) {
      vLocal.srcObject = null;
    }
    vLocal.style.display = 'none';
    delete vLocal.dataset.mirror;
  }
  if (window.uiControls?.setOverlayPreviewStream) {
    const isCameraStream = stream ? !!mirror : true;
    window.uiControls.setOverlayPreviewStream(stream, isCameraStream);
  }
  if (window.uiControls?.refreshLocalMicIndicator) {
    window.uiControls.refreshLocalMicIndicator();
  }
  updateLocalVideoActiveState();
}

function setRemoteDisplayStream(stream) {
  const display = document.getElementById('remoteVideoDisplay');
  if (!display || !vRemote) return;
  if (!display.contains(vRemote)) {
    vRemote.setAttribute('playsinline', '');
    display.appendChild(vRemote);
  }

  if (stream) {
    display.classList.add('has-media');
    vRemote.style.display = 'block';
    vRemote.srcObject = stream;
    resumePlay(vRemote);
  } else {
    display.classList.remove('has-media');
    if (vRemote.srcObject) {
      vRemote.srcObject = null;
    }
    vRemote.style.display = 'none';
  }
  if (window.uiControls?.refreshRemoteMicIndicator) {
    window.uiControls.refreshRemoteMicIndicator();
  }
  updateRemoteVideoActiveState(stream);
}

async function ensureFallbackLocalStream() {
  if (fallbackMedia.localStream) return fallbackMedia.localStream;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    fallbackMedia.localStream = stream;
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    fallbackMedia.cameraOn = videoTracks.length ? videoTracks[0].enabled !== false : false;
    fallbackMedia.micOn = audioTracks.length ? audioTracks[0].enabled !== false : false;
    setLocalDisplayStream(stream, true);
    if (window.uiControls) {
      if (videoTracks.length) window.uiControls.updateCameraState(videoTracks[0].enabled);
      if (audioTracks.length) window.uiControls.updateMicrophoneState(audioTracks[0].enabled);
    }
    return stream;
  } catch (err) {
    log('[fallback] getUserMedia ERR', err?.name || err?.message || String(err));
    return null;
  }
}

function showPlaceholderIfNoVideo() {
  const hasVideo =
    (fallbackMedia.screenStream && fallbackMedia.screenStream.getVideoTracks().some(t => t.enabled)) ||
    (fallbackMedia.localStream && fallbackMedia.localStream.getVideoTracks().some(t => t.enabled));
  if (!hasVideo) {
    if (fallbackMedia.screenStream) {
      setLocalDisplayStream(fallbackMedia.screenStream, false);
    } else if (fallbackMedia.localStream) {
      setLocalDisplayStream(fallbackMedia.localStream, true);
    } else {
      setLocalDisplayStream(null);
    }
    if (window.uiControls?.setLocalVideoActive) {
      window.uiControls.setLocalVideoActive(false);
    }
  } else {
    updateLocalVideoActiveState();
  }
}

function cleanupFallbackMedia() {
  if (fallbackMedia.screenStream) {
    try { fallbackMedia.screenStream.getTracks().forEach(t => t.stop()); } catch {}
    fallbackMedia.screenStream = null;
  }
  if (fallbackMedia.localStream) {
    try { fallbackMedia.localStream.getTracks().forEach(t => t.stop()); } catch {}
    fallbackMedia.localStream = null;
  }
  fallbackMedia.cameraOn = false;
  fallbackMedia.micOn = false;
  fallbackMedia.prevCameraOn = false;
  setLocalDisplayStream(null);
  updateLocalVideoActiveState();
}

function ensureMicNudgeHandler() {
  if (micNudgeHandlerRegistered) return;
  if (!window.uiControls || typeof window.uiControls.onRemoteMicNudge !== 'function') {
    setTimeout(ensureMicNudgeHandler, 250);
    return;
  }
  window.uiControls.onRemoteMicNudge(() => {
    if (!signalingSession || !signalingSession.otherPeer) return;
    signalingSession.send({
      type: 'mic-nudge',
      target: signalingSession.otherPeer,
      payload: { ts: Date.now() }
    });
  });
  micNudgeHandlerRegistered = true;
}

function handleMicNudge(from) {
  log('[signal] mic nudge received', from || null);
  if (window.uiControls && typeof window.uiControls.flashMicrophoneButton === 'function') {
    window.uiControls.flashMicrophoneButton(3);
  }
}

async function fallbackToggleCamera() {
  const stream = await ensureFallbackLocalStream();
  if (!stream) return fallbackMedia.cameraOn;
  const videoTracks = stream.getVideoTracks();
  if (!videoTracks.length) return fallbackMedia.cameraOn;
  const track = videoTracks[0];
  track.enabled = !track.enabled;
  fallbackMedia.cameraOn = track.enabled;
  if (track.enabled) {
    setLocalDisplayStream(stream, true);
  } else if (!fallbackMedia.screenStream) {
    showPlaceholderIfNoVideo();
  }
  updateLocalVideoActiveState();
  return track.enabled;
}

async function fallbackToggleMicrophone() {
  const stream = await ensureFallbackLocalStream();
  if (!stream) return fallbackMedia.micOn;
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return fallbackMedia.micOn;
  const track = audioTracks[0];
  track.enabled = !track.enabled;
  fallbackMedia.micOn = track.enabled;
  return track.enabled;
}

async function fallbackStartScreenShare() {
  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const displayTrack = displayStream.getVideoTracks()[0];
    if (displayTrack) {
      displayTrack.addEventListener('ended', () => {
        fallbackStopScreenShare();
      });
    }
    fallbackMedia.screenStream = displayStream;
    fallbackMedia.prevCameraOn = fallbackMedia.cameraOn;
    if (fallbackMedia.localStream) {
      const localVideoTracks = fallbackMedia.localStream.getVideoTracks();
      if (localVideoTracks.length) {
        localVideoTracks[0].enabled = false;
      }
      fallbackMedia.cameraOn = false;
      if (window.uiControls) {
        window.uiControls.updateCameraState(false);
      }
    }
    setLocalDisplayStream(displayStream, false);
    window.setScreenShareState(true);
    return true;
  } catch (err) {
    log('[fallback] screen share start ERR', err?.name || err?.message || String(err));
    return false;
  }
}

async function fallbackStopScreenShare() {
  if (fallbackMedia.screenStream) {
    try { fallbackMedia.screenStream.getTracks().forEach(t => t.stop()); } catch {}
    fallbackMedia.screenStream = null;
  }
  window.setScreenShareState(false);
  if (fallbackMedia.localStream) {
    const localVideoTracks = fallbackMedia.localStream.getVideoTracks();
    if (fallbackMedia.prevCameraOn && localVideoTracks.length) {
      localVideoTracks[0].enabled = true;
      fallbackMedia.cameraOn = true;
      setLocalDisplayStream(fallbackMedia.localStream, true);
      if (window.uiControls) {
        window.uiControls.updateCameraState(true);
      }
    } else {
      fallbackMedia.cameraOn = localVideoTracks.length ? localVideoTracks[0].enabled : false;
      if (fallbackMedia.cameraOn) {
        setLocalDisplayStream(fallbackMedia.localStream, true);
      } else {
        showPlaceholderIfNoVideo();
        if (window.uiControls) {
          window.uiControls.updateCameraState(false);
        }
      }
    }
  } else {
    fallbackMedia.cameraOn = false;
    showPlaceholderIfNoVideo();
    if (window.uiControls) {
      window.uiControls.updateCameraState(false);
    }
  }
  fallbackMedia.prevCameraOn = false;
  return true;
}


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

async function resumePlay(el, onFailure){
  if (!el) return false;
  
  // Nothing to do if the element is already playing
  if (!el.paused && !el.ended && el.readyState >= 2) {
    return true;
  }
  
  try {
    await el.play();
    
    // Watch the playback state for up to 500ms
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Treat as a failure if readyState stays below 2
        if (el.readyState < 2) {
          resolve(false);
        } else {
          resolve(true);
        }
      }, 500);
      
      const onPlaying = () => {
        clearTimeout(timeout);
        el.removeEventListener('playing', onPlaying);
        resolve(true);
      };
      
      el.addEventListener('playing', onPlaying);
    });
  } catch (err) {
    if (onFailure) onFailure(err);
    return false;
  }
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

ensureMicNudgeHandler();

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
  signalingSession.onStatusChange = (newStatus) => {
    if (!window.uiControls) return;
    if (newStatus === 'failed') {
      prejoinOverlayDismissed = false;
      window.uiControls.showCallOverlay('reconnect-failed');
    }
  };
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
  };

  signalingSession.onMessage = (msg) => {
    if (msg?.type === 'mic-nudge') {
      handleMicNudge(msg.from);
      return;
    }
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
          diagEl.textContent = 'Preparing media...';
          // Pause the timer while media is preparing
          if (window.uiControls) {
            window.uiControls.stopCallTimer(false);
          }
          break;
        case 'active':
          diagEl.textContent = 'Call in progress';
          // Start or resume the timer when the session becomes active
          if (window.uiControls) {
            window.uiControls.startCallTimer();
          }
          break;
        case 'idle':
          diagEl.textContent = 'Awaiting media...';
          // Stop the timer once the session becomes idle
          if (window.uiControls) {
            window.uiControls.stopCallTimer(false);
          }
          break;
      }
    }
    if (window.uiControls) {
      if (newState === 'active') {
        window.uiControls.hideCallOverlay();
        prejoinOverlayDismissed = true;
      } else if (newState === 'preparing' && !prejoinOverlayDismissed) {
        window.uiControls.showCallOverlay('prejoin');
      }
    }
  };

  // Handle local media stream updates
  mediaSession.onLocalStream = (stream) => {
    setLocalDisplayStream(stream, true);

    if (!stream) {
      if (window.uiControls?.setLocalVideoActive) {
        window.uiControls.setLocalVideoActive(true);
      }
      return;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    if (window.uiControls) {
      if (videoTracks.length > 0) {
        window.uiControls.updateCameraState(videoTracks[0].enabled);
      }
      if (audioTracks.length > 0) {
        window.uiControls.updateMicrophoneState(audioTracks[0].enabled);
      }
      if (window.uiControls.setLocalVideoActive) {
        const hasActiveVideo = videoTracks.some(track =>
          track &&
          track.readyState === 'live' &&
          track.enabled !== false
        );
        window.uiControls.setLocalVideoActive(hasActiveVideo);
      }
    }

    videoTracks.forEach((track) => {
      if (!track || track.__hermesVideoListener) return;
      const listener = () => updateLocalVideoActiveState();
      track.__hermesVideoListener = listener;
      track.addEventListener('mute', listener);
      track.addEventListener('unmute', listener);
      track.addEventListener('ended', listener);
    });
  };

  mediaSession.onRemoteStream = (stream) => {
    setRemoteDisplayStream(stream);

    if (!stream) {
      remotePlaybackGranted = false;
      if (window.uiControls?.setRemoteMicrophoneState) {
        window.uiControls.setRemoteMicrophoneState(true);
      } else if (window.uiControls?.refreshRemoteMicIndicator) {
        window.uiControls.refreshRemoteMicIndicator();
      }
      if (window.uiControls?.setRemoteVideoActive) {
        window.uiControls.setRemoteVideoActive(true);
      }
      return;
    }

    if (vRemote && !vRemote.__hermesPlaybackListener) {
      vRemote.__hermesPlaybackListener = true;
      vRemote.addEventListener('playing', () => {
        remotePlaybackGranted = true;
      });
      vRemote.addEventListener('pause', () => {
        if (vRemote.readyState < 2) {
          remotePlaybackGranted = false;
        }
      });
    }

    const updateRemoteMicState = () => {
      const audioTracks = stream.getAudioTracks();
      const hasActiveAudio = audioTracks.some(track =>
        track &&
        track.readyState === 'live' &&
        track.enabled !== false &&
        track.muted !== true
      );
      if (window.uiControls?.setRemoteMicrophoneState) {
        window.uiControls.setRemoteMicrophoneState(hasActiveAudio);
      }
    };

    updateRemoteMicState();
    if (window.uiControls?.setRemoteVideoActive) {
      window.uiControls.setRemoteVideoActive(hasActiveVideoTrack(stream));
    }
    const videoTracksRemote = stream.getVideoTracks();
    videoTracksRemote.forEach((track) => {
      if (!track || track.__hermesVideoListener) return;
      const listener = () => updateRemoteVideoActiveState(stream);
      track.__hermesVideoListener = listener;
      if (track.addEventListener) {
        track.addEventListener('mute', listener);
        track.addEventListener('unmute', listener);
        track.addEventListener('ended', listener);
      } else {
        const originalMute = track.onmute;
        const originalUnmute = track.onunmute;
        const originalEnded = track.onended;
        track.onmute = (...args) => {
          listener();
          if (typeof originalMute === 'function') originalMute.apply(track, args);
        };
        track.onunmute = (...args) => {
          listener();
          if (typeof originalUnmute === 'function') originalUnmute.apply(track, args);
        };
        track.onended = (...args) => {
          listener();
          if (typeof originalEnded === 'function') originalEnded.apply(track, args);
        };
      }
    });
    updateRemoteVideoActiveState(stream);
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track) => {
      if (!track || track.__hermesMicListener) return;
      const listener = () => updateRemoteMicState();
      track.__hermesMicListener = listener;
      if (track.addEventListener) {
        track.addEventListener('mute', listener);
        track.addEventListener('unmute', listener);
        track.addEventListener('ended', listener);
      } else {
        const originalMute = track.onmute;
        const originalUnmute = track.onunmute;
        const originalEnded = track.onended;
        track.onmute = (...args) => {
          listener();
          if (typeof originalMute === 'function') originalMute.apply(track, args);
        };
        track.onunmute = (...args) => {
          listener();
          if (typeof originalUnmute === 'function') originalUnmute.apply(track, args);
        };
        track.onended = (...args) => {
          listener();
          if (typeof originalEnded === 'function') originalEnded.apply(track, args);
        };
      }
    });
    if (window.uiControls?.refreshRemoteMicIndicator) {
      window.uiControls.refreshRemoteMicIndicator();
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

// btnJoin.onclick is unused - production flow passes the token via URL

// Global UI helpers
window.toggleCameraMedia = async () => {
  try {
    if (!mediaSession || !mediaSession.localStream) {
      const result = await fallbackToggleCamera();
      return result;
    }
    const videoTracks = mediaSession.localStream.getVideoTracks() || [];
    if (videoTracks.length) {
      const t = videoTracks[0];
      t.enabled = !t.enabled;
      log('[media] video toggle', t.enabled ? 'on' : 'off');
      
      // Sync UI state
      if (window.uiControls) {
        window.uiControls.updateCameraState(t.enabled);
      }
      updateLocalVideoActiveState();
      
      return t.enabled;
    } else {
      log('[media] video toggle: no video track');
      return fallbackMedia.cameraOn;
    }
  } catch (e) { 
    log('[media] video toggle ERR', e?.message || e); 
    const result = await fallbackToggleCamera();
    return result;
  }
};

window.toggleMicrophoneMedia = async () => {
  try {
    if (!mediaSession || !mediaSession.localStream) {
      const result = await fallbackToggleMicrophone();
      return result;
    }
    const audioTracks = mediaSession.localStream.getAudioTracks() || [];
    if (audioTracks.length) {
      const t = audioTracks[0];
      t.enabled = !t.enabled;
      log('[media] audio toggle', t.enabled ? 'on' : 'off');
      
      // Sync UI state
      if (window.uiControls) {
        window.uiControls.updateMicrophoneState(t.enabled);
      }
      return t.enabled;
    } else {
      log('[media] audio toggle: no audio track');
      const result = await fallbackToggleMicrophone();
      return result;
    }
  } catch (e) { 
    log('[media] audio toggle ERR', e?.message || e); 
    const result = await fallbackToggleMicrophone();
    return result;
  }
};

window.toggleSpeakerOutput = () => {
  try {
    speakerOutputEnabled = !speakerOutputEnabled;
    if (vRemote) {
      vRemote.muted = !speakerOutputEnabled;
      if (speakerOutputEnabled) {
        try { vRemote.volume = 1; } catch {}
      }
    }
    log('[media] speaker toggle', speakerOutputEnabled ? 'on' : 'off');
    if (window.uiControls) {
      window.uiControls.updateSpeakerState(speakerOutputEnabled);
    }
    return speakerOutputEnabled;
  } catch (e) {
    log('[media] speaker toggle ERR', e?.message || e);
    return speakerOutputEnabled;
  }
};

window.toggleScreenShare = async () => {
  try {
    if (!mediaSession) {
      if (!screenShareActive) {
        const started = await fallbackStartScreenShare();
        const result = started ? true : screenShareActive;
        log('[media] screen toggle (fallback)', result ? 'on' : 'off');
        return result;
      } else {
        await fallbackStopScreenShare();
        log('[media] screen toggle (fallback)', 'off');
        return false;
      }
    }
    const activeBefore = !!mediaSession.screenShareStream;
    if (!activeBefore) {
      const started = await mediaSession.startScreenShare?.();
      const targetState = started ? true : !!mediaSession.screenShareStream;
      window.setScreenShareState(targetState);
      log('[media] screen toggle', targetState ? 'on' : 'off');
      return targetState;
    } else {
      const stopped = await mediaSession.stopScreenShare?.();
      const targetState = (stopped !== false) ? false : !!mediaSession.screenShareStream;
      window.setScreenShareState(targetState);
      log('[media] screen toggle', targetState ? 'on' : 'off');
      return targetState;
    }
  } catch (e) {
    log('[media] screen toggle ERR', e?.message || e);
    return screenShareActive;
  }
};

window.endCall = () => {
  try {
    log('[ui] ending call...');
    // Stop active screen share if any
    if (mediaSession && mediaSession.stopScreenShare) {
      try { mediaSession.stopScreenShare(); } catch {}
    }

    
    // Stop and reset the timer
    if (window.uiControls) {
      window.uiControls.stopCallTimer(true);
    }
    
    // Close active sessions
    if (mediaSession) {
      mediaSession.close();
    }
    if (signalingSession) {
      signalingSession.close();
    }
    
    // Clear media elements
    if (vLocal) vLocal.srcObject = null;
    if (vRemote) vRemote.srcObject = null;
    
    // Reset playback flags
    remotePlaybackGranted = false;
    
    // Restore placeholders
    setLocalDisplayStream(null);
    setRemoteDisplayStream(null);
    
    // Reset control states
    if (window.uiControls) {
      window.uiControls.updateCameraState(true);
      window.uiControls.updateMicrophoneState(true);
      window.uiControls.updateSpeakerState(true);
      if (window.uiControls.setRemoteMicrophoneState) {
        window.uiControls.setRemoteMicrophoneState(true);
      }
      if (window.uiControls.refreshRemoteMicIndicator) {
        window.uiControls.refreshRemoteMicIndicator();
      }
    }
    if (window.setScreenShareState) {
      window.setScreenShareState(false);
    } else if (window.uiControls) {
      window.uiControls.updateScreenState(false);
    }
    speakerOutputEnabled = true;
    screenShareActive = false;
    if (vRemote) {
      vRemote.muted = false;
    }
    cleanupFallbackMedia();


    // Attempt to close the window (if allowed)
    try {
      window.close();
    } catch (e) {
      // Redirect to the landing page if window.close fails
      window.location.href = '/';
    }
  } catch (e) {
    log('[ui] end call ERR', e?.message || e);
  }
};

// Helper to retry media permissions
window.requestMediaRetry = () => {
  if (mediaSession && mediaSession.pendingMediaRetry) {
    mediaSession.pendingMediaRetry();
  }
};

// Legacy helper kept for backward compatibility
// resumeRemotePlayback removed - pre-join overlay will handle user gesture

// Legacy join handlers removed - UIControls drives the flow now

// Global click/touch handlers removed - pre-join overlay will drive playback

// Auto-join when token already in URL
if (token) {
  join().catch(e => { log('ERR', e?.message || String(e)); });
} else {
  // In production the token must be provided via the URL
  // Show an error when the token is missing
  log('ERR: No token provided in URL');
  
  // Hide interactive controls because they require a valid token
  // Delay to ensure the UI initialises before disabling controls
  const diagContainer = document.getElementById('diag');
  if (diagContainer) {
    diagContainer.textContent = 'Add ?token=... to the URL to join the call.';
  }
  const controls = document.querySelector('.controls-container');
  if (controls) {
    controls.classList.add('inactive');
  }
}

// Media stats functionality moved to MediaSession class














