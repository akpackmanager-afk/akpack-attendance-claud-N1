# Pulse — Gym Management & Attendance

A premium, modular gym management and attendance web app. Frontend is plain
HTML/CSS/JS (GitHub Pages–ready); the backend is Google Sheets via Google
Apps Script. **Stage 1 (Reception) is complete and runnable right now in
mock-data mode.**

## What's in this build

```
index.html                 App shell: nav, topbar, Reception view (live) +
                            staged placeholders for Live Feed / Members /
                            Attendance / Admin
css/
  style.css                Design system: color/type tokens, layout shell,
                            cards, buttons, badges, forms, toasts
  reception.css             Reception-specific styles (scan card, mode
                            toggle, member result panel, recent activity)
js/
  app.js                   Nav routing between tabs, mobile drawer, clock
  api.js                   The ONLY module that talks to the backend.
                            Mock mode included so the UI works with zero
                            setup; flip to live by setting GAS_WEB_APP_URL.
  reception.js              Reception screen logic: verify → entry/exit
  utils/
    format.js               DD/MM/YYYY dates, 12-hour time, durations
    validation.js            Numeric-only input enforcement
    notifications.js         Toast messages
    icons.js                Inline SVG icon set (no external image deps)
gas/
  Code.gs                  Full Apps Script backend for Stage 1: sheet
                            auto-creation, member verification, entry/exit,
                            reception summary, missing-exit closeout,
                            system logging
```

Every later module (Live Feed, Members, Attendance History, Admin) adds its
own `css/<name>.css` + `js/<name>.js` and a new `case` in `api.js` / route in
`Code.gs` — nothing above needs to change shape to support that.

## Running it right now (no backend needed)

Just open `index.html` in a browser, or serve the folder statically:

```bash
npx serve .
```

`js/api.js` ships in **mock mode** by default (`GAS_WEB_APP_URL = ''`), with
three sample members baked in so you can try Entry/Exit end-to-end:

| Membership ID | Contact No | Name |
|---|---|---|
| 100234 | 9876543210 | Aarav Shah (Active) |
| 100519 | 9988776655 | Meera Iyer (Expiring Soon) |
| 100882 | 9012345678 | Vikram Nair (Active) |

## Connecting the real Google Sheets backend

1. **Create/open your Google Sheet** with the existing `Members` tab (exact
   15 columns as specified — this script never renames or reorders them).
2. In the Sheet, go to **Extensions → Apps Script**.
3. Paste the contents of `gas/Code.gs` into the script editor.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or **Anyone within [your domain]** for a
     private gym network — this is where access control actually lives,
     not in a frontend secret)
5. Copy the deployment's `/exec` URL.
6. In `js/api.js`, set:
   ```js
   export const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
   This automatically turns `MOCK_MODE` off.
7. (Recommended) Add a time-based trigger on `closeMissingExits` — Apps
   Script editor → **Triggers → Add Trigger** → time-driven, daily, a few
   minutes after your gym's closing time — so open entries never carry into
   the next day's live occupancy.

The `Attendance`, `Settings`, and `System Logs` sheets are created
automatically the first time the script runs — nothing to set up manually,
and existing data in them is never touched or duplicated on later runs.

## Gym branding (name + logo) — editable live, no redeploy

Default gym name is **AK PACK FITNES**. Both the name and logo are stored in
the `Settings` sheet (logo file lives in a Drive folder called
`Pulse Gym App — Branding`, created automatically) and can be changed at any
time from **Admin → Gym Branding** — this works even after the app is
published, since it's just a Settings write, not a code change.

- Changing the name updates the sidebar and browser tab immediately.
- Uploading a logo (PNG/JPG/WEBP/SVG, under 1.5MB) replaces the default
  mark icon in the sidebar everywhere in the app.
- "Remove Logo" reverts to the default mark icon without deleting the gym name.
- The first time `uploadLogo` runs, Apps Script will ask you to authorize
  Drive access — approve it once and it won't ask again.
- In **mock mode**, branding changes only persist for the current browser
  session (there's no real backend to write to yet) — connect
  `GAS_WEB_APP_URL` for changes to persist permanently.

## Design system

- **Palette**: ink `#14132b` on paper `#f6f5fb`, brand gradient
  indigo→violet (`#4f3fd6 → #a970e8`), status green/amber/red for
  Active/Expiring Soon/Expired.
- **Type**: Sora (display/headings), Inter (body/UI), JetBrains Mono
  (IDs, timestamps, numeric fields) — loaded from Google Fonts.
- **Signature element**: the Reception "scan ring" — a pulsing circular
  verification indicator that shifts from idle (soft indigo pulse) to
  verifying (grey pulse) to success/error (green/red), echoing the feel
  of a physical check-in scanner without literally depicting one.

## Deploying the frontend to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo → **Settings → Pages** → Deploy from branch → `main` / root.
3. No build step needed — it's static HTML/CSS/JS with native ES modules.

## Roadmap (per the original build plan)

- [x] **Stage 1** — Reception (this build)
- [ ] Stage 2 — Attendance History (Admin)
- [ ] Stage 3 — Live Attendance Feed
- [ ] Stage 4 — Members + Member Attendance Calendar
- [ ] Stage 5 — Admin shell + Membership Status
- [ ] Stage 6 — Crowd Analytics
- [ ] Stage 7 — Public Crowd View (no-PII embed)
- [ ] Stage 8 — Auth roles (Reception / Trainer / Admin), final responsive
      pass, GitHub deployment hardening

## Data integrity rules baked into Code.gs

- Membership ID + Contact No must match the **same** Members row — verified
  server-side, never independently.
- Entry is rejected if the member already has an open entry today.
- Exit is rejected unless a matching open Entry exists (`getOpenEntryRow`).
- Every verify/entry/exit attempt (success or failure) is written to
  `System Logs` for troubleshooting without exposing extra member PII.
- All dates render as `DD/MM/YYYY` and times as 12-hour `hh:mm AM/PM` via
  `js/utils/format.js` — no module formats dates on its own.
