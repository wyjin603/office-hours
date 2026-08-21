/* =============================================================
 *  Office hours booking — Google Apps Script backend
 *
 *  Google Meet links need the advanced Calendar service:
 *  Services (+) in the left sidebar -> Google Calendar API -> Add.
 *  Then run setup() once; it reports whether everything is wired up.
 *
 *  Remember: editing this file does nothing until you redeploy
 *  (Deploy -> Manage deployments -> pencil -> Version: New version).
 * ============================================================= */

/* ---------- Settings ---------- */

// Leave empty if this script was opened from the sheet's Extensions menu
// (it is then bound to that spreadsheet). For a standalone project created
// at script.google.com, paste the id from the sheet URL, the part between
// /d/ and /edit. Keep it out of a public repo — the value only needs to
// exist inside the Apps Script editor.
var SPREADSHEET_ID = '13B0Xy0XuhtQ3ZIg35GSoE1pk8dd7-dXMlaH18lpAHaE';

var SHEET_NAME = 'Bookings';          // Created automatically if missing
var TIMEZONE   = 'America/New_York';  // Must match `timezone` in config.js

var ADD_TO_CALENDAR   = true;      // Create a Google Calendar event per booking
var CREATE_MEET_LINK  = true;      // Attach a Google Meet link to online bookings
var CALENDAR_ID       = 'primary'; // 'primary' is your own default calendar
var EVENT_TITLE       = 'Office Hour';
var IN_PERSON_PLACE   = 'SERC 359';  // Written to the event's location field

var NOTIFY_EMAIL = '';             // Your address to get a mail on every booking/cancel

// Which host id in config.js is the account this script runs as.
// Every booking lands on this calendar, including a TA's, so you keep an
// overview — but you should not be pinged before an hour you are not attending.
// Bookings held by anyone else are therefore created with reminders switched
// off *on your copy only*. Guests keep their own default notifications.
// Leave empty to get reminders for everything.
var OWNER_HOST_ID = 'weiyi';

// Online bookings must carry an email so the student is a real calendar guest
// and can join the meeting without waiting to be admitted.
var REQUIRE_EMAIL_FOR_ONLINE = true;

// Permanent meeting rooms and host addresses, keyed by the host ids in config.js.
// Whoever owns a room is the person running that office hour, so they can always
// admit students themselves — nobody waits for the course owner to show up.
//
// ⚠️  DO NOT put real links here if this file lives in a public repository.
//     This is a template; the copy in Apps Script is what actually runs.
//     Set the real values in **Project Settings -> Script properties** instead:
//
//         room.<hostId>    https://…zoom.us/j/…  or  https://meet.google.com/…
//         email.<hostId>   person@example.com
//
//     using the same host ids as `hosts` in config.js.
//
//     Script properties live in Google's project settings, never in a file, so
//     nothing sensitive can be committed by accident. A host with no room falls
//     back to a freshly generated Google Meet link.
var HOST_LINKS  = {};
var HOST_EMAILS = {};

var MAX_NAME_LEN = 40;
var MAX_NOTE_LEN = 200;
var DEFAULT_SLOT_MINUTES = 15;

var HEADERS = ['id', 'slotId', 'date', 'start', 'end', 'name', 'email', 'note',
               'mode', 'host', 'meetUrl', 'eventId', 'cancelCode', 'status',
               'createdAt', 'updatedAt'];

/* ---------- Host rooms ---------- */

// Script properties are read once per execution and cached.
var _props = null;
function prop_(key) {
  if (_props === null) {
    try { _props = PropertiesService.getScriptProperties().getProperties() || {}; }
    catch (err) { _props = {}; }
  }
  return _props[key] || '';
}

function looksLikeEmail_(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v || '').trim());
}

function hostLink_(h)  { return h ? (HOST_LINKS[h]  || prop_('room.'  + h)) : ''; }

