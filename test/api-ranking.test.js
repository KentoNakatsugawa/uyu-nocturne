'use strict';
const test = require('node:test');
const assert = require('node:assert');
// @vercel/blob は関数内で動的importしているので、依存未インストールでも require できる
const api = require('../api/ranking.js');

test('validateEntry：正常値はサニタイズして通す', () => {
  const e = api.validateEntry({ name: 'うゆ', rank: 3, lv: 2, orbs: 20, max: 27, time: 300.55 });
  assert.ok(e);
  assert.equal(e.name, 'うゆ');
  assert.equal(e.rank, 3);
  assert.equal(e.time, 300.6, 'タイムは0.1秒に丸める');
  assert.equal(typeof e.at, 'number');
});

test('validateEntry：名前のサニタイズ（タグ文字除去・10文字制限・空はデフォルト名）', () => {
  assert.equal(api.validateEntry({ name: '<script>x', rank: 1, lv: 1, orbs: 0, max: 10, time: 60 }).name, 'scriptx');
  assert.equal(api.validateEntry({ name: 'あいうえおかきくけこさし', rank: 1, lv: 1, orbs: 0, max: 10, time: 60 }).name, 'あいうえおかきくけこ');
  assert.equal(api.validateEntry({ name: '  ', rank: 1, lv: 1, orbs: 0, max: 10, time: 60 }).name, 'ななしのわんこ');
});

test('validateEntry：不正値はnull（公開APIの防御）', () => {
  const base = { name: 'x', rank: 3, lv: 1, orbs: 5, max: 27, time: 300 };
  assert.equal(api.validateEntry(null), null);
  assert.equal(api.validateEntry({ ...base, rank: 4 }), null, 'エンドは1-3のみ');
  assert.equal(api.validateEntry({ ...base, lv: 0 }), null, 'レベルは1-3のみ');
  assert.equal(api.validateEntry({ ...base, orbs: 30, max: 27 }), null, 'かけら>最大は不正');
  assert.equal(api.validateEntry({ ...base, max: 999 }), null, '最大かけらの上限');
  assert.equal(api.validateEntry({ ...base, time: 5 }), null, '20秒未満はチート扱い');
  assert.equal(api.validateEntry({ ...base, time: 99999 }), null, '2時間超は不正');
  assert.equal(api.validateEntry({ ...base, orbs: 'abc' }), null, '数値でないものは不正');
});

test('cmpEntry：ゲーム本体と同じ優先度（エンド>レベル>かけら>タイム）', () => {
  const e = (rank, lv, orbs, time) => ({ rank, lv, orbs, time });
  assert.ok(api.cmpEntry(e(3, 1, 0, 999), e(2, 3, 99, 1)) < 0);
  assert.ok(api.cmpEntry(e(2, 3, 0, 999), e(2, 1, 99, 1)) < 0);
  assert.ok(api.cmpEntry(e(2, 2, 9, 999), e(2, 2, 8, 1)) < 0);
  assert.ok(api.cmpEntry(e(2, 2, 9, 10), e(2, 2, 9, 20)) < 0);
});
