/**
 * admin.js
 * Full Admin module arrives in Stage 5–6 (reports, membership status,
 * crowd analytics, settings). For now this file owns just the Branding
 * card, since gym name + logo need to be editable from day one and apply
 * everywhere immediately — see js/utils/branding.js for where it's applied.
 */

import { api, ApiError } from './api.js';
import { applyBranding } from './utils/branding.js';
import { notifySuccess, notifyError } from './utils/notifications.js';

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024; // 1.5MB — keeps Sheets/Drive writes fast
let initialized = false;
let pendingLogoDataUrl = null; // null = unchanged, '' = explicitly removed, string = new upload

export function initAdminBranding() {
  if (initialized) return;
  initialized = true;

  const nameInput = document.getElementById('branding-name-input');
  const logoInput = document.getElementById('branding-logo-input');
  const logoImg = document.getElementById('branding-logo-img');
  const logoPlaceholder = document.getElementById('branding-logo-placeholder');
  const removeBtn = document.getElementById('branding-logo-remove');
  const saveBtn = document.getElementById('branding-save-btn');
  const statusEl = document.getElementById('branding-save-status');

  loadCurrentBranding();

  logoInput.addEventListener('change', () => {
    const file = logoInput.files && logoInput.files[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      notifyError('Logo is too large — please use an image under 1.5MB.');
      logoInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingLogoDataUrl = reader.result;
      showLogoPreview(pendingLogoDataUrl);
    };
    reader.readAsDataURL(file);
  });

  removeBtn.addEventListener('click', () => {
    pendingLogoDataUrl = '';
    logoInput.value = '';
    showLogoPreview('');
  });

  saveBtn.addEventListener('click', async () => {
    const gymName = nameInput.value.trim();
    if (!gymName) {
      notifyError('Gym name cannot be empty.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>';
    statusEl.textContent = '';

    try {
      // Logo upload is a separate action so large image payloads don't
      // ride along with every ordinary settings update.
      let gymLogoUrl;
      if (pendingLogoDataUrl === '') {
        gymLogoUrl = '';
      } else if (pendingLogoDataUrl) {
        const uploaded = await api.uploadLogo(pendingLogoDataUrl);
        gymLogoUrl = uploaded.gymLogoUrl;
      }

      const payload = { gymName };
      if (gymLogoUrl !== undefined) payload.gymLogoUrl = gymLogoUrl;
      const saved = await api.updateSettings(payload);

      applyBranding({ gymName: saved.gymName, gymLogoUrl: saved.gymLogoUrl });
      pendingLogoDataUrl = null;
      statusEl.textContent = 'Saved.';
      notifySuccess('Branding updated.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save branding. Please try again.';
      notifyError(message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Branding';
    }
  });

  async function loadCurrentBranding() {
    try {
      const settings = await api.getSettings();
      nameInput.value = settings.gymName || '';
      showLogoPreview(settings.gymLogoUrl || '');
    } catch (err) {
      notifyError('Could not load current branding settings.');
    }
  }

  function showLogoPreview(url) {
    if (url) {
      logoImg.src = url;
      logoImg.hidden = false;
      logoPlaceholder.hidden = true;
    } else {
      logoImg.hidden = true;
      logoImg.removeAttribute('src');
      logoPlaceholder.hidden = false;
    }
  }
}
