'use strict';
/*
 * みんなのランキングAPI（Vercel Serverless Function + Vercel Blob）
 *   GET  /api/ranking        → { list: 上位10件 }
 *   POST /api/ranking {name,rank,lv,orbs,max,time} → { pos: 順位(圏外=0), list: 上位10件 }
 *
 * - 永続化は Blob の ranking.json 1ファイル（上位100件のみ保持）
 * - 認証なしの公開APIなので validateEntry で値域を厳しめに検証する
 * - 読み→マージ→書きに一瞬の競合窓があるが、ゲームの投稿頻度では実害なし
 * - @vercel/blob は関数内で動的importする（ローカルの node --test が依存なしで通るように）
 */
const PATH = 'ranking.json';
const CAP_STORE = 100;   // 保存する件数
const CAP_RETURN = 10;   // APIが返す件数

// 並び順はゲーム本体と同一：エンド > レベル > かけら > タイム（短い方）
function cmpEntry(a, b) {
  if (b.rank !== a.rank) return b.rank - a.rank;
  if (b.lv !== a.lv) return b.lv - a.lv;
  if (b.orbs !== a.orbs) return b.orbs - a.orbs;
  return a.time - b.time;
}

// 不正値は null。名前は制御文字・タグ文字を除去して10文字まで
function validateEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const name = String(x.name || '').replace(/[\u0000-\u001F<>]/g, '').trim().slice(0, 10) || 'ななしのわんこ';
  const rank = +x.rank, lv = +x.lv, orbs = +x.orbs, max = +x.max, time = +x.time;
  if (![1, 2, 3].includes(rank) || ![1, 2, 3].includes(lv)) return null;
  if (!Number.isFinite(orbs) || !Number.isFinite(max) || !Number.isFinite(time)) return null;
  if (orbs < 0 || max < 0 || orbs > max || max > 40) return null;
  if (time < 20 || time > 7200) return null; // 20秒未満・2時間超は物理的にありえない
  return { name, rank, lv, orbs: Math.round(orbs), max: Math.round(max), time: Math.round(time * 10) / 10, at: Date.now() };
}

async function readList() {
  const { list } = await import('@vercel/blob');
  const r = await list({ prefix: PATH, limit: 1 });
  const b = r.blobs.find(v => v.pathname === PATH);
  if (!b) return [];
  // BlobのCDNキャッシュを避けるためクエリでバスト
  const res = await fetch(b.url + '?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) return [];
  const j = await res.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

async function writeList(l) {
  const { put } = await import('@vercel/blob');
  await put(PATH, JSON.stringify(l), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json',
  });
}

// GitHub Pages版・ローカルfile://からも叩けるようにCORSは全開放（書き込みは検証で防御）
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    if (req.method === 'GET') {
      const l = await readList();
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ list: l.slice(0, CAP_RETURN) });
      return;
    }
    if (req.method === 'POST') {
      const entry = validateEntry(req.body);
      if (!entry) { res.status(400).json({ error: 'invalid entry' }); return; }
      const l = await readList();
      l.push(entry);
      l.sort(cmpEntry);
      const stored = l.slice(0, CAP_STORE);
      await writeList(stored);
      const pos = stored.indexOf(entry) + 1; // sliceで溢れたら-1+1=0（圏外）
      res.status(200).json({ pos, list: stored.slice(0, CAP_RETURN) });
      return;
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
};

// テスト用（ブラウザには配信されないサーバー側コード）
module.exports.validateEntry = validateEntry;
module.exports.cmpEntry = cmpEntry;
