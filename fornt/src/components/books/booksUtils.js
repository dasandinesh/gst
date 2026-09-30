import { formatDate } from '../../dateFormat';
// Shared helpers for the books-of-accounts pages (chart of accounts, trial
// balance, account ledger). Balances come from /api/accounting as signed
// Dr − Cr amounts: positive = debit balance, negative = credit balance.

export const amount = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 1234.5 → "1,234.50 Dr", -80 → "80.00 Cr", 0 → "—"
export const drCr = (value) => {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  if (!v) return '—';
  return `${amount(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`;
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayString = () => ymd(new Date());
// Indian financial year: 1 April to 31 March.
export const financialYearStart = () => {
  const now = new Date();
  return `${now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1}-04-01`;
};

export const displayDate = (value) => formatDate(value, 'Opening');

// Link to an account's ledger page, keeping the period (and optional party).
export const ledgerHref = (account, { startDate, endDate, party } = {}) => {
  const params = new URLSearchParams({ account });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (party) params.set('party', party);
  return `/account-ledger?${params}`;
};
