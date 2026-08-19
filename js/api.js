/**
 * api.js
 * Single point of contact with the Google Apps Script backend.
 * No module other than this one should call fetch() against the backend —
 * that keeps the request/response shape (and any future retry/auth logic)
 * in one place.
 *
 * SECURITY: this file intentionally contains no API keys or secrets.
 * GAS_WEB_APP_URL is the public URL of your deployed Apps Script Web App
 * ("Deploy > New deployment > Web app"). Access control (who can call
 * privileged actions like Admin config) is enforced server-side inside
 * Code.gs, not by hiding a key in this file — see gas/Code.gs.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Paste your deployed Apps Script Web App URL here once Stage 8 wiring begins. */
export const GAS_WEB_APP_URL = ''; /https://script.google.com/macros/s/AKfycbyOR3yBY_KES4cBUUZako5NK1paQVCXkZWFdUnu01u5xB9Hi0-h_g0mzg6HVJsCIVs/exec/ e.g. 'https://script.google.com/macros/s/AKfycb.../exec'

/**
 * MOCK_MODE runs entirely on in-memory sample data so the UI can be built
 * and previewed before the Apps Script backend is deployed. Flip to false
 * (or simply set GAS_WEB_APP_URL) once the backend is live.
 */
export const MOCK_MODE = GAS_WEB_APP_URL === '';

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function callBackend(action, payload = {}) {
  if (MOCK_MODE) return mockRouter(action, payload);

  let response;
  try {
    response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight against the Apps Script endpoint
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
    });
  } catch (err) {
    throw new ApiError('Unable to connect to the attendance system. Please try again.');
  }

  if (!response.ok) {
    throw new ApiError('Unable to connect to the attendance system. Please try again.');
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new ApiError('Unable to connect to the attendance system. Please try again.');
  }

  if (!json.ok) {
    throw new ApiError(json.message || 'Something went wrong. Please try again.', json.code);
  }

  return json.data;
}

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Public API — one function per backend action
// ---------------------------------------------------------------------------

export const api = {
  /** Verify Membership ID + Contact No resolve to the SAME member row. */
  verifyMember(membershipId, contactNo) {
    return callBackend('verifyMember', { membershipId, contactNo });
  },

  /** Record an Entry for an already-verified member. */
  recordEntry(membershipId, contactNo) {
    return callBackend('recordEntry', { membershipId, contactNo });
  },

  /** Record an Exit for an already-verified member (requires an open Entry). */
  recordExit(membershipId, contactNo) {
    return callBackend('recordExit', { membershipId, contactNo });
  },

  /** Today's Reception dashboard numbers + recent check-ins. */
  getReceptionSummary() {
    return callBackend('getReceptionSummary');
  },

  /** Live Attendance Feed (Attendance + Members, most recent first). */
  getLiveFeed(sinceIso) {
    return callBackend('getLiveFeed', { sinceIso });
  },

  /** Members list with search/filter. */
  searchMembers(query) {
    return callBackend('searchMembers', { query });
  },

  /** Full member profile + attendance calendar for one member. */
  getMemberProfile(membershipId, monthIso) {
    return callBackend('getMemberProfile', { membershipId, monthIso });
  },

  /** Admin: filtered attendance history. */
  getAttendanceHistory(filters) {
    return callBackend('getAttendanceHistory', filters);
  },

  /** Admin: membership status / expiry filtering. */
  getMembershipStatusList(filters) {
    return callBackend('getMembershipStatusList', filters);
  },

  /** Admin: crowd analytics by time-of-day. */
  getCrowdAnalytics(dateIso) {
    return callBackend('getCrowdAnalytics', { dateIso });
  },

  /** Public, no-PII crowd snapshot for embedding on the gym website. */
  getPublicCrowdView() {
    return callBackend('getPublicCrowdView');
  },

  /** Admin: read/write Settings (gym name/logo, closing time, expiry threshold, crowd bands). */
  getSettings() {
    return callBackend('getSettings');
  },
  updateSettings(settings) {
    return callBackend('updateSettings', settings);
  },

  /**
   * Upload a new gym logo. dataUrl is a base64 "data:image/..." string
   * from FileReader — the backend stores the image (Drive in production)
   * and returns its public URL.
   */
  uploadLogo(dataUrl) {
    return callBackend('uploadLogo', { dataUrl });
  },
};

// ---------------------------------------------------------------------------
// Mock backend (Stage 1 preview data — clearly marked, never used once
// GAS_WEB_APP_URL is set)
// ---------------------------------------------------------------------------

const MOCK_MEMBERS = [
  { clientName: 'Aarav Shah', contactNo: '9876543210', membershipId: '100234', clientId: 'C-0231', packageDetails: 'Gold — 12 Month', packageValidity: '2026-09-14', trainerName: 'Rohit Verma', status: 'Active', pendingPayment: 0, totalRewardPoints: 340 },
  { clientName: 'Meera Iyer', contactNo: '9988776655', membershipId: '100519', clientId: 'C-0512', packageDetails: 'Silver — 6 Month', packageValidity: '2026-08-22', trainerName: 'Neha Kapoor', status: 'Active', pendingPayment: 1200, totalRewardPoints: 120 },
  { clientName: 'Vikram Nair', contactNo: '9012345678', membershipId: '100882', clientId: 'C-0788', packageDetails: 'Platinum — 12 Month', packageValidity: '2026-01-05', trainerName: 'Rohit Verma', status: 'Active', pendingPayment: 0, totalRewardPoints: 980 },
];

