# 段階 1.5（使ってみての改善）Implementation Plan

> **For agentic workers:** 進め方は `AGENTS.md`。Global Constraints は `docs/plans/2026-11-13-stage-1-foundation.md` の同名の節をそのまま守る（ドラッグ・同時押し・ダブルクリック・ホバー専用の操作なし、押せる部品は 40px 以上、画面の文字は日本語、`src/core` は純粋）。

**Goal:** 使う人の感想（2026-11-14）を反映する。中心は「角と辺がグリッドに乗る」こと。あわせて、角のつまみ、揃える・間隔・拡大縮小・回転・ガイド・塗りなしを足し、グリッドと吸着先を見やすくする。

**使う人の感想と対応:**

| 感想 | 対応 | Task |
|---|---|---|
| 三角形のつまみの変形に違和感。角や辺がグリッドに乗らない | 多角形を「幅と高さの箱」に収める形に変える。角のつまみは角をグリッド点へぴったり動かす | A |
| 吸着が「決まった分だけ動く」ように見える | 移動と矢印キーは、図形の外枠をグリッドの線に合わせる | A |
| 多角形は辺と角につまみ、円は 8 方向 | 四角と円は辺 4 + 角 4、多角形と自由な形は辺 + 角 | A |
| 図形の拡大、縮小 | `,` 縮小、`.` 拡大 | B |
| 複数選択時に揃える（上・中央・下） | 揃える 6 種 | B |
| 複数選択時の図形間の調節 | 間隔のスライダーと「等間隔」 | B |
| 回転を十字キーで直感的に | `V` で回転の状態に入り、矢印で回す | B |
| ガイドライン機能 | `-` 横のガイド、`I` 縦のガイド | B |
| 塗りなし | `N` で切り替え。線が無ければ線を付ける | B |
| バーと数値のリアルタイム対応 | 数値の欄は打った瞬間に反映 | C |
| ルーラーのような罫線（薄い水色） | グリッドを線で描く。5 本ごとに少し濃く | C |
| 吸着の位置がわかりにくい | 吸着先に十字の印と座標の表示 | C |

---

## Task A: グリッドに乗る形とつまみ（core + editor）

**Files:** Modify `src/core/{types,model,validate,geometry,handles}.ts`, `src/editor/{state,actions}.ts`, `src/render/svg.ts`, `src/ui/propDefs.ts`, それらのテスト。型の変更で壊れる UI のファイルは、コンパイルが通る最小限だけ直す（見た目の作り込みは Task C）。

### A-1 多角形を箱に収める

```ts
// types.ts — radius をやめる
export interface PolygonNode extends NodeBase { kind: 'polygon'; sides: number; width: number; height: number; starRatio: number }
export type Anchor = 'auto' | 'center' | 'tl' | 'tr' | 'bl' | 'br';
```

- `localOutline(polygon)`: まず半径 1 の正多角形（i 番目の角度は `-90° + i * 360°/sides`。`starRatio < 1` なら従来どおり点は `2 * sides` 個）を作る。その外枠 `(minX,minY,maxX,maxY)` を求め、外枠が `[-width/2, width/2] × [-height/2, height/2]` にちょうど重なるよう、x と y を別々に拡大・平行移動する。
  - 例: `sides 3, width 80, height 80` → `[(0,-40),(40,40),(-40,40)]`。
  - 例: `sides 4, width 80, height 80` → `[(0,-40),(40,0),(0,40),(-40,0)]`。
- `createNode('polygon')`: `sides 3`、`width = height = 4 * grid.size`、`starRatio 1`。
- `validateDocument`: 古い形（`radius` があり `width` `height` が無い polygon）は、エラーにせず新しい形に直して受け入れる。`width` と `height` は「半径 `radius` の正多角形の外枠の幅と高さ」。
- `propDefsFor(polygon)`: `sides`、`width`（幅）、`height`（高さ）、`starRatio`。`width` `height` の範囲と刻みは rect と同じ。
- `createEditorState` の `anchor` の初期値は `'auto'`。

### A-2 つまみ

```ts
export interface Handle { id: string; kind: 'edge' | 'corner' | 'vertex'; index: number; pos: Point; normal: Point }  // corner と vertex の normal は {x:0,y:0}
export function toPath(node: SceneNode): PathNode | null;   // rect・polygon → path。ellipse と path は null
```

