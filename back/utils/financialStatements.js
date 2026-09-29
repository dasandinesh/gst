// Profit & Loss and Balance Sheet, from the trial balance (utils/accounting.js).
//
// Stock is not kept in the books (purchases go straight to the Purchases
// account), so stock values are inputs:
//   P&L          opening stock (start of period) and closing stock (end of period)
//   Balance sheet closing stock on the date, and the stock the business had when
//                it started using the software (it came in as capital).
// estimateStock() suggests today's closing stock: quantity in hand × the latest
// purchase rate of each product.
const Product = require('../model/productmodule');
const Purchase = require('../model/purchasemodule');
const { trialBalance } = require('./accounting');

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const TRADING = { sales: ['sales', 'salesOther', 'salesReturns'], purchases: ['purchases', 'purchaseReturns'] };

// P&L for a period. Income and expense accounts use only the period's movement.
const profitAndLoss = (vouchers, accounts, { startDate, endDate }, { openingStock = 0, closingStock = 0 } = {}) => {
  const tb = trialBalance(vouchers, { startDate, endDate }, accounts);
  const move = (a) => round2(a.debit - a.credit);         // + = debit side
  const line = (a, amount) => ({ key: a.key, name: a.name, amount: round2(amount) });

  const sales = tb.accounts.filter((a) => TRADING.sales.includes(a.key)).map((a) => line(a, -move(a))).filter((l) => l.amount);
  const purchases = tb.accounts.filter((a) => TRADING.purchases.includes(a.key)).map((a) => line(a, move(a))).filter((l) => l.amount);
  const otherIncome = tb.accounts.filter((a) => a.group === 'income' && !TRADING.sales.includes(a.key)).map((a) => line(a, -move(a))).filter((l) => l.amount);
  const expenses = tb.accounts.filter((a) => a.group === 'expense' && !TRADING.purchases.includes(a.key)).map((a) => line(a, move(a))).filter((l) => l.amount);

  const sum = (list) => round2(list.reduce((t, l) => t + l.amount, 0));
  const netSales = sum(sales);
  const netPurchases = sum(purchases);
  const costOfGoodsSold = round2(num(openingStock) + netPurchases - num(closingStock));
  const grossProfit = round2(netSales - costOfGoodsSold);
  const totalOtherIncome = sum(otherIncome);
  const totalExpenses = sum(expenses);
  const netProfit = round2(grossProfit + totalOtherIncome - totalExpenses);
  return {
    period: { startDate: startDate || null, endDate: endDate || null },
    sales, netSales,
    openingStock: round2(openingStock), purchases, netPurchases, closingStock: round2(closingStock), costOfGoodsSold,
    grossProfit,
    otherIncome, totalOtherIncome,
    expenses, totalExpenses,
    netProfit,
  };
};

// Balance sheet on a date: every balance up to that date.
const balanceSheet = (vouchers, accounts, { endDate }, { closingStock = 0, startingStock = 0 } = {}) => {
  const tb = trialBalance(vouchers, { endDate }, accounts);
  const line = (a, amount) => ({ key: a.key, name: a.name, sub: a.sub, amount: round2(amount) });
  const assets = tb.accounts.filter((a) => a.group === 'asset' && a.closing).map((a) => line(a, a.closing));
  if (num(closingStock)) assets.push({ key: 'stock', name: 'Closing stock', sub: 'Stock', amount: round2(closingStock) });
  const liabilities = tb.accounts.filter((a) => a.group === 'liability' && a.closing).map((a) => line(a, -a.closing));
  const equity = tb.accounts.filter((a) => a.group === 'equity' && a.closing).map((a) => line(a, -a.closing));
  if (num(startingStock)) equity.push({ key: 'startingStock', name: 'Stock brought in at start', sub: 'Capital', amount: round2(startingStock) });

  // Profit (or loss) earned up to the date, including the change in stock.
  const ledgerProfit = -tb.accounts.filter((a) => a.group === 'income' || a.group === 'expense').reduce((t, a) => t + a.closing, 0);
  const profitToDate = round2(ledgerProfit + num(closingStock) - num(startingStock));
  equity.push({ key: 'profit', name: profitToDate >= 0 ? 'Profit to date' : 'Loss to date', sub: 'Profit & loss', amount: profitToDate });

  const sum = (list) => round2(list.reduce((t, l) => t + l.amount, 0));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity);
  return {
    asOf: endDate || null,
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
};

// Today's stock value: quantity in hand × latest purchase rate (before GST) of
// each product, matched by name. Products never purchased are listed as missing.
const estimateStock = async (businessId) => {
  const [products, purchases] = await Promise.all([
    Product.find({ businessId, StockQunity: { $gt: 0 } }, 'name StockQunity').lean(),
    Purchase.find({ businessId }, 'items billDetails.date').sort({ 'billDetails.date': -1 }).lean(),
  ]);
  const latestRate = {};
  purchases.forEach((p) => (p.items || []).forEach((it) => {
    const key = String(it.name || '').trim().toLowerCase();
    if (key in latestRate || !num(it.quantity)) return;
    latestRate[key] = num(it.taxableValue) / num(it.quantity);
  }));
  let value = 0;
  const missing = [];
  products.forEach((p) => {
    const rate = latestRate[String(p.name || '').trim().toLowerCase()];
    if (rate === undefined) { missing.push(p.name); return; }
    value += rate * num(p.StockQunity);
  });
  return { value: round2(value), products: products.length, valued: products.length - missing.length, missing: missing.slice(0, 20), missingCount: missing.length };
};

module.exports = { profitAndLoss, balanceSheet, estimateStock };