// Raw value, so setup() can point at a typo.
function hostEmailRaw_(h) { return h ? (HOST_EMAILS[h] || prop_('email.' + h)) : ''; }

// A malformed address would make the whole calendar insert fail, taking the
// event and the meeting link with it. Better to drop it and keep the booking.
function hostEmail_(h) {
  var v = hostEmailRaw_(h);
  return looksLikeEmail_(v) ? v : '';
}

// Every host id mentioned anywhere, so setup() can report on all of them.
function knownHosts_() {
  var ids = {};
  Object.keys(HOST_LINKS).forEach(function (h) { ids[h] = 1; });
  Object.keys(HOST_EMAILS).forEach(function (h) { ids[h] = 1; });
  if (_props === null) prop_('');
  Object.keys(_props).forEach(function (k) {
    var m = k.match(/^(?:room|email)\.(.+)$/);
    if (m) ids[m[1]] = 1;
  });
  return Object.keys(ids).sort();
}

/* ---------- Entry points ---------- */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  try {
    if (action === 'list') return json_({ ok: true, bookings: listActive_() });
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  try {
    if (body.action === 'book')   return json_(book_(body));
    if (body.action === 'cancel') return json_(cancel_(body));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- Actions ---------- */

function book_(b) {
  var slotId = String(b.slotId || '');
  if (!/^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/.test(slotId)) return { ok: false, error: 'bad_slot' };

  var name = String(b.name || '').trim();
  if (!name) return { ok: false, error: 'no_name' };
  name = name.substring(0, MAX_NAME_LEN);

  var note  = String(b.note || '').trim().substring(0, MAX_NOTE_LEN);
  var email = String(b.email || '').trim();
  if (email && !looksLikeEmail_(email)) return { ok: false, error: 'bad_email' };

  var mode = (b.mode === 'inperson') ? 'inperson' : 'online';
  if (mode === 'online' && REQUIRE_EMAIL_FOR_ONLINE && !email) return { ok: false, error: 'need_email' };

  var host  = String(b.host || '').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 24);
  var parts = slotId.split('_');
  var date  = parts[0], start = parts[1];
  var end   = /^\d{2}:\d{2}$/.test(String(b.end || '')) ? String(b.end)
                                                       : addMinutes_(start, DEFAULT_SLOT_MINUTES);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };

  try {
    var sh = getSheet_(), m = headerMap_(sh);
    var rows = sh.getDataRange().getValues();

    // One person per slot
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][m.slotId]) === slotId && String(rows[i][m.status]) === 'active') {
        return { ok: false, error: 'taken' };
      }
    }

    var cal = { eventId: '', meetUrl: '', warning: '' };
    if (ADD_TO_CALENDAR) {
      cal = createEvent_({
        date: date, start: start, end: end, name: name, email: email,
        note: note, mode: mode, host: host, label: String(b.label || '')
      });
    }

    var code = makeCode_();
    var now  = new Date();
    var row  = new Array(sh.getLastColumn()).fill('');
    function set(k, v) { if (m[k] !== undefined) row[m[k]] = v; }

    set('id', Utilities.getUuid());
    set('slotId', slotId);   set('date', date);     set('start', start);  set('end', end);
    set('name', name);       set('email', email);   set('note', note);    set('mode', mode);
    set('host', host);
    set('meetUrl', cal.meetUrl);  set('eventId', cal.eventId);
    set('cancelCode', code); set('status', 'active');
    set('createdAt', now);   set('updatedAt', now);
    sh.appendRow(row);

    notify_('New booking: ' + date + ' ' + start + ' — ' + name,
            name + ' booked ' + date + ' ' + start + '–' + end +
            '\n\nFormat: ' + (mode === 'online' ? 'Online' : 'In person') +
            (host ? '\nHost: ' + host : '') +
            (email ? '\nEmail: ' + email : '') +
            (note ? '\nNote: ' + note : '') +
            (cal.meetUrl ? '\nMeet: ' + cal.meetUrl : '') +
            (cal.warning ? '\n\n(!) Calendar: ' + cal.warning : ''));

    return { ok: true, cancelCode: code, meetUrl: cal.meetUrl, mode: mode, host: host,
             warning: cal.warning ? 'no_calendar' : '' };
  } finally {
    lock.releaseLock();
  }
}

