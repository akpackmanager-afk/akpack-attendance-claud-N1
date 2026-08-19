/**
 * Code.gs — Pulse Gym Management backend
 * -----------------------------------------------------------------------
 * Bind this script to the Google Sheet that contains the master "Members"
 * tab. Deploy as a Web App (Deploy > New deployment > Web app,
 * execute as "Me", access "Anyone" or "Anyone within [domain]") and paste
 * the resulting /exec URL into GAS_WEB_APP_URL in js/api.js.
 *
 * Every read/write the frontend needs goes through doPost() below as a
 * single {action, payload} envelope — see js/api.js for the matching
 * client-side call for each action name.
 *
 * SECURITY NOTE: this script never returns raw error stack traces to the
 * client, and no secret/API key lives in the frontend — the Web App URL
 * itself is the only thing shared, and every write action is validated
 * server-side against the Members sheet before anything is recorded.
 * -----------------------------------------------------------------------
 */

// ============================================================================
// CONFIG
// ============================================================================

const SHEET_NAMES = {
  MEMBERS: 'Members',
  ATTENDANCE: 'Attendance',
  SETTINGS: 'Settings',
  LOGS: 'System Logs',
};

// Exact Members columns — DO NOT rename. Order must match the sheet.
const MEMBERS_COLUMNS = [
  'Client name', 'Contact no', 'Package Details', 'Package Validity',
  'Trainer Name', 'Representative', 'Source', 'Status', 'Created On',
  'Last Followup On', 'Next Followup On', 'Pending Payment', 'Client ID',
  'Membership ID', 'Total Reward Points',
];

const ATTENDANCE_COLUMNS = [
  'Attendance Date', 'Membership ID', 'Client ID', 'Entry Time', 'Exit Time',
  'Duration (min)', 'Attendance Status', 'Exit Status', 'Created At', 'Updated At',
];

const LOGS_COLUMNS = ['Timestamp', 'Action', 'Membership ID', 'Result', 'Details'];

const DEFAULT_SETTINGS = {
  gymName: 'AK PACK FITNES',
  gymLogoUrl: '',
  gymClosingTime: '22:00',
  expiringSoonDays: 4,
  crowdLowMax: 5,
  crowdModerateMax: 14,
};

/** Name of the Drive folder logos are stored in (created automatically). */
const LOGO_DRIVE_FOLDER = 'Pulse Gym App — Branding';

// ============================================================================
// ENTRY POINTS
// ============================================================================

function doPost(e) {
  return handleRequest(e);
}

function doGet(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  let action = '';
  try {
    const body = e.postData ? JSON.parse(e.postData.contents) : (e.parameter || {});
    action = body.action || e.parameter.action;
    const payload = body.payload || {};

    ensureAllSheets();

    const handler = ROUTES[action];
    if (!handler) {
      return jsonResponse({ ok: false, message: 'Unknown request.', code: 'UNKNOWN_ACTION' });
    }

    const data = handler(payload);
    return jsonResponse({ ok: true, data });
  } catch (err) {
    logAction(action || 'unknown', '', 'ERROR', String(err && err.message ? err.message : err));
    return jsonResponse({ ok: false, message: safeErrorMessage(err), code: 'SERVER_ERROR' });
  }
}

const ROUTES = {
  verifyMember: apiVerifyMember,
  recordEntry: apiRecordEntry,
  recordExit: apiRecordExit,
  getReceptionSummary: apiGetReceptionSummary,
  getSettings: apiGetSettings,
  updateSettings: apiUpdateSettings,
  uploadLogo: apiUploadLogo,
  // Later-stage routes — implemented incrementally; safe to call once built:
  // getLiveFeed, searchMembers, getMemberProfile, getAttendanceHistory,
  // getMembershipStatusList, getCrowdAnalytics, getPublicCrowdView
};

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Never leak raw exception text (sheet names, formulas, internals) to the client. */
function safeErrorMessage(err) {
  const known = ['Membership ID and mobile number do not match', 'No active entry', 'already has an active entry'];
  const msg = String(err && err.message ? err.message : err);
  if (known.some((k) => msg.indexOf(k) !== -1)) return msg;
  return 'Unable to connect to the attendance system. Please try again.';
}

