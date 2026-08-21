/* =============================================================
 *  前端逻辑 —— 一般不用改这个文件，改 config.js 就行
 *  All user-facing strings live in this file and config.js.
 * ============================================================= */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  var DEMO = !CONFIG.apiUrl || CONFIG.apiUrl === 'DEMO' || CONFIG.apiUrl.indexOf('http') !== 0;
  var LS_CODES = 'ohb.codes.v1';
  var LS_DEMO = 'ohb.demo.v1';

  var state = {
    loaded: false,  // 第一次拿到后端数据之前，格子先禁用，免得误点
    bookings: {},   // slotId -> { name, note }
    days: [],       // [{ date, slots: [...] }]
    pending: null,
    timer: null
  };

  /* ---------------- 本地存的取消码 ---------------- */
  function myCodes() {
    try { return JSON.parse(localStorage.getItem(LS_CODES)) || {}; } catch (e) { return {}; }
  }
  function saveCode(slotId, code, name) {
    var m = myCodes();
    m[slotId] = { code: code, name: name };
    localStorage.setItem(LS_CODES, JSON.stringify(m));
  }
  function dropCode(slotId) {
    var m = myCodes();
    delete m[slotId];
    localStorage.setItem(LS_CODES, JSON.stringify(m));
  }
  function lastName() {
    var m = myCodes(), keys = Object.keys(m);
    return keys.length ? (m[keys[keys.length - 1]].name || '') : '';
  }

  /* ---------------- 时间工具 ---------------- */
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

  // 当前时间（按配置时区）→ { date: 'YYYY-MM-DD', time: 'HH:MM' }
  function nowInTZ() {
    var opts = {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    };
    if (CONFIG.timezone) opts.timeZone = CONFIG.timezone;
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(new Date());
    } catch (e) {                       // 时区名字写错时退回本地时间
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

  // '14:05' -> '2:05 PM'（或原样返回 24 小时制）
  function fmtTime(hm, withMeridiem) {
    if (!CONFIG.use12Hour) return hm;
    var m = toMin(hm), h = Math.floor(m / 60), mm = m % 60;
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(mm).padStart(2, '0') + (withMeridiem === false ? '' : ' ' + ap);
  }
  function meridiem(hm) { return toMin(hm) < 720 ? 'AM' : 'PM'; }

  // 一段时间 -> '2:00 – 2:15 PM'（同上下午时只写一次 AM/PM）
  function fmtRange(start, end) {
    if (!CONFIG.use12Hour) return start + '–' + end;
    var same = meridiem(start) === meridiem(end);
    return fmtTime(start, !same) + ' – ' + fmtTime(end, true);
  }

  /* ---------------- 根据配置生成时段 ---------------- */
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
        if (map[dateStr][hm]) continue;               // 时段重叠时去重
        map[dateStr][hm] = {
          id: dateStr + '_' + hm,
          date: dateStr,
          start: hm,
          end: toHM(t + step),
          label: block.label || ''
        };
      }
    }

    (CONFIG.recurring || []).forEach(function (b) {
      for (var d = today; d <= horizon; d = addDays(d, 1)) {
        if (d.getUTCDay() === b.weekday) addBlock(ymd(d), b);
      }
    });

    // 手动指定的日期：只要还没过去就显示，不受 daysAhead 限制
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
        return !(date === now.date && toMin(s.start) < nowMin);   // 已开始的不显示
      });
      return { date: date, slots: slots };
    }).filter(function (d) { return d.slots.length > 0; });
  }

  /* ---------------- 与后端通信 ---------------- */
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
        db[body.slotId] = { name: body.name, note: body.note || '', code: code };
        demoSave(db);
        return Promise.resolve({ ok: true, cancelCode: code });
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
    // 用 text/plain 发 POST，避开 CORS 预检（Apps Script 不支持预检）
    return fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  /* ---------------- 渲染 ---------------- */
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
          btn.className = 'slot free'; sub = s.label || 'Available';
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
    return f.dow + ', ' + f.md + ' · ' + fmtRange(s.start, s.end) + (s.label ? ' · ' + s.label : '');
  }

  function renderMine() {
    var codes = myCodes();
    var ids = Object.keys(codes).filter(function (id) { return !!state.bookings[id]; }).sort();
    var box = $('#mine'), list = $('#mineList');
    if (!ids.length) { box.hidden = true; return; }
    box.hidden = false;
    list.innerHTML = '';
    ids.forEach(function (id) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.textContent = slotText(slotById(id));
      var btn = document.createElement('button');
      btn.className = 'ghost';
      btn.type = 'button';
      btn.textContent = 'Cancel';
      btn.dataset.cancel = id;
      li.appendChild(span);
      li.appendChild(btn);
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

  /* ---------------- 弹窗 ---------------- */
  function openModal(sel) { $(sel).hidden = false; }
  function closeModal(sel) { $(sel).hidden = true; }

  function openBook(slotId) {
    state.pending = slotId;
    $('#mSlot').textContent = slotText(slotById(slotId));
    $('#mError').hidden = true;
    $('#fName').value = lastName();
    $('#fNote').value = '';
    $('#noteWrap').hidden = !CONFIG.askNote;
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

  /* ---------------- 事件 ---------------- */
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

    $('#bookForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#fName').value.trim();
      var note = CONFIG.askNote ? $('#fNote').value.trim() : '';
      if (!name) return;

      var btn = $('#mSubmit');
      btn.disabled = true; btn.textContent = 'Booking…';
      $('#mError').hidden = true;

      var slotId = state.pending;
      apiPost({ action: 'book', slotId: slotId, name: name, note: note })
        .then(function (res) {
          if (!res.ok) {
            $('#mError').textContent = res.error === 'taken'
              ? 'Someone just took that slot. Please pick another one.'
              : 'Booking failed: ' + (res.error || 'unknown error');
            $('#mError').hidden = false;
            return refresh();
          }
          saveCode(slotId, res.cancelCode, name);
          closeModal('#modal');
          $('#dSlot').textContent = slotText(slotById(slotId));
          $('#dCode').textContent = res.cancelCode;
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

  /* ---------------- 刷新 ---------------- */
  function refresh(showSpinner) {
    setStatus(state.loaded ? (showSpinner ? 'Refreshing…' : '') : 'Loading availability…');
    state.days = buildDays();
    render();                      // 先把课表画出来，不让用户盯着 Loading
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

  /* ---------------- 启动 ---------------- */
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
