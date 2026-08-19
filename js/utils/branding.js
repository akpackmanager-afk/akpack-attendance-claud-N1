/**
 * branding.js
 * Applies the gym's name + logo (stored in the Settings sheet, editable
 * from Admin → Branding) to every place the app shows a brand mark: the
 * nav sidebar and the browser tab title. Runs once on load; admin.js calls
 * applyBranding() again immediately after a save so changes are visible
 * without a refresh.
 */

import { api } from '../api.js';

const FALLBACK_NAME = 'AK PACK FITNES';

export async function initBranding() {
  try {
    const settings = await api.getSettings();
    applyBranding({ gymName: settings.gymName, gymLogoUrl: settings.gymLogoUrl });
  } catch (err) {
    // Fall back to the default name already in the HTML if Settings can't be reached.
    applyBranding({ gymName: FALLBACK_NAME, gymLogoUrl: '' });
  }
}

/**
 * @param {{ gymName?: string, gymLogoUrl?: string }} branding
 */
export function applyBranding(branding) {
  const name = (branding && branding.gymName) ? branding.gymName : FALLBACK_NAME;
  const logoUrl = branding && branding.gymLogoUrl;

  const nameEl = document.getElementById('app-brand-name');
  const titleEl = document.getElementById('page-title');
  const logoImg = document.getElementById('app-brand-logo');
  const markEl = document.getElementById('app-brand-mark');

  if (nameEl) nameEl.textContent = name;
  if (titleEl) titleEl.textContent = `${name} — Gym Management & Attendance`;

  if (logoImg) {
    if (logoUrl) {
      logoImg.src = logoUrl;
      logoImg.hidden = false;
      if (markEl) markEl.hidden = true;
    } else {
      logoImg.hidden = true;
      logoImg.removeAttribute('src');
      if (markEl) markEl.hidden = false;
    }
  }
}
