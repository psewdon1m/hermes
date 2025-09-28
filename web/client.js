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
  try {
    await el.play();
    return true;
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
let signalingSession = null;
let mediaSession = null;

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
          // Ставим таймер на паузу при подготовке
          if (window.uiControls) {
            window.uiControls.stopCallTimer(false);
          }
          break;
        case 'active':
          diagEl.textContent = 'Медиа-поток установлен';
          // Запускаем/возобновляем таймер при активном состоянии
          if (window.uiControls) {
            window.uiControls.startCallTimer();
          }
          break;
        case 'idle':
          diagEl.textContent = 'Ожидание медиа...';
          // Ставим таймер на паузу при простое
          if (window.uiControls) {
            window.uiControls.stopCallTimer(false);
          }
          break;
      }
    }
  };

  // Добавляем обработчики для видео-потоков
  mediaSession.onLocalStream = (stream) => {
    if (stream && window.uiControls) {
      // Вставляем локальное видео в плейсхолдер
      const localVideoArea = document.getElementById('localVideoArea');
      if (localVideoArea && vLocal) {
        vLocal.srcObject = stream;
        localVideoArea.appendChild(vLocal);
        vLocal.style.display = 'block';
        vLocal.style.width = '100%';
        vLocal.style.height = '100%';
        vLocal.style.objectFit = 'cover';
        vLocal.style.borderRadius = '12px';
        vLocal.style.position = 'absolute';
        vLocal.style.top = '0';
        vLocal.style.left = '0';
        vLocal.style.zIndex = '2';
        
        // Скрываем плейсхолдер при появлении локального видео
        localVideoArea.classList.add('hidden');
      }
      
      // Синхронизируем состояние кнопок
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      if (videoTracks.length > 0) {
        window.uiControls.updateCameraState(videoTracks[0].enabled);
      }
      if (audioTracks.length > 0) {
        window.uiControls.updateMicrophoneState(audioTracks[0].enabled);
      }
    } else {
      // Если поток исчез, показываем плейсхолдер обратно
      const localVideoArea = document.getElementById('localVideoArea');
      if (localVideoArea) {
        localVideoArea.classList.remove('hidden');
      }
    }
  };

  mediaSession.onRemoteStream = (stream) => {
    if (stream && window.uiControls) {
      // Вставляем удаленное видео в плейсхолдер
      const remoteVideoArea = document.getElementById('remoteVideoArea');
      if (remoteVideoArea && vRemote) {
        vRemote.srcObject = stream;
        remoteVideoArea.appendChild(vRemote);
        vRemote.style.display = 'block';
        vRemote.style.width = '100%';
        vRemote.style.height = '100%';
        vRemote.style.objectFit = 'cover';
        vRemote.style.borderRadius = '12px';
        vRemote.style.position = 'absolute';
        vRemote.style.top = '0';
        vRemote.style.left = '0';
        vRemote.style.zIndex = '2';
        
        // Скрываем плейсхолдер при появлении удаленного видео
        remoteVideoArea.classList.add('hidden');
        
        // Пытаемся запустить видео, при неудаче показываем overlay
        resumePlay(vRemote, () => {
          window.uiControls?.showRemotePlaybackPrompt();
        });
      }
    } else {
      // Если поток исчез, показываем плейсхолдер обратно
      const remoteVideoArea = document.getElementById('remoteVideoArea');
      if (remoteVideoArea) {
        remoteVideoArea.classList.remove('hidden');
        // Скрываем overlay если он был показан
        window.uiControls?.hideRemotePlaybackPrompt();
      }
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

// btnJoin.onclick убран - в рабочем билде токен всегда в URL

// Глобальные функции для нового UI
window.toggleCameraMedia = () => {
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
      
      // Синхронизируем UI
      if (window.uiControls) {
        window.uiControls.updateCameraState(t.enabled);
      }
      
      // Показываем/скрываем плейсхолдер в зависимости от состояния видео
      const localVideoArea = document.getElementById('localVideoArea');
      if (localVideoArea) {
        if (t.enabled) {
          localVideoArea.classList.add('hidden');
        } else {
          localVideoArea.classList.remove('hidden');
        }
      }
      
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

window.toggleMicrophoneMedia = () => {
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
      
      // Синхронизируем UI
      if (window.uiControls) {
        window.uiControls.updateMicrophoneState(t.enabled);
      }
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

window.endCall = () => {
  try {
    log('[ui] ending call...');
    
    // Останавливаем и сбрасываем таймер
    if (window.uiControls) {
      window.uiControls.stopCallTimer(true);
    }
    
    // Закрываем сессии
    if (mediaSession) {
      mediaSession.close();
    }
    if (signalingSession) {
      signalingSession.close();
    }
    
    // Очищаем UI
    if (vLocal) vLocal.srcObject = null;
    if (vRemote) vRemote.srcObject = null;
    
    // Показываем плейсхолдеры обратно
    const localVideoArea = document.getElementById('localVideoArea');
    const remoteVideoArea = document.getElementById('remoteVideoArea');
    if (localVideoArea) localVideoArea.classList.remove('hidden');
    if (remoteVideoArea) remoteVideoArea.classList.remove('hidden');
    
    // Сбрасываем состояние кнопок
    if (window.uiControls) {
      window.uiControls.updateCameraState(true);
      window.uiControls.updateMicrophoneState(true);
    }
    
    // Пытаемся закрыть вкладку (если возможно)
    try {
      window.close();
    } catch (e) {
      // Если не можем закрыть, перенаправляем на главную
      window.location.href = '/';
    }
  } catch (e) {
    log('[ui] end call ERR', e?.message || e);
  }
};

// Глобальная функция для повторного запроса медиа
window.requestMediaRetry = () => {
  if (mediaSession && mediaSession.pendingMediaRetry) {
    mediaSession.pendingMediaRetry();
  }
};

// Глобальная функция для запуска удаленного видео
window.resumeRemotePlayback = async () => {
  const ok = await resumePlay(vRemote);
  if (ok) {
    window.uiControls?.hideRemotePlaybackPrompt();
    // Скрываем плейсхолдер при успешном запуске
    const remoteVideoArea = document.getElementById('remoteVideoArea');
    if (remoteVideoArea) {
      remoteVideoArea.classList.add('hidden');
    }
  }
};

// Старые обработчики убраны - теперь используется UIControls

// Глобальные обработчики для запуска видео
document.addEventListener('click', () => {
  if (window.resumeRemotePlayback) {
    window.resumeRemotePlayback();
  }
});

document.addEventListener('touchstart', () => {
  if (window.resumeRemotePlayback) {
    window.resumeRemotePlayback();
  }
});

// Auto-join when token already in URL
if (token) {
  join().catch(e => { log('ERR', e?.message || String(e)); });
} else {
  // В рабочем билде токен всегда должен быть в URL
  // Если токена нет, показываем ошибку
  log('ERR: No token provided in URL');
  
  // Скрываем кнопки, так как без токена они не работают
  // Используем setTimeout чтобы дождаться инициализации UI
  setTimeout(() => {
    const controls = document.querySelector('.controls-container');
    if (controls) {
      controls.style.display = 'none';
    }
  }, 100);
}

// Media stats functionality moved to MediaSession class








