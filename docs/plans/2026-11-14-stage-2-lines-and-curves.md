# 段階 2（線と曲線）Implementation Plan

> **For agentic workers:** 進め方は `AGENTS.md`。Global Constraints は `docs/plans/2026-11-13-stage-1-foundation.md` の同名の節をそのまま守る（ドラッグ・同時押し・ダブルクリック・ホバー専用の操作なし、押せる部品は 40px 以上、画面の文字は日本語、`src/core` は純粋）。段階 1.5 で変わった点（多角形は幅と高さ、つまみは edge / corner / vertex、外枠での吸着、ガイド）は `docs/design.html` の 16 章にある。

**Goal:** グリッド点を順にクリックして線を引き、`S` で点を通る滑らかな曲線に変えられるようにする。ジグザグを曲線にすると波になる。点を足す・消す・角のまま残す、円を点に変える、も入れる。ベジェ曲線のハンドルは出さない。

**Architecture:** 線は既存の `PathNode` で表す（`closed: false` が線、`true` が自由な形）。曲線は、点を通る Catmull-Rom 曲線を三次ベジェ曲線に直して描く。外形・当たり判定・外枠は、その曲線を細かく刻んだ折れ線で計算する。線を引いている途中の点は、絵のデータではなく編集の状態（`EditorState.drawing`）に持つ。

## 言葉の決まり

- **線**: `PathNode` で `closed: false`。初期の名前は `線 N`。初期の見た目は `fill: null`、`stroke: DEFAULT_STYLE.fill`、`strokeWidth: 4`。
- **自由な形**: `PathNode` で `closed: true`。初期の名前は `自由な形 N`。
- **曲線**: `smooth: true` の path。`tension`（丸みの強さ）は `0..1`、初期値 `0.5`。
- **角のまま残す点**: `PathPoint.corner === true`。`smooth` のときだけ意味を持つ。`smooth: false` の path では、全部の点の `corner` を `false` にそろえる（`validateDocument` と `toPath` で直す）。

---

## Task A: 曲線の計算と path の操作（core + render）

**Files:** Create `src/core/curve.ts`、`tests/core/curve.test.ts`。Modify `src/core/{model,validate,geometry,handles}.ts`、`src/render/svg.ts`、`src/ui/propDefs.ts`、それらのテスト。

### A-1 曲線（`src/core/curve.ts`、純粋）

```ts
export interface CubicSegment { p0: Point; c1: Point; c2: Point; p1: Point }
export function pathSegments(points: PathPoint[], closed: boolean, smooth: boolean, tension: number): CubicSegment[];
export function samplePath(points: PathPoint[], closed: boolean, smooth: boolean, tension: number, perSegment?: number): Point[];   // perSegment の初期値 12
export function pathData(points: PathPoint[], closed: boolean, smooth: boolean, tension: number): string;   // SVG の d
```

- 区間の数: `closed` なら `n`、開いていれば `n − 1`（`n` は点の数。`n < 2` なら空）。
- 区間 i は点 `P1 = points[i]` から `P2 = points[i+1]`（閉じた形では最後が 0 に戻る）。前の点 `P0`、次の次の点 `P3`。開いた線の端では、無い側の点を端の点自身で代える（`P0 = P1`、`P3 = P2`）。
- `smooth` が偽: `c1 = P1`、`c2 = P2`（直線）。
- `smooth` が真: `c1 = P1 + (P2 − P0) * tension / 3`、`c2 = P2 − (P3 − P1) * tension / 3`。ただし `P1.corner` が真なら `c1 = P1`、`P2.corner` が真なら `c2 = P2`。
- `samplePath`: 各区間を `t = 0, 1/k, …, (k−1)/k` で刻み、開いた線は最後の点を足す。直線の区間（`c1 === P1` かつ `c2 === P2`）は刻まず、始点だけを入れる。`smooth` が偽なら、結果は `points` と同じ座標の並びになる。
- `pathData`: `M x y`、区間ごとに直線なら `L x y`、曲線なら `C c1x c1y c2x c2y x y`、`closed` なら最後に `Z`。数値は小数第 3 位で丸め、余分な 0 を落とす（`render/svg.ts` と同じ丸め。丸めの関数を共有する）。

