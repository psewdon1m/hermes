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
    this.localVideoActive = true;
    this.remoteVideoActive = true;
    this.remoteParticipantPresent = false;
    this.localVideoStream = null;
    this.remoteVideoStream = null;
    this.localVideoDisplayContainer = document.getElementById('localVideoDisplay') || null;
    this.remoteVideoDisplayContainer = document.getElementById('remoteVideoDisplay') || null;
    this.mobileSwapActive = false;
    this.mobileControlsResizeObserver = null;
    this.boundUpdateMobileSmallTileOffset = null;
    this.localVideoFallback = document.querySelector('[data-role="local-video-fallback"]');
    this.remoteVideoFallback = document.querySelector('[data-role="remote-video-fallback"]');
    this.desktopIdleDelay = 6000;
    this.desktopIdleTimer = null;
    this.desktopIdleActive = false;
    this.desktopIdleEnabled = false;
    this.boundDesktopActivityHandler = null;
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
    this.timerStorageKey = null;
    try {
      const currentUrl = new URL(location.href);
      const token = currentUrl.searchParams.get('token') || '';
      if (token) {
        this.skipInitialOverlay = sessionStorage.getItem(`overlayDismissed:${token}`) === '1';
        this.timerStorageKey = `callTimer:${token}`;
        const storedStart = sessionStorage.getItem(this.timerStorageKey);
        const parsedStart = storedStart ? Number(storedStart) : NaN;
        if (!Number.isNaN(parsedStart) && parsedStart > 0) {
          this.callStartTime = parsedStart;
          this.updateTimer();
        }
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
    this.refreshLocalVideoFallback();
    this.refreshRemoteVideoFallback();
    this.refreshOverlayPreview();
    this.updateOverlayScale();
    this.attachOverlayScaleListeners();
    this.initializeMobileVideoSwap();
    this.initializeDesktopIdleMode();
    if (!this.skipInitialOverlay) {
      this.showCallOverlay('prejoin');
    }
  }

  initializeEventListeners() {
    this.setupCopyLinkButtons();
    this.setupFullscreenButtons();
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
    this.toggleMobileVideoSwap(false);
    document.body.classList.add('mobile-landscape');
    this.syncFullscreenButtons();
  }

  collapseMobileView() {
    if (!document?.body) return;
    document.body.classList.remove('mobile-landscape');
    this.mobileExpandedView = null;
    this.orientationForcedView = false;
    this.mobileExpandedManual = false;
    this.toggleMobileVideoSwap(false);
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
    this.updateMobileSmallTileOffset();
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

  initializeMobileVideoSwap() {
    if (!this.isMobileDevice) return;
    if (!document?.body) return;

    const localContainer = this.localVideoDisplayContainer || document.getElementById('localVideoDisplay');
    const remoteContainer = this.remoteVideoDisplayContainer || document.getElementById('remoteVideoDisplay');
    const controlsInner = this.mobileControlsContainer?.querySelector('.mobile-controls__inner') || null;

    if (!localContainer || !remoteContainer) return;

    this.localVideoDisplayContainer = localContainer;
    this.remoteVideoDisplayContainer = remoteContainer;

    if (!localContainer.dataset.swapHandlerAttached) {
      localContainer.dataset.swapHandlerAttached = '1';
      localContainer.addEventListener('click', (event) => this.handleMobileSwapClick(event, 'local'));
    }

    if (!remoteContainer.dataset.swapHandlerAttached) {
      remoteContainer.dataset.swapHandlerAttached = '1';
      remoteContainer.addEventListener('click', (event) => this.handleMobileSwapClick(event, 'remote'));
    }

    this.attachVideoAspectListeners(localContainer, 'local');
    this.attachVideoAspectListeners(remoteContainer, 'remote');
    this.updateVideoAspect('local');
    this.updateVideoAspect('remote');

    if (controlsInner && !controlsInner.dataset.mobileResizeObserved && typeof ResizeObserver === 'function') {
      controlsInner.dataset.mobileResizeObserved = '1';
      this.mobileControlsResizeObserver = new ResizeObserver(() => this.updateMobileSmallTileOffset());
      this.mobileControlsResizeObserver.observe(controlsInner);
    }

    if (!this.boundUpdateMobileSmallTileOffset) {
      this.boundUpdateMobileSmallTileOffset = () => this.updateMobileSmallTileOffset();
      window.addEventListener('resize', this.boundUpdateMobileSmallTileOffset, { passive: true });
    }

    this.updateMobileSmallTileOffset();
  }

  initializeDesktopIdleMode() {
    if (this.isMobileDevice) return;
    if (!document?.body || typeof window === 'undefined') return;
    if (this.desktopIdleEnabled) return;

    this.desktopIdleEnabled = true;
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'pointerdown', 'pointermove', 'touchstart', 'touchmove'];
    this.boundDesktopActivityHandler = () => this.handleDesktopActivity();
    activityEvents.forEach((type) => {
      window.addEventListener(type, this.boundDesktopActivityHandler, { passive: true });
    });
    this.scheduleDesktopIdle();
  }

  handleDesktopActivity() {
    if (!this.desktopIdleEnabled) return;
    this.applyDesktopIdleState(false);
    this.scheduleDesktopIdle();
  }

  scheduleDesktopIdle() {
    if (!this.desktopIdleEnabled) return;
    if (this.overlayVisible) {
      this.clearDesktopIdleTimer();
      return;
    }
    const delay = typeof this.desktopIdleDelay === 'number' ? Math.max(2000, this.desktopIdleDelay) : 6000;
    this.clearDesktopIdleTimer();
    this.desktopIdleTimer = setTimeout(() => {
      this.applyDesktopIdleState(true);
    }, delay);
  }

  clearDesktopIdleTimer() {
    if (this.desktopIdleTimer) {
      clearTimeout(this.desktopIdleTimer);
      this.desktopIdleTimer = null;
    }
  }

  applyDesktopIdleState(nextIdle) {
    if (!document?.body) return;
    const shouldBeIdle = !!nextIdle && !this.overlayVisible && this.desktopIdleEnabled;
    if (this.desktopIdleActive === shouldBeIdle) return;
    this.desktopIdleActive = shouldBeIdle;
    document.body.classList.toggle('desktop-idle', shouldBeIdle);
  }

  handleDesktopIdleOverlayChange(isVisible) {
    if (!this.desktopIdleEnabled) return;
    if (isVisible) {
      this.applyDesktopIdleState(false);
      this.clearDesktopIdleTimer();
    } else {
      this.scheduleDesktopIdle();
    }
  }

  handleMobileSwapClick(event, source) {
    if (!this.isMobileDevice) return;
    if (!document?.body) return;
    if (document.body.classList.contains('mobile-landscape')) return;
    if (event.target.closest('.fullscreen-button') || event.target.closest('.copy-link-button')) {
      return;
    }

    const isSwapActive = this.mobileSwapActive === true;
    const isLocalSource = source === 'local';
    const isSmallTile = (!isSwapActive && isLocalSource) || (isSwapActive && !isLocalSource);
    if (!isSmallTile) return;

    this.toggleMobileVideoSwap();
  }

  toggleMobileVideoSwap(forceState) {
    if (!this.isMobileDevice || !document?.body) return;
    const nextState = typeof forceState === 'boolean' ? forceState : !this.mobileSwapActive;
    this.mobileSwapActive = nextState;
    document.body.classList.toggle('mobile-video-swap-active', nextState);
    this.updateMobileSmallTileOffset();
  }

  attachVideoAspectListeners(container, type) {
    if (!container) return;
    const video = container.querySelector('video');
    if (!video || video.dataset.mobileAspectAttached === '1') return;
    video.dataset.mobileAspectAttached = '1';
    const handler = () => this.updateVideoAspect(type);
    video.addEventListener('loadedmetadata', handler);
    video.addEventListener('resize', handler);
  }

  updateVideoAspect(type, stream = undefined) {
    if (!this.isMobileDevice) return;
    const container = type === 'remote' ? this.remoteVideoDisplayContainer : this.localVideoDisplayContainer;
    if (!container) return;
    this.attachVideoAspectListeners(container, type);

    if (typeof stream !== 'undefined') {
      if (type === 'remote') {
        this.remoteVideoStream = stream instanceof MediaStream ? stream : null;
      } else {
        this.localVideoStream = stream instanceof MediaStream ? stream : null;
      }
    }

    const effectiveStream =
      typeof stream === 'undefined'
        ? (type === 'remote' ? this.remoteVideoStream : this.localVideoStream)
        : (stream instanceof MediaStream ? stream : null);

    const aspectValue = this.resolveStreamAspectRatio(effectiveStream, container);
    if (aspectValue) {
      container.style.setProperty('--mobile-video-aspect', aspectValue);
    } else {
      container.style.removeProperty('--mobile-video-aspect');
    }
  }

  resolveStreamAspectRatio(stream, container) {
    let width = null;
    let height = null;

    if (stream instanceof MediaStream) {
      const [track] = stream.getVideoTracks();
      if (track && typeof track.getSettings === 'function') {
        const settings = track.getSettings();
        if (settings.width && settings.height) {
          width = settings.width;
          height = settings.height;
        } else if (settings.aspectRatio) {
          const aspectSetting = Number(settings.aspectRatio);
          if (!Number.isNaN(aspectSetting) && aspectSetting > 0) {
            return this.formatAspectRatio(aspectSetting);
          }
        }
      }
    }

    const video = container?.querySelector('video');
    if (video) {
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;
      if (!width && vWidth) {
        width = vWidth;
      }
      if (!height && vHeight) {
        height = vHeight;
      }
    }

    if (width && height) {
      return `${Math.max(1, width)} / ${Math.max(1, height)}`;
    }
    return null;
  }

  formatAspectRatio(value) {
    if (!value || !(value > 0)) return null;
    const normalized = Number(value);
    if (Number.isNaN(normalized) || normalized <= 0) return null;
    const precision = Math.pow(10, 4);
    const scaledW = Math.round(normalized * precision);
    const scaledH = precision;
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(scaledW, scaledH);
    const ratioW = Math.max(1, scaledW / divisor);
    const ratioH = Math.max(1, scaledH / divisor);
    return `${ratioW} / ${ratioH}`;
  }

  updateMobileSmallTileOffset() {
    if (!this.isMobileDevice || !document?.body) return;
    const controlsInner = this.mobileControlsContainer?.querySelector('.mobile-controls__inner');
    let offset = 140;
    if (controlsInner) {
      const rect = controlsInner.getBoundingClientRect();
      if ((rect.width || rect.height) && rect.height > 0) {
        const baseSpacing = 20;
        const desiredGap = 20;
        offset = rect.height + baseSpacing + desiredGap;
      }
    }
    document.body.style.setProperty('--mobile-small-tile-offset', `${Math.round(offset)}px`);
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
      this.refreshLocalVideoFallback();
    }
  }

  setRemoteParticipantPresent(isPresent) {
    this.remoteParticipantPresent = !!isPresent;
    const container = document.getElementById('remoteVideoDisplay');
    if (container) {
      container.classList.toggle('participant-present', this.remoteParticipantPresent);
    }
    this.refreshRemoteVideoFallback();
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
    this.handleDesktopIdleOverlayChange(true);
  }

  hideCallOverlay() {
    if (!this.overlay) return;
    this.overlay.classList.remove('call-overlay--visible');
    this.overlayVisible = false;
    this.handleDesktopIdleOverlayChange(false);
  }

  startCallTimer() {
    if (this.timerInterval) return;
    if (!this.callStartTime) {
      if (this.timerStorageKey) {
        const stored = sessionStorage.getItem(this.timerStorageKey);
        const parsed = stored ? Number(stored) : NaN;
        if (!Number.isNaN(parsed) && parsed > 0) {
          this.callStartTime = parsed;
        }
      }
      if (!this.callStartTime) {
        this.callStartTime = Date.now();
      }
    }
    if (this.timerStorageKey) {
      try { sessionStorage.setItem(this.timerStorageKey, String(this.callStartTime)); } catch {}
    }
    this.updateTimer();
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
      if (this.timerStorageKey) {
        try { sessionStorage.removeItem(this.timerStorageKey); } catch {}
      }
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




