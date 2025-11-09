const TRANSLATIONS = {
  en: {
    'shared.ogLocale': 'en_US',
    'landing.metaTitle': 'Hermes - P2P videocall platform',
    'landing.metaDescription': 'Secure peer-to-peer video calls that stay private and easy to share.',
    'landing.heroBadge': 'hermes call',
    'landing.heroTitle': 'Hi! This is Hermes.<br /><br />Secure video calls made simple.',
    'landing.heroLead': 'Spin up a self-hosted WebRTC room in seconds. Share a link, join instantly, and keep every conversation private.',
    'landing.ctaLabel': 'Telegram ID (optional)',
    'landing.ctaPlaceholder': '@username or numeric ID',
    'landing.ctaButton': 'START CALL',
    'landing.ctaHint': 'Leave the field empty to generate a guest identifier. Codes expire after 15 minutes, links stay valid for 24-hours.',
    'landing.aboutTitle': 'About',
    'landing.aboutBody1': 'Hermes is a lightweight, self-hosted platform for real-time peer-to-peer video calls. It brings the signalling server, TURN/STUN infrastructure, and WebRTC client into a single deployable bundle.',
    'landing.aboutBody2': 'Give teams a private space to connect: every session issues short-lived access codes, traffic stays encrypted end-to-end, and you decide where the stack runs.',
    'landing.howTitle': 'How it works',
    'landing.howStep1': 'Press "Start call". Hermes requests the API and returns a short join link backed by a 24-hour token.',
    'landing.howStep2': 'Share the link or access code. Your teammate opens `/join` via the link (or enters the code/token) and lands in the same room.',
    'landing.howStep3': 'Hermes negotiates TURN/STUN and keeps the WebRTC media channel encrypted the entire time.',
    'landing.opensourceTitle': 'Open source & self-hosted',
    'landing.opensourceBody': 'The whole stack is MIT-licensed. Explore the signalling layer, customise the web client, or wire Hermes into your own infrastructure without vendor lock-in.',
    'landing.opensourceLink': 'View on GitHub',
    'landing.footer': 'Hermes (c) 2025. Documentation and source are available in the repository.',
    'landing.status.creating': 'Creating a call...',
    'landing.status.tooMany': 'Too many requests. Please try again in a minute.',
    'landing.status.badRequest': 'Check the Telegram ID - the server responded with 400.',
    'landing.status.createFailed': 'Call creation failed ({code}).',
    'landing.status.unexpected': 'Unexpected response: join link or code is missing.',
    'landing.status.copySuccess': 'Call link copied. Redirecting you to the session...',
    'landing.status.redirecting': 'Redirecting you to the session...',
    'landing.status.couldNotCreate': 'Could not create the call.',
    'join.metaTitle': 'Hermes - P2P videocall platform',
    'join.metaDescription': 'Join a secure Hermes peer-to-peer video call and stay in control of your connection.',
    'join.overlayCloseAria': 'Leave call',
    'join.overlayEnter': 'enter',
    'join.overlayCamAria': 'Toggle camera',
    'join.overlayMicAria': 'Toggle microphone',
    'join.fullscreenLocalAria': 'toggle fullscreen for local video',
    'join.fullscreenRemoteAria': 'toggle fullscreen for remote video',
    'join.copyPrompt': 'press to copy call link',
    'join.copySuccess': 'Link copied',
    'join.copyError': 'Copy failed',
    'join.fullscreenEnter': 'full',
    'join.fullscreenExit': 'exit',
    'join.fullscreenBack': 'back',
    'join.fullscreenEnterAria': 'enter fullscreen',
    'join.fullscreenExitAria': 'exit fullscreen',
    'join.controlExit': 'exit',
    'join.mobileCamAria': 'Toggle camera',
    'join.mobileTurnAria': 'Swap front and rear camera',
    'join.mobileMicAria': 'Toggle microphone',
    'join.mobileExitAria': 'Leave call',
    'join.hiddenJoin': 'Join',
    'join.permission.title': 'Camera and microphone are blocked',
    'join.permission.body': 'Please allow access to your camera and microphone in the browser settings and try again.',
    'join.permission.retry': 'TRY AGAIN',
  },
  ru: {
    'shared.ogLocale': 'ru_RU',
    'landing.metaTitle': 'Hermes — платформа P2P видеозвонков',
    'landing.metaDescription': 'Безопасные peer-to-peer видеозвонки, которые остаются приватными и легко расшариваются.',
    'landing.heroBadge': 'hermes call',
    'landing.heroTitle': 'Привет! Это Hermes.<br /><br />Защищённые видеозвонки без лишних сложностей.',
    'landing.heroLead': 'Поднимите self-hosted WebRTC-комнату за секунды. Поделитесь ссылкой, подключитесь мгновенно и держите каждый разговор приватным.',
    'landing.ctaLabel': 'Telegram ID (необязательно)',
    'landing.ctaPlaceholder': '@username или числовой ID',
    'landing.ctaButton': 'НАЧАТЬ ЗВОНОК',
    'landing.ctaHint': 'Оставьте поле пустым, чтобы сгенерировать гостевой идентификатор. Коды действуют 15 минут, ссылки — 24 часа.',
    'landing.aboutTitle': 'О продукте',
    'landing.aboutBody1': 'Hermes — лёгкая self-hosted платформа для peer-to-peer видеозвонков в реальном времени. В одном развёртывании поставляются сигнальный сервер, инфраструктура TURN/STUN и WebRTC-клиент.',
    'landing.aboutBody2': 'Дайте командам приватное пространство: каждый сеанс выдаёт краткоживущие коды доступа, трафик шифруется end-to-end, а вы контролируете, где работает весь стек.',
    'landing.howTitle': 'Как это работает',
    'landing.howStep1': 'Нажмите «Start call». Hermes обратится к API и вернёт короткую ссылку со 24‑часовым токеном.',
    'landing.howStep2': 'Поделитесь ссылкой или кодом. Партнёр открывает /join (или вводит код/токен) и оказывается в той же комнате.',
    'landing.howStep3': 'Hermes настраивает TURN/STUN и держит WebRTC-канал шифрованным всё время.',
    'landing.opensourceTitle': 'Открытый код и self-hosted',
    'landing.opensourceBody': 'Весь стек распространяется по MIT. Исследуйте сигнальный слой, кастомизируйте web-клиент или интегрируйте Hermes в свою инфраструктуру без vendor lock-in.',
    'landing.opensourceLink': 'Посмотреть на GitHub',
    'landing.footer': 'Hermes (c) 2025. Документация и исходники доступны в репозитории.',
    'landing.status.creating': 'Создаю комнату...',
    'landing.status.tooMany': 'Слишком много запросов. Попробуйте через минуту.',
    'landing.status.badRequest': 'Проверьте Telegram ID — сервер ответил 400.',
    'landing.status.createFailed': 'Создать звонок не удалось ({code}).',
    'landing.status.unexpected': 'Неожиданный ответ: нет ссылки или кода.',
    'landing.status.copySuccess': 'Ссылка скопирована. Перенаправляю в комнату...',
    'landing.status.redirecting': 'Перенаправляю в комнату...',
    'landing.status.couldNotCreate': 'Не удалось создать звонок.',
    'join.metaTitle': 'Hermes — платформа P2P видеозвонков',
    'join.metaDescription': 'Присоединяйтесь к защищённому peer-to-peer видеозвонку Hermes и контролируйте соединение.',
    'join.overlayCloseAria': 'Выйти из звонка',
    'join.overlayEnter': 'войти',
    'join.overlayCamAria': 'Переключить камеру',
    'join.overlayMicAria': 'Переключить микрофон',
    'join.fullscreenLocalAria': 'Развернуть локальное видео',
    'join.fullscreenRemoteAria': 'Развернуть удалённое видео',
    'join.copyPrompt': 'нажмите, чтобы скопировать ссылку',
    'join.copySuccess': 'Ссылка скопирована',
    'join.copyError': 'Не удалось скопировать',
    'join.fullscreenEnter': 'экран',
    'join.fullscreenExit': 'выход',
    'join.fullscreenBack': 'назад',
    'join.fullscreenEnterAria': 'Войти в полноэкранный режим',
    'join.fullscreenExitAria': 'Выйти из полноэкранного режима',
    'join.controlExit': 'выйти',
    'join.mobileCamAria': 'Переключить камеру',
    'join.mobileTurnAria': 'Сменить фронтальную и тыловую камеры',
    'join.mobileMicAria': 'Переключить микрофон',
    'join.mobileExitAria': 'Покинуть звонок',
    'join.hiddenJoin': 'Подключиться',
    'join.permission.title': 'Камера и микрофон заблокированы',
    'join.permission.body': 'Разрешите доступ к камере и микрофону в настройках браузера и повторите попытку.',
    'join.permission.retry': 'ПОВТОРИТЬ',
  },
};