### A-2 既存の関数の変更

- `localOutline(path)`: `samplePath(...)` を返す（`smooth` が偽なら今までと同じ）。`nodeBounds`、`hitTest`、`hitStack` はこれを使うので、曲線にも効く。
- `hitTest` の開いた path: 折れ線（刻んだ点）から `max(tolerance, strokeWidth / 2)` 以内。内側の判定はしない。`fill` があるときだけ、内側も当たりにする。
- `nodeToSvg(path)`: `closed` で `smooth` が偽なら今までどおり `polygon`。それ以外は `tag: 'path'`、`d = pathData(...)`。開いた線は `stroke-linecap="round"`、`stroke-linejoin="round"` を付ける。`SvgElementSpec.tag` に `'path'` を足す。
- `toPath`: 点の `corner` は全部 `false` にする。ellipse にも対応する: 8 点（角度 `0°, 45°, …, 315°`、点は `(rx cos θ, ry sin θ)`）、`closed: true`、`smooth: true`、`tension: 0.5`。名前と見た目は引き継ぐ。
- `validateDocument`: `smooth: false` の path は、点の `corner` を全部 `false` に直して受け入れる。
- `nextName(doc, kind, base?: string)`: `base` があれば、その語で番号を数える（`線`）。
- `model.ts` に足す:

```ts
export function createPathFromPoints(doc: Document, worldPoints: Point[], closed: boolean, id?: string): PathNode;
export function insertPathPoint(node: PathNode, edgeIndex: number, world: Point): PathNode;    // 辺 edgeIndex の後ろに点を足す
export function removePathPoint(node: PathNode, index: number): PathNode;                      // 残りが足りなくなるなら元の node を返す
export function setPathCorner(node: PathNode, index: number, corner: boolean): PathNode;
```

  - `createPathFromPoints`: `transform` の位置は点の外枠の中心。`points` はそこからの相対位置（`corner: false`）。`closed` が真なら `fill: DEFAULT_STYLE.fill`、`stroke: null`、名前は `自由な形 N`。偽なら `fill: null`、`stroke: DEFAULT_STYLE.fill`、`strokeWidth: 4`、名前は `線 N`。`smooth: false`、`tension: 0.5`。
  - `removePathPoint`: 開いた線は 2 点、閉じた形は 3 点を下回る削除はしない。
  - 回転している path でも、`insertPathPoint` はワールドの点をローカルに直して入れる。

### A-3 つまみ（`handles.ts`）

- 開いた path: 辺は `n − 1` 個（最後の点と最初の点の間の辺は無い）。並びは `vertex:0, edge:0, vertex:1, …, vertex:n−1`。
- `smooth` の path: 角のつまみだけ（辺のつまみは出さない）。
- 辺のつまみの位置は、両端の点の中点（今までどおり）。
- `moveHandle` の path の角・辺は今までどおり。

### A-4 設定の項目（`propDefs.ts`）

- path: `tension`（丸みの強さ、`0..1`、刻み `0.05`）を足す。`smooth` が偽のときは出さない。
- 開いた線の `strokeWidth` の下限は `1`。

### A のテスト（最低限）

