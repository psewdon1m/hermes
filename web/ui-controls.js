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
    // Защита от повторного запуска
    if (this.timerInterval) {
      return; // Таймер уже запущен
    }
    
    this.callStartTime = Date.now();
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
  }

  stopCallTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.resetTimer();
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
}
