export const PAGE_SIZE = 15;

export function normalize(row) {
  const [id, name, portfolio, domains] = row;
  return { id, name, portfolio, domains, rate: domains * 10000 / portfolio };
}

export function compare(rows, query, sort) {
  const key = query.trim().toLowerCase();
  const visible = rows.filter(row => row.name.toLowerCase().includes(key) || String(row.id) === key);
  return visible.sort((a, b) => {
    const byName = a.name.localeCompare(b.name) || a.id - b.id;
    if (sort === 'name') return byName;
    return b[sort] - a[sort] || byName;
  });
}

export function periodLabel(period) {
  const format = value => new Intl.DateTimeFormat('en-CA', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value + 'T00:00:00Z'));
  return format(period.start) + ' – ' + format(period.end);
}

// Public source rows may contain quoted delimiters and escaped quotes.
export function parseSource(text) {
  const records = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const c = text[index];
    if (c === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field);
      field = '';
      if (c === '\n') { records.push(row); row = []; }
    } else if (quoted || c !== '\r') field += c;
  }
  if (field || row.length) records.push([...row, field]);
  const headers = records.shift();
  const fields = ['Registrar IANA ID', 'Registrar Name', 'Registrar DUM', 'Phishing Domains'].map(name => headers.indexOf(name));
  if (fields.includes(-1)) throw new Error('Unexpected CSV columns.');
  return records.filter(record => record.length === headers.length).map(record => {
    const [id, name, portfolio, domains] = fields.map(i => record[i]);
    return normalize([Number(id), name, Number(portfolio), Number(domains)]);
  }).filter(row => row.id !== 9998 && row.id !== 9999);
}
