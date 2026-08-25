/**
 * members.js
 * Members search/list, and an individual member profile with a monthly
 * attendance calendar + rollup stats. All data comes from the Members and
 * Attendance sheets via api.searchMembers / api.getMemberProfile — nothing
 * here is entered manually.
 */

import { api, ApiError } from './api.js';
import { formatDate, formatTime, formatDuration, formatPhone, initials } from './utils/format.js';
import { notifyError } from './utils/notifications.js';
import { icon } from './utils/icons.js';

const STATUS_BADGE = {
  Active: 'badge--green',
  'Expiring Soon': 'badge--amber',
  Expired: 'badge--red',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

let initialized = false;

export function initMembers() {
  if (initialized) return;
  initialized = true;

  const root = document.getElementById('view-members');
  if (!root) return;

  const state = {
    query: '',
    activeMembershipId: null,
    profileMonth: startOfMonth(new Date()),
  };

  const els = {
    listView: root.querySelector('#members-list-view'),
    profileView: root.querySelector('#members-profile-view'),
    profileContent: root.querySelector('#members-profile-content'),
    search: root.querySelector('#members-search'),
    list: root.querySelector('#member-list'),
    backBtn: root.querySelector('#profile-back-btn'),
  };

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim();
    loadList();
  });

  els.backBtn.addEventListener('click', () => showList());

  loadList();

  async function loadList() {
    els.list.innerHTML = `<div class="skeleton" style="height:64px; margin-bottom:8px;"></div>`.repeat(3);
    try {
      const results = await api.searchMembers(state.query);
      renderList(results);
    } catch (err) {
      els.list.innerHTML = '';
      notifyError(err instanceof ApiError ? err.message : 'Could not load members.');
    }
  }

  function renderList(results) {
    if (!results || results.length === 0) {
      els.list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">${icon('members')}</div>
          <div class="empty-state__title">No members found</div>
          <p>Try a different name, Membership ID, or contact number.</p>
        </div>`;
      return;
    }

    els.list.innerHTML = results.map((m) => `
      <div class="member-row-card" data-id="${escapeHtml(m.membershipId)}">
        <div class="member-avatar">${initials(m.clientName)}</div>
        <div class="member-row-card__body">
          <div class="member-row-card__name">${escapeHtml(m.clientName)}</div>
          <div class="member-row-card__meta">ID ${escapeHtml(m.membershipId)} · ${formatPhone(m.contactNo)}</div>
        </div>
        <div class="member-row-card__badges">
          <span class="badge ${STATUS_BADGE[m.membershipStatus] || 'badge--neutral'}">${m.membershipStatus}</span>
        </div>
      </div>
    `).join('');

    els.list.querySelectorAll('.member-row-card').forEach((card) => {
      card.addEventListener('click', () => openProfile(card.dataset.id));
    });
  }

  async function openProfile(membershipId) {
    state.activeMembershipId = membershipId;
    state.profileMonth = startOfMonth(new Date());
    els.listView.hidden = true;
    els.profileView.hidden = false;
    els.profileContent.innerHTML = `<div class="skeleton" style="height:220px;"></div>`;
    await loadProfile();
  }

  function showList() {
    state.activeMembershipId = null;
    els.profileView.hidden = true;
    els.listView.hidden = false;
  }

  async function loadProfile() {
    if (!state.activeMembershipId) return;
    try {
      const profile = await api.getMemberProfile(state.activeMembershipId, state.profileMonth.toISOString());
      renderProfile(profile);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : 'Could not load member profile.');
      showList();
    }
  }

  function renderProfile(profile) {
    const m = profile.member;
    const badgeClass = STATUS_BADGE[m.membershipStatus] || 'badge--neutral';

    els.profileContent.innerHTML = `
      <div class="profile-header">
        <div class="member-avatar">${initials(m.clientName)}</div>
        <div>
          <div class="profile-header__name">${escapeHtml(m.clientName)}</div>
          <div class="profile-header__meta">ID ${escapeHtml(m.membershipId)} · ${formatPhone(m.contactNo)}</div>
        </div>
        <div class="profile-header__badges">
          <span class="badge ${badgeClass}">${m.membershipStatus}</span>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-card__label">Total Visits</span>
          <span class="stat-card__value">${profile.stats.totalVisits}</span>
          <span class="stat-card__accent"></span>
        </div>
        <div class="stat-card stat-card--green">
          <span class="stat-card__label">Visits This Month</span>
          <span class="stat-card__value">${profile.stats.visitsThisMonth}</span>
          <span class="stat-card__accent"></span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Avg. Duration</span>
          <span class="stat-card__value">${minutesToShort(profile.stats.averageDurationMin)}</span>
          <span class="stat-card__accent"></span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Total Gym Time</span>
          <span class="stat-card__value">${minutesToShort(profile.stats.totalGymTimeMin)}</span>
          <span class="stat-card__accent"></span>
        </div>
      </div>

      <div class="profile-layout">
        <div class="card">
          <h3 style="margin-bottom:14px; font-size:1rem;">Member Details</h3>
          <div class="profile-detail-grid">
            <div class="member-result__item"><span class="member-result__item-label">Package</span><span class="member-result__item-value">${escapeHtml(m.packageDetails || '—')}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Valid Until</span><span class="member-result__item-value">${formatDate(m.packageValidity)}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Trainer</span><span class="member-result__item-value">${escapeHtml(m.trainerName || '—')}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Client ID</span><span class="member-result__item-value">${escapeHtml(profile.clientId || '—')}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Member Since</span><span class="member-result__item-value">${formatDate(profile.createdOn)}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Reward Points</span><span class="member-result__item-value">${escapeHtml(String(profile.totalRewardPoints ?? '—'))}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Pending Payment</span><span class="member-result__item-value">${escapeHtml(String(profile.pendingPayment ?? '0'))}</span></div>
            <div class="member-result__item"><span class="member-result__item-label">Next Follow-up</span><span class="member-result__item-value">${formatDate(profile.nextFollowupOn)}</span></div>
          </div>
        </div>

        <div class="card">
          <div class="calendar-nav">
            <button type="button" class="calendar-nav__btn" id="cal-prev" aria-label="Previous month">&larr;</button>
            <span class="calendar-nav__title" id="cal-title"></span>
            <button type="button" class="calendar-nav__btn" id="cal-next" aria-label="Next month">&rarr;</button>
          </div>
          <div class="calendar-weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="calendar-grid" id="cal-grid"></div>
          <div class="calendar-log" id="cal-log"></div>
        </div>
      </div>
    `;

    renderCalendar(profile);

    els.profileContent.querySelector('#cal-prev').addEventListener('click', () => shiftMonth(-1));
    els.profileContent.querySelector('#cal-next').addEventListener('click', () => shiftMonth(1));
  }

  function shiftMonth(delta) {
    const d = new Date(state.profileMonth);
    d.setMonth(d.getMonth() + delta);
    state.profileMonth = startOfMonth(d);
    loadProfile();
  }

  function renderCalendar(profile) {
    const monthDate = new Date(profile.monthIso);
    const titleEl = els.profileContent.querySelector('#cal-title');
    titleEl.textContent = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const attendedDays = new Set(
      profile.calendar.map((c) => new Date(c.date).getDate())
    );

    const firstWeekday = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    const gridEl = els.profileContent.querySelector('#cal-grid');
    let cells = '';
    for (let i = 0; i < firstWeekday; i++) cells += `<div class="calendar-day calendar-day--empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const attended = attendedDays.has(day);
      cells += `<div class="calendar-day${attended ? ' calendar-day--attended' : ''}">${day}</div>`;
    }
    gridEl.innerHTML = cells;

    const logEl = els.profileContent.querySelector('#cal-log');
    if (profile.calendar.length === 0) {
      logEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">${icon('attendance')}</div>
          <div class="empty-state__title">No visits this month</div>
        </div>`;
      return;
    }

    logEl.innerHTML = profile.calendar.map((c) => `
      <div class="calendar-log-row">
        <span class="calendar-log-row__date">${formatDate(c.date)}</span>
        <span class="calendar-log-row__times">${formatTime(c.entryTime)} ${c.exitTime ? '→ ' + formatTime(c.exitTime) : '(no exit)'}</span>
        <span class="calendar-log-row__duration">${c.exitTime ? formatDuration(c.entryTime, c.exitTime) : '—'}</span>
      </div>
    `).join('');
  }
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function minutesToShort(min) {
  const total = Math.round(min || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}