`polygonToPath` は `toPath` に置き換える（名前は別名として残してよい）。`toPath` の結果は `points = localOutline(node)`（`corner: true`）、`closed: true`、`smooth: false`、`tension: 0.5`。ほかの項目は引き継ぐ。

| 図形 | つまみ（`nextHandleId` の順） | 動かしたとき |
|---|---|---|
| rect | `edge:0..3`（上・右・下・左）、`corner:0..3`（左上・右上・右下・左下） | 辺: 従来どおり。角: 大きさを変える（rect のまま） |
| ellipse | 同じ 8 個。角のつまみは外枠の角に置く | 辺: 従来どおり。角: `rx` と `ry` を変える（ellipse のまま） |
| polygon | `vertex:0, edge:0, vertex:1, edge:1, …`（外形の点の順に一周） | どれを動かしても、先に `toPath` で path に変える |
| path | 同じ並び | 角: その点だけ動く。辺: 両端の点が同じ量だけ動く |

- **rect・ellipse の角**: ローカル座標で考える。`t = toLocal(node, target)`、反対側の角 `o` は動かさない。新しい幅は `|t.x − o.x|`、高さは `|t.y − o.y|`。ただし `t` が `o` を越えたり `minSize` より近づいたりしたら、`o` から `minSize` 離れた位置に止める。新しい中心は、`o` と止めたあとの `t` の中点をワールドに戻したもの。
- **path の角**: `points[i] = toLocal(node, target)`。`transform` は変えない。
- **path の辺**: `d = target − handle.pos`（ワールド）。x と y をそれぞれ `snapValue(·, gridSize)` で丸めてから、ローカルの向きに直して両端の点に足す。そのため `moveHandle` に省略できる引数を足す: `moveHandle(node, handleId, target, minSize, gridSize?: number)`。`gridSize` が無ければ丸めない。
- **`nudgeHandle(node, handleId, dir, step, minSize, snap: boolean)`**: `snap` が真なら、つまみの位置の、`dir` の向きの座標を「その向きで次のグリッドの線」に進めた点を `target` にして `moveHandle` を呼ぶ（次の線: `dir > 0` なら `(floor(v / step + 1e-6) + 1) * step`、`dir < 0` なら `(ceil(v / step − 1e-6) − 1) * step`）。偽なら従来どおり `pos + dir * step`。

### A-3 移動をグリッドに合わせる

- `anchor === 'auto'` のクリック移動と `Space`: 主の図形の中心が `p`（吸着する前のクリックした点）に来るように動かしたうえで、主の図形の外枠の `minX` と `minY` が一番近いグリッドの線に乗るよう、さらにずらす。選んだ全図形を同じ量だけ動かす。`grid.snap` が偽なら中心を `p` に置くだけ。ほかの anchor は従来どおり。
- `nudge`（図形の移動）: `grid.snap` が真なら、主の図形の外枠の `minX`（横）か `minY`（縦）を、その向きで次のグリッドの線に進める量だけ、選んだ全図形を動かす（次の線の式は A-2 と同じ）。偽なら従来どおり `grid.size` 分。
- `nudge`（つまみ）: `nudgeHandle(…, grid.snap)`。
- `clickCanvas` と `moveToCursor` のつまみの移動は `moveHandle(node, id, snapPoint(p, grid), grid.size, grid.snap ? grid.size : undefined)`。
- 新しい action: `convertToPath(s)`。選んだ図形のうち `toPath` が `null` でないものを path に変えて 1 回で `commit`。`notice = '自由な形に変えました（Z で戻せます）'`。変えられる図形が無ければ `notice = '円は自由な形に変えられません（線の機能と一緒に入ります）'`。

### A のテスト（最低限）

