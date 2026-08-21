/* =============================================================
 *  Front-end logic. You normally don't need to touch this file —
 *  everything configurable lives in config.js.
 * ============================================================= */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var DEMO = !CONFIG.apiUrl || CONFIG.apiUrl === 'DEMO' || CONFIG.apiUrl.indexOf('http') !== 0;
  var LS_CODES = 'ohb.codes.v1';
  var LS_DEMO = 'ohb.demo.v1';

  var state = {
    loaded: false,  // slots stay disabled until the first fetch lands, to prevent mis-clicks
    bookings: {},   // slotId -> { name, mode }
    days: [],       // [{ date, slots: [...] }]
    pending: null,
    timer: null
  };

  /* ---------------- Cancellation codes kept in localStorage ---------------- */
  function myCodes() {
    try { return JSON.parse(localStorage.getItem(LS_CODES)) || {}; } catch (e) { return {}; }
  }
  function saveCode(slotId, rec) {
    var m = myCodes();
    m[slotId] = rec;
    localStorage.setItem(LS_CODES, JSON.stringify(m));
  }
  function dropCode(slotId) {
    var m = myCodes();
    delete m[slotId];
    localStorage.setItem(LS_CODES, JSON.stringify(m));
  }
  function lastOf(field) {
    var m = myCodes(), keys = Object.keys(m);
    return keys.length ? (m[keys[keys.length - 1]][field] || '') : '';
  }
  function meetCfg() { return CONFIG.meeting || {}; }
  // 'Zoom link' / 'Google Meet link' / plain 'meeting link'
  function linkWord() {
    var p = meetCfg().platformName;
    return p ? p + ' link' : 'meeting link';
  }
  function hostOf(s) { return s.host || CONFIG.defaultHost || ''; }
  function hostName(id) {
    var h = (CONFIG.hosts || {})[id];
    return h ? (h.name || id) : '';
  }
  function placeOf(slot) {
    var h = (CONFIG.hosts || {})[hostOf(slot)];
    return (h && h.location) || meetCfg().location || '';
  }
  // Only worth naming the host on a slot chip when the schedule has more than one.
  function manyHosts() {
    var seen = {};
    state.days.forEach(function (d) {
      d.slots.forEach(function (x) { seen[hostOf(x)] = 1; });
    });
    return Object.keys(seen).filter(function (k) { return !!k; }).length > 1;
  }
  function modeOf(s) { return s.mode || meetCfg().defaultMode || 'either'; }
  function modeLabel(mode) {
    var mc = meetCfg();
    return mode === 'online' ? (mc.onlineLabel || 'Online')
         : mode === 'inperson' ? (mc.inPersonLabel || 'In person') : '';
  }

  /* ---------------- Time helpers ---------------- */
  function toMin(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function toHM(n) {
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  }
  function parseYMD(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

  // Current time in the configured zone -> { date: 'YYYY-MM-DD', time: 'HH:MM' }
  function nowInTZ() {
    var opts = {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    };
    if (CONFIG.timezone) opts.timeZone = CONFIG.timezone;
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
    } catch (e) {                       // Fall back to local time if the zone name is invalid
      delete opts.timeZone;
      parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
    }
    var p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
  }

  function tzLabel() {
    if (!CONFIG.timezone) return 'Times shown in your local time zone';
    try {
      var name = new Intl.DateTimeFormat('en-US', {
        timeZone: CONFIG.timezone, timeZoneName: 'short'
      }).formatToParts(new Date()).filter(function (x) { return x.type === 'timeZoneName'; })[0];
      return 'All times ' + CONFIG.timezone.split('/').pop().replace(/_/g, ' ') +
             (name ? ' (' + name.value + ')' : '');
    } catch (e) { return 'Times shown in your local time zone'; }
  }

  // '14:05' -> '2:05 PM' (or unchanged when use12Hour is false)
  function fmtTime(hm, withMeridiem) {
    if (!CONFIG.use12Hour) return hm;
    var m = toMin(hm), h = Math.floor(m / 60), mm = m % 60;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(mm).padStart(2, '0') + (withMeridiem === false ? '' : ' ' + ap);
  }
  function meridiem(hm) { return toMin(hm) < 720 ? 'AM' : 'PM'; }

  // A range -> '2:00 - 2:15 PM' (the meridiem is printed once when both halves match)
  function fmtRange(start, end) {
    if (!CONFIG.use12Hour) return start + '–' + end;
    var same = meridiem(start) === meridiem(end);
    return fmtTime(start, !same) + ' – ' + fmtTime(end, true);
  }

  /* ---------------- Build the slot grid from CONFIG ---------------- */
  function buildDays() {
    var now = nowInTZ();
    var today = parseYMD(now.date);
    var horizon = addDays(today, CONFIG.daysAhead || 14);
    var blackout = CONFIG.blackoutDates || [];
    var map = {};   // date -> { 'HH:MM' -> slot }

    function addBlock(dateStr, block) {
      if (blackout.indexOf(dateStr) !== -1) return;
      var step = CONFIG.slotMinutes || 15;
      var end = toMin(block.end);
      if (!map[dateStr]) map[dateStr] = {};
      for (var t = toMin(block.start); t + step <= end; t += step) {
        var hm = toHM(t);
        if (map[dateStr][hm]) continue;               // de-dupe overlapping blocks
        map[dateStr][hm] = {
          id: dateStr + '_' + hm,
          date: dateStr,
          start: hm,
          end: toHM(t + step),
          label: block.label || '',
          mode: block.mode || '',     // empty = fall back to CONFIG.meeting.defaultMode
          host: block.host || ''      // empty = fall back to CONFIG.defaultHost
        };
      }
    }

    (CONFIG.recurring || []).forEach(function (b) {
      for (var d = today; d <= horizon; d = addDays(d, 1)) {
        if (d.getUTCDay() === b.weekday) addBlock(ymd(d), b);
      }
    });

    // One-off dates show as long as they haven't passed, ignoring daysAhead
    (CONFIG.extraDates || []).forEach(function (b) {
      if (b.date >= now.date) addBlock(b.date, b);
    });

    var lead = CONFIG.minLeadMinutes || 0;
    var nowMin = toMin(now.time);

    return Object.keys(map).sort().map(function (date) {
      var slots = Object.keys(map[date]).sort().map(function (hm) {
        var s = map[date][hm];
        s.closed = (date === now.date) && (toMin(s.start) < nowMin + lead);
        return s;
      }).filter(function (s) {
        return !(date === now.date && toMin(s.start) < nowMin);   // hide slots already under way
      });
      return { date: date, slots: slots };
    }).filter(function (d) { return d.slots.length > 0; });
  }

  /* ---------------- Backend calls ---------------- */
  function demoStore() {
    try { return JSON.parse(localStorage.getItem(LS_DEMO)) || {}; } catch (e) { return {}; }
  }
  function demoSave(o) { localStorage.setItem(LS_DEMO, JSON.stringify(o)); }

  function apiList() {
    if (DEMO) {
      var db = demoStore(), out = {};
      Object.keys(db).forEach(function (k) { out[k] = { name: db[k].name, note: db[k].note }; });
      return Promise.resolve({ ok: true, bookings: out });
    }
    return fetch(CONFIG.apiUrl + '?action=list&t=' + Date.now())
      .then(function (r) { return r.json(); });
  }

  function apiPost(body) {
    if (DEMO) {
      var db = demoStore();
      if (body.action === 'book') {
        if (db[body.slotId]) return Promise.resolve({ ok: false, error: 'taken' });
        var code = String(Math.floor(100000 + Math.random() * 900000));
        var fakeMeet = body.mode === 'online'
          ? 'https://meet.google.com/demo-' + code.slice(0, 4) + '-xyz' : '';
        db[body.slotId] = { name: body.name, note: body.note || '',
                            mode: body.mode || '', code: code, meetUrl: fakeMeet };
        demoSave(db);
        return Promise.resolve({ ok: true, cancelCode: code, meetUrl: fakeMeet });
      }
      if (body.action === 'cancel') {
        var row = db[body.slotId];
        if (!row) return Promise.resolve({ ok: false, error: 'notfound' });
        if (row.code !== body.code) return Promise.resolve({ ok: false, error: 'badcode' });
        delete db[body.slotId];
        demoSave(db);
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false, error: 'unknown' });
    }
    // POST as text/plain to avoid a CORS preflight — Apps Script can't answer OPTIONS
    return fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  /* ---------------- Rendering ---------------- */
  function fmtDate(dateStr) {
    var d = parseYMD(dateStr);
    var sameYear = dateStr.slice(0, 4) === nowInTZ().date.slice(0, 4);
    var dOpts = { month: 'long', day: 'numeric', timeZone: 'UTC' };
    if (!sameYear) dOpts.year = 'numeric';
    return {
      md: new Intl.DateTimeFormat('en-US', dOpts).format(d),
      dow: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(d)
    };
  }

  function render() {
    var host = $('#days');
    host.innerHTML = '';

    if (!state.days.length) {
      host.innerHTML = '<p class="empty">No open slots right now.</p>';
      renderMine();
      return;
    }

    var codes = myCodes();
    var showHost = manyHosts();

    state.days.forEach(function (day) {
      var card = document.createElement('section');
      card.className = 'day';

      var f = fmtDate(day.date);
      var free = day.slots.filter(function (s) { return !state.bookings[s.id] && !s.closed; }).length;

      var head = document.createElement('div');
      head.className = 'day-head';
      head.innerHTML =
        '<span class="day-date"></span><span class="day-dow"></span><span class="day-count"></span>';
      head.children[0].textContent = f.md;
      head.children[1].textContent = f.dow;
      head.children[2].textContent = free + ' of ' + day.slots.length + ' open';
      card.appendChild(head);

      var grid = document.createElement('div');
      grid.className = 'slots';

      day.slots.forEach(function (s) {
        var b = state.bookings[s.id];
        var mine = !!codes[s.id];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.slot = s.id;

        var sub;
        if (b && mine) { btn.className = 'slot own'; sub = 'Yours · tap to cancel'; }
        else if (b) {
          btn.className = 'slot taken';
          btn.disabled = true;
          sub = CONFIG.showNames ? ('Booked · ' + b.name) : 'Booked';
        } else if (!state.loaded) {
          btn.className = 'slot closed'; btn.disabled = true; sub = s.label || '';
        } else if (s.closed) {
          btn.className = 'slot closed'; btn.disabled = true; sub = 'Closed';
        } else {
          btn.className = 'slot free';
          var tag = modeOf(s);
          var who = showHost ? hostName(hostOf(s)) : '';
          sub = who
            ? who + (tag === 'either' ? '' : ' · ' + modeLabel(tag))
            : (s.label || 'Available') + (tag === 'either' ? '' : ' · ' + modeLabel(tag));
        }

        var t = document.createElement('span');
        t.className = 't';
        t.textContent = fmtRange(s.start, s.end);
        var sp = document.createElement('span');
        sp.className = 's';
        sp.textContent = sub;
        btn.appendChild(t);
        btn.appendChild(sp);
        grid.appendChild(btn);
      });

      card.appendChild(grid);
      host.appendChild(card);
    });

    renderMine();
  }

  function slotById(id) {
    for (var i = 0; i < state.days.length; i++) {
      var arr = state.days[i].slots;
      for (var j = 0; j < arr.length; j++) if (arr[j].id === id) return arr[j];
    }
    var p = id.split('_');
    return { id: id, date: p[0], start: p[1], end: p[1], label: '' };
  }

  function slotText(s) {
    var f = fmtDate(s.date);
    var who = hostName(hostOf(s));
    return f.dow + ', ' + f.md + ' · ' + fmtRange(s.start, s.end) +
           (s.label ? ' · ' + s.label : '') +
           (who ? ' · with ' + who : '');
  }

  function renderMine() {
    var codes = myCodes();
    var ids = Object.keys(codes).filter(function (id) { return !!state.bookings[id]; }).sort();
    var box = $('#mine'), list = $('#mineList');
    if (!ids.length) { box.hidden = true; return; }
    box.hidden = false;
    list.innerHTML = '';
    ids.forEach(function (id) {
      var rec = codes[id];
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = slotText(slotById(id)) +
                         (rec.mode ? ' · ' + modeLabel(rec.mode) : '');
      var btn = document.createElement('button');
      btn.className = 'ghost';
      btn.type = 'button';
      btn.textContent = 'Cancel';
      btn.dataset.cancel = id;
      li.appendChild(span);
      li.appendChild(btn);

      if (rec.meetUrl) {
        var a = document.createElement('a');
        a.className = 'mlink';
        a.href = rec.meetUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = rec.meetUrl;
        li.appendChild(a);
      }
      list.appendChild(li);
    });
  }

  function setStatus(msg) { $('#status').textContent = msg || ''; }

  function banner(msg, kind) {
    var el = $('#banner');
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'banner' + (kind ? ' ' + kind : '');
    el.textContent = msg;
  }

  /* ---------------- Dialogs ---------------- */
  function openModal(sel) { $(sel).hidden = false; }
  function closeModal(sel) { $(sel).hidden = true; }

  function openBook(slotId) {
    state.pending = slotId;
    var s = slotById(slotId);
    var mc = meetCfg();

    $('#mSlot').textContent = slotText(s);
    $('#mError').hidden = true;
    $('#fName').value = lastOf('name');
    $('#fEmail').value = lastOf('email');
    $('#fNote').value = '';
    $('#noteWrap').hidden = !CONFIG.askNote;
    $('#emailWrap').hidden = !CONFIG.askEmail;
    $('#segOnline').textContent = mc.onlineLabel || 'Online';
    $('#segPerson').textContent = mc.inPersonLabel || 'In person';

    syncEmailRequirement();
    var place = placeOf(s);
    $('#modeHint').textContent =
      'Online gets you a ' + linkWord() + '.' +
      (place ? ' In person is at ' + place + '.' : '');

    var eff = modeOf(s);
    $('#modeWrap').hidden = (eff !== 'either');
    $('#modeFixed').hidden = (eff === 'either');
    if (eff === 'online') {
      $('#modeFixed').textContent = modeLabel('online') + ' — your meeting link appears right after booking.';
    } else if (eff === 'inperson') {
      $('#modeFixed').textContent = modeLabel('inperson') + (place ? ' — ' + place : '');
    } else {
      document.querySelector('input[name=mode][value=online]').checked = true;
    }

    openModal('#modal');
    setTimeout(function () { $('#fName').focus(); }, 30);
  }

  function openCancel(slotId) {
    state.pending = slotId;
    $('#cSlot').textContent = slotText(slotById(slotId));
    $('#cError').hidden = true;
    var known = myCodes()[slotId];
    $('#codeWrap').hidden = !!known;
    $('#fCode').value = '';
    openModal('#cancelModal');
  }

  function showMeetInfo(mode, meetUrl, warning, place) {
    $('#dMeet').hidden = true;
    $('#dPlace').hidden = true;
    $('#dWarn').hidden = true;

    if (mode === 'online') {
      if (meetUrl) {
        $('#dMeetLabel').textContent =
          linkWord().charAt(0).toUpperCase() + linkWord().slice(1) +
          ' — it also went to your email:';
        $('#dMeetLink').textContent = meetUrl;
        $('#dMeetLink').href = meetUrl;
        $('#dMeet').hidden = false;
      } else {
        $('#dWarn').textContent = warning === 'no_calendar'
          ? "Your booking is confirmed, but the meeting link couldn't be created. Contact me for the link."
          : "Your booking is confirmed. The meeting link will follow by email.";
        $('#dWarn').hidden = false;
      }
    } else if (place) {
      $('#dPlaceText').textContent = place;
      $('#dPlace').hidden = false;
    }
  }

  // Online bookings need a real email so the student is a calendar guest and can
  // join without waiting to be admitted.
  function pickedMode() {
    var slot = state.pending ? slotById(state.pending) : null;
    var eff = slot ? modeOf(slot) : 'either';
    if (eff !== 'either') return eff;
    var picked = document.querySelector('input[name=mode]:checked');
    return picked ? picked.value : 'online';
  }

  function syncEmailRequirement() {
    if (!CONFIG.askEmail) return;
    var need = CONFIG.requireEmailForOnline && pickedMode() === 'online';
    var input = $('#fEmail');
    input.required = need;
    $('#emailLabelText').textContent = need ? 'Email' : 'Email (optional)';
    $('#emailReq').hidden = !need;
    $('#emailHint').textContent = need
      ? "Required for online meetings — the invite carries your meeting link and lets you join straight away."
      : "You'll get a calendar invite with all the details.";
  }

  /* ---------------- Event wiring ---------------- */
  function wire() {
    $('#days').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-slot]');
      if (!btn || btn.disabled) return;
      var id = btn.dataset.slot;
      if (state.bookings[id]) openCancel(id); else openBook(id);
    });

    $('#mineList').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-cancel]');
      if (btn) openCancel(btn.dataset.cancel);
    });

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('.modal').hidden = true; });
    });

    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.hidden = true; });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; });
    });

    $('#refreshBtn').addEventListener('click', function () { refresh(true); });

    document.querySelectorAll('input[name=mode]').forEach(function (r) {
      r.addEventListener('change', syncEmailRequirement);
    });

    $('#bookForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#fName').value.trim();
      var note = CONFIG.askNote ? $('#fNote').value.trim() : '';
      if (!name) return;

      var btn = $('#mSubmit');
      btn.disabled = true; btn.textContent = 'Booking…';
      $('#mError').hidden = true;

      var slotId = state.pending;
      var slot = slotById(slotId);
      var eff = modeOf(slot);
      var picked = document.querySelector('input[name=mode]:checked');
      var mode = (eff === 'either') ? (picked ? picked.value : 'online') : eff;
      var email = CONFIG.askEmail ? $('#fEmail').value.trim() : '';

      if (mode === 'online' && CONFIG.requireEmailForOnline && !email) {
        $('#mError').textContent = 'An email address is required for online meetings.';
        $('#mError').hidden = false;
        $('#fEmail').focus();
        return;
      }

      var place = placeOf(slot);

      apiPost({ action: 'book', slotId: slotId, end: slot.end, label: slot.label,
                host: hostOf(slot), place: place,
                name: name, email: email, note: note, mode: mode })
        .then(function (res) {
          if (!res.ok) {
            $('#mError').textContent =
                res.error === 'taken'     ? 'Someone just took that slot. Please pick another one.'
              : res.error === 'bad_email' ? "That email address doesn't look right."
              : res.error === 'need_email' ? 'An email address is required for online meetings.'
              : 'Booking failed: ' + (res.error || 'unknown error');
            $('#mError').hidden = false;
            return refresh();
          }
          saveCode(slotId, { code: res.cancelCode, name: name, email: email,
                             mode: mode, meetUrl: res.meetUrl || '' });
          closeModal('#modal');
          $('#dSlot').textContent = slotText(slotById(slotId));
          $('#dCode').textContent = res.cancelCode;
          showMeetInfo(mode, res.meetUrl, res.warning, place);
          openModal('#doneModal');
          return refresh();
        })
        .catch(function (err) {
          $('#mError').textContent = 'Network error: ' + err.message;
          $('#mError').hidden = false;
        })
        .then(function () { btn.disabled = false; btn.textContent = 'Book slot'; });
    });

    $('#cancelForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var slotId = state.pending;
      var known = myCodes()[slotId];
      var code = known ? known.code : $('#fCode').value.trim();
      if (!code) {
        $('#cError').textContent = 'Please enter your cancellation code.';
        $('#cError').hidden = false;
        return;
      }

      var btn = $('#cSubmit');
      btn.disabled = true; btn.textContent = 'Working…';
      $('#cError').hidden = true;

      apiPost({ action: 'cancel', slotId: slotId, code: code })
        .then(function (res) {
          if (!res.ok) {
            $('#cError').textContent = res.error === 'badcode'
              ? "That code doesn't match this booking."
              : "Couldn't cancel: " + (res.error || 'unknown error');
            $('#cError').hidden = false;
            return;
          }
          dropCode(slotId);
          closeModal('#cancelModal');
          return refresh();
        })
        .catch(function (err) {
          $('#cError').textContent = 'Network error: ' + err.message;
          $('#cError').hidden = false;
        })
        .then(function () { btn.disabled = false; btn.textContent = 'Cancel booking'; });
    });
  }

  /* ---------------- Refresh ---------------- */
  function refresh(showSpinner) {
    setStatus(state.loaded ? (showSpinner ? 'Refreshing…' : '') : 'Loading availability…');
    state.days = buildDays();
    render();                      // paint the schedule immediately instead of a bare spinner
    return apiList().then(function (res) {
      if (res && res.ok) {
        state.loaded = true;
        state.bookings = res.bookings || {};
        setStatus('Updated ' + fmtTime(nowInTZ().time));
        if (!DEMO) banner('');
      } else {
        setStatus('');
        banner("Couldn't load bookings: " + ((res && res.error) || 'unknown error'), 'bad');
      }
      render();
    }).catch(function (err) {
      setStatus('');
      banner('Cannot reach the backend (' + err.message + '). Check apiUrl in config.js, ' +
             'and make sure the Apps Script web app is deployed with access set to "Anyone".', 'bad');
      render();
    });
  }

  /* ---------------- Boot ---------------- */
  function init() {
    document.title = CONFIG.title;
    $('#pageTitle').textContent = CONFIG.title;
    $('#pageSubtitle').textContent = CONFIG.subtitle || '';
    $('#footerNote').textContent = CONFIG.footerNote || '';
    $('#tzNote').textContent = tzLabel();

    if (DEMO) {
      banner('Demo mode — no backend configured yet, so bookings are stored only in this browser ' +
             'and nobody else can see them. Deploy the Apps Script (see README) and paste its URL ' +
             'into apiUrl in config.js to go live.', 'warn');
    }

    wire();
    refresh();

    if (CONFIG.autoRefreshSeconds > 0 && !DEMO) {
      state.timer = setInterval(function () {
        if (document.hidden) return;
        if (!$('#modal').hidden || !$('#cancelModal').hidden) return;
        refresh();
      }, CONFIG.autoRefreshSeconds * 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
