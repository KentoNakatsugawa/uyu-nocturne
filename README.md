# うゆの夜想曲

ポメチワの女の子「うゆ」が主人公の、ストーリー×横スクロールアクションゲーム。
ゲーム本体は `index.html` の**単一HTMLファイル・外部依存ゼロ**（フォント・音・画像すべて内蔵）。

▶ Play: https://kentonakatsugawa.github.io/uyu-nocturne/

## テスト

ゲームのロジックのうち、DOMに依存しない純粋関数をユニットテストしている。

```bash
npm test        # node --test（Node 18+ 標準テストランナー、追加インストール不要）
```

- `test/game-logic.test.js` … `nf`（音名→周波数）/ `fmtTime` / `endingRank`（エンド分岐）/ `betterRecord`（ベスト記録更新）/ `buildSong`（BGM生成）を検証
- `test-support/load-game.js` … `index.html` の `<script>` を DOM/Canvas/Audio をダミー化した Node vm 上でそのまま実行し、`module.exports` した関数を取り出すローダー。**スクリプトが例外なくロードできること自体のスモークテストにもなっている**

> 単一HTML構成を崩さないため、ロジックは外部JSに分割していない。テスト用の
> `module.exports` は `typeof module !== 'undefined'` ガード付きで、ブラウザ実行時は無視される。
