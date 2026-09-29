// GST state/UT codes — the first two digits of every GSTIN, and the `pos`
// (place of supply) value GSTR-1 expects. Bills store place of supply as free
// text (usually the state name), so this translates both ways.
const STATES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

// Old names and common spellings people type into the place-of-supply box.
const ALIASES = {
  jammukashmir: '01', jk: '01',
  uttaranchal: '05',
  newdelhi: '07', nctofdelhi: '07',
  up: '09',
  orissa: '21',
  chattisgarh: '22', chhatisgarh: '22',
  mp: '23',
  damananddiu: '26', dadranagarhaveli: '26', dadraandnagarhaveli: '26', dnhdd: '26',
  tn: '33', tamilnadu: '33',
  pondicherry: '34', pondy: '34',
  andamannicobar: '35', andamanandnicobar: '35',
  ap: '37',
};

const squash = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

const BY_NAME = {};
Object.entries(STATES).forEach(([code, name]) => { BY_NAME[squash(name)] = code; });
Object.assign(BY_NAME, ALIASES);

// Accepts "Tamil Nadu", "tamilnadu", "33", "33-Tamil Nadu", "TN" → "33"; '' if unknown.
const stateCode = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const digits = text.match(/^(\d{1,2})\b/);
  if (digits) {
    const code = digits[1].padStart(2, '0');
    if (STATES[code]) return code;
  }
  return BY_NAME[squash(text)] || BY_NAME[squash(text.replace(/^\d+\s*[-:]?\s*/, ''))] || '';
};

const stateName = (code) => STATES[String(code || '').padStart(2, '0')] || '';

module.exports = { STATES, stateCode, stateName };