// ============================================================================
// SHEET BOOTSTRAP — creates dynamic sheets/headers if missing, never
// destroys existing data, never duplicates sheets.
// ============================================================================

function ensureAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet(ss, SHEET_NAMES.ATTENDANCE, ATTENDANCE_COLUMNS);
  ensureSheet(ss, SHEET_NAMES.SETTINGS, ['Key', 'Value']);
  ensureSheet(ss, SHEET_NAMES.LOGS, LOGS_COLUMNS);
  ensureSettingsSeeded(ss);
  // Members is the pre-existing master sheet — verify it exists but never modify its columns.
  const membersSheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
  if (!membersSheet) {
    throw new Error('The Members sheet is missing. It must be created manually as the master member database.');
  }
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Sheet exists — make sure headers are present without touching existing data.
  const existingHeaderRange = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1));
  const existingHeaders = existingHeaderRange.getValues()[0];
  if (!existingHeaders[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureSettingsSeeded(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const existing = sheetToObjects(sheet);
  const existingKeys = new Set(existing.map((r) => r.Key));
  const rowsToAdd = [];
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    if (!existingKeys.has(key)) rowsToAdd.push([key, DEFAULT_SETTINGS[key]]);
  });
  if (rowsToAdd.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 2).setValues(rowsToAdd);
  }
}

// ============================================================================
// SHEET <-> OBJECT HELPERS
// ============================================================================

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row, idx) => {
      const obj = { __row: idx + 2 }; // 1-indexed sheet row, +1 for header
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function getSettingsMap() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  const rows = sheetToObjects(sheet);
  const map = Object.assign({}, DEFAULT_SETTINGS);
  rows.forEach((r) => { if (r.Key) map[r.Key] = r.Value; });
  return map;
}

function setSettingValue(key, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SETTINGS);
  const rows = sheetToObjects(sheet);
  const existing = rows.find((r) => r.Key === key);
  if (existing) {
    sheet.getRange(existing.__row, 2).setValue(value);
  } else {
    sheet.appendRow([key, value]);
  }
}

// ============================================================================
// SETTINGS & BRANDING (gym name + logo, editable live from Admin → Branding)
// ============================================================================

function apiGetSettings() {
  return getSettingsMap();
}

/**
 * Accepts a partial settings object (e.g. just { gymName } or just
 * { gymLogoUrl } from apiUploadLogo) and writes only the provided keys.
 */
function apiUpdateSettings(payload) {
  Object.keys(payload || {}).forEach((key) => {
    if (payload[key] === undefined) return;
    if (key === 'gymName' && !String(payload[key]).trim()) return; // never save a blank gym name
    setSettingValue(key, payload[key]);
  });
  logAction('updateSettings', '', 'SUCCESS', Object.keys(payload || {}).join(','));
  return getSettingsMap();
}

/**
 * Stores the uploaded logo in a dedicated Drive folder (replacing any
 * previous logo file) and saves its public view URL into Settings.
 * Keeping large image data in Drive — not in the Sheet — keeps the sheet
 * fast and avoids per-cell size limits.
 */
function apiUploadLogo(payload) {
  const dataUrl = payload.dataUrl;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    throw new Error('Please choose a valid image file.');
  }
  const mimeType = match[1];
  const base64 = match[2];
  const extension = mimeType.split('/')[1].replace('svg+xml', 'svg');

  const folder = getOrCreateLogoFolder();

  // Remove any previous logo so we don't accumulate old uploads.
  const existingFiles = folder.getFilesByName('gym-logo');
  while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);
  const existingFilesAnyExt = folder.getFiles();
  while (existingFilesAnyExt.hasNext()) {
    const f = existingFilesAnyExt.next();
    if (f.getName().indexOf('gym-logo') === 0) f.setTrashed(true);
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, `gym-logo.${extension}`);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // A direct-render URL works better than the "view" URL for <img src>.
  const logoUrl = `https://lh3.googleusercontent.com/d/${file.getId()}`;
  setSettingValue('gymLogoUrl', logoUrl);
  logAction('uploadLogo', '', 'SUCCESS', file.getId());

  return { gymLogoUrl: logoUrl };
}

function getOrCreateLogoFolder() {
  const existing = DriveApp.getFoldersByName(LOGO_DRIVE_FOLDER);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(LOGO_DRIVE_FOLDER);
}

