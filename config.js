/* =============================================================
 *  预约系统配置 —— 平时你只需要改这一个文件
 *  (This is the only file you normally need to edit.)
 * ============================================================= */

const CONFIG = {

  /* ---------- 1. 后端地址（部署 Apps Script 后把网址粘到这里） ---------- */
  // 形如 https://script.google.com/macros/s/AKfycb..../exec
  // 保持 'DEMO' 不改的话，网页以「演示模式」运行（数据只存在你自己浏览器里）
  apiUrl: 'https://script.google.com/macros/s/AKfycbzDXxdLci7L63MqheX8YDac3a0WDWLR064AR5G_xSWpDOQHnRPR5K_VHaa32081tvA/exec',

  /* ---------- 2. 页面文字（学生看到的，全英文） ---------- */
  title: 'Office Hours & Lab Booking',
  subtitle: 'Pick an open slot and enter your name. Each slot is 15 minutes and holds one person.',
  footerNote: 'Questions? Send me an email.',

  /* ---------- 3. 基本规则 ---------- */
  slotMinutes: 15,              // 每格时长（分钟）
  timezone: 'America/New_York', // 时间按这个时区显示，例：'Asia/Shanghai'
  use12Hour: true,              // true = 2:00 – 2:15 PM；false = 14:00 – 14:15
  daysAhead: 21,                // 往后开放多少天的重复时段
  minLeadMinutes: 60,           // 开始前多少分钟停止预约（0 = 不限制）
  showNames: true,              // 已被预约的格子是否显示预约人姓名
  askNote: true,                // 是否让学生填一句「想聊什么」
  autoRefreshSeconds: 30,       // 自动刷新间隔（0 = 关闭）

  /* ---------- 4. 每周固定时段 ---------- */
  // weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  // 时间一律用 24 小时制写，显示时会按 use12Hour 自动转换
  // label 会显示在空格子上 —— 用它区分 Office Hour 和实验
  recurring: [
    { weekday: 2, start: '14:00', end: '16:00', label: 'Office Hour' },
    { weekday: 4, start: '10:00', end: '11:30', label: 'Office Hour' },
  ],

  /* ---------- 5. 额外指定的具体日期（比如临时加的实验时段） ---------- */
  extraDates: [
    // { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session' },
  ],

  /* ---------- 6. 取消的日子（放假、出差等，写这里就整天不开放） ---------- */
  blackoutDates: [
    // '2026-11-26',
  ],
};