- `pathSegments`: 3 点の開いた線・`smooth` 偽 → 2 区間でどちらも `c1 === p0`、`c2 === p1`。閉じた 3 点 → 3 区間。1 点 → 空。
- `smooth` 真・`tension 0.5`・点 `(0,0) (60,0) (120,0)`（開いた線）: 区間 0 の `c1 = (10,0)`（`(60−0) * 0.5 / 3`）、`c2 = (40,0)`（`60 − (120−0) * 0.5 / 3`）。
- 真ん中の点が `corner: true` なら、区間 0 の `c2 = (60,0)`、区間 1 の `c1 = (60,0)`。
- 曲線は全部の点を通る: `samplePath` の結果に、元の各点が（`toBeCloseTo` で）含まれる。
- ジグザグ `(0,40) (40,0) (80,40) (120,0) (160,40)` を `smooth` にする → 刻んだ点の y が全部 `−10 以上 50 以下`（暴れない）で、`x = 20` 付近の y が直線のとき（`20`）と違う。
- `pathData`: 開いた直線 3 点 → `M 0 0 L 60 0 L 120 0`。閉じた直線 → 最後が `Z`。`smooth` → `C` を含む。
- `tension 0` の `smooth` は、刻んだ点が直線の上に乗る。
- `nodeToSvg`: 開いた線 → `tag 'path'` で `fill "none"`、`stroke-linecap "round"`。閉じた直線の path → `tag 'polygon'`（今までどおり）。閉じた曲線 → `tag 'path'`。
- `toPath(ellipse rx 40 ry 20)`: 点が 8 個、0 番が `(40,0)`、2 番が `(0,20)`、`smooth true`。その外枠が元の楕円の外枠と 2 単位以内。
- `toPath(rect)` の点の `corner` が全部 `false`。
- `createPathFromPoints`（開いた線、点 `(0,0) (40,40) (80,0)`）: 中心 `(40,20)`、`points[0] = (−40,−20)`、`fill null`、`stroke` あり、名前 `線 1`。閉じた形 → 名前 `自由な形 1`、`fill` あり。
- `insertPathPoint`: 4 点の辺 1 に足す → 5 点で、`points[2]` が足した点。`removePathPoint`: 開いた 2 点 → 同じ参照。`setPathCorner`。
- `getHandles`: 開いた 3 点の直線 → 5 個（`vertex:0, edge:0, vertex:1, edge:1, vertex:2`）。`smooth` → 3 個で全部 `vertex`。
- `hitTest`（開いた線・`strokeWidth 4`・`fill null`）: 線の上の点 → 真。線で囲まれた内側だが線から遠い点 → 偽。
- `validateDocument`: `smooth: false` で `corner: true` の点がある path → `ok` で、返った `doc` の `corner` が `false`。
- `propDefsFor(path smooth)` に `tension` がある。`smooth` 偽 → 無い。

コミット: `feat(core): smooth paths, open lines and point editing`

---

## Task B: 線を引く操作（editor + input）

**Files:** Modify `src/editor/{state,actions}.ts`、`src/input/{keymap,keyboard}.ts`、テスト。

### B-1 状態

```ts
export interface EditorState { …; drawing: { points: Point[] } | null }   // ワールド座標。吸着した後の点
```

### B-2 actions

```ts
export function startLine(s): EditorState;                    // L
export function addLinePoint(s, p: Point, closeTolerance: number): EditorState;   // 引いている間の左クリックと Space
export function undoLinePoint(s): EditorState;                // 引いている間の右クリック・Backspace・Delete・Z
export function finishLine(s, closed?: boolean): EditorState; // Enter
export function cancelLine(s): EditorState;                   // Esc
export function toggleSmooth(s): EditorState;                 // S
export function toggleClosed(s): EditorState;                 // 設定のボタン
export function toggleCornerAtHandle(s): EditorState;         // /
export function insertPointAtHandle(s): EditorState;          // 辺のつまみをつかんで Enter
export function setTension(s, v: number, now?: number): EditorState;   // 設定のスライダー（setNodeProp でもよい）
```