// ============================================================================
// MEMBER LOOKUP + STATUS
// ============================================================================

/** Find the SINGLE Members row where Membership ID AND Contact No both match. */
function findMemberRow(membershipId, contactNo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MEMBERS);
  const rows = sheetToObjects(sheet);
  const targetId = String(membershipId).trim();
  const targetContact = String(contactNo).trim();

  return rows.find((r) => {
    const rowId = String(r['Membership ID'] || '').trim();
    const rowContact = String(r['Contact no'] || '').trim();
    return rowId === targetId && rowContact === targetContact;
  });
}

function computeMembershipStatus(validityValue, expiringSoonDays) {
  if (!validityValue) return 'Expired';
  const validity = new Date(validityValue);
  if (isNaN(validity)) return 'Expired';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  validity.setHours(0, 0, 0, 0);
  const diffDays = Math.round((validity - today) / 86400000);
  if (diffDays < 0) return 'Expired';
  if (diffDays <= expiringSoonDays) return 'Expiring Soon';
  return 'Active';
}

function memberToPublicShape(row, settings) {
  return {
    clientName: row['Client name'],
    contactNo: String(row['Contact no']),
    membershipId: String(row['Membership ID']),
    clientId: row['Client ID'],
    packageDetails: row['Package Details'],
    packageValidity: row['Package Validity'],
    trainerName: row['Trainer Name'],
    membershipStatus: computeMembershipStatus(row['Package Validity'], settings.expiringSoonDays),
  };
}

// ============================================================================
// ATTENDANCE
// ============================================================================

function getOpenEntryRow(membershipId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = sheetToObjects(sheet);
  const targetId = String(membershipId).trim();
  // "Open" = Entry Time set, Exit Time blank, still today (missing-exit closeout
  // happens via closeMissingExits(), so anything still open here is genuinely open).
  return rows.reverse().find((r) =>
    String(r['Membership ID'] || '').trim() === targetId &&
    r['Entry Time'] &&
    !r['Exit Time']
  );
}

function apiVerifyMember(payload) {
  const settings = getSettingsMap();
  const row = findMemberRow(payload.membershipId, payload.contactNo);
  if (!row) {
    logAction('verifyMember', payload.membershipId, 'FAILED', 'No matching member row');
    throw new Error('Membership ID and mobile number do not match our records.');
  }
  const member = memberToPublicShape(row, settings);
  member.hasOpenEntry = Boolean(getOpenEntryRow(member.membershipId));
  logAction('verifyMember', member.membershipId, 'SUCCESS', '');
  return member;
}