- 三角形 `(100,100)` `80×80`: `worldOutline` が `[(100,60),(140,140),(60,140)]`。`getHandles` が 6 個で、id の順が `vertex:0, edge:0, vertex:1, edge:1, vertex:2, edge:2`。
- 三角形の `vertex:0` を `(120,40)` へ → `kind 'path'`、`points[0] = (20,-60)`、ほかの 2 点は変わらない。
- 三角形の `edge:1`（下の辺、中点 `(100,140)`）を `(107,163)` へ、`gridSize 20` → 両端が `(0,+20)` 動く（`(140,160)` と `(60,160)`）。
- rect `80×80` `(100,100)`: `getHandles` が 8 個。`corner:2`（右下、`(140,140)`）を `(180,160)` へ → `width 120`、`height 100`、中心 `(120,110)`、左上は `(60,60)` のまま。`corner:2` を `(40,40)` へ、`minSize 20` → `width 20`、`height 20`、左上は `(60,60)` のまま。
- 回転 90 の rect で `corner` を動かしても、反対側の角のワールド座標が変わらない。
- ellipse `rx 40, ry 40`: `corner:2` を `(180,160)` へ → `rx 60`、`ry 50`、中心 `(120,110)`。
- `toPath(ellipse)` → `null`。`toPath(rect)` の点が 4 個。
- 古い polygon（`radius: 40, sides: 4`）を `validateDocument` → `ok`、`width 80`、`height 80`。
- 外枠の `minX` が `63` の rect を選んで `nudge(1,0)` → `minX 80`。もう一度 → `100`。`nudge(-1,0)` を `minX 63` から → `60`。
- `anchor 'auto'` で、幅 `60` の rect を何もない点 `(203,198)` のクリックで動かす → 外枠の `minX` と `minY` が 20 の倍数。
- つまみをつかんで `nudge`: `edge:1` の x が `143` の rect で `nudge(1,0)` → 右の辺が `160`。
- `convertToPath`: rect → path、`undoAction` で rect に戻る。ellipse だけを選んでいると何も変わらず `notice` が出る。
- 既存のテストは、新しい形に合わせて直す（消さない）。

コミット: `feat(core): grid-true polygons, corner and vertex handles, edge snapping`

---

## Task B: 揃える・間隔・拡大縮小・回転・塗りなし・ガイド（core + editor + keymap）

**Files:** Create `src/core/arrange.ts`、`tests/core/arrange.test.ts`。Modify `src/core/{types,model,validate,geometry}.ts`、`src/editor/{state,actions}.ts`、`src/input/{keymap,keyboard}.ts`、テスト。

### B-1 並べる計算（`src/core/arrange.ts`、純粋）

```ts
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export function alignNodes(doc: Document, ids: string[], mode: AlignMode): Document;
export function distributeNodes(doc: Document, ids: string[], axis: 'x' | 'y', gap: number | null): Document;
export function averageGap(doc: Document, ids: string[], axis: 'x' | 'y'): number | null;   // 2 個未満なら null
export function scaleNode(node: SceneNode, factor: number): SceneNode;
export function scaleStepFactor(node: SceneNode, dir: 1 | -1, gridSize: number): number;
export function toggleFillNone(node: SceneNode): SceneNode;
```

- `alignNodes`: 基準は、選んだ図形の外枠（`nodeBounds`）を合わせた枠。`left` は各図形の `minX` を枠の `minX` に、`hcenter` は各図形の外枠の中心を枠の中心に、ほかも同じ考え。locked の図形は動かさない（基準には入れる）。2 個未満なら元の `doc` を返す。
- `distributeNodes`: 軸の方向の `min` が小さい順に並べる。先頭は動かさない。`gap` が数値なら、次の図形の `min = 前の図形の max + gap`。`gap` が `null` なら、先頭と最後を動かさず、間が同じになる `gap = (最後の max − 先頭の min − 全図形の大きさの合計) / (n − 1)` を使う。
- `scaleNode`: 中心（`transform`）はそのまま。rect は `width` `height` `cornerRadius`、ellipse は `rx` `ry`、polygon は `width` `height`、path は全点の x・y に `factor` を掛ける。`strokeWidth` は変えない。
- `scaleStepFactor`: `L` を外枠の幅と高さの大きいほうとして、`(L + dir * gridSize) / L`。結果の `L` が `gridSize` 未満になるなら `1`（変えない）。
- `toggleFillNone`: `fill` があれば、`fill = null` にし、`stroke` が `null` のときは `stroke = 元の fill`、`strokeWidth = max(strokeWidth, 2)`。`fill` が `null` なら `fill = stroke ?? DEFAULT_STYLE.fill`。

### B-2 ガイド

