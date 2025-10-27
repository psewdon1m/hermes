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

    this.initializeEventListeners();
    this.updateCameraState(this.cameraEnabled);
    this.updateMicrophoneState(this.microphoneEnabled);
    this.updateSpeakerState(this.speakerEnabled);
    this.updateScreenState(this.screenSharing);
  }

  initializeEventListeners() {
    this.setupCopyLinkButtons();
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

  attachControlButton(id, handler) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', handler);
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

  handleExitClick() {
    if (window.endCall) {
      window.endCall();
    }
  }

  updateCameraState(isEnabled) {
    this.cameraEnabled = !!isEnabled;
    const button = document.getElementById('camBtn');
    if (!button) return;
    button.classList.remove('disabled', 'active', 'inactive');
    button.classList.add(this.cameraEnabled ? 'active' : 'inactive');
  }

  updateMicrophoneState(isEnabled) {
    this.microphoneEnabled = !!isEnabled;
    const button = document.getElementById('micBtn');
    if (!button) return;
    button.classList.remove('disabled', 'active', 'inactive');
    button.classList.add(this.microphoneEnabled ? 'active' : 'inactive');
  }

  updateSpeakerState(isEnabled) {
    this.speakerEnabled = !!isEnabled;
    const button = document.getElementById('spkBtn');
    if (!button) return;
    button.classList.remove('disabled', 'active', 'inactive');
    button.classList.add(this.speakerEnabled ? 'active' : 'inactive');
  }

  updateScreenState(isSharing) {
    this.screenSharing = !!isSharing;
    const button = document.getElementById('screenBtn');
    if (button) {
      button.classList.remove('disabled', 'active', 'inactive');
      button.classList.add(this.screenSharing ? 'active' : 'inactive');
    }
    const localDisplay = document.getElementById('localVideoDisplay');
    if (localDisplay) {
      localDisplay.classList.toggle('has-screen-share', this.screenSharing);
      if (this.screenSharing) {
        localDisplay.classList.add('has-media');
      } else if (!this.cameraEnabled) {
        localDisplay.classList.remove('has-media');
      }
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
