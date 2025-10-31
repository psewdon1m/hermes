// Shared helpers for detecting client device/profile across modules.
let cachedProfile = null;

export function detectClient() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const vendor = navigator.vendor || '';

  let device = 'desktop';
  if (/Android/i.test(ua)) {
    device = 'android';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    device = 'ios';
  } else if (/Macintosh|MacIntel/i.test(ua)) {
    device = 'mac';
  } else if (/Windows/i.test(ua)) {
    device = 'windows';
  }

  const browserMatch = ua.match(/(Firefox|Chrome|Edg|Safari|OPR)\/(\d+\.?[\d]*)/i);
  const browser = browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : 'unknown';

  return { ua, platform, vendor, device, browser };
}

export function getClientProfile() {
  if (!cachedProfile) {
    const baseProfile = detectClient();
    cachedProfile = {
      ...baseProfile,
      isMobile: baseProfile.device === 'android' || baseProfile.device === 'ios'
    };
  }
  return cachedProfile;
}

export function applyClientProfileToDOM() {
  const profile = getClientProfile();
  try {
    window.clientProfile = profile;
  } catch {
    // Ignore if assigning to window fails (e.g. strict CSP sandbox)
  }

  const root = document.documentElement;
  if (root) {
    if (profile.device) {
      root.dataset.device = profile.device;
    }
    root.classList.toggle('device-mobile', !!profile.isMobile);
  }

  return profile;
}