const FALLBACK_LANG = 'en';

function detectLanguage() {
  try {
    const nav = navigator?.language || navigator?.userLanguage || '';
    const short = (nav || '').split('-')[0].toLowerCase();
    if (TRANSLATIONS[short]) {
      return short;
    }
  } catch {}
  return FALLBACK_LANG;
}

const ACTIVE_LANG = detectLanguage();
document.documentElement.lang = ACTIVE_LANG;
window.__lang = ACTIVE_LANG;

function translateInternal(key, params = null, lang = ACTIVE_LANG) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS[FALLBACK_LANG] || {};
  let template = dict[key];
  if (typeof template === 'undefined') {
    template = (TRANSLATIONS[FALLBACK_LANG] || {})[key];
  }
  if (!template) {
    return '';
  }
  if (params && typeof params === 'object') {
    template = template.replace(/\{(\w+)\}/g, (match, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        const value = params[token];
        return value == null ? '' : String(value);
      }
      return match;
    });
  }
  return template;
}

window.__ = (key, params) => translateInternal(key, params) || key;

const DOM_MAPPINGS = {
  shared: [
    { selector: 'meta[property="og:locale"]', attr: 'content', key: 'shared.ogLocale' },
  ],
  landing: [
    { target: 'title', key: 'landing.metaTitle' },
    { selector: 'meta[name="title"]', attr: 'content', key: 'landing.metaTitle' },
    { selector: 'meta[name="description"]', attr: 'content', key: 'landing.metaDescription' },
    { selector: 'meta[property="og:description"]', attr: 'content', key: 'landing.metaDescription' },
    { selector: 'meta[name="twitter:description"]', attr: 'content', key: 'landing.metaDescription' },
    { selector: 'meta[property="og:title"]', attr: 'content', key: 'landing.metaTitle' },
    { selector: 'meta[name="twitter:title"]', attr: 'content', key: 'landing.metaTitle' },
    { selector: '.hero-badge', key: 'landing.heroBadge' },
    { selector: '.hero h1', key: 'landing.heroTitle', mode: 'html' },
    { selector: '.hero p', key: 'landing.heroLead' },
    { selector: '.cta label', key: 'landing.ctaLabel' },
    { selector: '#initiatorInput', attr: 'placeholder', key: 'landing.ctaPlaceholder' },
    { selector: '.cta button[data-role="create-call"]', key: 'landing.ctaButton' },
    { selector: '.cta-hint', key: 'landing.ctaHint' },
    { selector: '#about .section-title', key: 'landing.aboutTitle' },
    { selector: '#about p:nth-of-type(1)', key: 'landing.aboutBody1' },
    { selector: '#about p:nth-of-type(2)', key: 'landing.aboutBody2' },
    { selector: '#how-it-works .section-title', key: 'landing.howTitle' },
    { selector: '.how-steps .how-step:nth-child(1)', key: 'landing.howStep1' },
    { selector: '.how-steps .how-step:nth-child(2)', key: 'landing.howStep2' },
    { selector: '.how-steps .how-step:nth-child(3)', key: 'landing.howStep3' },
    { selector: '.opensource-card h2', key: 'landing.opensourceTitle' },
    { selector: '.opensource-card p', key: 'landing.opensourceBody' },
    { selector: '.opensource-card a', key: 'landing.opensourceLink' },
    { selector: 'footer', key: 'landing.footer' },
  ],
  join: [
    { target: 'title', key: 'join.metaTitle' },
    { selector: 'meta[name="title"]', attr: 'content', key: 'join.metaTitle' },
    { selector: 'meta[name="description"]', attr: 'content', key: 'join.metaDescription' },
    { selector: 'meta[property="og:description"]', attr: 'content', key: 'join.metaDescription' },
    { selector: 'meta[name="twitter:description"]', attr: 'content', key: 'join.metaDescription' },
    { selector: 'meta[property="og:title"]', attr: 'content', key: 'join.metaTitle' },
    { selector: 'meta[name="twitter:title"]', attr: 'content', key: 'join.metaTitle' },
    { selector: '.call-overlay__close', attr: 'aria-label', key: 'join.overlayCloseAria' },
    { selector: '[data-role="overlay-cam"]', attr: 'aria-label', key: 'join.overlayCamAria' },
    { selector: '[data-role="overlay-mic"]', attr: 'aria-label', key: 'join.overlayMicAria' },
    { selector: '.call-overlay__enter', key: 'join.overlayEnter' },
    { selector: '#localVideoDisplay .fullscreen-button', key: 'join.fullscreenEnter' },
    { selector: '#localVideoDisplay .fullscreen-button', attr: 'aria-label', key: 'join.fullscreenLocalAria' },
    { selector: '#remoteVideoDisplay .fullscreen-button', key: 'join.fullscreenEnter' },
    { selector: '#remoteVideoDisplay .fullscreen-button', attr: 'aria-label', key: 'join.fullscreenRemoteAria' },
    { selector: '.copy-link-button .placeholder-text', key: 'join.copyPrompt', all: true },
    { selector: '#exitBtn', key: 'join.controlExit' },
    { selector: '[data-role="mobile-cam"]', attr: 'aria-label', key: 'join.mobileCamAria' },
    { selector: '[data-role="mobile-turn"]', attr: 'aria-label', key: 'join.mobileTurnAria' },
    { selector: '[data-role="mobile-mic"]', attr: 'aria-label', key: 'join.mobileMicAria' },
    { selector: '[data-role="mobile-exit"]', attr: 'aria-label', key: 'join.mobileExitAria' },
    { selector: '#joinBtn', key: 'join.hiddenJoin' },
  ],
};

function resolveNodes(entry) {
  if (!entry.selector) return [];
  if (entry.all) {
    return Array.from(document.querySelectorAll(entry.selector));
  }
  const node = document.querySelector(entry.selector);
  return node ? [node] : [];
}

function applyTranslations() {
  const pageId =
    document.documentElement.dataset.page ||
    (window.location.pathname.includes('/join') ? 'join' : 'landing');
  ['shared', pageId].forEach((group) => {
    const entries = DOM_MAPPINGS[group] || [];
    entries.forEach((entry) => {
      const value = translateInternal(entry.key);
      if (!value) return;
      if (entry.target === 'title') {
        document.title = value;
        return;
      }
      resolveNodes(entry).forEach((node) => {
        if (!node) return;
        if (entry.attr) {
          node.setAttribute(entry.attr, value);
        } else if (entry.mode === 'html') {
          node.innerHTML = value;
        } else {
          node.textContent = value;
        }
      });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyTranslations, { once: true });
} else {
  applyTranslations();
}
