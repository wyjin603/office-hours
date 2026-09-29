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
  subtitle: 'Pick an open slot and enter your name. Each slot is 10 minutes and holds one person.',
  footerNote: 'Questions? Send me an email.',

  /* ---------- 3. Rules ---------- */
  slotMinutes: 10,              // Length of each slot, in minutes
  timezone: 'America/New_York', // Must match TIMEZONE in Code.gs
  use12Hour: true,              // true -> 3:00 - 3:10 PM;  false -> 15:00-15:10
  daysAhead: 21,                // How far ahead recurring slots are opened
  minLeadMinutes: 60,           // Booking closes this many minutes before a slot (0 = no cutoff)
  showNames: true,              // Show the booker's name on taken slots
  askNote: true,                // Ask "what would you like to discuss?"
  askEmail: true,               // Ask for an email address
  requireEmailForOnline: true,  // Make it mandatory for online bookings, so the student is
                                // a real calendar guest and can join without knocking
  autoRefreshSeconds: 30,       // Background refresh interval (0 = off)

  /* ---------- 4. Online / in person ---------- */
  meeting: {
    // 'online'   -> every slot is online
    // 'inperson' -> every slot is in person
    // 'either'   -> the student chooses when booking
    defaultMode: 'either',

    // Fallback office for any host without their own `location` below.
    location: '',

    // Shown wherever the meeting link is mentioned. Set it to whatever you
    // actually use — 'Google Meet', 'Zoom', 'Teams'. Leave empty for a neutral
    // "meeting link". The code never cares what the link points at; HOST_LINKS
    // in Code.gs is just a list of URLs.
    platformName: 'Zoom',

    onlineLabel:   'Online',
    inPersonLabel: 'In person',
  },

  /* ---------- 5. Who holds each block ---------- */
  // One entry per person holding office hours. The key is what you put in `host:`
  // on a block below. Only display names live here — the actual meeting-room links
  // are set in Code.gs, so they reach only people who have actually booked and are
  // never published with the site.
  // `location` is where this person holds in-person hours. It is shown to students
  // and written to the calendar event, so it only needs setting here — no redeploy.
  hosts: {
    weiyi:  { name: 'Weiyi',  location: 'SERC 359' },
    zephyr: { name: 'Zephyr', location: 'SERC 358' },
    seth:   { name: 'Seth',   location: 'SERC 358' },
    // To add someone: a line here, blocks below, and room.<id> / email.<id>
    // as script properties in Apps Script.
  },
  defaultHost: 'weiyi',           // used by any block without an explicit `host`

  /* ---------- 6. Weekly recurring slots ---------- */
  // weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  // Always write times in 24-hour form; use12Hour only affects display.
  // Add `mode: 'online'` or `mode: 'inperson'` to pin a block to one format,
  // and `host:` to say who is holding it.
  //
  // Blocks on the same day must NOT overlap. Where two blocks cover the same
  // time, the one listed first wins and the other is ignored. To split a day
  // between people, give them adjacent ranges — e.g. shorten the block below to
  // 16:00-17:00 and hand 17:00-18:00 to someone else.
  recurring: [
    { weekday: 1, start: '11:00', end: '13:00', label: 'Office Hour', host: 'zephyr' }, // Mon 11 AM - 1 PM
    { weekday: 2, start: '15:00', end: '17:00', label: 'Office Hour', host: 'weiyi', mode: 'inperson' }, // Tue 3 - 5 PM, office only
    { weekday: 4, start: '15:00', end: '17:00', label: 'Office Hour', host: 'weiyi', mode: 'online'   }, // Thu 3 - 5 PM, online only

    { weekday: 1, start: '13:30', end: '14:30', label: 'Office Hour', host: 'seth' }, // Mon 1:30 - 2:30 PM
    { weekday: 5, start: '13:30', end: '14:30', label: 'Office Hour', host: 'seth' }, // Fri 1:30 - 2:30 PM
  ],

  /* ---------- 7. One-off dates (lab sessions, make-up hours) ---------- */
  // These show up even if they fall beyond daysAhead.
  extraDates: [
    // { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson', host: 'zephyr' },
  ],

  /* ---------- 8. Days to close entirely (holidays, travel) ---------- */
  blackoutDates: [
    // Transition to the new schedule. Bookings already made for these two days
    // were placed under the old 4-6 PM / 15-minute layout, so those days are
    // closed to new bookings rather than re-cut into the new grid. Everyone who
    // already booked keeps their calendar invite and meeting link. Safe to
    // delete both lines once 1 Oct has passed.
    '2026-09-29',
    '2026-10-01',
  ],
};
