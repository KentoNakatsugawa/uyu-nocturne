'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('../test-support/load-game');

// これが例外なく通ること自体が「スクリプトがロードできる」スモークテスト
const G = loadGame();

test('スモーク：主要な純粋関数がエクスポートされている', () => {
  for (const name of ['nf', 'fmtTime', 'buildSong', 'endingRank', 'betterRecord']) {
    assert.equal(typeof G[name], 'function', name + ' が関数として存在する');
  }
  assert.equal(typeof G.SONGDEF, 'object');
  assert.equal(typeof G.RANK_NAMES, 'object');
});

test('nf：音名→周波数（A4=440基準）', () => {
  assert.ok(Math.abs(G.nf('A4') - 440) < 1e-6);
  assert.ok(Math.abs(G.nf('C4') - 261.6256) < 0.01);
  assert.ok(Math.abs(G.nf('A5') - 880) < 1e-6, 'オクターブ上は2倍');
  assert.ok(Math.abs(G.nf('A3') - 220) < 1e-6, 'オクターブ下は半分');
  assert.ok(Math.abs(G.nf('A#3') - G.nf('Bb3')) < 1e-6, '異名同音（A#3とBb3）は同じ');
  assert.equal(G.nf(0), 0, '休符(0)は0Hz');
  assert.equal(G.nf(''), 0);
});

test('fmtTime：秒→「M分SS秒」（秒は2桁ゼロ埋め・切り捨て）', () => {
  assert.equal(G.fmtTime(0), '0分00秒');
  assert.equal(G.fmtTime(5), '0分05秒');
  assert.equal(G.fmtTime(65), '1分05秒');
  assert.equal(G.fmtTime(600), '10分00秒');
  assert.equal(G.fmtTime(59.9), '0分59秒', '端数は切り捨て');
});

test('endingRank：回収率×きずなで 3/2/1 に分岐', () => {
  assert.equal(G.endingRank(0.7, 5), 3, 'TRUE条件ちょうど');
  assert.equal(G.endingRank(1, 10), 3);
  assert.equal(G.endingRank(0.7, 4), 2, 'きずな不足だとTRUEにならない');
  assert.equal(G.endingRank(0.69, 9), 2, '回収率不足だとTRUEにならない');
  assert.equal(G.endingRank(0.4, 0), 2, 'GOOD条件ちょうど');
  assert.equal(G.endingRank(0.39, 9), 1, 'ANOTHER');
  assert.equal(G.endingRank(0, 0), 1);
});

test('betterRecord：ランク > かけら数 > タイム（短い方）の優先度', () => {
  assert.equal(G.betterRecord(null, { rank: 1, orbs: 0, time: 999 }), true, '記録なしは常に更新');
  // ランク優先
  assert.equal(G.betterRecord({ rank: 2, orbs: 99, time: 1 }, { rank: 3, orbs: 0, time: 999 }), true);
  assert.equal(G.betterRecord({ rank: 3, orbs: 0, time: 999 }, { rank: 2, orbs: 99, time: 1 }), false);
  // 同ランクならかけら数
  assert.equal(G.betterRecord({ rank: 2, orbs: 5, time: 1 }, { rank: 2, orbs: 6, time: 999 }), true);
  assert.equal(G.betterRecord({ rank: 2, orbs: 6, time: 999 }, { rank: 2, orbs: 5, time: 1 }), false);
  // 同ランク・同かけらならタイムが短い方
  assert.equal(G.betterRecord({ rank: 2, orbs: 6, time: 100 }, { rank: 2, orbs: 6, time: 99 }), true);
  assert.equal(G.betterRecord({ rank: 2, orbs: 6, time: 99 }, { rank: 2, orbs: 6, time: 100 }), false);
  // 完全同一は更新しない
  assert.equal(G.betterRecord({ rank: 2, orbs: 6, time: 100 }, { rank: 2, orbs: 6, time: 100 }), false);
});

test('finaleLines：全ランクで有効な台本（[話者,本文]の配列）を返す', () => {
  for (const rank of [1, 2, 3]) {
    const lines = G.finaleLines(rank);
    assert.ok(Array.isArray(lines) && lines.length >= 3, `rank${rank} は3行以上の台本`);
    for (const l of lines) {
      assert.equal(l.length, 2, '各行は [話者, 本文] のペア');
      assert.equal(typeof l[0], 'string');
      assert.ok(typeof l[1] === 'string' && l[1].length > 0, '本文が空でない');
    }
  }
  // ランクごとに内容が異なる（分岐が機能している）
  assert.notEqual(G.finaleLines(3)[0][1], G.finaleLines(2)[0][1]);
  assert.notEqual(G.finaleLines(2)[0][1], G.finaleLines(1)[0][1]);
});

