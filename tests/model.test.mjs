import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, normalize, periodLabel } from '../web/model.mjs';

const rows = [[1, 'Big Registrar', 1000000, 200], [20, 'Small Provider', 5000, 100]].map(normalize);
test('compare uses a same-period portfolio denominator and parses ID searches exactly', () => {
  assert.equal(compare(rows, '', 'rate')[0].id, 20);
  assert.equal(compare(rows, '', 'domains')[0].id, 1);
  assert.equal(compare(rows, ' small ', 'name')[0].rate, 200);
  assert.deepEqual(compare(rows, '2', 'domains'), []);
  assert.equal(compare(rows, '20', 'domains')[0].id, 20);
});
test('each bundled period has source, coverage and unique registrar IDs', () => {
  const base = new URL('../web/data/', import.meta.url);
  const read = file => JSON.parse(readFileSync(new URL(file + '.json', base)));
  const index = read('index');
  assert.ok(index.quarters.length >= 6);
  for (const start of index.quarters) {
    const quarter = read(start);
    assert.equal(quarter.start, start);
    assert.match(periodLabel(quarter), /20[0-9]{2}/);
    assert.match(quarter.source, /^https:\/\/www\.cybercrimeinfocenter\.org\/s\//);
    const ids = new Set();
    for (const row of quarter.rows.map(normalize)) {
      assert.ok(row.portfolio > 0 && row.domains >= 0 && Number.isFinite(row.rate));
      assert.ok(!ids.has(row.id) && row.id !== 9999 && row.id !== 9998);
      ids.add(row.id);
    }
  }
});
