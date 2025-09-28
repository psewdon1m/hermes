// UI Controls Module - управление кнопками интерфейса
export class UIControls {
  constructor() {
    this.linkButtonTimeout = null;
    this.callStartTime = null;
    this.timerInterval = null;
    
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Link button - копирование URL
    document.getElementById('linkBtn').addEventListener('click', () => {
      this.handleLinkClick();
    });

    // Cam button - переключение камеры
    document.getElementById('camBtn').addEventListener('click', () => {
      this.handleCamClick();
    });

    // Mic button - переключение микрофона
    document.getElementById('micBtn').addEventListener('click', () => {
      this.handleMicClick();
    });

    // Exit button - выход из звонка
    document.getElementById('exitBtn').addEventListener('click', () => {
      this.handleExitClick();
    });
  }

  handleLinkClick() {
    const button = document.getElementById('linkBtn');
    
    // Очищаем предыдущий таймер если он есть
    if (this.linkButtonTimeout) {
      clearTimeout(this.linkButtonTimeout);
    }
    
    // Копируем текущий URL
    this.copyCurrentURL();
    
    // Меняем текст на "copied" с новыми цветами
    button.textContent = 'copied';
    button.classList.add('copied');
    
    // Возвращаем к нормальному состоянию через 1.5 секунды
    this.linkButtonTimeout = setTimeout(() => {
      button.textContent = 'link';
      button.classList.remove('copied');
      this.linkButtonTimeout = null;
    }, 1500);
  }

  copyCurrentURL() {
    try {
      navigator.clipboard.writeText(window.location.href);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  }

  handleCamClick() {
    // Сначала получаем результат переключения
    let isEnabled = false;
    if (window.toggleCameraMedia) {
      isEnabled = window.toggleCameraMedia();
    }
    
    // Синхронизируем UI с фактическим результатом
    this.updateCameraState(isEnabled);
  }

  handleMicClick() {
    // Сначала получаем результат переключения
    let isEnabled = false;
    if (window.toggleMicrophoneMedia) {
      isEnabled = window.toggleMicrophoneMedia();
    }
    
    // Синхронизируем UI с фактическим результатом
    this.updateMicrophoneState(isEnabled);
  }

  handleExitClick() {
    // Уведомляем внешний код о выходе
    if (window.endCall) {
      window.endCall();
    }
  }

  // Методы для синхронизации с внешним состоянием
  updateCameraState(isEnabled) {
    const button = document.getElementById('camBtn');
    if (isEnabled) {
      button.classList.remove('disabled');
    } else {
      button.classList.add('disabled');
    }
  }

  updateMicrophoneState(isEnabled) {
    const button = document.getElementById('micBtn');
    if (isEnabled) {
      button.classList.remove('disabled');
    } else {
      button.classList.add('disabled');
    }
  }

  // Таймер звонка
  startCallTimer() {
    // Если таймер уже запущен, не перезапускаем
    if (this.timerInterval) {
      return;
    }
    
    // Если callStartTime уже есть, переиспользуем его (возобновление)
    if (!this.callStartTime) {
      this.callStartTime = Date.now();
    }
    
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
  }

  stopCallTimer(reset = false) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    // Сбрасываем время только при полном завершении
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
    
    const timerElement = document.getElementById('callTimer');
    if (timerElement) {
      timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  resetTimer() {
    const timerElement = document.getElementById('callTimer');
    if (timerElement) {
      timerElement.textContent = '00:00';
    }
  }

  // UI для разрешений медиа
  showPermissionPrompt() {
    // Создаем промпт если его нет
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
        color: #D9D9D9;
        padding: 30px;
        border-radius: 12px;
        border: 2px solid #D9D9D9;
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
          background: #D9D9D9;
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
      
      // Обработчик кнопки
      document.getElementById('permissionRetryBtn').addEventListener('click', () => {
        this.hidePermissionPrompt();
        if (window.requestMediaRetry) {
          window.requestMediaRetry();
        }
      });
    }
    
    prompt.style.display = 'block';
  }

  hidePermissionPrompt() {
    const prompt = document.getElementById('permissionPrompt');
    if (prompt) {
      prompt.style.display = 'none';
    }
  }

  // UI для запуска удаленного видео
  showRemotePlaybackPrompt() {
    const overlay = document.getElementById('remotePlaybackPrompt');
    if (overlay) {
      overlay.classList.add('is-visible');
      
      // Добавляем обработчик клика
      overlay.onclick = () => {
        if (window.resumeRemotePlayback) {
          window.resumeRemotePlayback();
        }
      };
    }
  }

  hideRemotePlaybackPrompt() {
    const overlay = document.getElementById('remotePlaybackPrompt');
    if (overlay) {
      overlay.classList.remove('is-visible');
      overlay.onclick = null; // Убираем обработчик
    }
  }
}
