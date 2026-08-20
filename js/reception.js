/**
 * reception.js
 * The Reception screen: verify Membership ID, then confirm Entry or Exit.
 * Kept deliberately fast and uncluttered — this is the screen used
 * hundreds of times a day at the front desk.
 */

import { api, ApiError } from './api.js';
import { enforceNumericInput, validateVerificationForm } from './utils/validation.js';
import { formatTime, formatDate, initials, formatPhone } from './utils/format.js';
import { notifySuccess, notifyError } from './utils/notifications.js';
import { icon } from './utils/icons.js';

const STATUS_BADGE = {
  Active: 'badge--green',
  'Expiring Soon': 'badge--amber',
  Expired: 'badge--red',
};

export function initReception() {
  const root = document.getElementById('view-reception');
  if (!root) return;

  const state = {
    mode: 'entry', // 'entry' | 'exit'
    verifiedMember: null,
    busy: false,
  };

  const els = {
    modeEntryBtn: root.querySelector('[data-mode="entry"]'),
    modeExitBtn: root.querySelector('[data-mode="exit"]'),
    form: root.querySelector('#reception-form'),
    membershipInput: root.querySelector('#membership-id'),
    membershipError: root.querySelector('#membership-id-error'),
    scanRing: root.querySelector('#scan-ring'),
    scanIcon: root.querySelector('#scan-ring-icon'),
    scanStatus: root.querySelector('#scan-status'),
    resultPanel: root.querySelector('#member-result'),
    submitBtn: root.querySelector('#verify-submit'),
    confirmBtn: root.querySelector('#confirm-action'),
    resetBtn: root.querySelector('#reset-form'),
    statToday: root.querySelector('#stat-checkins'),
    statInside: root.querySelector('#stat-inside'),
    statCheckouts: root.querySelector('#stat-checkouts'),
    statExpired: root.querySelector('#stat-expired'),
    crowdLevel: root.querySelector('#crowd-level'),
    crowdFill: root.querySelector('#crowd-fill'),
    recentList: root.querySelector('#recent-list'),
  };

  enforceNumericInput(els.membershipInput, { maxLength: 12 });

  setMode('entry');
  loadSummary();
  const summaryInterval = setInterval(loadSummary, 15000);
  window.addEventListener('beforeunload', () => clearInterval(summaryInterval));

  els.modeEntryBtn.addEventListener('click', () => setMode('entry'));
  els.modeExitBtn.addEventListener('click', () => setMode('exit'));
  els.resetBtn.addEventListener('click', resetForm);
  els.form.addEventListener('submit', handleVerify);
  els.confirmBtn.addEventListener('click', handleConfirm);

  function setMode(mode) {
    state.mode = mode;
    els.modeEntryBtn.classList.toggle('is-active', mode === 'entry');
    els.modeExitBtn.classList.toggle('is-active', mode === 'exit');
    els.confirmBtn.textContent = mode === 'entry' ? 'Confirm Entry' : 'Confirm Exit';
    els.confirmBtn.className = `btn btn--full btn--lg ${mode === 'entry' ? 'btn--primary' : 'btn--danger'}`;
    resetForm();
  }

  function resetForm() {
    state.verifiedMember = null;
    els.form.reset();
    els.membershipError.textContent = '';
    els.membershipInput.classList.remove('is-invalid');
    els.resultPanel.hidden = true;
    els.submitBtn.hidden = false;
    setScanState('idle', 'Enter Membership ID to verify a member.');
    els.membershipInput.focus();
  }

  function setScanState(kind, message) {
    els.scanRing.className = `scan-ring is-${kind}`;
    els.scanIcon.innerHTML = kind === 'success' ? icon('check') : kind === 'error' ? icon('cross') : icon('scan');
    els.scanStatus.textContent = message || '';
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (state.busy) return;

    const membershipId = els.membershipInput.value.trim();
    const { valid, errors } = validateVerificationForm({ membershipId });

    els.membershipError.textContent = errors.membershipId || '';
    els.membershipInput.classList.toggle('is-invalid', Boolean(errors.membershipId));
    if (!valid) return;

    state.busy = true;
    setScanState('verifying', 'Verifying member…');
    els.submitBtn.disabled = true;

    try {
      const member = await api.verifyMember(membershipId);
      state.verifiedMember = member;
      renderMember(member);
      setScanState('success', `Verified: ${member.clientName}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to connect to the attendance system. Please try again.';
      setScanState('error', message);
      notifyError(message);
    } finally {
      state.busy = false;
      els.submitBtn.disabled = false;
    }
  }

  function renderMember(member) {
    els.resultPanel.hidden = false;
    els.submitBtn.hidden = true;
    els.resultPanel.querySelector('.member-avatar').textContent = initials(member.clientName);
    els.resultPanel.querySelector('.member-result__name').textContent = member.clientName;
    els.resultPanel.querySelector('.member-result__meta').textContent =
      `ID ${member.membershipId} · ${formatPhone(member.contactNo)}`;

    const badge = els.resultPanel.querySelector('.member-result__status');
    badge.className = `badge member-result__status ${STATUS_BADGE[member.membershipStatus] || 'badge--neutral'}`;
    badge.textContent = member.membershipStatus;

    setField('package', member.packageDetails || '—');
    setField('validity', formatDate(member.packageValidity));
    setField('trainer', member.trainerName || '—');

    const isExitButValid = state.mode === 'exit';
    const blockExit = isExitButValid && !member.hasOpenEntry;
    const blockEntry = state.mode === 'entry' && member.hasOpenEntry;

    els.confirmBtn.disabled = blockExit || blockEntry;
    els.confirmBtn.parentElement.querySelector('.scan-status')?.remove();

    if (blockExit) {
      setScanState('error', 'No active entry found — exit cannot be recorded.');
    } else if (blockEntry) {
      setScanState('error', 'This member already has an active entry today.');
    }
  }

  function setField(key, value) {
    const el = els.resultPanel.querySelector(`[data-field="${key}"]`);
    if (el) el.textContent = value;
  }

  async function handleConfirm() {
    if (!state.verifiedMember || state.busy) return;
    state.busy = true;
    els.confirmBtn.disabled = true;
    els.confirmBtn.innerHTML = '<span class="spinner"></span>';

    const { membershipId } = state.verifiedMember;
    try {
      if (state.mode === 'entry') {
        const result = await api.recordEntry(membershipId);
        notifySuccess(`Entry recorded for ${result.clientName} at ${formatTime(result.entryTime)}.`);
      } else {
        const result = await api.recordExit(membershipId);
        notifySuccess(`Exit recorded for ${result.clientName} at ${formatTime(result.exitTime)}.`);
      }
      resetForm();
      loadSummary();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to connect to the attendance system. Please try again.';
      notifyError(message);
      els.confirmBtn.disabled = false;
      els.confirmBtn.textContent = state.mode === 'entry' ? 'Confirm Entry' : 'Confirm Exit';
    } finally {
      state.busy = false;
      if (els.confirmBtn.innerHTML.includes('spinner')) {
        els.confirmBtn.textContent = state.mode === 'entry' ? 'Confirm Entry' : 'Confirm Exit';
      }
    }
  }

  async function loadSummary() {
    try {
      const summary = await api.getReceptionSummary();
      els.statToday.textContent = summary.todayCheckIns;
      els.statInside.textContent = summary.currentlyInside;
      els.statCheckouts.textContent = summary.todayCheckOuts;
      els.statExpired.textContent = summary.expiredMembers;
      els.crowdLevel.textContent = summary.crowdLevel;
      els.crowdFill.style.width = `${summary.crowdCapacityPct}%`;
      renderRecent(summary.recent);
    } catch (err) {
      // Silent on the dashboard — the verification flow already surfaces
      // connectivity errors where the user is actively acting.
    }
  }

  function renderRecent(items) {
    if (!items || items.length === 0) {
      els.recentList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">${icon('attendance')}</div>
          <div class="empty-state__title">No activity yet</div>
          <p>Check-ins will appear here as they happen.</p>
        </div>`;
      return;
    }

    els.recentList.innerHTML = items.map((item) => `
      <div class="recent-row">
        <div class="recent-row__avatar">${initials(item.clientName)}</div>
        <div class="recent-row__body">
          <div class="recent-row__name">${item.clientName}</div>
          <div class="recent-row__sub">ID ${item.membershipId} · ${item.type === 'entry' ? 'Entry' : 'Exit'}</div>
        </div>
        <div class="recent-row__time">${formatTime(item.time)}</div>
      </div>
    `).join('');
  }
}