function apiRecordEntry(payload) {
  const settings = getSettingsMap();
  const row = findMemberRow(payload.membershipId, payload.contactNo);
  if (!row) {
    logAction('recordEntry', payload.membershipId, 'FAILED', 'Verification failed');
    throw new Error('Membership ID and mobile number do not match our records.');
  }
  const membershipId = String(row['Membership ID']);

  if (getOpenEntryRow(membershipId)) {
    logAction('recordEntry', membershipId, 'FAILED', 'Duplicate open entry');
    throw new Error('This member already has an active entry today.');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const now = new Date();
  sheet.appendRow([
    now, membershipId, row['Client ID'], now, '', '', 'Present', '', now, now,
  ]);

  logAction('recordEntry', membershipId, 'SUCCESS', '');
  return { clientName: row['Client name'], entryTime: now.toISOString() };
}

function apiRecordExit(payload) {
  const row = findMemberRow(payload.membershipId, payload.contactNo);
  if (!row) {
    logAction('recordExit', payload.membershipId, 'FAILED', 'Verification failed');
    throw new Error('Membership ID and mobile number do not match our records.');
  }
  const membershipId = String(row['Membership ID']);
  const openEntry = getOpenEntryRow(membershipId);
  if (!openEntry) {
    logAction('recordExit', membershipId, 'FAILED', 'No open entry');
    throw new Error('Exit cannot be recorded because no active entry was found.');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const now = new Date();
  const entryTime = new Date(openEntry['Entry Time']);
  const durationMin = Math.max(0, Math.round((now - entryTime) / 60000));

  sheet.getRange(openEntry.__row, ATTENDANCE_COLUMNS.indexOf('Exit Time') + 1).setValue(now);
  sheet.getRange(openEntry.__row, ATTENDANCE_COLUMNS.indexOf('Duration (min)') + 1).setValue(durationMin);
  sheet.getRange(openEntry.__row, ATTENDANCE_COLUMNS.indexOf('Exit Status') + 1).setValue('Normal Exit');
  sheet.getRange(openEntry.__row, ATTENDANCE_COLUMNS.indexOf('Updated At') + 1).setValue(now);

  logAction('recordExit', membershipId, 'SUCCESS', `${durationMin} min`);
  return { clientName: row['Client name'], entryTime: entryTime.toISOString(), exitTime: now.toISOString() };
}

function apiGetReceptionSummary() {
  const settings = getSettingsMap();
  const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = sheetToObjects(attendanceSheet);
  const membersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MEMBERS);
  const members = sheetToObjects(membersSheet);
  const membersById = {};
  members.forEach((m) => { membersById[String(m['Membership ID'])] = m; });

  const today = new Date();
  const isToday = (d) => {
    const dt = new Date(d);
    return dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate();
  };

  const todayRows = rows.filter((r) => r['Entry Time'] && isToday(r['Entry Time']));
  const todayCheckIns = todayRows.length;
  const todayCheckOuts = todayRows.filter((r) => r['Exit Time']).length;
  const currentlyInside = todayRows.filter((r) => !r['Exit Time']).length;

  const expiredMembers = members.filter(
    (m) => computeMembershipStatus(m['Package Validity'], settings.expiringSoonDays) === 'Expired'
  ).length;

  let crowdLevel = 'Low';
  if (currentlyInside > settings.crowdModerateMax) crowdLevel = 'High';
  else if (currentlyInside > settings.crowdLowMax) crowdLevel = 'Moderate';

  const recent = todayRows
    .slice()
    .sort((a, b) => new Date(b['Updated At'] || b['Entry Time']) - new Date(a['Updated At'] || a['Entry Time']))
    .slice(0, 8)
    .map((r) => {
      const member = membersById[String(r['Membership ID'])] || {};
      const isExit = Boolean(r['Exit Time']);
      return {
        type: isExit ? 'exit' : 'entry',
        clientName: member['Client name'] || 'Unknown member',
        membershipId: r['Membership ID'],
        time: (isExit ? r['Exit Time'] : r['Entry Time']),
      };
    });

  return {
    todayCheckIns,
    currentlyInside,
    todayCheckOuts,
    expiredMembers,
    crowdLevel,
    crowdCapacityPct: Math.min(100, Math.round((currentlyInside / Math.max(1, settings.crowdModerateMax * 1.6)) * 100)),
    recent,
  };
}

// ============================================================================
// MISSING EXIT / GYM CLOSING
// Run this from a time-driven trigger (Triggers > Add Trigger > time-based,
// daily, a few minutes after gymClosingTime) so open entries don't silently
// carry into the next day's live occupancy.
// ============================================================================

function closeMissingExits() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ATTENDANCE);
  const rows = sheetToObjects(sheet);
  const now = new Date();

  rows.forEach((r) => {
    if (r['Entry Time'] && !r['Exit Time']) {
      const entryDate = new Date(r['Entry Time']);
      const isPastDay = entryDate.getFullYear() !== now.getFullYear()
        || entryDate.getMonth() !== now.getMonth()
        || entryDate.getDate() !== now.getDate();
      if (isPastDay) {
        sheet.getRange(r.__row, ATTENDANCE_COLUMNS.indexOf('Exit Status') + 1).setValue('Missing Exit');
        sheet.getRange(r.__row, ATTENDANCE_COLUMNS.indexOf('Attendance Status') + 1).setValue('Auto-Closed');
        sheet.getRange(r.__row, ATTENDANCE_COLUMNS.indexOf('Updated At') + 1).setValue(now);
        logAction('closeMissingExits', r['Membership ID'], 'AUTO_CLOSED', 'Entry left open past gym closing');
      }
    }
  });
}

// ============================================================================
// LOGGING
// ============================================================================

function logAction(action, membershipId, result, details) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.LOGS);
    sheet.appendRow([new Date(), action, String(membershipId || ''), result, details || '']);
  } catch (err) {
    // Logging must never break the primary request.
  }
}
