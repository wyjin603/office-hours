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

    // Shown to students. Keep it in sync with IN_PERSON_PLACE in Code.gs
    // so the calendar event carries the same location.
    location: 'SERC 359',

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
  hosts: {
    weiyi:  { name: 'Weiyi'  },
    zephyr: { name: 'Zephyr' },
    // Add the next TA here, then give them blocks below and a room in Apps Script:
    // ta3: { name: 'Name' },
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
    { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour', host: 'weiyi'  }, // Tue 4 - 6 PM
    { weekday: 4, start: '16:00', end: '18:00', label: 'Office Hour', host: 'weiyi'  }, // Thu 4 - 6 PM
  ],

  /* ---------- 7. One-off dates (lab sessions, make-up hours) ---------- */
  // These show up even if they fall beyond daysAhead.
  extraDates: [
    // { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson', host: 'zephyr' },
  ],

  /* ---------- 8. Days to close entirely (holidays, travel) ---------- */
  blackoutDates: [
    // '2026-11-26',
  ],
};