function cancel_(b) {
  var slotId = String(b.slotId || '');
  var code   = String(b.code || '').trim();
  if (!slotId || !code) return { ok: false, error: 'missing' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };

  try {
    var sh = getSheet_(), m = headerMap_(sh);
    var rows = sh.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][m.slotId]) !== slotId || String(rows[i][m.status]) !== 'active') continue;
      if (String(rows[i][m.cancelCode]).toUpperCase() !== code.toUpperCase()) {
        return { ok: false, error: 'badcode' };
      }

      deleteEvent_(String(rows[i][m.eventId] || ''));

      sh.getRange(i + 1, m.status + 1).setValue('cancelled');
      sh.getRange(i + 1, m.updatedAt + 1).setValue(new Date());

      notify_('Booking cancelled: ' + rows[i][m.date] + ' ' + rows[i][m.start],
              rows[i][m.name] + ' cancelled ' + rows[i][m.date] + ' at ' + rows[i][m.start]);

      return { ok: true };
    }
    return { ok: false, error: 'notfound' };
  } finally {
    lock.releaseLock();
  }
}

// Public payload is deliberately minimal: name and format only.
// Notes, emails, cancellation codes and Meet links are never exposed.
function listActive_() {
  var sh = getSheet_(), m = headerMap_(sh);
  var rows = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][m.status]) !== 'active') continue;
    out[String(rows[i][m.slotId])] = {
      name: String(rows[i][m.name]),
      mode: String(rows[i][m.mode] || '')
    };
  }
  return out;
}

/* ---------- Calendar / Meet ---------- */

