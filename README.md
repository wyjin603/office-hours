# Office Hours & Lab Booking

A static booking page hosted on **GitHub Pages**. A student opens the URL, clicks an open
15-minute slot, types their name, and submits. Bookings are written to **your own Google
Sheet**, which you can read and export at any time. Students need no account of any kind.

- One person per 15-minute slot. Once taken, the slot shows `Booked · <name>` and is not clickable.
- Every booking returns a 6-character cancellation code so students can cancel themselves.
  On the same device the code is remembered, so cancelling is one click.
- Slots come from **weekly recurring blocks** plus **one-off dates** (lab sessions, make-up hours).
- Online bookings get an **auto-generated Google Meet link** and land on your Google Calendar.
  Cancelling removes the event.
- Free end to end. No server to run or pay for.

---

## How it fits together

GitHub Pages can only serve static files, so the data lives elsewhere:

| Piece | Where it runs | What it holds |
|---|---|---|
| `index.html` / `app.js` / `config.js` / `styles.css` | GitHub Pages | The page students see |
| `apps-script/Code.gs` | Google Apps Script, as you | Booking logic, calendar events |
| A Google Sheet | Your Google Drive | Every booking |

The repository holds no booking data. The only thing published with the site is the Apps
Script `/exec` URL, which has to be reachable by students' browsers by design.

---

## 1. Preview locally

From this folder:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. Set `apiUrl` to `'DEMO'` in `config.js` to try the page with no
backend — a yellow "Demo mode" banner appears and bookings live only in your own browser.

---

## 2. Set up the backend

### 2.1 Open the script editor

From your Google Sheet, choose **Extensions → Apps Script**. Opening it this way binds the
script to that sheet.

If you instead created a standalone project at <https://script.google.com>, that also works —
see `SPREADSHEET_ID` below.

### 2.2 Paste the code

Delete the placeholder `function myFunction() {}` and paste all of
[`apps-script/Code.gs`](apps-script/Code.gs).

```bash
cat apps-script/Code.gs | pbcopy
```

### 2.3 Fill in the settings at the top

```js
var SPREADSHEET_ID    = '';            // empty if bound via Extensions; otherwise the sheet id
var TIMEZONE          = 'America/New_York';  // must match `timezone` in config.js
var ADD_TO_CALENDAR   = true;
var CREATE_MEET_LINK  = true;
var CALENDAR_ID       = 'primary';
var IN_PERSON_PLACE   = '';            // office/room, written to the event location
var NOTIFY_EMAIL      = '';            // your address, to be mailed on each booking
```

The sheet id is the part of the sheet URL between `/d/` and `/edit`. Keep it out of a public
repository — it only needs to exist inside the Apps Script editor.

### 2.4 Enable the Calendar service

Google Meet links require the advanced Calendar service:

**Services (+)** in the left sidebar → **Google Calendar API** → **Add**. Leave the identifier
as `Calendar`.

### 2.5 Authorise and self-check

Save, pick **`setup`** in the function dropdown, and press **Run**. Google will ask for
authorisation: pick your account → **Advanced** → **Go to … (unsafe)** → **Allow**. The
"unsafe" warning is simply because the script has not been reviewed by Google; it is your own.

The execution log should show two OK lines:

```
OK  Sheet ready: "Bookings" in "<your sheet name>"
OK  Calendar ready: <your calendar> (America/New_York)
    Meet links: on
```

A `!!` line means the Calendar service was not added. Bookings still work in that case — the
code falls back gracefully — but online bookings get no Meet link.

### 2.6 Deploy

**Deploy → New deployment**, gear icon → **Web app**:

| Field | Value |
|---|---|
| Execute as | **Me (your account)** |
| Who has access | **Anyone** |

"Anyone" is required. "Anyone with a Google account" locks out students who are not signed in.