```ts
// types.ts
export interface Guide { id: string; axis: 'h' | 'v'; pos: number }       // h = 横の線（y = pos）、v = 縦の線（x = pos）
export interface Document { version: 1; grid: GridSettings; nodes: SceneNode[]; guides?: Guide[] }
// model.ts
export function addGuide(doc: Document, axis: 'h' | 'v', pos: number, id?: string): Document;   // 同じ axis・pos があれば足さない
export function removeGuide(doc: Document, id: string): Document;
export function clearGuides(doc: Document): Document;
// geometry.ts
export function snapPointToDoc(p: Point, doc: Document): Point;
```

- `snapPointToDoc`: x と y を別々に決める。`grid.snap` が真ならグリッドの線の候補、加えて、その軸のガイド（x には `axis 'v'`、y には `axis 'h'`）のうち `p` から `grid.size / 2` 以内のものが候補。一番近い候補を選ぶ。同じ距離ならガイドを選ぶ。`grid.snap` が偽でもガイドの候補は効く。候補が無ければ元の値。
- `actions.ts` の中で吸着先を決めている所（クリック移動、つまみ、`placeShape`、`moveToCursor`）は、`snapPoint` ではなく `snapPointToDoc` を使う。
- `validateDocument`: `guides` は無くてもよい。あれば配列で、各要素の `id`（文字列）、`axis`、`pos`（有限の数）を確かめる。
- ガイドは書き出しに出さない（`render/svg.ts` は触らない）。

### B-3 actions と状態

```ts
// state.ts
export interface EditorState { …; rotateMode: boolean }
// actions.ts
export function alignSelection(s, mode: AlignMode): EditorState;
export function distributeSelection(s, axis: 'x' | 'y', gap: number | null, coalesceKey?: string, now?: number): EditorState;
export function scaleSelection(s, dir: 1 | -1, now?: number): EditorState;
export function toggleRotateMode(s): EditorState;
export function toggleFillNoneSelection(s): EditorState;
export function addGuideAtCursor(s, axis: 'h' | 'v'): EditorState;
export function removeGuideAction(s, id: string): EditorState;
export function clearGuidesAction(s): EditorState;
```

- `alignSelection` `distributeSelection`: 選択が 2 個未満なら `notice = '2 個以上の図形を選んでください（M で複数選択）'`。
- `scaleSelection`: 選んだ各図形（locked を除く）に `scaleNode(n, scaleStepFactor(n, dir, grid.size))`。`coalesceKey: 'scale'`。
- `toggleRotateMode`: 選択が無ければ `notice = '図形を選んでから V を押してください'` で入らない。入るとき `heldHandle = null`。
- `nudge`: `rotateMode` が真で選択があれば、動かす代わりに回す。`dx` で `rotation += dx * 15`、`dy` で `rotation += dy * 1`（`↓` と `→` が時計回り）。`0 <= rotation < 360` に直す。選んだ各図形を自分の中心で回す。`coalesceKey: 'rotate'`。
- `escape`: `rotateMode` が真なら、まずそれだけを切る（つまみや選択はそのまま）。
- 選択が空になる action と `loadDocument` は `rotateMode = false` にする。
- `addGuideAtCursor`: `cursor` が無ければ `notice = 'カーソルをキャンバスに置いてから押してください'`。あれば `pos` は吸着先の座標（`h` なら y、`v` なら x）。`commit` する（取り消せる）。

### B-4 キー

`keymap.ts` に足す（group は既存のものを使う。`ActionId` も足す）:

| キー | ActionId | ラベル | group |
|---|---|---|---|
| `,` | `scale-down` | 縮小 | 編集 |
| `.` | `scale-up` | 拡大 | 編集 |
| `v` | `rotate-mode` | 回転 | 動かす |
| `n` | `fill-none` | 塗りなし | 編集 |
| `j` | `to-path` | 自由な形に変える | 編集 |
| `-` | `guide-h` | 横のガイド | 見る |
| `i` | `guide-v` | 縦のガイド | 見る |

- `repeat` は `,` と `.` だけ `true`（押し続けで大きさが変わる）。既存のテスト「`repeat: true` は矢印 4 つだけ」は、この 2 つを足した形に直す。
- `hintsFor`: `rotateMode` のときは最優先で `← →: 15°ずつ回す`、`↑ ↓: 1°ずつ回す`、`V / Esc: 回転を終える`。図形を選んでいるときの案内に `V: 回転`、`, .: 縮小・拡大` を足す。複数選択の途中の案内に `設定で揃える・間隔` を足す。
- `-` と `.` は設定パネルの数値入力の開始にも使われている（`PropsPanel`）。`focusArea === 'props'` のときは数値入力を優先し、それ以外の場所ではこの表の動きにする。

