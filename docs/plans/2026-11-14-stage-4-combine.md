# 段階 4（結合とくり抜き）Implementation Plan

> **For agentic workers:** 進め方は `AGENTS.md`。Global Constraints は `docs/plans/2026-11-13-stage-1-foundation.md` の同名の節をそのまま守る（ドラッグ・同時押し・ダブルクリック・ホバー専用の操作なし、押せる部品は 40px 以上、画面の文字は日本語）。これまでの決まりは `docs/design.html` の 16〜18 章にある。

**Goal:** 図形に「足す」「抜く」の役割を付け、重なった図形を一つの輪郭にまとめて書き出せるようにする。抜く図形は、それより奥にある図形をくり抜く。元の図形は残るので、あとから位置や大きさを直せる。

**Architecture:** 結合は、絵のデータを変えない「見え方の計算」として作る（`combineDocument(doc)`）。一番上の図形を奥から手前へ順に見て、`expandNode` で葉に展開し、Paper.js の図形演算（`unite` `subtract`）で輪郭を作る。結果は SVG の `d`（パスの文字列）の並び。キャンバスの「結合を表示」と、書き出しの両方が同じ計算を使う。

**依存:** `paper`（Paper.js）を足す。段階 4 で足してよい依存はこれだけ。

## 結合の決まり（`combineDocument`）

1. 一番上の図形のうち `visible` が真のものを、奥から手前へ順に処理する。役割は一番上の図形の `role` で決まる（入れ物の中の図形の `role` は見ない）。
2. 各図形を `expandNode` で葉に展開し、葉を順に処理する。結果の並び `items`（奥から手前）を作っていく。
3. **開いた線**（`kind 'path'` で `closed: false`）は結合に入れない。役割が「足す」なら、そのまま線として `items` に積む（`kind: 'stroke'`）。役割が「抜く」の開いた線は無視する。
4. **足す**の葉（閉じた形）: `items` の最後が `kind: 'region'` で、見た目（`fill` `stroke` `strokeWidth` `opacity`）が全部同じなら、その領域に合体する（`unite`）。そうでなければ、新しい領域として積む。
5. **抜く**の葉（閉じた形）: それまでに積んだ全部の領域から、この葉の形を引く（`subtract`）。空になった領域は消す。線（`stroke`）には何もしない。
6. 塗りが `null` の閉じた形も、形としては同じように扱う（輪郭だけの領域になる）。
7. 曲線はベジェ曲線のまま保つ（折れ線に直さない）。

```ts
// src/core/combine.ts
export interface CombinedItem {
  kind: 'region' | 'stroke';
  d: string;             // ワールド座標の SVG パス
  style: Style;
  bounds: Bounds;        // 線の太さは含めない
  area: number;          // region の面積（絶対値）。stroke は 0
  sourceIds: string[];   // 元になった一番上の図形の id（重複なし、出てきた順）
}
export type CombineResult =
  | { ok: true; items: CombinedItem[] }
  | { ok: false; message: string; nodeId: string | null };   // nodeId = 失敗したときに処理していた一番上の図形
export function combineDocument(doc: Document): CombineResult;
export function hasSubtract(doc: Document): boolean;        // visible で role 'subtract' の図形が 1 個でもあるか
```

- 葉を Paper.js の形に直す: rect は `Path.Rectangle`（`cornerRadius` があれば角丸）、ellipse は `Path.Ellipse`、polygon と path は `pathData(...)`（`src/core/curve.ts`）か `localOutline` から作る。どれも、ローカル座標で作ってから、回転して中心へ動かす。
- 計算の途中で例外が出たら、`{ ok: false, message: '結合できませんでした', nodeId }` を返す（例外を外へ出さない）。
- `d` の数値は小数第 3 位で丸める（`curve.ts` の丸めを使う）。
- Paper.js は Node（Vitest）でも DOM なしで動かす。最初に `paper.setup(new paper.Size(1, 1))` を 1 回だけ呼ぶ。**最初の手順として、Vitest の中で `unite` と `subtract` が動くことを小さなテストで確かめること。** どうしても動かない場合だけ、代わりに `polygon-clipping` を使ってよい（その場合は、曲線を 1 区間 24 点・楕円を 128 角形に刻んでから計算し、「曲線はベジェ曲線のまま」のテストを外して、報告に理由を書く）。

---

## Task A: 結合の計算と書き出し（core + render）

**Files:** Create `src/core/combine.ts`、`tests/core/combine.test.ts`。Modify `package.json`、`src/core/model.ts`、`src/render/svg.ts`、テスト。`tests/promises.test.ts` の「`src/core` に `window` `document.` が無い」検査は、`combine.ts` でも通ること。

```ts
// model.ts
export function setRole(doc: Document, ids: string[], role: Role): Document;
// render/svg.ts
export interface ExportOptions { area: 'content' | Bounds; margin: number; background: string | null; combine?: boolean }
export function combinedToSvg(doc: Document, opts: ExportOptions): string;   // combineDocument が失敗したら例外を投げる（message は CombineResult の message）
```