- `startLine`: `drawing = { points: [] }`、選択を空にする、`heldHandle = null`、`rotateMode = false`、`multiSelect = false`、`focusArea = 'canvas'`。すでに引いている途中なら何もしない。
- `addLinePoint`: `q = snapPointToDoc(p, doc)`。点が 3 個以上あり、`q` が最初の点から `closeTolerance` 以内なら `finishLine(s, true)`。直前の点と同じ座標なら足さない。それ以外は `points` に足す。絵のデータは変えない（履歴に積まない）。
- `undoLinePoint`: 最後の点を消す。点が無ければ `cancelLine` と同じ。
- `finishLine`: 点が 2 個未満なら `notice = '点を 2 つ以上クリックしてください'` で、引いている状態のまま。`closed` で点が 3 個未満なら、開いた線として確定する。確定したら `createPathFromPoints` で作って `addNode`、1 回 `commit`、その図形を選ぶ、`drawing = null`。
- `cancelLine`: `drawing = null`、`notice = null`。絵は変わらない。
- `clickCanvas`: `drawing` があれば、左は `addLinePoint(s, p, opts.handleTolerance)`、右は `undoLinePoint` に回す（図形の選択や移動はしない）。
- `moveToCursor`（Space）: `drawing` があり `cursor` があれば `addLinePoint(s, cursor, …)`。そのために `moveToCursor(s, closeTolerance?: number)` と省略できる引数を足す（無ければ `grid.size / 2`）。
- `escape`: `drawing` があれば `cancelLine` を最優先にする。
- `undoAction`: `drawing` があれば `undoLinePoint` に回す。`redoAction` は `drawing` の間は何もしない。
- `drawing` の間、次の action は何もせず元の状態を返す: `placeShape`、`cycleSelection`、`cycleHandle`、`duplicateSelection`、`deleteSelection`（代わりに `undoLinePoint`）、`reorderSelection`、`toggleVisible`、`toggleLocked`、`toggleSolo`、`toggleMultiSelect`、`scaleSelection`、`toggleRotateMode`、`toggleFillNoneSelection`、`convertToPath`、`toggleSmooth`。`nudge` は表示を動かす（`panBy`）。拡大縮小・全体表示・グリッド・ガイドは働く。
- `toggleSmooth`: 選んだ図形のうち path のものの `smooth` を反転して 1 回 `commit`。path が 1 個も無ければ `notice = '線か自由な形を選んでください（四角と多角形は J で自由な形に変えられます）'`。`smooth` を偽にするときは、点の `corner` を全部 `false` に戻す。`heldHandle` が辺のつまみで、`smooth` になって辺のつまみが無くなるなら `heldHandle = null`。
- `toggleClosed`: 主の図形が path なら `closed` を反転。閉じるときに `fill` が `null` なら `fill = stroke ?? DEFAULT_STYLE.fill`。開くときは `fill = null`、`stroke` が `null` なら `stroke = 元の fill`、`strokeWidth = max(strokeWidth, 2)`。開いた線は 2 点以上、閉じた形は 3 点以上が要る（2 点の線は閉じられない: `notice = '閉じるには点が 3 つ以上要ります'`）。
- `toggleCornerAtHandle`: 主の図形が `smooth` の path で、`heldHandle` が `vertex:i` のとき、その点の `corner` を反転。そうでなければ `notice = '曲線の点（丸いつまみ）をつかんでから押してください'`。
- `insertPointAtHandle`: 主の図形が path で、`heldHandle` が `edge:i` のとき、その辺の中点を `snapPointToDoc` した位置に点を足し、`heldHandle = 'vertex:' + (i + 1)` にする。主の図形が polygon か rect のときは、先に `toPath` してから同じことをする。そうでなければ何もしない。
- `deleteSelection`: 主の図形が path で `heldHandle` が `vertex:i` のときは、図形ではなくその点を消す（`removePathPoint`）。消せなければ `notice = 'これ以上点を減らせません'`。消したら `heldHandle = null`。

### B-3 キー

| キー | ActionId | ラベル | group |
|---|---|---|---|
| `l` | `line` | 線 | 置く |
| `s` | `smooth` | 曲線 | 編集 |
| `/` | `corner-point` | 点を角にする | 編集 |
| `Enter` | `confirm` | 確定 | 選ぶ |