### B のテスト（最低限）

- `alignNodes`: 3 個で `left` → 全部の `minX` が同じ。`vcenter` → 外枠の中心の y が同じ。locked は動かない。1 個なら同じ参照。
- `distributeNodes`: 幅 40 の rect 3 個（`minX` が 0、70、200）を `x` 方向に `gap 20` → `minX` が 0、60、120。`gap null` → 0、80、200。
- `averageGap`。
- `scaleNode(rect 80×40, 1.5)` → `120×60`、中心は同じ。path の点が 1.5 倍。
- `scaleStepFactor(rect 80×40, 1, 20)` → `1.25`。`(rect 20×20, -1, 20)` → `1`。
- `toggleFillNone`: `fill '#1d2330', stroke null` → `fill null, stroke '#1d2330', strokeWidth >= 2`。もう一度 → `fill '#1d2330'`。
- `addGuide` の重複。`snapPointToDoc`: グリッド 20、縦のガイド `x = 47`、`p = (44, 33)` → `(47, 40)`。`grid.snap` 偽で `p = (44, 33)` → `(47, 33)`。ガイドから遠い `p = (72, 33)`（snap 真）→ `(80, 40)`。
- `validateDocument`: `guides` なし → ok。`guides: [{axis:'z'}]` → エラー。
- actions: `toggleRotateMode` → `nudge(1,0)` で `rotation 15`、`nudge(0,-1)` で `14`、`escape` で `rotateMode false` かつ選択は残る。`rotation` が `350` から `+15` → `5`。
- `scaleSelection(1)` を 2 回 → `undoAction` 1 回で元に戻る。
- `addGuideAtCursor('v')` → `guides.length 1`、`undoAction` → 0。カーソル無し → `notice`。
- keymap: 新しい 7 個が引ける。キーの重複なし。

コミット: `feat(editor): align, distribute, scale, rotate mode, fill-none and guides`

---

## Task C: 画面（canvas + panels + e2e + README）

**Files:** Modify `src/ui/{CanvasView,PropsPanel,ShapeList,GridPanel,SliderField,ColorField,Toolbar,KeyHints}.tsx`、`src/styles.css`、`src/App.tsx`、`e2e/*.spec.ts`、`README.md`。Create `src/ui/ArrangePanel.tsx`、`e2e/feedback.spec.ts`。

### C-1 キャンバス

- **グリッドは線で描く**（点をやめる）。色は薄い水色。`.stage` に変数を足す: `--grid: #cfe8f6`（細い線）、`--grid-major: #9fd0ec`（5 本ごと）、`--grid-axis: #6fb6de`（x = 0 と y = 0）。線の太さは画面上で 1px。画面上の間隔が 8px 未満のときに間隔を 2 倍にしていく決まりは残す（5 本ごとの線は、描いている間隔の 5 本ごと）。
- **吸着先の印**: 輪（半径 9px）に加えて、十字（縦横 28px、太さ 2px）。色は `--warn`（`.stage` に `--warn: #d9480f` を足す）。吸着先は `snapPointToDoc` で決める。
- **座標の表示**: 画面下の案内の右端に、吸着先の座標を `x 120  y 80` の形で出す（カーソルがキャンバスの外なら出さない）。`data-testid="cursor-pos"`。
- **ガイド**: キャンバスいっぱいの線。色は `--guide: #e64980`、太さは画面上で 1.5px。`data-guide-id`。
- **つまみの形**: 辺は四角（今のまま）、`corner` は少し大きい四角（16px）、`vertex` は丸（直径 16px）。`data-handle-id` はそのまま。
- **回転の状態**: `rotateMode` の間、選んだ図形の外形を点線にし、中心に小さな丸と、今の角度（`45°`）の文字を出す。

### C-2 設定パネル

