const canvas = document.getElementById("backgroundCanvas");
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const t = (key, fallback, params) => {
  if (typeof window !== 'undefined' && typeof window.__ === 'function') {
    const value = window.__(key, params);
    if (value && value !== key) {
      return value;
    }
  }
  return fallback;
};

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
    setStatus(t('landing.status.creating', 'Creating a call...'));
  }
}

async function copyToClipboard(value) {
  if (!value) return false;
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
    return true;
  } catch (error) {
    console.error('[landing] clipboard failed', error);
    return false;
  }
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
        throw new Error(t('landing.status.tooMany', 'Too many requests. Please try again in a minute.'));
      }
      if (response.status === 400) {
        throw new Error(t('landing.status.badRequest', 'Check the Telegram ID - the server responded with 400.'));
      }
      throw new Error(
        t('landing.status.createFailed', `Call creation failed (${errorCode}).`, { code: errorCode }),
      );
    }

    const data = await response.json();
    if (!data?.joinUrl || !data?.code) {
      throw new Error(
        t('landing.status.unexpected', 'Unexpected response: join link or code is missing.'),
      );
    }

    const joinUrl = data.joinUrl;
    const copied = await copyToClipboard(joinUrl);
    if (copied) {
      setStatus(
        t('landing.status.copySuccess', 'Call link copied. Redirecting you to the session...'),
      );
    } else {
      setStatus(t('landing.status.redirecting', 'Redirecting you to the session...'));
    }

    setTimeout(() => {
      window.location.assign(joinUrl);
    }, 50);
  } catch (error) {
    console.error('[landing] create call failed', error);
    setStatus(
      error.message || t('landing.status.couldNotCreate', 'Could not create the call.'),
      'error',
    );
  } finally {
    toggleSubmitting(false);
  }
}

form?.addEventListener('submit', handleSubmit);

window.addEventListener('pageshow', () => {
  setStatus('');
});