- `combinedToSvg`: 領域は `<path d="…" fill="…" fill-rule="nonzero" …>`、線は `<path d="…" fill="none" stroke="…" stroke-width="…" stroke-linecap="round" stroke-linejoin="round">`。見た目の属性の決まりは `nodeToSvg` と同じ（`fill: null` は `"none"`、`stroke` が無ければ付けない、`opacity 1` は付けない）。`area: 'content'` の外枠は、`items` の `bounds` を合わせ、線の太さの半分を足したもの。`items` が空なら `(0,0,100,100)`。背景と `viewBox` の決まりは `documentToSvg` と同じ。
- `documentToSvg(doc, opts)`: `opts.combine` が真なら `combinedToSvg` の結果を返す。偽か無ければ今までどおり。ただし今までどおりのときも、`role 'subtract'` の図形は書き出さない（抜く図形は、結合しないと意味を持たないため）。

### A のテスト（最低限）

`rect(id, x, y)` は中心 `(x,y)`、`80×80`、`fill '#1d2330'` の四角とする。面積は 1% 以内で比べる。

- Paper.js が Vitest で動く: 2 つの四角の `unite` と `subtract` の面積が正しい。
- 同じ見た目の `rect(0,0)` と `rect(40,0)`（重なる）→ 領域 1 個、面積 `9600`、`bounds` が `−40,−40,80,40`、`sourceIds` が 2 個。
- 色が違う 2 個 → 領域 2 個。
- 離れた同じ見た目の 2 個（続けて並ぶ）→ 領域 1 個（複合パス）、面積 `12800`。
- 同じ色の間に違う色が挟まる（a 黒、b 赤、c 黒）→ 領域 3 個。
- `rect(0,0)` の上に、抜く円（中心 `(0,0)`、`rx = ry = 20`）→ 領域 1 個、面積 `6400 − π * 400`（約 `5143`）、`d` に `C` か `c` を含む（曲線のまま）。
- 抜く図形は奥だけをくり抜く: `[rect a 足す, 円 抜く, rect c 足す（同じ位置、色違い）]` → 2 個で、c の面積は `6400` のまま。
- 抜く図形が全部を覆う → `items` が空。
- 抜く図形が何にも重ならない → 元のまま。
- 開いた線（足す）→ `kind 'stroke'` が 1 個、`area 0`。その上に抜く四角を置いても線は変わらない。抜くの線 → 何も出ない。
- 非表示の図形は入らない。
- `repeat(rect, count 3, dx 100)` → 領域 1 個、面積 `19200`。入れ物の `role` が `subtract` なら、複製の全部がくり抜く。
- 回転 45 の rect → `bounds.minX ≈ −56.57`。
- 滑らかな閉じた path（足す）→ `d` に `C` を含む。
- 角丸の rect（`cornerRadius 10`）の面積が `6400 − (4 − π) * 100`（約 `6314`）。
- 塗り `null`・線ありの閉じた形 → 領域になり、`style.fill` が `null`。
- `hasSubtract`。`setRole` が元の `doc` を書き換えない。
- `combinedToSvg`: `<path` の数が `items` の数と同じ。`fill-rule="nonzero"` がある。`viewBox`（`rect(0,0)` 1 個、margin 10 → `"-50 -50 100 100"`）。
- `documentToSvg(doc, { combine: true })` が `combinedToSvg` と同じ。`combine` 無しで抜く図形がある → その図形の要素が出ない。
- 既存のテストは通す。

コミット: `feat(core): combine shapes with add and subtract roles`

---

## Task B: 操作と画面（editor + input + ui + e2e）

**Files:** Modify `src/editor/{state,actions}.ts`、`src/input/{keymap,keyboard}.ts`、`src/ui/{CanvasView,ShapeList,PropsPanel,Toolbar,ExportDialog,Banner}.tsx`、`src/styles.css`、`src/main.tsx`、`e2e/*.spec.ts`、`README.md`、テスト。Create `e2e/combine.spec.ts`。

### B-1 状態と操作

```ts
export interface EditorState { …; combineView: boolean }
export function toggleRole(s): EditorState;           // T
export function toggleCombineView(s): EditorState;    // 3
```

- `toggleRole`: 選んだ一番上の図形（locked を除く）の `role` を反転して 1 回 `commit`。選択が無ければ `notice = '図形を選んでから T を押してください'`。抜くにしたとき `notice = '抜く図形にしました。奥にある図形をくり抜きます（3 で結合を表示）'`。
- `toggleCombineView`: `combineView` を反転。絵のデータは変えない（履歴に積まない）。入れるときに `combineDocument` が失敗するなら、入れずに `notice = '結合できませんでした: ' + 図形の名前` にして、その図形を選ぶ。
- `loadDocument` は `combineView = false` にする。
- キー: `t` `role` 足す・抜く（編集）、`3` `combine-view` 結合を表示（見る）。
- `hintsFor`: 図形を選んでいるときの案内に `T: 足す・抜く` を足す。`combineView` の間は、先頭に `{ keys: '3', label: '結合の表示を終える' }` を足す。

