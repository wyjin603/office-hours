/* =============================================================
 *  Office Hour 预约 —— Google Apps Script 后端
 *  把这个文件的全部内容粘贴到 Google 表格的「扩展程序 → Apps Script」里
 * ============================================================= */

/* ---------- 配置 ---------- */

// 如果你是从表格里点「扩展程序 → Apps Script」打开的，留空即可。
// 如果是从 script.google.com 单独建的项目，把表格网址里 /d/ 和 /edit 之间那一串 ID 粘到这里。
// 注意：填了 ID 就别把这份文件推到公开的 GitHub 仓库（脚本本来也只需要活在 Apps Script 里）。
var SPREADSHEET_ID = '';

var SHEET_NAME    = 'Bookings';   // 数据写到哪个工作表（不存在会自动建）
var NOTIFY_EMAIL  = '';           // 填上你的邮箱 = 每次有人预约/取消都给你发信；留空则不发
var MAX_NAME_LEN  = 40;
var MAX_NOTE_LEN  = 200;

var HEADERS = ['id', 'slotId', 'date', 'start', 'name', 'note',
               'cancelCode', 'status', 'createdAt', 'updatedAt'];

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
  var name   = String(b.name || '').trim();
  var note   = String(b.note || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}$/.test(slotId)) return { ok: false, error: 'bad_slot' };
  if (!name) return { ok: false, error: 'no_name' };
  if (name.length > MAX_NAME_LEN) name = name.substring(0, MAX_NAME_LEN);
  if (note.length > MAX_NOTE_LEN) note = note.substring(0, MAX_NOTE_LEN);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'busy' };

  try {
    var sh = getSheet_();
    var rows = sh.getDataRange().getValues();

    // 已被占用？（每格只能 1 个人）
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) === slotId && String(rows[i][7]) === 'active') {
        return { ok: false, error: 'taken' };
      }
    }

    var parts = slotId.split('_');
    var code  = makeCode_();
    var now   = new Date();

    sh.appendRow([
      Utilities.getUuid(), slotId, parts[0], parts[1],
      name, note, code, 'active', now, now
    ]);

    notify_('New booking: ' + parts[0] + ' ' + parts[1],
            name + ' booked ' + parts[0] + ' at ' + parts[1] +
            (note ? '\n\nNote: ' + note : ''));

    return { ok: true, cancelCode: code };
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
    var sh = getSheet_();
    var rows = sh.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1]) !== slotId || String(rows[i][7]) !== 'active') continue;
      if (String(rows[i][6]).toUpperCase() !== code.toUpperCase()) return { ok: false, error: 'badcode' };

      sh.getRange(i + 1, 8).setValue('cancelled');   // status
      sh.getRange(i + 1, 10).setValue(new Date());   // updatedAt

      notify_('Booking cancelled: ' + rows[i][2] + ' ' + rows[i][3],
              rows[i][4] + ' cancelled ' + rows[i][2] + ' at ' + rows[i][3]);

      return { ok: true };
    }
    return { ok: false, error: 'notfound' };
  } finally {
    lock.releaseLock();
  }
}

function listActive_() {
  var rows = getSheet_().getDataRange().getValues();
  var out = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][7]) !== 'active') continue;
    // 注意：这里绝不返回 cancelCode
    out[String(rows[i][1])] = { name: String(rows[i][4]), note: String(rows[i][5]) };
  }
  return out;
}

/* ---------- 工具 ---------- */

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到表格：请把 SPREADSHEET_ID 填上，或从表格的「扩展程序 → Apps Script」重新打开脚本。');
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 日期/时间/取消码按纯文本存，免得被表格自动转成日期或数字
    sh.getRange('B:D').setNumberFormat('@');
    sh.getRange('G:G').setNumberFormat('@');
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function makeCode_() {
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // 去掉了容易看混的 0/O/1/I
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

/* ---------- 一次性：在编辑器里手动运行一下，用来建表 + 授权 ---------- */
function setup() {
  var sh = getSheet_();
  Logger.log('OK. Sheet ready: "' + SHEET_NAME + '" in "' + sh.getParent().getName() + '"');
}