function createEvent_(o) {
  var out = { eventId: '', meetUrl: '', warning: '' };
  try {
    var ev = {
      summary: (o.label || EVENT_TITLE) + ' — ' + o.name,
      description: (o.note ? 'Student note: ' + o.note + '\n\n' : '') +
                   'Booked through the office hours page.',
      start: { dateTime: o.date + 'T' + o.start + ':00', timeZone: TIMEZONE },
      end:   { dateTime: o.date + 'T' + o.end   + ':00', timeZone: TIMEZONE }
    };

    if (o.mode === 'inperson' && IN_PERSON_PLACE) ev.location = IN_PERSON_PLACE;

    // Invite the student and, when known, whoever is running this block, so the
    // appointment lands on the host's own calendar.
    var guests = [];
    if (o.email) guests.push({ email: o.email });
    var hostEmail = hostEmail_(o.host);
    if (hostEmail && hostEmail !== o.email) guests.push({ email: hostEmail });
    if (guests.length) ev.attendees = guests;

    // Reminders set at insert time apply to the organiser's copy of the event.
    // Each guest keeps whatever defaults their own calendar has.
    if (OWNER_HOST_ID && o.host && o.host !== OWNER_HOST_ID) {
      ev.reminders = { useDefault: false, overrides: [] };
    }

    var params = { sendUpdates: guests.length ? 'all' : 'none' };

    // A host's own permanent room wins: its owner is the person actually holding
    // the hour, so they can admit anyone. Otherwise generate a one-off Meet link.
    var fixedRoom = (o.mode === 'online') ? hostLink_(o.host) : '';
    if (fixedRoom) {
      ev.location = fixedRoom;
      ev.description += '\n\nMeeting link: ' + fixedRoom;
    } else if (o.mode === 'online' && CREATE_MEET_LINK) {
      ev.conferenceData = {
        createRequest: {
          requestId: Utilities.getUuid(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      };
      params.conferenceDataVersion = 1;
    }

    var created = Calendar.Events.insert(ev, CALENDAR_ID, params);
    out.eventId = created.id || '';
    out.meetUrl = fixedRoom || created.hangoutLink || '';
    if (o.mode === 'online' && !out.meetUrl) out.warning = 'no meeting link';
  } catch (err) {
    // A calendar problem must never block the booking itself — record the reason,
    // still hand out the host's permanent room if there is one, and write the row.
    out.warning = String(err);
    if (o.mode === 'online') out.meetUrl = hostLink_(o.host);
  }
  return out;
}

function deleteEvent_(eventId) {
  if (!eventId || !ADD_TO_CALENDAR) return;
  try {
    Calendar.Events.remove(CALENDAR_ID, eventId, { sendUpdates: 'all' });
  } catch (err) { /* already deleted by hand, or gone — nothing to do */ }
}

/* ---------- Helpers ---------- */

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet found. Set SPREADSHEET_ID, or open this script from the sheet via Extensions > Apps Script.');

  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange('B:E').setNumberFormat('@');   // keep dates/times as text, not coerced values
    sh.getRange('L:L').setNumberFormat('@');   // cancellation codes
  } else {
    // Migration: append only the columns that are missing, leaving existing rows untouched
    var cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
                .map(function (x) { return String(x); });
    var missing = HEADERS.filter(function (h) { return cur.indexOf(h) === -1; });
    if (missing.length) sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
  }

  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

// Header name -> zero-based column index. Reading by name keeps the code
// correct even after columns are added.
function headerMap_(sh) {
  var row = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var m = {};
  for (var i = 0; i < row.length; i++) m[String(row[i])] = i;
  return m;
}

function addMinutes_(hm, mins) {
  var p = hm.split(':');
  var t = (+p[0]) * 60 + (+p[1]) + mins;
  return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
}

function makeCode_() {
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // 0/O and 1/I omitted on purpose
  var s = '';
  for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function notify_(subject, body) {
  if (!NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(NOTIFY_EMAIL, subject, body); } catch (e) { /* out of quota — not worth failing over */ }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Run this by hand in the editor and read the execution log ---------- */
function setup() {
  var sh = getSheet_();
  Logger.log('OK  Sheet ready: "' + SHEET_NAME + '" in "' + sh.getParent().getName() + '"');

  if (!ADD_TO_CALENDAR) { Logger.log('--  ADD_TO_CALENDAR is false, no events will be created.'); return; }
  try {
    var cal = Calendar.Calendars.get(CALENDAR_ID);
    Logger.log('OK  Calendar ready: ' + cal.summary + ' (' + cal.timeZone + ')');
    Logger.log('    Meet links: ' + (CREATE_MEET_LINK ? 'on' : 'off'));
  } catch (err) {
    Logger.log('!!  Calendar advanced service is not enabled - online bookings get no Meet link.');
    Logger.log('    Fix: Services (+) in the left sidebar -> Google Calendar API -> Add, then run setup again.');
    Logger.log('    (' + err + ')');
  }

  var hosts = knownHosts_();
  if (!hosts.length) {
    Logger.log('!!  No host rooms configured. Add script properties like');
    Logger.log('    room.<hostId> and email.<hostId> under Project Settings.');
    return;
  }
  Logger.log('--  Reminders: ' + (OWNER_HOST_ID
    ? 'only for bookings held by "' + OWNER_HOST_ID + '"'
    : 'on for every booking (set OWNER_HOST_ID to change)'));

  Logger.log('--  Host rooms:');
  hosts.forEach(function (h) {
    var raw = hostEmailRaw_(h);
    var mail = !raw                  ? 'NO EMAIL - will not reach their calendar'
             : !looksLikeEmail_(raw) ? 'INVALID EMAIL "' + raw + '" - ignored, fix email.' + h
             :                         'invited as ' + raw;
    Logger.log('      ' + h + ': ' +
      (hostLink_(h) ? 'own room ' + hostLink_(h) : 'auto-generated Meet link') + ', ' + mail);
  });
}
