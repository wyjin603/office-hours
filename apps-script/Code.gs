/* =============================================================
 *  Office Hour 预约 —— Google Apps Script 后端
 *
 *  需要启用「Google Calendar API」高级服务才能自动生成 Meet 链接：
 *  左侧「服务 / Services」旁边的 ➕ → 选 Google Calendar API → 添加。
 *  加完后先手动运行一次 setup()，它会告诉你有没有配好。
 * ============================================================= */

/* ---------- 配置 ---------- */

// 从表格的「扩展程序 → Apps Script」打开的 → 留空
// 从 script.google.com 单独建的项目 → 填表格网址里 /d/ 和 /edit 之间那串 ID
// 填了 ID 就别把这份文件推到公开仓库（脚本本来只需要活在 Apps Script 里）
var SPREADSHEET_ID = '';

var SHEET_NAME = 'Bookings';       // 数据写到哪个工作表（不存在会自动建）
var TIMEZONE   = 'America/New_York';  // ⚠️ 必须和 config.js 里的 timezone 一致

var ADD_TO_CALENDAR   = true;      // 每个预约在你的 Google 日历上建一个日程
var CREATE_MEET_LINK  = true;      // 线上预约自动生成 Google Meet 链接
var CALENDAR_ID       = 'primary'; // 写进哪个日历，'primary' = 你的主日历
var EVENT_TITLE       = 'Office Hour';
var IN_PERSON_PLACE   = 'SERC 359';  // 线下地点，会写进日程的 location

var NOTIFY_EMAIL = '';             // 填你的邮箱 = 每次预约/取消都给你发信；留空则不发

var MAX_NAME_LEN = 40;
var MAX_NOTE_LEN = 200;
var DEFAULT_SLOT_MINUTES = 15;

var HEADERS = ['id', 'slotId', 'date', 'start', 'end', 'name', 'email', 'note',
               'mode', 'meetUrl', 'eventId', 'cancelCode', 'status',
               'createdAt', 'updatedAt'];

/* ---------- 入口 ---------- */

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

/* ---------- 业务 ---------- */

function book_(b) {
  var slotId = String(b.slotId || '');
  if (!/^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/.test(slotId)) return { ok: false, error: 'bad_slot' };

  var name = String(b.name || '').trim();
  if (!name) return { ok: false, error: 'no_name' };
  name = name.substring(0, MAX_NAME_LEN);

  var note  = String(b.note || '').trim().substring(0, MAX_NOTE_LEN);
  var email = String(b.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return { ok: false, error: 'bad_email' };

  var mode  = (b.mode === 'inperson') ? 'inperson' : 'online';
  var parts = slotId.split('_');
  var date  = parts[0], start = parts[1];
  var end   = /^\d{2}:\d{2}$/.test(String(b.end || '')) ? String(b.end)
                                                       : addMinutes_(start, DEFAULT_SLOT_MINUTES);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };

  try {
    var sh = getSheet_(), m = headerMap_(sh);
    var rows = sh.getDataRange().getValues();

    // 每格只能 1 个人
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][m.slotId]) === slotId && String(rows[i][m.status]) === 'active') {
        return { ok: false, error: 'taken' };
      }
    }

    var cal = { eventId: '', meetUrl: '', warning: '' };
    if (ADD_TO_CALENDAR) {
      cal = createEvent_({
        date: date, start: start, end: end, name: name,
        email: email, note: note, mode: mode, label: String(b.label || '')
      });
    }

    var code = makeCode_();
    var now  = new Date();
    var row  = new Array(sh.getLastColumn()).fill('');
    function set(k, v) { if (m[k] !== undefined) row[m[k]] = v; }

    set('id', Utilities.getUuid());
    set('slotId', slotId);   set('date', date);     set('start', start);  set('end', end);
    set('name', name);       set('email', email);   set('note', note);    set('mode', mode);
    set('meetUrl', cal.meetUrl);  set('eventId', cal.eventId);
    set('cancelCode', code); set('status', 'active');
    set('createdAt', now);   set('updatedAt', now);
    sh.appendRow(row);

    notify_('New booking: ' + date + ' ' + start + ' — ' + name,
            name + ' booked ' + date + ' ' + start + '–' + end +
            '\n\nFormat: ' + (mode === 'online' ? 'Online' : 'In person') +
            (email ? '\nEmail: ' + email : '') +
            (note ? '\nNote: ' + note : '') +
            (cal.meetUrl ? '\nMeet: ' + cal.meetUrl : '') +
            (cal.warning ? '\n\n(!) Calendar: ' + cal.warning : ''));

    return { ok: true, cancelCode: code, meetUrl: cal.meetUrl, mode: mode,
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

// 只返回公开需要的字段：姓名 + 形式。备注、邮箱、取消码、Meet 链接绝不外泄。
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

/* ---------- 日历 / Meet ---------- */

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
    if (o.email) ev.attendees = [{ email: o.email }];

    var params = { sendUpdates: o.email ? 'all' : 'none' };
    if (o.mode === 'online' && CREATE_MEET_LINK) {
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
    out.meetUrl = created.hangoutLink || '';
    if (o.mode === 'online' && CREATE_MEET_LINK && !out.meetUrl) out.warning = 'meet link missing';
  } catch (err) {
    // 日历没配好也不能挡住预约本身 —— 记下来，照常写表
    out.warning = String(err);
  }
  return out;
}

function deleteEvent_(eventId) {
  if (!eventId || !ADD_TO_CALENDAR) return;
  try {
    Calendar.Events.remove(CALENDAR_ID, eventId, { sendUpdates: 'all' });
  } catch (err) { /* 日程已经被手动删了之类的，忽略 */ }
}

/* ---------- 工具 ---------- */

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到表格：请填 SPREADSHEET_ID，或从表格的「扩展程序 → Apps Script」打开脚本。');

  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange('B:E').setNumberFormat('@');   // 日期/时间按纯文本存，别被转成日期
    sh.getRange('L:L').setNumberFormat('@');   // 取消码
  } else {
    // 老表格升级：只在末尾补上缺的列，已有数据一行不动
    var cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
                .map(function (x) { return String(x); });
    var missing = HEADERS.filter(function (h) { return cur.indexOf(h) === -1; });
    if (missing.length) sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
  }

  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

// 表头名 → 列下标（0 起）。用名字取值，以后加列也不会错位。
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
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // 去掉容易看混的 0/O/1/I
  var s = '';
  for (var i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function notify_(subject, body) {
  if (!NOTIFY_EMAIL) return;
  try { MailApp.sendEmail(NOTIFY_EMAIL, subject, body); } catch (e) { /* 配额用完就算了 */ }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 一次性自检：在编辑器里手动运行，看「执行日志」 ---------- */
function setup() {
  var sh = getSheet_();
  Logger.log('✅ 表格 OK：工作表 "' + SHEET_NAME + '" in "' + sh.getParent().getName() + '"');

  if (!ADD_TO_CALENDAR) { Logger.log('ℹ️ ADD_TO_CALENDAR = false，不建日程。'); return; }
  try {
    var cal = Calendar.Calendars.get(CALENDAR_ID);
    Logger.log('✅ 日历 OK：' + cal.summary + '（时区 ' + cal.timeZone + '）');
    Logger.log('   Meet 链接生成：' + (CREATE_MEET_LINK ? '开' : '关'));
  } catch (err) {
    Logger.log('❌ Calendar 高级服务没启用 —— 线上预约不会有 Meet 链接。');
    Logger.log('   修复：左侧「服务 / Services」旁的 ➕ → Google Calendar API → 添加，然后重跑 setup。');
    Logger.log('   (' + err + ')');
  }
}