- `Enter`: `drawing` があれば `finishLine`。無くて、辺のつまみをつかんでいれば `insertPointAtHandle`。それ以外は何もしない。入力欄にフォーカスがあるときの `Enter` は、今までどおり入力欄のもの。
- `hintsFor`: `drawing` があれば最優先で `クリック / Space: 点を足す`、`Enter: 確定`、`最初の点をクリック: 閉じて確定`、`右クリック / Backspace: 一つ戻す`、`Esc: やめる`。点が 0 個のときは先頭を `グリッド点をクリック: 線を始める` にする。
- 何も選んでいないときの案内に `L: 線` を足す。path を選んでいるときの案内に `S: 曲線・直線` を足す。辺のつまみをつかんでいるとき（path・polygon・rect）に `Enter: 点を足す`、曲線の点をつかんでいるときに `/: 角にする・丸める`、path の点をつかんでいるときに `Delete: 点を消す` を足す。

### B のテスト（最低限）

- `startLine` → `drawing.points` が空、選択が空。
- `addLinePoint` を 3 回（`(3,2) (41,38) (82,1)`、グリッド 20）→ 点が `(0,0) (40,40) (80,0)`。絵の `nodes` は 0 個のまま、`history.past` は増えない。
- 同じ点を続けてクリック → 点は増えない。
- `finishLine` → `nodes` が 1 個、`kind 'path'`、`closed false`、名前 `線 1`、選択がその id、`drawing null`、`history.past` が 1 増える。`undoAction` → `nodes` 0 個。
- 点が 1 個で `finishLine` → `drawing` は残り、`notice` が出る。
- 点が 3 個あるとき、最初の点の近く（`closeTolerance` 以内）を `addLinePoint` → 閉じた形で確定（`closed true`、名前 `自由な形 1`）。
- `undoLinePoint`: 3 点 → 2 点。0 点で呼ぶ → `drawing null`。
- `clickCanvas`（左）が `drawing` の間は点を足し、図形があっても選ばない。右クリックで一つ戻る。
- `escape` → `drawing null`、絵は変わらない。
- `drawing` の間の `placeShape('rect')` → 状態が変わらない。
- `toggleSmooth`: 線を選んで → `smooth true`。もう一度 → `false` で `corner` が全部 `false`。rect だけを選んで → `notice`。
- `toggleClosed`: 3 点の線 → `closed true` で `fill` が入る。もう一度 → `closed false`、`fill null`、`stroke` あり。2 点の線 → `notice` で変わらない。
- `toggleCornerAtHandle`: `smooth` の path で `heldHandle 'vertex:1'` → `points[1].corner true`。`smooth` でない → `notice`。
- `insertPointAtHandle`: 4 点の path で `heldHandle 'edge:1'` → 5 点、`heldHandle 'vertex:2'`。rect で `heldHandle 'edge:0'` → `kind 'path'` で 5 点。
- `deleteSelection`: path で `heldHandle 'vertex:1'` → 点が 1 個減り、図形は残る。3 点の閉じた形 → `notice` で減らない。
- keymap: `l` `s` `/` `Enter` が引ける。キーの重複なし。`hintsFor` が `drawing` の案内を返す。

コミット: `feat(editor): line drawing, smoothing and point editing actions`

---

## Task C: 画面（canvas + panels + toolbar + e2e）

**Files:** Modify `src/ui/{CanvasView,PropsPanel,Toolbar,KeyHints}.tsx`、`src/styles.css`、`src/App.tsx`、`e2e/*.spec.ts`、`README.md`。Create `e2e/lines.spec.ts`。

### C-1 キャンバス