- **数値の欄は打った瞬間に反映する**: `SliderField` の number の欄は、打つたびに、数として読めて範囲の中なら `onChange` を呼ぶ。読めない・範囲の外の間は反映せず、`blur` か `Enter` のときに従来どおり丸める・戻す。打っている途中の文字（`1` → `12` → `120`）は欄に残す（外から値が変わっても、フォーカスがある間は書き換えない）。`Enter` を押さなくても図形が変わる。
- **塗りの色の「なし」**: `なし` を押したときは `toggleFillNone` と同じ決まり（線が無ければ線を付ける）で反映する。`ColorField` の並びは、`なし` のボタンを見本の先頭（左上）に置く。色の欄（塗り・線）は、スライダーの列より上、設定パネルの一番上に置く。
- **図形の操作のボタン**（選択が 1 個以上のとき、色の欄の下）: `縮小 ,`、`拡大 .`、`回転 V`、`塗りなし N`、`自由な形に変える J`。押すと `runAction`。高さ 40px 以上。
- **`ArrangePanel`**（選択が 2 個以上のとき、設定パネルの中身として出す。`N 個の図形を選んでいます` の文の下）:
  - 揃える: `左` `左右の中央` `右` `上` `上下の中央` `下` の 6 ボタン。`data-align={mode}`。
  - 間隔: `横の間隔` と `縦の間隔` の `SliderField`（`0..400`、刻み `grid.size / 2`、値は `averageGap` を丸めたもの。`null` なら 0）。変えると `distributeSelection(s, axis, v, 'gap-' + axis)`。
  - `横に等間隔` `縦に等間隔` のボタン（`gap null`）。
  - `focusArea === 'props'` のとき、複数選択でも `↑ ↓` で 2 本の間隔スライダーを選び、`← →` で増減できる。
- **基準点のボタン**に `自動`（`'auto'`）を先頭に足す。
- **`GridPanel`**: ガイドの一覧（`横 y = 80` のような行と `消す` ボタン、`data-guide-row`）、`ガイドを全部消す`、`横のガイドを足す -`、`縦のガイドを足す I` のボタン。ガイドが無ければ `ガイドはありません（- と I で足せます）`。

### C-3 道具の帯

`P 多角形` の右に区切りを入れず、既存の並びのまま。編集の列に `, 縮小`、`. 拡大`、`V 回転`（入っている間は押された見た目）を足す。

### C-4 e2e（`e2e/feedback.spec.ts`。単独キーとクリックとホイールだけ）

- `p` で三角形 → 3 つの角（`worldOutline` を `window.__shapeSnap` 経由で読むか、`points` から計算）が全部グリッドの倍数。
- 三角形の `[data-handle-id="vertex:0"]` をクリック → 別のグリッド点をクリック → `kind 'path'` で、その点がクリックした点の吸着先と一致。
- 四角の `corner:2` をつかんで点をクリック → `width` と `height` が変わり `kind 'rect'` のまま。
- 円のつまみが 8 個ある。
- `v` → `ArrowRight` 2 回 → `rotation 30`。`Escape` → もう一度 `ArrowRight` で図形が動く（回らない）。
- `.` 2 回 → 大きくなる。`,` → 小さくなる。
- `n` → `fill` が `null` で `stroke` がある。図形がまだ画面に見える（`[data-node-id]` の要素に `stroke` 属性がある）。
- 図形を 3 個置いて `m` で 3 個選ぶ → `[data-align="top"]` を押す → 3 個の外枠の `minY` が同じ。`横に等間隔` → 間が同じ。`横の間隔` を 40 にする → 間が 40。
- `-` → 横のガイドが 1 本（`[data-guide-id]`）。`i` → 2 本。ガイドの `消す` → 1 本。`z` で戻る。
- 幅の数値の欄に `200` を打つ（`Enter` を押さない）→ `width 200`。
- グリッドが線で描かれている（`<pattern>` の中に `line` か `path` がある）。
- カーソルを動かすと `[data-testid="cursor-pos"]` の文が変わる。
- 追加した全部のボタンが 40px 以上。
- 既存の e2e（`canvas` `panels` `io` `promises`）は、変えた仕様（多角形の形、つまみの数と id、anchor の初期値）に合わせて直す。消さない。`tests/promises.test.ts` はそのまま通ること。

### C-5 README

キーの一覧に新しい 7 個を足す。「つまみ」の説明を、辺・角・点の 3 種類に直す。

コミット: `feat(ui): grid lines, snap crosshair, arrange panel, guides and live numeric input`
