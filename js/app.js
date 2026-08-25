/**
 * app.js
 * App shell: tab navigation, mobile nav drawer, topbar clock.
 * Each nav tab maps to a <section id="view-*"> in index.html. Only
 * Reception is wired to a real module in Stage 1 — the rest render as
 * "coming in Stage N" placeholders so the shell/nav architecture is final
 * from day one and later modules simply slot in.
 */

import { initReception } from './reception.js';
import { initAdminBranding } from './admin.js';
import { initLiveFeed } from './live-feed.js';
import { initMembers } from './members.js';
import { formatDate, formatTime, formatPhone } from './utils/format.js';
import { api, ApiError } from './api.js';
import { notifyError } from './utils/notifications.js';
import { icon } from './utils/icons.js';

const initializedModules = new Set();

function setActiveView(viewName) {
  document.querySelectorAll('.app-view').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.view === viewName);
  });
  document.querySelectorAll('.app-nav__link').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.view === viewName);
  });

  const titleEl = document.querySelector('.app-topbar__title');
  const subtitleEl = document.querySelector('.app-topbar__subtitle');
  const activeLink = document.querySelector(`.app-nav__link[data-view="${viewName}"]`);
  if (titleEl && activeLink) titleEl.textContent = activeLink.dataset.title || activeLink.textContent.trim();
  if (subtitleEl && activeLink) subtitleEl.textContent = activeLink.dataset.subtitle || '';

  closeMobileNav();
  initModule(viewName);
  history.replaceState(null, '', `#${viewName}`);
}

/**
 * Admin → Attendance History — inlined here instead of a separate
 * attendance-history.js so this stage only touches index.html + app.js.
 * Filters the Attendance sheet (joined with Members) by date range, name,
 * Membership ID, or contact number via api.getAttendanceHistory.
 */
let attendanceHistoryInitialized = false;

function initAttendanceHistory() {
  if (attendanceHistoryInitialized) return;
  attendanceHistoryInitialized = true;

  const root = document.getElementById('view-attendance');
  if (!root) return;

  const els = {
    dateFrom: root.querySelector('#hist-date-from'),
    dateTo: root.querySelector('#hist-date-to'),
    clientName: root.querySelector('#hist-client-name'),
    membershipId: root.querySelector('#hist-membership-id'),
    contactNo: root.querySelector('#hist-contact-no'),
    searchBtn: root.querySelector('#hist-search-btn'),
    clearBtn: root.querySelector('#hist-clear-btn'),
    resultsWrap: root.querySelector('#hist-results'),
  };

  els.searchBtn.addEventListener('click', loadHistory);
  els.clearBtn.addEventListener('click', () => {
    [els.dateFrom, els.dateTo, els.clientName, els.membershipId, els.contactNo].forEach((el) => { el.value = ''; });
    loadHistory();
  });

  loadHistory();

  async function loadHistory() {
    els.resultsWrap.innerHTML = `<div class="skeleton" style="height:180px;"></div>`;

    const filters = {
      dateFrom: els.dateFrom.value || undefined,
      dateTo: els.dateTo.value || undefined,
      clientName: els.clientName.value.trim() || undefined,
      membershipId: els.membershipId.value.trim() || undefined,
      contactNo: els.contactNo.value.trim() || undefined,
    };

    try {
      const rows = await api.getAttendanceHistory(filters);
      renderHistoryResults(rows);
    } catch (err) {
      els.resultsWrap.innerHTML = '';
      notifyError(err instanceof ApiError ? err.message : 'Could not load attendance history.');
    }
  }

  function renderHistoryResults(rows) {
    if (!rows || rows.length === 0) {
      els.resultsWrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">${icon('attendance')}</div>
          <div class="empty-state__title">No records found</div>
          <p>Try widening your date range or clearing some filters.</p>
        </div>`;
      return;
    }

    els.resultsWrap.innerHTML = `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td data-label="Date">${formatDate(r.date)}</td>
                <td data-label="Client">
                  <div class="history-table__name">${escapeHtml(r.clientName)}</div>
                  <div class="history-table__meta">ID ${escapeHtml(r.membershipId)}${r.contactNo ? ' · ' + formatPhone(r.contactNo) : ''}</div>
                </td>
                <td data-label="Entry">${formatTime(r.entryTime)}</td>
                <td data-label="Exit">${r.exitTime ? formatTime(r.exitTime) : '—'}</td>
                <td data-label="Duration" class="history-table__duration">${r.durationMin ? minutesToShort(r.durationMin) : '—'}</td>
                <td data-label="Status">${historyStatusBadge(r)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:0.76rem; color:var(--ink-600); margin-top:10px;">${rows.length} record${rows.length === 1 ? '' : 's'} shown${rows.length === 500 ? ' (500 max — narrow your filters for more precise results)' : ''}.</p>
    `;
  }

  function historyStatusBadge(r) {
    if (r.exitStatus === 'Missing Exit' || (!r.exitTime && r.attendanceStatus === 'Auto-Closed')) {
      return '<span class="badge badge--red">Missing Exit</span>';
    }
    if (!r.exitTime) return '<span class="badge badge--green">Inside</span>';
    return '<span class="badge badge--neutral">Completed</span>';
  }
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

function initModule(viewName) {
  if (initializedModules.has(viewName)) return;
  if (viewName === 'reception') {
    initReception();
    initializedModules.add(viewName);
  }
  if (viewName === 'admin') {
    // Only the Branding card is functional this stage — the rest of Admin
    // (reports, membership status, settings) attaches here in Stage 5–6.
    initAdminBranding();
    initializedModules.add(viewName);
  }
  if (viewName === 'live-feed') {
    initLiveFeed();
    initializedModules.add(viewName);
  }
  if (viewName === 'members') {
    initMembers();
    initializedModules.add(viewName);
  }
  if (viewName === 'attendance') {
    initAttendanceHistory();
    initializedModules.add(viewName);
  }
}

function closeMobileNav() {
  document.querySelector('.app-nav')?.classList.remove('is-open');
  document.querySelector('.app-nav-scrim')?.classList.remove('is-visible');
}

function initNav() {
  document.querySelectorAll('.app-nav__link').forEach((link) => {
    link.addEventListener('click', () => setActiveView(link.dataset.view));
  });

  const toggle = document.querySelector('.app-nav-toggle');
  const scrim = document.querySelector('.app-nav-scrim');
  toggle?.addEventListener('click', () => {
    document.querySelector('.app-nav')?.classList.add('is-open');
    scrim?.classList.add('is-visible');
  });
  scrim?.addEventListener('click', closeMobileNav);

  const initialView = window.location.hash.replace('#', '') || 'reception';
  const validView = document.querySelector(`.app-view[data-view="${initialView}"]`) ? initialView : 'reception';
  setActiveView(validView);
}

function initClock() {
  const clockEl = document.querySelector('.app-clock');
  if (!clockEl) return;
  const tick = () => {
    const now = new Date();
    clockEl.textContent = `${formatDate(now)} · ${formatTime(now)}`;
  };
  tick();
  setInterval(tick, 30000);
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initClock();
});
