/* =============================================================
 *  Booking site configuration — this is the only file you
 *  normally need to edit.
 * ============================================================= */

const CONFIG = {

  /* ---------- 1. Backend ---------- */
  // The Apps Script web app URL (Deploy -> Web app -> copy the /exec URL).
  // Set to 'DEMO' to run the page without a backend: bookings are then kept
  // only in the visitor's own browser, which is handy for previewing.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzDXxdLci7L63MqheX8YDac3a0WDWLR064AR5G_xSWpDOQHnRPR5K_VHaa32081tvA/exec',

  /* ---------- 2. Page copy ---------- */
  title: 'Office Hours & Lab Booking',
  subtitle: 'Pick an open slot and enter your name. Each slot is 15 minutes and holds one person.',
  footerNote: 'Questions? Send me an email.',

  /* ---------- 3. Rules ---------- */
  slotMinutes: 15,              // Length of each slot, in minutes
  timezone: 'America/New_York', // Must match TIMEZONE in Code.gs
  use12Hour: true,              // true -> 4:00 - 4:15 PM;  false -> 16:00-16:15
  daysAhead: 21,                // How far ahead recurring slots are opened
  minLeadMinutes: 60,           // Booking closes this many minutes before a slot (0 = no cutoff)
  showNames: true,              // Show the booker's name on taken slots
  askNote: true,                // Ask "what would you like to discuss?"
  askEmail: true,               // Recommended: with an email, the student gets a
                                // calendar invite carrying the meeting link
  autoRefreshSeconds: 30,       // Background refresh interval (0 = off)

  /* ---------- 4. Online / in person ---------- */
  meeting: {
    // 'online'   -> every slot is online
    // 'inperson' -> every slot is in person
    // 'either'   -> the student chooses when booking
    defaultMode: 'either',

    // Shown to students. Keep it in sync with IN_PERSON_PLACE in Code.gs
    // so the calendar event carries the same location.
    location: 'SERC 359',

    onlineLabel:   'Online',
    inPersonLabel: 'In person',
  },

  /* ---------- 5. Weekly recurring slots ---------- */
  // weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  // Always write times in 24-hour form; use12Hour only affects display.
  // Add `mode: 'online'` or `mode: 'inperson'` to pin a block to one format.
  recurring: [
    { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour' },  // Tuesday 4-6 PM
    { weekday: 4, start: '16:00', end: '18:00', label: 'Office Hour' },  // Thursday 4-6 PM
  ],

  /* ---------- 6. One-off dates (lab sessions, make-up hours) ---------- */
  // These show up even if they fall beyond daysAhead.
  extraDates: [
    // { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson' },
  ],

  /* ---------- 7. Days to close entirely (holidays, travel) ---------- */
  blackoutDates: [
    // '2026-11-26',
  ],
};
