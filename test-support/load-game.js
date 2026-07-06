'use strict';
/*
 * index.html の <script> をそのまま Node の vm 上で実行し、
 * module.exports に出した純粋関数を取り出すためのローダー。
 *
 * ゲーム本体は「単一HTML・外部依存ゼロ」を維持したいので、ロジックを外部JSに
 * 切り出さず、DOM/Canvas/Audio をダミー化して丸ごと読み込む方式にしている。
 * これにより「スクリプトが例外なくロードできる」こと自体もスモークテストになる。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 任意のプロパティ参照・メソッド呼び出し・new を安全に呑み込む DOM/要素スタブ。
// $('#x').classList.toggle(...) や ctx.createLinearGradient(...).addColorStop(...) の
// ような連鎖も、すべて同じダミーを返すことで落ちないようにする。
function makeStub() {
  const handler = {
    get(_t, prop) {
      if (prop === 'style') return new Proxy({}, { get() { return ''; }, set() { return true; } });
      if (prop === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (prop === 'length') return 0;
      if (prop === Symbol.iterator) return function* () {};
      // textContent / innerHTML / width などの読み出しも、呼び出しも同じダミーで吸収
      return makeStub();
    },
    set() { return true; },
    apply() { return makeStub(); },
    construct() { return makeStub(); }
  };
  return new Proxy(function () {}, handler);
}

function loadGame() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html に <script> ブロックが見つからない');
  const code = m[1];

  const moduleObj = { exports: {} };
  const sandbox = {
    window: makeStub(),
    document: makeStub(),
    location: { hostname: 'localhost' },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    module: moduleObj,
    exports: moduleObj.exports,
    AudioContext: undefined,
    webkitAudioContext: undefined
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'uyu-game-inline.js' });
  return moduleObj.exports;
}

module.exports = { loadGame };