test('scenes：序章→第一章→第二章→終章の4シーン構成で、遷移先が正しい', () => {
  const sc = G.scenes();
  assert.equal(sc.length, 4);
  assert.match(sc[0].tag, /序章/);
  assert.match(sc[1].tag, /第一章/);
  assert.match(sc[2].tag, /第二章/);
  assert.match(sc[3].tag, /終章/);
  assert.deepEqual(sc[0].next, { type: 'action', stage: 0 });
  assert.deepEqual(sc[1].next, { type: 'action', stage: 1 });
  assert.deepEqual(sc[2].next, { type: 'action', stage: 2 });
  assert.deepEqual(sc[3].next, { type: 'ending' });
  // 「死者は出てこない」前提：幽霊・死を想起させる語が台本にないこと
  const allText = JSON.stringify(sc.map(s => [s.lines, s.after || []]));
  for (const ng of ['幽霊', '亡く', '死']) {
    assert.ok(!allText.includes(ng), `台本に「${ng}」が含まれない`);
  }
});

test('cmpEntry：エンド > レベル > かけら > タイム（短い方）の優先度', () => {
  const e = (rank, lv, orbs, time) => ({ rank, lv, orbs, time });
  assert.ok(G.cmpEntry(e(3, 1, 0, 999), e(2, 3, 99, 1)) < 0, 'エンド優先');
  assert.ok(G.cmpEntry(e(2, 3, 0, 999), e(2, 1, 99, 1)) < 0, '同エンドはレベル優先');
  assert.ok(G.cmpEntry(e(2, 2, 9, 999), e(2, 2, 8, 1)) < 0, '同レベルはかけら優先');
  assert.ok(G.cmpEntry(e(2, 2, 9, 10), e(2, 2, 9, 20)) < 0, '最後はタイムが短い方');
});

test('insertRanking：ソート挿入・上限・順位（圏外は0）', () => {
  const e = (rank, time) => ({ rank, lv: 1, orbs: 0, max: 0, time, name: 'x' });
  // 空リストへの挿入は1位
  let r = G.insertRanking([], e(2, 100), 3);
  assert.equal(r.pos, 1);
  assert.equal(r.list.length, 1);
  // 上位に入る
  const base = [e(3, 10), e(2, 10), e(1, 10)];
  r = G.insertRanking(base, e(3, 5), 3);
  assert.equal(r.pos, 1, 'TRUE&速タイムは1位');
  assert.equal(r.list.length, 3, 'capを超えない');
  // 圏外
  r = G.insertRanking(base, e(1, 999), 3);
  assert.equal(r.pos, 0, 'capから溢れたら圏外=0');
  // 元のリストは破壊しない
  assert.equal(base.length, 3);
});

test('esc：HTML特殊文字をエスケープする（名前入力のXSS対策）', () => {
  assert.equal(G.esc('<script>"a"&\'b\''), '&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;');
  assert.equal(G.esc('うゆ🐶'), 'うゆ🐶', '通常文字はそのまま');
});

test('buildSong：各曲が「16分 × 小節数」ぶんのステップ列になる', () => {
  for (const name of ['story', 'action', 'boss']) {
    const def = G.SONGDEF[name];
    const song = G.buildSong(def);
    assert.equal(song.steps.length, def.chords.length * 16, name + ' のステップ数 = 小節数×16');
    assert.ok(song.stepMs > 0, name + ' の stepMs は正');
    assert.ok(song.steps.some(s => s.bass), name + ' にベース音がある');
    // lead/arp は休符(0)か正の周波数のいずれか
    for (const st of song.steps) {
      if (st.lead) assert.ok(st.lead > 0, name + ' の lead は正の周波数');
      if (st.arp) assert.ok(st.arp > 0, name + ' の arp は正の周波数');
    }
  }
});

test('buildSong：ベース音は各小節ルート音の1オクターブ下', () => {
  const def = G.SONGDEF.story;
  const song = G.buildSong(def);
  const root = G.nf(def.chords[0][0]); // 1小節目のルート
  const firstBass = song.steps.find(s => s.bass).bass;
  assert.ok(Math.abs(firstBass - root / 2) < 1e-6);
});