- **線を引いている途中の表示**: 確定した点を結ぶ折れ線（`--accent`、画面上で 2px）、各点に小さな丸、最後の点から吸着先までの点線。最初の点は少し大きい輪で描き、点が 3 個以上のときは `閉じる` と分かるよう二重の輪にする。`data-testid="drawing-preview"`。
- 線を引いている間、キャンバスのカーソルは `crosshair`。
- **path の描画**: `nodeToSvg` の結果をそのまま使う（`tag: 'path'` に対応する。属性 `stroke-linecap` などは React の名前に直す）。
- **選んだ図形の外形の強調**: `worldOutline`（曲線は刻んだ点）を使う。開いた線は閉じずに描く。
- **つまみ**: `corner: true` の点（曲線の中の角）は、丸ではなくひし形で描く。

### C-2 設定パネル（path を 1 個選んでいるとき）

図形の操作のボタンの列に足す: `曲線にする S` / `直線に戻す S`（今の状態で文を変える。`data-path-action="smooth"`）、`閉じる` / `開く`（`data-path-action="closed"`）。つまみをつかんでいるとき、その種類に合わせて出す: `点を足す Enter`（辺）、`点を角にする /` / `点を丸める /`（曲線の点）、`点を消す Delete`（path の点）。押すと対応する action を呼ぶ。高さ 40px 以上。`丸みの強さ` のスライダーは `propDefsFor` から出る。

### C-3 道具の帯

- `P 多角形` の右に `L 線`（引いている間は押された見た目）、編集の列に `S 曲線` を足す。
- **2 段以内に収める**（幅 1280px）。見出し `Shape Snap` と `作品` `書き出し` を同じ 1 行目に置き、道具のボタンをその下の 1 段に収める。収めるために、ボタンの左右の余白と文字を詰めてよい（高さは 40px 以上のまま）。幅 1024px では 3 段までよい。
- e2e で、幅 1280px のとき `header.toolbar` の高さが 120px 以下であることを確かめる。

### C-4 e2e（`e2e/lines.spec.ts`。単独キーとクリックとホイールだけ）

- `l` → グリッド点を 5 回クリック（ジグザグ）→ `Enter` → 図形が 1 個、`kind 'path'`、`closed false`、点が 5 個で全部グリッドの倍数。`[data-node-id]` の要素が `path` で `fill="none"`。
- 引いている途中に `[data-testid="drawing-preview"]` が見える。確定すると消える。
- 引いている途中の右クリック → 点が 1 個減る。`Escape` → 図形は増えない。
- 3 点クリックして最初の点をクリック → `closed true`。
- 線を選んで `s` → `smooth true` で、要素の `d` に `C` が入る。もう一度 `s` → `C` が無い。
- 曲線にした線の `丸みの強さ` を変える → `tension` が変わり、`d` が変わる。
- 曲線の点（`[data-handle-id="vertex:1"]`）をつかんで別のグリッド点をクリック → その点が動き、曲線の `d` が変わる。`/` → `points[1].corner true`。
- 直線の path で辺のつまみをつかんで `Enter` → 点が 1 個増える。点をつかんで `Delete` → 点が 1 個減り、図形は残る。
- 円を置いて `j` → `kind 'path'`、点が 8 個、`smooth true`。
- 線を書き出した SVG に `<path` と `stroke-linecap` がある。
- `[data-path-action="closed"]` を押す → `closed` が反転する。
- 幅 1280px で `header.toolbar` の高さが 120px 以下。足した全部のボタンが 40px 以上。
- 既存の e2e は、変えた仕様に合わせて直す（消さない）。`e2e/promises.spec.ts` の通しの筋書きに「線を引いて曲線にする」を足す。
- スクリーンショットを `.superpowers/sdd/2026-11-14-stage-2-lines-and-curves/screens/` に保存する（1280×800、明るい表示）: `drawing.png`（ジグザグを 4 点まで引いた途中）、`wave.png`（ジグザグを確定して曲線にし、選んだ状態）、`dark.png`（`wave.png` と同じ状態を暗い表示で）。

### C-5 README

キーの一覧に `L` `S` `/` `Enter` を足し、「線を引く」「曲線に変える」「点を足す・消す」の説明を足す。

コミット: `feat(ui): line drawing preview, curve controls and compact toolbar`
