/**
 * live-feed.js
 * Shows recent Entries (Attendance) joined with Members data, refreshing
 * automatically so trainers/staff can see who's checked in without
 * touching Reception. Read-only — no writes happen from this screen.
 */

import { api } from './api.js';
import { formatDate, formatTime, initials, formatPhone } from './utils/format.js';
import { icon } from './utils/icons.js';

const STATUS_BADGE = {
  Active: 'badge--green',
  'Expiring Soon': 'badge--amber',
  Expired: 'badge--red',
};

const POLL_INTERVAL_MS = 8000;

export function initLiveFeed() {
  const root = document.getElementById('view-live-feed');
  if (!root) return;

  const state = {
    items: [],
    query: '',
    statusFilter: 'all', // 'all' | 'Active' | 'Expiring Soon' | 'Expired'
  };

  const els = {
    grid: root.querySelector('#feed-grid'),
    search: root.querySelector('#feed-search'),
    chips: root.querySelectorAll('.feed-filter-chip'),
  };

  els.search.addEventListener('input', () => {
    state.query = els.search.value.trim().toLowerCase();
    render();
  });

  els.chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      els.chips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.statusFilter = chip.dataset.status;
      render();
    });
  });

  load();
  const pollTimer = setInterval(load, POLL_INTERVAL_MS);
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));

  async function load() {
    try {
      state.items = await api.getLiveFeed();
      render();
    } catch (err) {
      // A failed background poll shouldn't nuke what's already on screen —
      // just try again on the next interval tick.
    }
  }

  function render() {
    const filtered = state.items.filter((item) => {
      const matchesStatus = state.statusFilter === 'all' || item.membershipStatus === state.statusFilter;
      if (!matchesStatus) return false;
      if (!state.query) return true;
      const haystack = `${item.clientName} ${item.membershipId} ${item.contactNo}`.toLowerCase();
      return haystack.includes(state.query);
    });

    if (filtered.length === 0) {
      els.grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state__icon">${icon('liveFeed')}</div>
          <div class="empty-state__title">No check-ins to show</div>
          <p>${state.items.length === 0 ? 'Entries will appear here as members check in at Reception.' : 'No entries match your search or filter.'}</p>
        </div>`;
      return;
    }

    els.grid.innerHTML = filtered.map((item) => {
      const badgeClass = STATUS_BADGE[item.membershipStatus] || 'badge--neutral';
      return `
        <div class="feed-card">
          <div class="feed-card__head">
            <div class="member-avatar">${initials(item.clientName)}</div>
            <div>
              <div class="feed-card__name">${escapeHtml(item.clientName)}</div>
              <div class="feed-card__meta">ID ${escapeHtml(item.membershipId)}${item.contactNo ? ' · ' + formatPhone(item.contactNo) : ''}</div>
            </div>
            <div class="feed-card__badges">
              <span class="badge ${badgeClass}">${item.membershipStatus}</span>
              ${item.hasExited ? '<span class="badge badge--neutral">Checked Out</span>' : '<span class="badge badge--green">Inside</span>'}
            </div>
          </div>
          <div class="feed-card__body">
            <div class="feed-card__item">
              <span class="feed-card__item-label">Entry Time</span>
              <span class="feed-card__item-value feed-card__entry-time">${formatTime(item.entryTime)}</span>
            </div>
            <div class="feed-card__item">
              <span class="feed-card__item-label">Membership Expiry</span>
              <span class="feed-card__item-value">${formatDate(item.packageValidity)}</span>
            </div>
            ${item.packageDetails ? `
            <div class="feed-card__item">
              <span class="feed-card__item-label">Package</span>
              <span class="feed-card__item-value">${escapeHtml(item.packageDetails)}</span>
            </div>` : ''}
            ${item.trainerName ? `
            <div class="feed-card__item">
              <span class="feed-card__item-label">Trainer</span>
              <span class="feed-card__item-value">${escapeHtml(item.trainerName)}</span>
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}
