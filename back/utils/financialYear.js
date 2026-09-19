// Indian financial year runs April 1 -> March 31, labeled like "24-25" for
// Apr 2024-Mar 2025. GST invoice numbers conventionally reset each FY
// (e.g. GB/24-25/0001) even though the law only requires them to be unique
// within the year, not that they restart — resetting is just the convention
// most Indian billing software (and accountants) expect.
exports.financialYearLabel = (date) => {
  const d = date ? new Date(date) : new Date();
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Jan-Mar belongs to the FY that started the previous April
  const startYY = String(startYear).slice(-2);
  const endYY = String(startYear + 1).slice(-2);
  return `${startYY}-${endYY}`;
};
