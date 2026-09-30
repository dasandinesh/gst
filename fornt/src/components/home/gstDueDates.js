// GST return due dates for the dashboard reminders (normal taxpayers).
//   Monthly filers:   GSTR-1 → 11th of next month, GSTR-3B → 20th of next month.
//   Quarterly (QRMP): GSTR-1 → 13th after the quarter, GSTR-3B → 22nd or 24th
//                     (by state, below); in the quarter's first two months IFF
//                     (optional, B2B invoices) by the 13th and PMT-06 tax payment by the 25th.
//   Annual GSTR-9:    31 December after the financial year.
// The government sometimes extends these by notification — the dashboard says so.

// States / UTs whose quarterly GSTR-3B is due on the 22nd; everyone else the 24th.
// (Chhattisgarh, MP, Gujarat, Daman & Diu, DNH & DD, Maharashtra, Karnataka, Goa,
// Lakshadweep, Kerala, Tamil Nadu, Puducherry, Andaman & Nicobar, Telangana, AP.)
const DAY_22_STATES = new Set(['22', '23', '24', '25', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthLabel = (y, m) => `${MONTHS[m]} ${y}`; // m is 0-based

// All deadlines for one return month (y, m 0-based).
const deadlinesForMonth = (y, m, { quarterly, stateCode }) => {
  const due = (day) => new Date(y, m + 1, day); // day of the following month
  const period = monthLabel(y, m);
  if (!quarterly) {
    return [
      { form: 'GSTR-1', what: `Sales details for ${period}`, date: due(11), link: '/gst-reports' },
      { form: 'GSTR-3B', what: `Summary return & tax payment for ${period}`, date: due(20), link: '/gstr-3b' },
    ];
  }
  const quarterEnd = m % 3 === 2; // Mar, Jun, Sep, Dec
  if (quarterEnd) {
    const q = `${MONTHS[m - 2]}–${MONTHS[m]} ${y}`;
    return [
      { form: 'GSTR-1', what: `Quarterly sales details for ${q}`, date: due(13), link: '/gst-reports' },
      { form: 'GSTR-3B', what: `Quarterly summary return & tax payment for ${q}`, date: due(DAY_22_STATES.has(stateCode) ? 22 : 24), link: '/gstr-3b' },
    ];
  }
  return [
    { form: 'IFF', what: `B2B invoices for ${period} (optional)`, date: due(13), link: '/gst-reports', optional: true },
    { form: 'PMT-06', what: `Tax payment for ${period}`, date: due(25), link: '/gstr-3b' },
  ];
};

// Deadlines from `pastDays` ago to `aheadDays` ahead, soonest first, each with
// daysLeft (negative = passed) and a status: 'passed' | 'today' | 'soon' | 'upcoming'.
export const upcomingDeadlines = ({ today = new Date(), quarterly = false, stateCode = '', pastDays = 15, aheadDays = 45 } = {}) => {
  const now = startOfDay(today);
  const list = [];
  // Return months: three back through the current one covers every window above.
  for (let back = 3; back >= 0; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    list.push(...deadlinesForMonth(d.getFullYear(), d.getMonth(), { quarterly, stateCode }));
  }
  // Annual return for the financial year that ended last March.
  const fyEndYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  list.push({
    form: 'GSTR-9',
    what: `Annual return for FY ${fyEndYear - 1}-${String(fyEndYear).slice(-2)} (if turnover is above ₹2 crore)`,
    date: new Date(fyEndYear, 11, 31),
  });

  return list
    .map((x) => {
      const daysLeft = Math.round((startOfDay(x.date) - now) / DAY_MS);
      const status = daysLeft < 0 ? 'passed' : daysLeft === 0 ? 'today' : daysLeft <= 5 ? 'soon' : 'upcoming';
      return { ...x, daysLeft, status };
    })
    .filter((x) => x.daysLeft >= -pastDays && x.daysLeft <= aheadDays)
    .sort((a, b) => a.date - b.date);
};