### B-2 キャンバス

- **ふつうの表示**（`combineView` が偽）: 抜く図形は、中身を塗らずに、斜線の模様（`<pattern>`、色は `--subtract: #e5484d`、不透明度 0.35）と、同じ色の点線の輪郭で描く。`data-role="subtract"` を図形の `<g>` に付ける。足す図形は今までどおり。
- **結合の表示**（`combineView` が真）: 図形そのものは描かず、`combineDocument` の結果を `<path>` で描く（`<g data-testid="combined">` の中。各 `<path>` に `data-combined-kind`）。選択の強調、つまみ、当たり判定、移動などの操作は、今までどおり元の図形に対して働く（描き方だけが変わる）。抜く図形は、選んでいるときだけ点線の輪郭を出す。
- 結果は、絵のデータが変わったときだけ計算し直す（`useMemo`）。計算が失敗したら、`combineView` を切り、`Banner` に `結合できませんでした: 図形の名前` を出して、その図形を選ぶ。
- 結合の表示の間、キャンバスの左上に `結合を表示中（3 で戻る）` の小さな札を出す（`data-testid="combine-badge"`）。

### B-3 パネルと道具の帯

- **図形リスト**: 抜く図形の行に `抜く` の札を付ける（`data-role-badge`）。行のボタンは増やさない。
- **設定パネル**の操作のボタンに `抜くにする T` / `足すにする T`（今の役割で文を変える、`data-op="role"`）。
- **道具の帯**: `T 足す・抜く`、`3 結合を表示`（入っている間は押された見た目）を足す。幅 1280px で `header.toolbar` の高さ 120px 以下のまま。収まらなければ、`Delete 消す` `F 手前へ` `B 奥へ` を道具の帯から外してよい（キーと設定パネルのボタンで使えるため。外す場合は、設定パネルの操作のボタンに `手前へ F` `奥へ B` `消す Delete` があることを確かめ、無ければ足す）。
- **書き出し**: `一つの輪郭にまとめる` のチェックボックス（`data-testid="export-combine"`）。初期値は、抜く図形が 1 個でもあれば入り、無ければ切り。SVG と PNG の両方に効く。まとめるのに失敗したら、ダイアログの中に `結合できませんでした` と出し、書き出さない。抜く図形があるのにチェックを外したときは、`抜く図形は書き出されません` と小さく出す。
- DEV の窓口に `combine: () => combineDocument(現在の doc)` を足す。

### B-4 e2e（`e2e/combine.spec.ts`。単独キーとクリックとホイールだけ）

- 四角を置き、その上に円を置いて `t` → 円の `role` が `subtract`、`[data-role="subtract"]` がある、リストに `抜く` の札。
- `3` → `[data-testid="combined"]` に `path` が 1 個、`combine-badge` が見える。`combine()` の結果の面積が、四角から円を引いた値（1% 以内）。もう一度 `3` → 元の表示に戻る。
- 結合の表示の間に、円を矢印キーで動かす → 結果の `d` が変わる（元の図形を直せる）。
- 同じ色の四角を 2 個重ねて `3` → `path` が 1 個。片方の色を変える → 2 個。
- `z` で `t` が戻る（`role` が `add` に戻る）。
- 書き出し: 抜く図形があると `export-combine` が入っている。SVG を書き出す → `<path` があり、`<ellipse` が無い。チェックを外して書き出す → `<rect` があり、円の要素が無い。
- PNG を `一つの輪郭にまとめる` で書き出す → PNG の印がある。
- 連続配置（四角 ×3）に抜く円を重ねて `3` → 結果が 1 個以上で、エラーにならない。
- 幅 1280px で `header.toolbar` の高さが 120px 以下。足した全部のボタンが 40px 以上。
- 既存の e2e は、変えた仕様に合わせて直す（消さない）。`e2e/promises.spec.ts` の通しの筋書きに「抜く図形にして、まとめて書き出す」を足す。
- スクリーンショットを `.superpowers/sdd/2026-11-14-stage-4-combine/screens/` に保存（1280×800、明るい表示）: `roles.png`（四角 2 個と抜く円、ふつうの表示、円を選んだ状態）、`combined.png`（同じ絵を結合の表示にした状態）。

### B のテスト（単体、最低限）

- `toggleRole`: 選んだ図形の `role` が反転し、`undoAction` で戻る。選択なし → `notice`。locked は変わらない。
- `toggleCombineView`: `combineView` が反転し、`history.past` は増えない。`loadDocument` で偽に戻る。
- keymap: `t` と `3` が引ける。キーの重複なし。`hintsFor` が `combineView` の案内を先頭に返す。

### B-5 README

`T` と `3`、「足す・抜く」「結合を表示」「一つの輪郭にまとめて書き出す」の説明を足す。開いた線は結合に入らないことも書く。

コミット: `feat(ui): add/subtract roles, combined view and combined export`
