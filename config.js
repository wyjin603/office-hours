/* =============================================================
 *  预约系统配置 —— 平时你只需要改这一个文件
 *  (This is the only file you normally need to edit.)
 * ============================================================= */

const CONFIG = {

  /* ---------- 1. 后端地址 ---------- */
  apiUrl: 'https://script.google.com/macros/s/AKfycbzDXxdLci7L63MqheX8YDac3a0WDWLR064AR5G_xSWpDOQHnRPR5K_VHaa32081tvA/exec',

  /* ---------- 2. 页面文字（学生看到的，全英文） ---------- */
  title: 'Office Hours & Lab Booking',
  subtitle: 'Pick an open slot and enter your name. Each slot is 15 minutes and holds one person.',
  footerNote: 'Questions? Send me an email.',

  /* ---------- 3. 基本规则 ---------- */
  slotMinutes: 15,              // 每格时长（分钟）
  timezone: 'America/New_York', // 时区，改这里也要改 Code.gs 里的 TIMEZONE
  use12Hour: true,              // true → 4:00 – 4:15 PM；false → 16:00–16:15
  daysAhead: 21,                // 往后开放多少天的重复时段
  minLeadMinutes: 60,           // 开始前多少分钟停止预约（0 = 不限制）
  showNames: true,              // 已被预约的格子是否显示预约人姓名
  askNote: true,                // 是否让学生填一句「想聊什么」
  askEmail: true,               // 强烈建议开着：填了邮箱，学生会收到带 Meet 链接的日历邀请
  autoRefreshSeconds: 30,       // 自动刷新间隔（0 = 关闭）

  /* ---------- 4. 线上 / 线下 ---------- */
  meeting: {
    // 默认形式：'online' 全线上 | 'inperson' 全线下 | 'either' 让学生预约时自己选
    defaultMode: 'either',

    // 线下地点（显示给学生，Code.gs 里的 IN_PERSON_PLACE 要保持一致）
    location: 'SERC 359',

    onlineLabel:   'Online',
    inPersonLabel: 'In person',
  },

  /* ---------- 5. 每周固定时段 ---------- */
  // weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  // 时间一律用 24 小时制写，显示时会按 use12Hour 自动转换
  // 可选 mode: 'online' / 'inperson' —— 不写就用上面的 defaultMode
  recurring: [
    { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour' },  // 周二 4–6 PM
    { weekday: 4, start: '16:00', end: '18:00', label: 'Office Hour' },  // 周四 4–6 PM
  ],

  /* ---------- 6. 额外指定的具体日期（比如实验） ---------- */
  extraDates: [
    // { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson' },
  ],

  /* ---------- 7. 取消的日子（放假、出差等，整天不开放） ---------- */
  blackoutDates: [
    // '2026-11-26',
  ],
};
