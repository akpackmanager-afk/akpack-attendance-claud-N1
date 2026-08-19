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
import { formatDate, formatTime } from './utils/format.js';

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
  // Members, live-feed, attendance modules attach here in later stages:
  // if (viewName === 'live-feed') { initLiveFeed(); initializedModules.add(viewName); }
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
