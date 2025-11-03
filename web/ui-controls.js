import { applyClientProfileToDOM } from './device-info.js';

const CONTROL_ICONS = {
  camera: {
    active: 'src/camera.svg',
    inactive: 'src/no_camera.svg',
  },
  microphone: {
    active: 'src/microphone.svg',
    inactive: 'src/no_microphone.svg',
  },
  speaker: {
    active: 'src/speaker.svg',
    inactive: 'src/no_speaker.svg',
  },
  screen: {
    active: 'src/screen-cast.svg',
    inactive: 'src/no_screen-cast.svg',
  },
};

// Lightweight UI controller for call controls and overlays.
export class UIControls {
  constructor() {
    this.linkButtonTimeouts = new Map();
    this.callStartTime = null;
    this.timerInterval = null;
    this.cameraEnabled = true;
    this.microphoneEnabled = true;
    this.speakerEnabled = true;
    this.screenSharing = false;
    this.remoteMicrophoneEnabled = true;
    this.remoteMicNudgeHandler = null;
    this.localMicIndicator = null;
    this.remoteMicIndicator = null;
    this.micButton = null;
    this.localVideoFallback = null;
    this.remoteVideoFallback = null;
    this.localVideoActive = true;
    this.remoteVideoActive = true;
    this.remoteParticipantPresent = false;
    this.overlayVisible = false;
    this.overlayMode = 'prejoin';
    this.overlay = document.querySelector('[data-role="call-overlay"]');
    this.overlayPreview = this.overlay?.querySelector('[data-role="overlay-preview"]') || null;
    this.overlayFallback = this.overlay?.querySelector('[data-role="overlay-preview-fallback"]') || null;
    this.overlayCamButton = this.overlay?.querySelector('[data-role="overlay-cam"]') || null;
    this.overlayMicButton = this.overlay?.querySelector('[data-role="overlay-mic"]') || null;
    this.overlayExitButton = this.overlay?.querySelector('[data-role="overlay-exit"]') || null;
    this.overlayPreviewContainer = this.overlay?.querySelector('[data-role="overlay-preview-container"]') || null;
    this.overlayPreviewStream = null;
    this.overlayEnterButton = this.overlay?.querySelector('[data-role="overlay-enter"]') || null;
    this.overlayPanel = this.overlay?.querySelector('.call-overlay__panel') || null;
    this.mobileControlsContainer = null;
    this.mobileCamControl = null;
    this.mobileTurnControl = null;
    this.mobileMicControl = null;
    this.mobileExitControl = null;
    this.mobileExpandedView = null;
    this.orientationForcedView = false;
    this.mobileExpandedManual = false;
    this.orientationChangeHandler = null;
    this.resizeOrientationHandler = null;
    this.deviceProfile = applyClientProfileToDOM();
    this.isMobileDevice = !!this.deviceProfile?.isMobile;
    if (this.isMobileDevice && document.body) {
      document.body.classList.add('mobile-ui');
    }

    this.skipInitialOverlay = false;
    try {
      const currentUrl = new URL(location.href);
      const token = currentUrl.searchParams.get('token') || '';
      if (token) {
        this.skipInitialOverlay = sessionStorage.getItem(`overlayDismissed:${token}`) === '1';
      }
    } catch {}
    if (this.skipInitialOverlay && this.overlay) {
      this.overlay.classList.remove('call-overlay--visible');
      this.overlayVisible = false;
    }

    this.initializeEventListeners();
    this.applyDeviceAdjustments();
    this.updateCameraState(this.cameraEnabled);
    this.updateMicrophoneState(this.microphoneEnabled);
    this.updateSpeakerState(this.speakerEnabled);
    this.updateScreenState(this.screenSharing);
    this.refreshLocalMicIndicator();
    this.refreshRemoteMicIndicator();
    this.refreshLocalVideoFallback();
    this.refreshRemoteVideoFallback();
    this.refreshOverlayPreview();
    this.updateOverlayScale();
    this.attachOverlayScaleListeners();
    if (!this.skipInitialOverlay) {
      this.showCallOverlay('prejoin');
    }
  }