Copy the **Web app URL** (it ends in `/exec`) into `apiUrl` in [`config.js`](config.js). The
yellow demo banner disappears once the page can reach it.

> **Editing `Code.gs` later does nothing until you redeploy.**
> Deploy → Manage deployments → pencil icon → Version: **New version** → Deploy.
> The URL stays the same, so `config.js` needs no change. This is the single most common
> thing to forget.

---

## 3. Configure your hours

Everything below lives in [`config.js`](config.js):

```js
title: 'Office Hours & Lab Booking',
timezone: 'America/New_York',
use12Hour: true,               // true -> 4:00 - 4:15 PM;  false -> 16:00-16:15
daysAhead: 21,                 // open three weeks of recurring slots
minLeadMinutes: 60,            // booking closes an hour before each slot
showNames: true,               // show who booked a taken slot
askEmail: true,                // with an email the student gets a calendar invite

meeting: {
  defaultMode: 'either',       // 'online' | 'inperson' | 'either' (student chooses)
  location: 'SERC 359',        // shown to students for in-person bookings
},

// 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
// Always write 24-hour times; use12Hour only affects display.
recurring: [
  { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour' },
  { weekday: 4, start: '16:00', end: '18:00', label: 'Office Hour' },
],

// One-off dates show even when they fall beyond daysAhead
extraDates: [
  { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson' },
],

blackoutDates: ['2026-11-26'],   // closed all day
```

A continuous block is sliced into 15-minute slots automatically. `label` is what appears on
an open slot, so it is how you distinguish office hours from lab sessions.

With `defaultMode: 'either'` the student picks Online or In person in the booking dialog.
Adding `mode` to a block pins it to one format, and the slot is labelled accordingly.

---

## 4. Publish

```bash
git add -A && git commit -m "Update slots" && git push
```

In the repository: **Settings → Pages → Source** → `Deploy from a branch`, branch `main`,
folder `/ (root)`. The site appears at `https://<user>.github.io/<repo>/` after a minute.

Changing hours later means editing `config.js` and pushing. The Apps Script side is untouched.

> GitHub Pages serves private repositories only on Pro, Team, or Enterprise plans. On a free
> account the repository must be public — which is fine here, since no booking data is in it.

---

## 5. Day to day

- **See who booked what** — read the `Bookings` sheet. Only rows with `status = active` count;
  `cancelled` rows are kept as a record and do not hold a slot.
- **Cancel on a student's behalf** — change `status` from `active` to `cancelled`. The slot
  frees up on the next page refresh.
- **Add a booking by hand** — append a row with `slotId` in the form `2026-09-10_09:00` and
  `status` set to `active`.
- **A student lost their code** — read it from the `cancelCode` column, or just edit `status`.
- **Meeting links** live in the `meetUrl` column and in the calendar event.
- **Editing `status` by hand does not delete the calendar event.** Remove it in Calendar
  yourself. Cancelling through the page does delete it.

---

## 6. Privacy notes

- **Keep the sheet private.** Student names are in it. Sheet → Share → General access →
  **Restricted**. Students never touch the sheet directly; Apps Script writes on your behalf.
- **The public endpoint returns names and format only.** Notes, email addresses, cancellation
  codes and Meet links are never included in the data the page fetches. A Meet link is shown
  once, to the person who booked, and then kept in their own browser.
- Set `showNames: false` if taken slots should read just `Booked` with no name.
- The `/exec` URL is public by necessity. If it is ever abused, create a new deployment in
  Apps Script, disable the old one, and update `apiUrl`.
- Apps Script's free quotas are far above what a single course needs (tens of thousands of
  requests a day, 100 emails).

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `config.js` | **The file you actually edit**: hours, timezone, backend URL |
| `app.js` | Front-end logic — builds the grid, calls the backend, drives the dialogs |
| `styles.css` | Styling, including dark mode and small screens |
| `apps-script/Code.gs` | Backend, pasted into Google Apps Script |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |
