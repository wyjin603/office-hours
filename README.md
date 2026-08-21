# Office Hours & Lab Booking

A static booking page hosted on **GitHub Pages**. A student opens the URL, clicks an open
15-minute slot, types their name, and submits. Bookings are written to **your own Google
Sheet**, which you can read and export at any time. Students need no account of any kind.

- One person per 15-minute slot. Once taken, the slot shows `Booked · <name>` and is not clickable.
- Every booking returns a 6-character cancellation code so students can cancel themselves.
  On the same device the code is remembered, so cancelling is one click.
- Slots come from **weekly recurring blocks** plus **one-off dates** (lab sessions, make-up hours).
- Online bookings hand out a meeting link and create a Google Calendar event. Cancelling
  removes the event again.
- Office hours can be **split between several people**. Each host has their own permanent
  meeting room, is invited to their own bookings, and therefore sees them on their own
  calendar with the usual reminders — nobody has to be present for anyone else's hour.
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
var REQUIRE_EMAIL_FOR_ONLINE = true;   // online bookings must carry an email
```

Meeting rooms are **not** set here — see [Sharing hours with TAs](#31-sharing-hours-with-tas).

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
requireEmailForOnline: true,   // and it becomes mandatory for online bookings

meeting: {
  defaultMode: 'either',       // 'online' | 'inperson' | 'either' (student chooses)
  location: 'SERC 359',        // shown to students for in-person bookings
  platformName: 'Zoom',        // 'Zoom' | 'Google Meet' | '' for a neutral "meeting link"
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

## 3.1 Sharing hours with TAs

`config.js` lists who holds office hours, and each block says which of them it belongs to:

```js
hosts: {
  alex: { name: 'Alex' },
  sam:  { name: 'Sam'  },
},
defaultHost: 'alex',

recurring: [
  { weekday: 1, start: '11:00', end: '13:00', label: 'Office Hour', host: 'sam'  },
  { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour', host: 'alex' },
],
```

Blocks on the same day **must not overlap** — where two cover the same time, the first one
listed wins and the other is silently dropped. Split a day by giving people adjacent ranges,
as above.

Once more than one host appears anywhere in the schedule, open slots show the host's name
instead of the label, so a student knows who they are booking before they click.

### Meeting rooms

Give each person their own permanent room — a Zoom personal meeting room, a Google Meet link,
anything with a stable URL. The code never inspects the link; it is only a string handed to
whoever booked.

This matters for more than tidiness. A meeting link admits invited guests directly, but anyone
else has to knock and wait for a host to let them in. If every hour ran through one person's
room, a TA holding office hours could be left unable to admit their own student. When the room
belongs to the person actually running the hour, they are always the one who can open the door.

**Set the links as script properties, never in a file.** In the Apps Script editor:
**Project Settings → Script properties → Add script property**, one row per host:

| Property | Value |
|---|---|
| `room.<hostId>` | the meeting URL |
| `email.<hostId>` | the host's email address |

`<hostId>` is the key used in `hosts` in `config.js`. A host with no `room.` property falls
back to a freshly generated Google Meet link per booking.

Script properties live in Google's project settings rather than in code, so nothing sensitive
can be committed by accident. **Do not fill in `HOST_LINKS` in `apps-script/Code.gs`** — that
file is committed to the repository and, on a public repo, served by GitHub Pages alongside
the site. It is a template, not the running copy.

`email.<hostId>` is what puts a booking on a TA's own calendar: the host is added as a guest,
so the appointment appears in their Google Calendar with their normal notifications. Ask each
TA to accept the first invitation — under Google Calendar → Settings → Event settings, "Add
invitations to my calendar" must not be set to "When I respond in email" if they want events
to appear automatically.

Running `setup` prints what each host resolved to, which is the quickest way to catch a typo
in a property key or a malformed address:

```
--  Host rooms:
      alex: own room https://…, invited as alex@example.edu
      sam:  own room https://…, INVALID EMAIL "sam@example" - ignored, fix email.sam
```

An address that does not parse is dropped rather than passed to Calendar, because a bad
attendee makes the whole event insert fail — which would cost you the event *and* the
meeting link. The booking itself always survives.

### Zoom rooms

A Zoom personal meeting room (PMI) is a permanent room shared by every booking, so **turn on
the waiting room**. Without it, the student booked at 4:15 walks straight into the 4:00
meeting. With it, the host admits people one at a time.

Google Meet links behave as if the waiting room were always on: anyone not on the invite has
to knock.

If your Zoom account requires authenticated users, students must sign in with an institutional
account to join. That is usually fine for a course, but worth saying on the page.

Every booking also lands on the calendar the script runs as (`CALENDAR_ID`, `primary` by
default), so the course owner sees all of them. Point `CALENDAR_ID` at a dedicated secondary
calendar if you would rather keep them out of your main one.

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
- **Who was booked** is in the `host` column.
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
- **Meeting-room links belong in script properties, not in any file.** Everything in this
  repository — `config.js` and `apps-script/Code.gs` alike — is served with the site on a
  public repo and readable by anyone.
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