  initializeEventListeners() {
    this.setupCopyLinkButtons();
    this.setupFullscreenButtons();
    this.setupMicIndicators();
    this.setupOverlayControls();
    this.attachControlButton('camBtn', () => this.handleCamClick());
    this.attachControlButton('micBtn', () => this.handleMicClick());
    this.attachControlButton('spkBtn', () => this.handleSpeakerClick());
    this.attachControlButton('screenBtn', () => this.handleScreenClick());
    this.attachControlButton('exitBtn', () => this.handleExitClick());
  }

  setupCopyLinkButtons() {
    const buttons = Array.from(document.querySelectorAll('.copy-link-button'));
    if (!buttons.length) return;

    this.copyLinkButtons = buttons;
    buttons.forEach((button) => {
      const label = button.querySelector('.placeholder-text');
      const defaultText = (label ? label.textContent : button.textContent) ?? '';
      if (!button.dataset.defaultText) {
        button.dataset.defaultText = defaultText.trim() || 'press to copy call link';
      }
      button.addEventListener('click', () => this.handleLinkClick(button));
    });
  }

  setupFullscreenButtons() {
    const placeholders = Array.from(document.querySelectorAll('.video-placeholder'));
    placeholders.forEach((container) => {
      const button = container.querySelector('.fullscreen-button');
      if (!button) return;
      if (!button.dataset.fullLabel) {
        button.dataset.fullLabel = button.textContent.trim() || 'full';
      }
      if (!button.dataset.exitLabel) {
        button.dataset.exitLabel = 'exit';
      }
      if (!button.dataset.mobileFullLabel) {
        button.dataset.mobileFullLabel = button.dataset.fullLabel || 'full';
      }
      if (!button.dataset.mobileExitLabel) {
        button.dataset.mobileExitLabel = 'back';
      }
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.toggleFullscreen(container);
      });
    });

    document.addEventListener('fullscreenchange', () => {
      this.syncFullscreenButtons();
    });
    this.syncFullscreenButtons();
  }

  setupMicIndicators() {
    this.localMicIndicator = document.querySelector('[data-role="local-mic-indicator"]');
    this.remoteMicIndicator = document.querySelector('[data-role="remote-mic-indicator"]');
    this.micButton = document.getElementById('micBtn');
    this.localVideoFallback = document.querySelector('[data-role="local-video-fallback"]');
    this.remoteVideoFallback = document.querySelector('[data-role="remote-video-fallback"]');

    if (this.localMicIndicator) {
      this.localMicIndicator.disabled = true;
    }

    if (this.remoteMicIndicator) {
      this.remoteMicIndicator.addEventListener('click', (event) => {
        if (!this.remoteMicIndicator.classList.contains('visible')) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.remoteMicIndicator.disabled) return;
        this.triggerRemoteMicIndicatorFeedback();
        try {
          if (typeof this.remoteMicNudgeHandler === 'function') {
            this.remoteMicNudgeHandler();
          }
        } catch (err) {
          console.error('[ui] remote mic nudge handler failed', err);
        }
      });
    }

    if (this.micButton) {
      this.micButton.addEventListener('animationend', (event) => {
        if (event.animationName === 'micButtonNudge') {
          this.micButton.classList.remove('mic-nudge');
        }
      });
    }

    this.refreshLocalVideoFallback();
    this.refreshRemoteVideoFallback();
  }

  setupOverlayControls() {
    if (!this.overlay) return;
    if (this.overlayCamButton) {
      this.overlayCamButton.addEventListener('click', () => this.handleCamClick());
    }
    if (this.overlayMicButton) {
      this.overlayMicButton.addEventListener('click', () => this.handleMicClick());
    }
    if (this.overlayExitButton) {
      this.overlayExitButton.addEventListener('click', () => this.handleExitClick());
    }
    if (this.overlayEnterButton) {
      this.overlayEnterButton.addEventListener('click', () => {
        this.hideCallOverlay();
        if (typeof window.handleOverlayEnter === 'function') {
          try {
            window.handleOverlayEnter();
          } catch (err) {
            console.error('[ui] overlay enter handler failed', err);
          }
        }
      });
    }
  }

  attachOverlayScaleListeners() {
    if (typeof window === 'undefined' || !this.overlayPanel) return;
    const viewport = window.visualViewport;
    this.overlayScaleHandler = () => this.updateOverlayScale();
    window.addEventListener('resize', this.overlayScaleHandler, { passive: true });
    if (viewport) {
      viewport.addEventListener('resize', this.overlayScaleHandler, { passive: true });
    }
  }

  updateOverlayScale() {
    if (!this.overlayPanel) return;
    let scaleBase = 1;
    if (window.visualViewport?.scale) {
      scaleBase = window.visualViewport.scale;
    } else if (window.devicePixelRatio) {
      scaleBase = window.devicePixelRatio;
    }
    const scale = scaleBase ? 1 / scaleBase : 1;
    const clampedScale = Math.min(Math.max(scale, 0.6), 2);
    this.overlayPanel.style.transform = `scale(${clampedScale})`;
  }

  async toggleFullscreen(container) {
    if (this.isMobileDevice) {
      return;
    }
    try {
      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        }
        return;
      }

      if (document.fullscreenElement === container) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } else {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          }
        } finally {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  }

  syncFullscreenButtons() {
    if (this.isMobileDevice) return;
    const placeholders = document.querySelectorAll('.video-placeholder');
    const activeEl = document.fullscreenElement;
    placeholders.forEach((container) => {
      const button = container.querySelector('.fullscreen-button');
      if (!button) return;
      const isActiveDesktop = activeEl === container;
      container.classList.toggle('fullscreen-active', isActiveDesktop);
      button.textContent = isActiveDesktop ? (button.dataset.exitLabel || 'exit') : (button.dataset.fullLabel || 'full');
      button.setAttribute('aria-label', isActiveDesktop ? 'exit fullscreen' : 'enter fullscreen');
    });
  }

  toggleMobileFullscreen(container) {
    return;
  }

  expandMobileView(target, options = {}) {
    if (!document?.body) return;
    if (target) {
      this.mobileExpandedView = target;
    }
    this.orientationForcedView = !!options.forced;
    this.mobileExpandedManual = !options.forced;
    document.body.classList.add('mobile-landscape');
    this.syncFullscreenButtons();
  }

  collapseMobileView() {
    if (!document?.body) return;
    document.body.classList.remove('mobile-landscape');
    this.mobileExpandedView = null;
    this.orientationForcedView = false;
    this.mobileExpandedManual = false;
    this.syncFullscreenButtons();
  }


  updateMobileTurnButton(facing) {
    if (!this.mobileTurnControl) return;
    const normalized = (facing || '').toLowerCase();
    const isFront = normalized !== 'environment';
    this.mobileTurnControl.dataset.facing = normalized || '';
    this.mobileTurnControl.classList.remove('front-camera', 'rear-camera');
    this.mobileTurnControl.classList.add(isFront ? 'front-camera' : 'rear-camera');
  }

  setupOrientationListeners() {
    if (!this.isMobileDevice || typeof window === 'undefined') return;
    this.orientationChangeHandler = () => this.handleOrientationChange();
    this.resizeOrientationHandler = () => this.handleOrientationChange();
    window.addEventListener('orientationchange', this.orientationChangeHandler, { passive: true });
    window.addEventListener('resize', this.resizeOrientationHandler, { passive: true });
    this.handleOrientationChange();
  }

  handleOrientationChange() {
    if (!this.isMobileDevice) return;
    const isLandscape = this.isLandscapeOrientation();
    if (isLandscape) {
      this.expandMobileView('remote', { forced: true });
    } else {
      this.collapseMobileView();
    }
    this.syncFullscreenButtons();
  }

  isLandscapeOrientation() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(orientation: landscape)');
      if (typeof mediaQuery.matches === 'boolean') {
        return mediaQuery.matches;
      }
    }
    return window.innerWidth > window.innerHeight;
  }

  attachControlButton(id, handler) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', handler);
  }

  updateControlButtonIcon(button, control, isActive) {
    if (!button) return;
    const icon = button.querySelector('.button-icon');
    const iconSet = CONTROL_ICONS[control];
    if (!icon || !iconSet) return;
    const nextSrc = isActive ? iconSet.active : iconSet.inactive;
    if (icon.getAttribute('src') !== nextSrc) {
      icon.setAttribute('src', nextSrc);
    }
  }

  applyDeviceAdjustments() {
    if (!this.isMobileDevice) return;
    const screenBtn = document.getElementById('screenBtn');
    if (screenBtn) {
      screenBtn.disabled = true;
      screenBtn.setAttribute('aria-hidden', 'true');
      screenBtn.setAttribute('tabindex', '-1');
    }
    const speakerBtn = document.getElementById('spkBtn');
    if (speakerBtn) {
      speakerBtn.disabled = true;
      speakerBtn.setAttribute('aria-hidden', 'true');
      speakerBtn.setAttribute('tabindex', '-1');
    }
    this.setupMobileControls();
    this.setupOrientationListeners();
    this.syncFullscreenButtons();
  }

  setupMobileControls() {
    this.mobileControlsContainer = document.querySelector('[data-role="mobile-controls"]');
    if (!this.mobileControlsContainer) return;
    this.mobileControlsContainer.removeAttribute('aria-hidden');

    this.mobileCamControl = this.mobileControlsContainer.querySelector('[data-role="mobile-cam"]');
    this.mobileTurnControl = this.mobileControlsContainer.querySelector('[data-role="mobile-turn"]');
    this.mobileMicControl = this.mobileControlsContainer.querySelector('[data-role="mobile-mic"]');
    this.mobileExitControl = this.mobileControlsContainer.querySelector('[data-role="mobile-exit"]');

    if (this.mobileCamControl) {
      this.mobileCamControl.addEventListener('click', () => this.handleCamClick());
    }
    if (this.mobileMicControl) {
      this.mobileMicControl.addEventListener('click', () => this.handleMicClick());
    }
    if (this.mobileExitControl) {
      this.mobileExitControl.addEventListener('click', () => this.handleExitClick());
    }
    if (this.mobileTurnControl) {
      this.mobileTurnControl.addEventListener('click', () => this.handleTurnClick());
    }

    [
      this.mobileCamControl,
      this.mobileTurnControl,
      this.mobileMicControl,
      this.mobileExitControl
    ].forEach((button) => this.attachMobileTapFeedback(button));

    if (!navigator?.mediaDevices?.getUserMedia && this.mobileTurnControl) {
      this.mobileTurnControl.disabled = true;
      this.mobileTurnControl.classList.add('disabled');
    }
    this.updateMobileTurnButton('user');
  }

  attachMobileTapFeedback(button) {
    if (!button || button.dataset.tapFeedbackAttached === '1') return;
    button.dataset.tapFeedbackAttached = '1';
    let releaseTimer = null;

    const cancelScheduledRelease = () => {
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    };

    const press = () => {
      cancelScheduledRelease();
      button.classList.add('is-pressed');
    };

    const scheduleRelease = () => {
      cancelScheduledRelease();
      if (!button.classList.contains('is-pressed')) return;
      releaseTimer = setTimeout(() => {
        button.classList.remove('is-pressed');
        releaseTimer = null;
      }, 120);
    };

    button.addEventListener('pointerdown', (event) => {
      if (typeof event.button === 'number' && event.button !== 0) return;
      press();
    });
    button.addEventListener('pointerup', scheduleRelease);
    button.addEventListener('pointercancel', scheduleRelease);
    button.addEventListener('pointerleave', scheduleRelease);
    button.addEventListener('blur', scheduleRelease);
    button.addEventListener('click', scheduleRelease);
    button.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        press();
      }
    });
    button.addEventListener('keyup', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        scheduleRelease();
      }
    });
  }

  async handleLinkClick(button) {
    const targetButton = button || this.copyLinkButtons?.[0];
    if (!targetButton) return;

    const previousTimeout = this.linkButtonTimeouts.get(targetButton);
    if (previousTimeout) {
      clearTimeout(previousTimeout);
    }

    const copied = await this.copyCurrentURL();
    this.updateCopyState(targetButton, copied ? 'copied' : 'copy failed', copied);
  }

  async copyCurrentURL() {
    const url = window.location.href;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch (err) {
        console.error('Failed to copy URL via clipboard API:', err);
      }
    }

    const area = document.createElement('textarea');
    area.value = url;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (err) {
      console.error('Failed to copy URL via execCommand:', err);
    }
    document.body.removeChild(area);
    return copied;
  }

  updateCopyState(button, message, isSuccess) {
    const label = button.querySelector('.placeholder-text');
    const defaultText = button.dataset.defaultText || 'press to copy call link';

    if (label) {
      label.textContent = message;
    } else {
      button.textContent = message;
    }

    button.classList.add(isSuccess ? 'copied' : 'copy-error');

    const timeoutId = setTimeout(() => {
      if (label) {
        label.textContent = defaultText;
      } else {
        button.textContent = defaultText;
      }
      button.classList.remove('copied', 'copy-error');
      this.linkButtonTimeouts.delete(button);
    }, isSuccess ? 1500 : 2000);

    this.linkButtonTimeouts.set(button, timeoutId);
  }

  async handleCamClick() {
    let nextState = !this.cameraEnabled;
    if (window.toggleCameraMedia) {
      try {
        const result = await window.toggleCameraMedia();
        if (typeof result === 'boolean') {
          nextState = result;
        }
      } catch (err) {
        console.error('[ui] camera toggle failed', err);
      }
    }
    this.updateCameraState(nextState);
  }

  async handleMicClick() {
    let nextState = !this.microphoneEnabled;
    if (window.toggleMicrophoneMedia) {
      try {
        const result = await window.toggleMicrophoneMedia();
        if (typeof result === 'boolean') {
          nextState = result;
        }
      } catch (err) {
        console.error('[ui] microphone toggle failed', err);
      }
    }
    this.updateMicrophoneState(nextState);
  }

  async handleSpeakerClick() {
    let nextState = !this.speakerEnabled;
    if (window.toggleSpeakerOutput) {
      try {
        const result = await window.toggleSpeakerOutput();
        if (typeof result === 'boolean') {
          nextState = result;
        }
      } catch (err) {
        console.error('[ui] speaker toggle failed', err);
      }
    }
    this.updateSpeakerState(nextState);
  }

  async handleScreenClick() {
    let nextState = !this.screenSharing;
    if (window.toggleScreenShare) {
      try {
        const result = await window.toggleScreenShare();
        if (typeof result === 'boolean') {
          nextState = result;
        }
      } catch (err) {
        console.error('[ui] screen share toggle failed', err);
      }
    }
    this.updateScreenState(nextState);
  }

  async handleTurnClick() {
    if (typeof window.toggleCameraFacingMode !== 'function') return;
    if (this.mobileTurnControl) {
      if (this.mobileTurnControl.dataset.busy === '1') return;
      this.mobileTurnControl.dataset.busy = '1';
    }
    try {
      const facing = await window.toggleCameraFacingMode();
      if (facing) {
        this.updateMobileTurnButton(facing);
      }
    } catch (err) {
      console.error('[ui] camera facing toggle failed', err);
    } finally {
      if (this.mobileTurnControl) {
        delete this.mobileTurnControl.dataset.busy;
      }
    }
  }

  handleExitClick() {
    if (window.endCall) {
      window.endCall();
    }
  }

  updateCameraState(isEnabled) {
    this.cameraEnabled = !!isEnabled;
    const mainButton = document.getElementById('camBtn');
    if (mainButton) {
      mainButton.classList.remove('disabled', 'active', 'inactive');
      mainButton.classList.add(this.cameraEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(mainButton, 'camera', this.cameraEnabled);
    }
    if (this.overlayCamButton) {
      this.overlayCamButton.classList.remove('disabled', 'active', 'inactive');
      this.overlayCamButton.classList.add(this.cameraEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(this.overlayCamButton, 'camera', this.cameraEnabled);
    }
    if (this.mobileCamControl) {
      this.mobileCamControl.classList.remove('disabled', 'active', 'inactive');
      this.mobileCamControl.classList.add(this.cameraEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(this.mobileCamControl, 'camera', this.cameraEnabled);
    }
    this.refreshLocalMicIndicator();
    this.refreshOverlayPreview();
  }

  updateMicrophoneState(isEnabled) {
    this.microphoneEnabled = !!isEnabled;
    const mainButton = document.getElementById('micBtn');
    if (mainButton) {
      mainButton.classList.remove('disabled', 'active', 'inactive');
      mainButton.classList.add(this.microphoneEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(mainButton, 'microphone', this.microphoneEnabled);
    }
    if (this.overlayMicButton) {
      this.overlayMicButton.classList.remove('disabled', 'active', 'inactive');
      this.overlayMicButton.classList.add(this.microphoneEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(this.overlayMicButton, 'microphone', this.microphoneEnabled);
    }
    if (this.mobileMicControl) {
      this.mobileMicControl.classList.remove('disabled', 'active', 'inactive');
      this.mobileMicControl.classList.add(this.microphoneEnabled ? 'active' : 'inactive');
      this.updateControlButtonIcon(this.mobileMicControl, 'microphone', this.microphoneEnabled);
    }
    this.refreshLocalMicIndicator();
  }

  updateSpeakerState(isEnabled) {
    this.speakerEnabled = !!isEnabled;
    const button = document.getElementById('spkBtn');
    if (!button) return;
    button.classList.remove('disabled', 'active', 'inactive');
    button.classList.add(this.speakerEnabled ? 'active' : 'inactive');
    this.updateControlButtonIcon(button, 'speaker', this.speakerEnabled);
  }

  updateScreenState(isSharing) {
    this.screenSharing = !!isSharing;
    const button = document.getElementById('screenBtn');
    if (button) {
      button.classList.remove('disabled', 'active', 'inactive');
      button.classList.add(this.screenSharing ? 'active' : 'inactive');
      this.updateControlButtonIcon(button, 'screen', this.screenSharing);
    }
    const localDisplay = document.getElementById('localVideoDisplay');
    if (localDisplay) {
      localDisplay.classList.toggle('has-screen-share', this.screenSharing);
      if (this.screenSharing) {
        localDisplay.classList.add('has-media');
      } else if (!this.cameraEnabled) {
        localDisplay.classList.remove('has-media');
      }
      this.refreshLocalMicIndicator();
      this.refreshLocalVideoFallback();
    }
  }

  refreshLocalMicIndicator() {
    const container = document.getElementById('localVideoDisplay');
    this.applyMicIndicator(container, !this.microphoneEnabled);
  }

  refreshRemoteMicIndicator() {
    const container = document.getElementById('remoteVideoDisplay');
    this.applyMicIndicator(container, !this.remoteMicrophoneEnabled);
  }

  setRemoteParticipantPresent(isPresent) {
    this.remoteParticipantPresent = !!isPresent;
    const container = document.getElementById('remoteVideoDisplay');
    if (container) {
      container.classList.toggle('participant-present', this.remoteParticipantPresent);
    }
    this.refreshRemoteVideoFallback();
  }

  setRemoteMicrophoneState(isEnabled) {
    this.remoteMicrophoneEnabled = !!isEnabled;
    this.refreshRemoteMicIndicator();
  }

  onRemoteMicNudge(handler) {
    this.remoteMicNudgeHandler = typeof handler === 'function' ? handler : null;
  }

  flashMicrophoneButton(times = 3) {
    const button = this.micButton || document.getElementById('micBtn');
    if (!button) return;
    const iterations = Math.max(1, Number(times) || 1);
    button.style.setProperty('--mic-nudge-iterations', iterations);
    button.classList.remove('mic-nudge');
    // force reflow to restart animation
    void button.offsetWidth;
    button.classList.add('mic-nudge');
  }

  triggerRemoteMicIndicatorFeedback() {
    if (!this.remoteMicIndicator) return;
    this.remoteMicIndicator.classList.add('feedback');
    setTimeout(() => {
      if (this.remoteMicIndicator) {
        this.remoteMicIndicator.classList.remove('feedback');
      }
    }, 600);
  }

  setLocalVideoActive(isVideoActive) {
    this.localVideoActive = !!isVideoActive;
    this.refreshLocalVideoFallback();
    this.refreshOverlayPreview();
  }

  setRemoteVideoActive(isVideoActive) {
    this.remoteVideoActive = !!isVideoActive;
    this.refreshRemoteVideoFallback();
  }

  refreshLocalVideoFallback() {
    const container = document.getElementById('localVideoDisplay');
    if (!container || !this.localVideoFallback) return;
    const hasMedia = container.classList.contains('has-media');
    const shouldShow = hasMedia && !this.localVideoActive;
    container.classList.toggle('video-inactive', !!shouldShow);
    this.localVideoFallback.classList.toggle('visible', !!shouldShow);
    this.localVideoFallback.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  refreshRemoteVideoFallback() {
    const container = document.getElementById('remoteVideoDisplay');
    if (!container || !this.remoteVideoFallback) return;
    const hasMedia = container.classList.contains('has-media');
    const effectivePresence = hasMedia || this.remoteParticipantPresent;
    const shouldShow = effectivePresence && !this.remoteVideoActive;
    container.classList.toggle('video-inactive', !!shouldShow);
    this.remoteVideoFallback.classList.toggle('visible', !!shouldShow);
    this.remoteVideoFallback.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  setOverlayPreviewStream(stream, isCameraStream = true, shouldMirror = true) {
    if (!this.overlayPreview) return;
    if (!isCameraStream && stream) {
      return;
    }
    const targetStream = isCameraStream ? stream : null;
    if (this.overlayPreview.srcObject !== targetStream) {
      this.overlayPreview.srcObject = targetStream || null;
      if (targetStream && typeof this.overlayPreview.play === 'function') {
        try {
          const playResult = this.overlayPreview.play();
          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(() => {});
          }
        } catch {}
      }
    }
    if (isCameraStream && targetStream && shouldMirror) {
      this.overlayPreview.dataset.mirror = '1';
    } else if (this.overlayPreview.dataset?.mirror) {
      delete this.overlayPreview.dataset.mirror;
    }
    this.overlayPreviewStream = targetStream || null;
    this.refreshOverlayPreview();
  }

  refreshOverlayPreview() {
    if (!this.overlayFallback) return;
    const hasStream = !!(this.overlayPreview && this.overlayPreview.srcObject);
    const shouldShowFallback = !hasStream || !this.localVideoActive;
    this.overlayFallback.classList.toggle('visible', shouldShowFallback);
  }

  showCallOverlay(mode = 'prejoin') {
    if (!this.overlay) return;
    this.overlayMode = mode;
    this.overlay.dataset.mode = mode;
    this.overlay.classList.add('call-overlay--visible');
    this.overlayVisible = true;
    this.updateOverlayScale();
  }

  hideCallOverlay() {
    if (!this.overlay) return;
    this.overlay.classList.remove('call-overlay--visible');
    this.overlayVisible = false;
  }

  applyMicIndicator(container, shouldShowMuted) {
    if (!container) return;
    const indicator = container.querySelector('.mic-indicator');
    if (!indicator) return;
    const hasMedia = container.classList.contains('has-media');
    const role = indicator.dataset.role || '';
    const remotePresence =
      role === 'remote-mic-indicator' &&
      (hasMedia || container.classList.contains('participant-present') || container.classList.contains('video-inactive'));
    const isVisible = !!shouldShowMuted && (role === 'remote-mic-indicator' ? remotePresence : hasMedia);
    indicator.classList.toggle('visible', isVisible);
    if (role === 'local-mic-indicator') {
      indicator.disabled = true;
      indicator.setAttribute('aria-label', isVisible ? 'Microphone muted' : 'Microphone active');
      indicator.title = isVisible ? 'Microphone is muted' : '';
    } else if (role === 'remote-mic-indicator') {
      indicator.disabled = !isVisible;
      indicator.setAttribute('aria-label', isVisible ? 'Remote microphone muted - request unmute' : 'Remote microphone active');
      indicator.title = isVisible ? 'Ask participant to enable microphone' : '';
      indicator.classList.remove('feedback');
    } else {
      indicator.disabled = !isVisible;
      indicator.title = '';
    }
    indicator.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (role === 'local-mic-indicator') {
      this.refreshLocalVideoFallback();
    } else if (role === 'remote-mic-indicator') {
      this.refreshRemoteVideoFallback();
    }
  }

  startCallTimer() {
    if (this.timerInterval) return;
    if (!this.callStartTime) {
      this.callStartTime = Date.now();
    }
    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  stopCallTimer(reset = false) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (reset) {
      this.callStartTime = null;
      this.resetTimer();
    }
  }

  updateTimer() {
    if (!this.callStartTime) return;
    const elapsed = Date.now() - this.callStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timerElement = document.getElementById('callTimer');
    if (timerElement) {
      timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  resetTimer() {
    const timerElement = document.getElementById('callTimer');
    if (timerElement) {
      timerElement.textContent = '00:00:00';
    }
  }

  showPermissionPrompt() {
    let prompt = document.getElementById('permissionPrompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = 'permissionPrompt';
      prompt.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #262626;
        color: #d9d9d9;
        padding: 30px;
        border-radius: 12px;
        border: 2px solid #d9d9d9;
        z-index: 1000;
        text-align: center;
        font-family: 'Alfa Slab One', cursive;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      `;
      prompt.innerHTML = `
        <h3 style="margin: 0 0 20px 0; font-size: 24px;">Разрешить доступ</h3>
        <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.4;">
          Для участия в звонке необходимо разрешить доступ к камере и микрофону.
        </p>
        <button id="permissionRetryBtn" style="
          background: #d9d9d9;
          color: #262626;
          border: none;
          border-radius: 24px;
          padding: 12px 24px;
          font-family: 'Alfa Slab One', cursive;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">Разрешить доступ</button>
      `;
      document.body.appendChild(prompt);
      const retryBtn = document.getElementById('permissionRetryBtn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.hidePermissionPrompt();
          if (window.requestMediaRetry) {
            window.requestMediaRetry();
          }
        });
      }
    }
    prompt.style.display = 'block';
  }

  hidePermissionPrompt() {
    const prompt = document.getElementById('permissionPrompt');
    if (prompt) {
      prompt.style.display = 'none';
    }
  }
}




