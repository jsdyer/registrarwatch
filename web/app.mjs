import { PAGE_SIZE, compare, normalize, periodLabel, parseSource } from './model.mjs';

const el = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-CA');
const score = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 });
const initial = new URLSearchParams(location.search);
let periods = [];
let page = 0;
let selectedId = null;

function cell(row, value) {
  const td = row.insertCell();
  td.textContent = value;
  return td;
}

function syncUrl() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ period: el('period').value, registrar: selectedId })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

function renderHistory(id, focus = false) {
  selectedId = id;
  const panel = el('history');
  panel.hidden = !id;
  if (!id) return;
  const values = periods.map(period => ({ period, row: period.rows.find(row => row.id === id) }));
  const latest = values.find(item => item.row)?.row;
  if (!latest) {
    selectedId = null;
    panel.hidden = true;
    return;
  }
  const maxRate = Math.max(...values.map(item => item.row?.rate || 0));
  el('history-name').textContent = latest.name + ' · IANA ' + id;
  const table = el('periods');
  table.replaceChildren();
  for (const { period, row } of values) {
    const tr = table.insertRow();
    cell(tr, periodLabel(period));
    if (!row) {
      cell(tr, period.full ? 'No published row' : 'Outside loaded selection').colSpan = 3;
      continue;
    }
    cell(tr, fmt.format(row.portfolio));
    cell(tr, fmt.format(row.domains));
    const value = cell(tr, score.format(row.rate));
    const bar = document.createElement('span');
    bar.className = 'trend';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i');
    fill.style.width = (maxRate ? row.rate / maxRate * 100 : 0) + '%';
    bar.append(fill);
    value.prepend(bar);
  }
  if (focus) el('history-title').focus();
}

function render() {
  const period = periods.find(item => item.start === el('period').value);
  const matches = compare(period.rows, el('query').value, el('sort').value);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, pages - 1));
  el('registrars').textContent = fmt.format(period.rows.length);
  el('domains').textContent = fmt.format(period.rows.reduce((n, r) => n + r.domains, 0));
  el('portfolio').textContent = fmt.format(period.rows.reduce((n, r) => n + r.portfolio, 0));
  el('csv').href = period.source;
  el('coverage').textContent = 'Loaded ' + period.rows.length + ' of ' + period.publishedRows + ' registrar rows for this quarter.';

  el('count').textContent = matches.length
    ? fmt.format(matches.length) + ' matching registrars · page ' + (page + 1) + ' of ' + pages + '. Select a registrar to see its history.'
    : 'No matching registrar in this quarter. Try another period or IANA ID.';
  const table = el('rows');
  table.replaceChildren();
  for (const row of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const tr = table.insertRow();
    const show = document.createElement('button');
    show.type = 'button';
    show.textContent = row.name;
    show.dataset.id = String(row.id);
    show.addEventListener('click', () => {
      renderHistory(row.id, true);
      syncUrl();
    });
    tr.insertCell().append(show);
    cell(tr, row.id);
    cell(tr, fmt.format(row.portfolio));
    cell(tr, fmt.format(row.domains));
    cell(tr, score.format(row.rate));
  }
  el('prev').disabled = page === 0;
  el('next').disabled = page === pages - 1;
}

async function data(path) {
  const response = await fetch('./data/' + path + '.json');
  if (!response.ok) throw new Error('Snapshot unavailable');
  return response.json();
}

async function importQuarter() {
  const file = el('file').files[0];
  if (!file) return;
  try {
    if (file.size > 6000000) throw new Error('The file exceeds the source size limit.');
    const bytes = await file.arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
    const period = periods.find(p => p.sha256 === hash);
    if (!period) throw new Error('This file does not match an archived source. Download a CSV from the selected quarter’s source link.');
    const rows = parseSource(new TextDecoder().decode(bytes));
    if (rows.length !== period.publishedRows) throw new Error('The row count does not match the published snapshot.');
    period.rows = rows;
    period.full = true;
    el('period').value = period.start;
    page = 0;
    render();
    renderHistory(selectedId);
    syncUrl();
    el('import-status').textContent = 'Loaded ' + rows.length + ' registrar rows for ' + periodLabel(period) + '. Reloading clears the file.';
  } catch (error) {
    el('import-status').textContent = error.message;
  } finally {
    el('file').value = '';
  }
}

async function init() {
  const index = await data('index');
  periods = await Promise.all(index.quarters.map(async date => {
    const period = await data(date);
    return { ...period, rows: period.rows.map(normalize) };
  }));
  const select = el('period');
  for (const period of periods) select.add(new Option(periodLabel(period), period.start));
  if (index.quarters.includes(initial.get('period'))) select.value = initial.get('period');
  el('updated').textContent = 'Snapshot updated ' + index.updated + '.';
  select.disabled = false;
  for (const [control, event] of [['period', 'change'], ['sort', 'change'], ['query', 'input']]) {
    el(control).addEventListener(event, () => {
      page = 0;
      render();
      if (control === 'period') syncUrl();
    });
  }
  el('file').addEventListener('change', importQuarter);
  for (const [control, change] of [['prev', -1], ['next', 1]]) {
    el(control).addEventListener('click', () => { page += change; render(); });
  }
  el('close').addEventListener('click', () => {
    const opener = el('rows').querySelector('button[data-id="' + selectedId + '"]');
    renderHistory(null);
    syncUrl();
    (opener || el('query')).focus();
  });
  render();
  renderHistory(Number(initial.get('registrar')) || null);
  el('status').textContent = '';
  el('explorer').hidden = false;
}

init().catch(() => {
  el('status').textContent = 'The registrar snapshot could not be loaded. Reload the page or use the Interisle source below.';
});