/** In-memory attendance log for the mock backend, keyed by membershipId. */
const mockOpenEntries = new Map();
const mockRecentActivity = [];

/**
 * Mock Settings store, including gym branding. In production this lives in
 * the Settings sheet (see gas/Code.gs) and the logo is stored in Drive —
 * here it just lives in memory for the session so the UI can be previewed.
 */
const mockSettings = {
  gymName: 'AK PACK FITNES',
  gymLogoUrl: '',
  gymClosingTime: '22:00',
  expiringSoonDays: 4,
  crowdLowMax: 5,
  crowdModerateMax: 14,
};

function mockFindMember(membershipId, contactNo) {
  return MOCK_MEMBERS.find(
    (m) => m.membershipId === String(membershipId) && m.contactNo === String(contactNo)
  );
}

function mockMembershipStatus(validityDateIso) {
  const today = new Date();
  const validity = new Date(validityDateIso);
  const diffDays = Math.ceil((validity - today) / 86400000);
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 4) return 'Expiring Soon';
  return 'Active';
}

async function mockRouter(action, payload) {
  await new Promise((r) => setTimeout(r, 380)); // simulate network latency

  switch (action) {
    case 'verifyMember': {
      const member = mockFindMember(payload.membershipId, payload.contactNo);
      if (!member) {
        return Promise.reject(new ApiError('Membership ID and mobile number do not match our records.', 'NOT_FOUND'));
      }
      return {
        clientName: member.clientName,
        contactNo: member.contactNo,
        membershipId: member.membershipId,
        clientId: member.clientId,
        packageDetails: member.packageDetails,
        packageValidity: member.packageValidity,
        trainerName: member.trainerName,
        membershipStatus: mockMembershipStatus(member.packageValidity),
        hasOpenEntry: mockOpenEntries.has(member.membershipId),
      };
    }

    case 'recordEntry': {
      const member = mockFindMember(payload.membershipId, payload.contactNo);
      if (!member) throw new ApiError('Membership ID and mobile number do not match our records.', 'NOT_FOUND');
      if (mockOpenEntries.has(member.membershipId)) {
        throw new ApiError('This member already has an active entry today.', 'DUPLICATE_ENTRY');
      }
      const entryTime = new Date();
      mockOpenEntries.set(member.membershipId, entryTime);
      mockRecentActivity.unshift({ type: 'entry', member, time: entryTime });
      return { clientName: member.clientName, entryTime: entryTime.toISOString() };
    }

    case 'recordExit': {
      const member = mockFindMember(payload.membershipId, payload.contactNo);
      if (!member) throw new ApiError('Membership ID and mobile number do not match our records.', 'NOT_FOUND');
      const entryTime = mockOpenEntries.get(member.membershipId);
      if (!entryTime) {
        throw new ApiError('Exit cannot be recorded because no active entry was found.', 'NO_OPEN_ENTRY');
      }
      const exitTime = new Date();
      mockOpenEntries.delete(member.membershipId);
      mockRecentActivity.unshift({ type: 'exit', member, time: exitTime, entryTime });
      return { clientName: member.clientName, entryTime: entryTime.toISOString(), exitTime: exitTime.toISOString() };
    }

    case 'getReceptionSummary': {
      const todayEntries = mockRecentActivity.filter((a) => a.type === 'entry');
      const todayExits = mockRecentActivity.filter((a) => a.type === 'exit');
      const expired = MOCK_MEMBERS.filter((m) => mockMembershipStatus(m.packageValidity) === 'Expired').length;
      return {
        todayCheckIns: todayEntries.length,
        currentlyInside: mockOpenEntries.size,
        todayCheckOuts: todayExits.length,
        expiredMembers: expired,
        crowdLevel: mockOpenEntries.size >= 15 ? 'High' : mockOpenEntries.size >= 6 ? 'Moderate' : 'Low',
        crowdCapacityPct: Math.min(100, Math.round((mockOpenEntries.size / 25) * 100)),
        recent: mockRecentActivity.slice(0, 8).map((a) => ({
          type: a.type,
          clientName: a.member.clientName,
          membershipId: a.member.membershipId,
          time: a.time.toISOString(),
        })),
      };
    }

    case 'getSettings':
      return { ...mockSettings };

    case 'updateSettings': {
      Object.keys(payload || {}).forEach((key) => {
        if (payload[key] !== undefined) mockSettings[key] = payload[key];
      });
      return { ...mockSettings };
    }

    case 'uploadLogo': {
      if (!payload.dataUrl || !payload.dataUrl.startsWith('data:image/')) {
        throw new ApiError('Please choose a valid image file.', 'INVALID_IMAGE');
      }
      // In mock mode the data URL itself stands in for a hosted Drive URL.
      mockSettings.gymLogoUrl = payload.dataUrl;
      return { gymLogoUrl: payload.dataUrl };
    }

    default:
      throw new ApiError(`Mock backend has no handler for "${action}" yet.`, 'NOT_IMPLEMENTED');
  }
}
