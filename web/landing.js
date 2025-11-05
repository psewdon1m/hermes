const canvas = document.getElementById(''backgroundCanvas'');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function startBackground() {
  if (!canvas || prefersReducedMotion) return;
  const module = await import('./background-animation.js');
  module.startBackgroundAnimation(canvas);
}

startBackground().catch(() => {});

const form = document.querySelector('[data-role="create-call-form"]');
const initiatorInput = document.querySelector('[data-role="initiator-input"]');
const createButton = document.querySelector('[data-role="create-call"]');
const statusEl = document.querySelector('[data-role="cta-status"]');
const resultBox = document.querySelector('[data-role="call-result"]');
const codeEl = document.querySelector('[data-role="call-code"]');
const linkEl = document.querySelector('[data-role="call-link"]');
const copyCodeBtn = document.querySelector('[data-role="copy-code"]');
const copyLinkBtn = document.querySelector('[data-role="copy-link"]');
const openCallBtn = document.querySelector('[data-role="open-call"]');

let currentJoinUrl = '';
let currentCode = '';
let isSubmitting = false;

function sanitizeInput(value = '') {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return normalized.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 64) || '';
}

function makeGuestId() {
  return `guest_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function setStatus(message = '', type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.remove('error');
  if (type === 'error') {
    statusEl.classList.add('error');
  }
}

function toggleSubmitting(state) {
  isSubmitting = state;
  if (createButton) {
    createButton.disabled = state;
  }
  if (state) {
    setStatus('Создаём звонок…');
  }
}

function showResult({ code, joinUrl }) {
  currentCode = code || '';
  currentJoinUrl = joinUrl || '';
  if (codeEl) codeEl.textContent = currentCode || '—';
  if (linkEl) linkEl.textContent = currentJoinUrl || '—';
  if (resultBox) resultBox.classList.remove('hidden');
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return;

  const initiator = sanitizeInput(initiatorInput?.value ?? '');
  const payload = {
    initiator_telegram_id: initiator || makeGuestId(),
  };

  try {
    toggleSubmitting(true);
    const response = await fetch('/api/call/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorCode = data?.error || response.status;
      if (response.status === 429) {
        throw new Error('Слишком много запросов. Попробуйте ещё раз через минуту.');
      }
      if (response.status === 400) {
        throw new Error('Проверьте введённый Telegram ID — сервер вернул 400.');
      }
      throw new Error(`Не удалось создать звонок (${errorCode}).`);
    }

    const data = await response.json();
    if (!data?.joinUrl || !data?.code) {
      throw new Error('Сервер вернул неожиданный ответ без ссылки или кода.');
    }
    showResult(data);
    setStatus('Готово! Отправьте код или ссылку собеседнику.');
  } catch (error) {
    console.error('[landing] create call failed', error);
    setStatus(error.message || 'Не удалось создать звонок.', 'error');
  } finally {
    toggleSubmitting(false);
  }
}

async function copyToClipboard(value, label) {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const temp = document.createElement('textarea');
      temp.value = value;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    setStatus(`${label} скопирован. Поделитесь им с собеседником.`);
  } catch (error) {
    console.error('[landing] clipboard failed', error);
    setStatus('Не удалось скопировать. Сделайте это вручную.', 'error');
  }
}

form?.addEventListener('submit', handleSubmit);
copyCodeBtn?.addEventListener('click', () => copyToClipboard(currentCode, 'Код'));
copyLinkBtn?.addEventListener('click', () => copyToClipboard(currentJoinUrl, 'Ссылка'));
openCallBtn?.addEventListener('click', () => {
  if (!currentJoinUrl) {
    setStatus('Создайте звонок, чтобы перейти на страницу подключения.', 'error');
    return;
  }
  window.location.assign(currentJoinUrl);
});

window.addEventListener('pageshow', () => {
  setStatus('');
});
