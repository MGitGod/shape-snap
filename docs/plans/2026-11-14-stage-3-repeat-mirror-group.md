# 段階 3（連続配置・対称コピー・グループ）Implementation Plan

> **For agentic workers:** 進め方は `AGENTS.md`。Global Constraints は `docs/plans/2026-11-13-stage-1-foundation.md` の同名の節をそのまま守る（ドラッグ・同時押し・ダブルクリック・ホバー専用の操作なし、押せる部品は 40px 以上、画面の文字は日本語、`src/core` は純粋）。これまでの決まりは `docs/design.html` の 16 章と 17 章にある。

**Goal:** 図形を並べる「連続配置」（個数・間隔・だんだん小さくなる割合・回転の増分）、左右・上下・回転で複製する「対称コピー」、まとめて動かす「グループ」を入れる。元の図形を直すと複製も全部変わる。あとから個数や間隔を変えられる。

**Architecture:** 図形を入れ物（container）で包む。入れ物は 3 種類: `group`（子が複数）、`repeat`（子が 1 つ + 並べる規則）、`mirror`（子が 1 つ + 対称の規則）。複製はデータに持たず、描く・当たりを調べる・書き出すときに、入れ物を「葉」（rect・ellipse・polygon・path）の並びに展開する（`expandNode`）。入れ物は一番上の階層で 1 個の図形として選ぶ。入れ物の中の図形を個別には選ばない（直したいときは解く）。入れ物は入れ子にできる（連続配置を対称コピーで包む、グループを連続配置で包む）。

## 型（`src/core/types.ts`）

```ts
export interface NodeCommon { id: string; name: string; visible: boolean; locked: boolean; role: Role }
export interface LeafBase extends NodeCommon { transform: Transform; style: Style }
// RectNode / EllipseNode / PolygonNode / PathNode は LeafBase を継ぐ（中身は今のまま）
export type LeafNode = RectNode | EllipseNode | PolygonNode | PathNode;
export interface GroupNode extends NodeCommon { kind: 'group'; children: SceneNode[] }
export interface RepeatNode extends NodeCommon {
  kind: 'repeat'; child: SceneNode;
  count: number;        // 2..50
  dx: number; dy: number;   // 隣の複製までのずれ（単位）
  scaleStep: number;    // 1 つ進むごとの拡大率。0.5..1.5
  rotateStep: number;   // 1 つ進むごとの回転（度）。-180..180
}
export type MirrorMode = 'h' | 'v' | 'both' | 'rotate';   // h = 左右（縦の軸）、v = 上下（横の軸）
export interface MirrorNode extends NodeCommon {
  kind: 'mirror'; child: SceneNode; mode: MirrorMode;
  count: number;        // rotate のときの個数。2..36
  axisX: number; axisY: number;   // 軸が通る点（ワールド座標）
}
export type ContainerNode = GroupNode | RepeatNode | MirrorNode;
export type SceneNode = LeafNode | ContainerNode;
export function isLeaf(n: SceneNode): n is LeafNode;
```

入れ物には `transform` も `style` も無い。`node.transform` や `node.style` を直接読んでいる所は、型のエラーになるので、下の関数に置き換える。`NodeBase` という名前は `LeafBase` の別名として残してよい。

---

## Task A: 入れ物の計算（core + render）

**Files:** Create `src/core/tree.ts`、`tests/core/tree.test.ts`。Modify `src/core/{types,model,validate,geometry,handles,arrange}.ts`、`src/render/svg.ts`、`src/ui/propDefs.ts`、テスト。UI と `src/editor` は、型のエラーを消してテストを通す最小限だけ直す（新しい操作は Task B、見た目は Task C）。

### A-1 `src/core/tree.ts`（純粋）

```ts
export function expandNode(node: SceneNode): LeafNode[];            // 描く順（奥から手前）の葉。入れ物の visible が偽でも展開する（見えるかどうかは呼ぶ側が一番上の node で決める）
export function sourceLeaves(node: SceneNode): LeafNode[];          // 複製を除いた、元の葉だけ（repeat・mirror は child の sourceLeaves、group は全部の子の sourceLeaves）
export function mapSourceLeaves(node: SceneNode, fn: (leaf: LeafNode) => LeafNode): SceneNode;   // 元の葉を置き換える。構造は保つ
export function editableLeaf(node: SceneNode): LeafNode | null;     // つまみで直せる葉。葉ならそれ自身。repeat・mirror は child の editableLeaf。group は null
export function withEditableLeaf(node: SceneNode, fn: (leaf: LeafNode) => LeafNode): SceneNode;
export function translateNode(node: SceneNode, dx: number, dy: number): SceneNode;
export function scaleNodeAbout(node: SceneNode, pivot: Point, f: number): SceneNode;
export function rotateNodeAbout(node: SceneNode, pivot: Point, degrees: number): SceneNode;
export function nodeCenter(node: SceneNode): Point;                 // 葉は transform の位置。入れ物は sourceBounds の中心
export function sourceBounds(node: SceneNode): Bounds;              // sourceLeaves の外枠を合わせたもの（吸着と揃えるの基準）
export function reflectLeaf(leaf: LeafNode, axis: 'x' | 'y', at: number): LeafNode;   // 'x' = 縦の線 x = at で左右を反転、'y' = 横の線 y = at で上下を反転
export function flattenNode(node: SceneNode, makeId: () => string): LeafNode[];       // 「ばらす」。expandNode の結果に新しい id と名前を付ける
```

**展開の決まり:**

- 葉: `[leaf]`。
- group: 子を順に展開してつなぐ。
- repeat: `i = 0 … count − 1` について、`child` を展開した葉の集まり `L` を次の順で変える。`c` は `nodeCenter(child)`。
  1. `c` を中心に `scaleStep ** i` 倍（葉の中心が `c` から離れる・近づく。葉の形も同じ割合で変わる。`scaleNode` を使う）。
  2. `c` を中心に `rotateStep * i` 度回す（葉の中心が回り、葉の `rotation` に同じ角度を足す）。
  3. `(dx * i, dy * i)` 動かす。
  - `i = 0` は元のまま。描く順は `i = 0` が一番奥。
- mirror: `child` を展開した葉の集まり `L` について、
  - `h`: `L`、続けて `L` を縦の線 `x = axisX` で反転したもの。
  - `v`: `L`、続けて `L` を横の線 `y = axisY` で反転したもの。
  - `both`: `L`、左右反転、上下反転、両方反転の 4 つ。
  - `rotate`: `k = 0 … count − 1` について、`L` を点 `(axisX, axisY)` を中心に `360 * k / count` 度回したもの。
- **反転（`reflectLeaf`）:** 左右反転（`'x'`）は、中心の x を `2 * at − x` に、`rotation` を `−rotation` に。path は点の x の符号も反転する。上下反転（`'y'`）は、中心の y を `2 * at − y` に。rect と ellipse は `rotation` を `−rotation` に。polygon は `rotation` を `180 − rotation` に。path は `rotation` を `−rotation` にして点の y の符号を反転する。`rotation` は `0 <= r < 360` に直す。
- 展開した葉の `id` は `元の id + '#' + 番号`（元の葉自身は元の id のまま）。同じ入力なら同じ id になること。
- `translateNode`: 葉は中心を動かす。group は全部の子。repeat は child。mirror は child と `axisX` `axisY` の両方。
- `scaleNodeAbout`: 葉は `scaleNode` で形を変え、中心を `pivot + (中心 − pivot) * f` に動かす。repeat は child に加えて `dx` `dy` も `f` 倍。mirror は child に加えて軸の点も `pivot` から `f` 倍。
- `rotateNodeAbout`: 葉は中心を `pivot` の周りに回し、`rotation` に足す。repeat は child と、ずれ `(dx, dy)` のベクトルも回す。mirror は child と軸の点を回す（`h` `v` `both` の軸の向きは変えない）。

### A-2 既存の関数を入れ物に対応させる

- `geometry.ts`: `nodeBounds(node)` は `expandNode` の全部の葉の外枠。`worldOutline(node)` は葉のときだけ今までどおり。新しく `worldOutlines(node): Point[][]`（葉ごとの外形。開いた線かどうかは葉を見る必要があるので、`{ points: Point[]; closed: boolean }[]` を返す）。`hitTest(node, p, tol)` は、どれかの葉に当たれば真。`anchorPoint` と、外枠での吸着の基準は `sourceBounds`（複製を含めない）を使う。
- `model.ts`: `translateNodes` は `translateNode` を使う。`duplicateNodes` は入れ物の中の全部の `id` を付け直す。足す関数:

```ts
export function groupNodes(doc: Document, ids: string[], id?: string): { doc: Document; id: string | null };       // 2 個以上。並びは元の重なり順。一番手前だった図形の位置に入れる
export function ungroupNode(doc: Document, id: string, makeId?: () => string): { doc: Document; ids: string[] };   // group は子を戻す。repeat・mirror は flattenNode でばらす
export function wrapRepeat(doc: Document, id: string, wrapperId?: string): { doc: Document; id: string | null };
export function wrapMirror(doc: Document, id: string, wrapperId?: string): { doc: Document; id: string | null };
```

  - 名前は `nextName` で `グループ N` `連続配置 N` `対称 N`。
  - `wrapRepeat` の初期値: `count 5`、`dx = snapValue(元の外枠の幅, grid.size) + grid.size`（幅が 0 なら `2 * grid.size`）、`dy 0`、`scaleStep 1`、`rotateStep 0`。
  - `wrapMirror` の初期値: `mode 'h'`、`count 6`、`axisX = snapValue(元の外枠の maxX, grid.size) + grid.size`、`axisY = snapValue(元の外枠の中心の y, grid.size)`。
  - 入れ物の `visible` `locked` `role` は、包んだ図形（group は主の図形）から引き継ぐ。中の図形の `visible` `locked` は見ない。
  - すでに repeat のものを `wrapRepeat` してもよい（入れ子になる）。
- `handles.ts`: `getHandles(node)` は `editableLeaf(node)` のつまみ。mirror はそれに加えて `{ id: 'axis:0', kind: 'axis', index: 0, pos: (axisX, axisY), normal: (0,0) }` を最後に足す。group はつまみなし。`moveHandle` は `withEditableLeaf` で葉に回す。`axis:0` は `axisX` `axisY` を `target` にする。`Handle.kind` に `'axis'` を足す。
- `arrange.ts`: `alignNodes` `distributeNodes` `averageGap` は `sourceBounds` を基準に、動かすのは `translateNode`。`scaleNode` は葉だけの関数として残す。`toggleFillNone` は葉だけ（入れ物には `mapSourceLeaves` で当てる）。
- `validate.ts`: 入れ物を再帰で確かめる。`count` などの範囲、`children` が配列で 1 個以上、`child` が図形。`id` の重複は木の全体で確かめる。エラー文は日本語で、どの図形の何がおかしいかを書く。
- `render/svg.ts`: `nodeToSvg(leaf)` はそのまま。`documentToSvg` と `exportBounds` は、見えている一番上の図形を `expandNode` して使う。足す関数: `nodeToSvgList(node: SceneNode): SvgElementSpec[]`。
- `propDefs.ts`: `propDefsFor(node, grid)` は、
  - 葉: 今までどおり。
  - repeat: `count`（個数、`2..50`、刻み 1）、`dx`（横の間隔、`-2000..2000`、刻み `grid.size`）、`dy`（縦の間隔、同じ）、`scaleStep`（大きさの変化、`0.5..1.5`、刻み `0.05`）、`rotateStep`（回転の増分、`-180..180`、刻み `15`）。続けて、`editableLeaf` があればその葉の項目（`get` `set` は葉に回す。`set` の結果は入れ物全体の `Partial`、つまり `{ child: … }`）。
  - mirror: `count`（回転の数、`2..36`、刻み 1。`mode 'rotate'` のときだけ）、`axisX`（軸の横の位置）、`axisY`（軸の縦の位置）: `-2000..2000`、刻み `grid.size`。続けて葉の項目。
  - group: 項目なし。
  - 葉の `x` `y`（位置）の項目は、入れ物の中では出さない（入れ物ごと動かすため）。

### A のテスト（最低限）

`rect(id, x, y)` は中心 `(x,y)`、`80×80` の四角とする。

- `expandNode(rect)` → 1 個。`repeat(rect(0,0), count 3, dx 100, dy 0)` → 3 個で中心の x が `0, 100, 200`、id が `a, a#1, a#2`。
- `scaleStep 0.5`: 幅が `80, 40, 20`、中心は `0, 100, 200`。
- `rotateStep 30`: `rotation` が `0, 30, 60`。
- `dy 50` を足すと中心の y が `0, 50, 100`。
- group を repeat で包む: group の中の 2 個が、group の中心を基準に一緒に大きさを変える（2 つ目の複製で、2 個の中心の間の距離が `scaleStep` 倍）。
- mirror `h`、`axisX 100`、`rect(0,0)` → 2 個で中心の x が `0, 200`。`both`、`axisY 100` → 4 個で `(0,0) (200,0) (0,200) (200,200)`。
- mirror `rotate`、`count 4`、軸 `(0,0)`、`rect(100,0)` → 中心が `(100,0) (0,100) (−100,0) (0,−100)`、`rotation` が `0, 90, 180, 270`。
- `reflectLeaf`: 回転 30 の rect を左右反転 → `rotation 330`。上を向いた三角形を上下反転 → `rotation 180`（下を向く。`worldOutline` の一番下の点の x が中心の x と同じ）。path `[(−10,0),(30,0),(0,20)]` を左右反転 → 点が `[(10,0),(−30,0),(0,20)]`。
- 入れ子: mirror(repeat(rect, count 3), `h`) → 6 個。
- `translateNode(mirror, 20, 0)` → child の中心と `axisX` が両方 20 増える。
- `scaleNodeAbout(repeat, pivot (−40,−40), 2)` → child の幅が 2 倍、`dx` が 2 倍。
- `rotateNodeAbout(repeat dx 100 dy 0, 中心, 90)` → `dx ≈ 0`、`dy ≈ 100`。
- `sourceBounds(repeat)` は child の外枠と同じ。`nodeBounds(repeat)` は全部の複製を含む。
- `hitTest(repeat, 2 つ目の複製の中の点)` → 真。
- `getHandles(repeat(rect))` → 8 個。`getHandles(mirror(rect))` → 9 個で最後が `axis:0`。`getHandles(group)` → 空。
- `moveHandle(repeat(rect), 'edge:1', …)` → `kind 'repeat'` のままで child の幅が変わる。`moveHandle(mirror, 'axis:0', (140, 60))` → `axisX 140`、`axisY 60`。
- `groupNodes`: `[a,b,c]` で `a` と `c` をまとめる → 一番上の階層が `[b, group]`、`group.children` が `[a, c]`。1 個なら変わらない。
- `ungroupNode(group)` → 子が元の順で戻る。`ungroupNode(repeat count 3)` → 独立した葉が 3 個、id が全部違い、木の中に重複が無い。
- `wrapRepeat`: 初期値が上の決まりどおり（`80×80` の四角、グリッド 20 → `dx 100`）。
- `duplicateNodes(repeat)` → 新しい入れ物も child も id が変わる。
- `validateDocument`: 入れ物入りの doc → ok。`count 1` の repeat → エラー。child の id が別の図形と重複 → エラー。`children: []` の group → エラー。
- `documentToSvg`: repeat `count 3` の rect → `<rect` が 3 個。
- `alignNodes`: repeat と rect を `left` → repeat の `sourceBounds.minX` と rect の `minX` が同じ。
- `propDefsFor(repeat(rect))` の先頭 5 個が `count, dx, dy, scaleStep, rotateStep` で、`x` `y` が無く、`width` がある。`width` の `set` の結果を重ねると child の幅が変わる。
- 既存のテストは通す（型の変更に合わせて直す。消さない）。

コミット: `feat(core): group, repeat and mirror containers`

---

## Task B: 操作（editor + input）

**Files:** Modify `src/editor/{state,actions}.ts`、`src/input/{keymap,keyboard}.ts`、テスト。

```ts
export function groupSelection(s): EditorState;      // G
export function ungroupSelection(s): EditorState;    // U
export function repeatSelection(s): EditorState;     // A
export function mirrorSelection(s): EditorState;     // X
export function setMirrorMode(s, mode: MirrorMode): EditorState;
```

- `groupSelection`: 選択が 2 個以上なら `groupNodes`、新しい group を選ぶ。1 個以下なら `notice = '2 個以上の図形を選んでください（M で複数選択）'`。`multiSelect = false`。
- `ungroupSelection`: 選んだ図形のうち入れ物のものを `ungroupNode` し、出てきた図形を全部選ぶ。1 回で `commit`。入れ物が無ければ `notice = 'グループ・連続配置・対称を選んでください'`。repeat・mirror を解いたときは `notice = 'ばらしました（Z で戻せます）'`。
- `repeatSelection` `mirrorSelection`: 選択が 1 個ならそれを包む。2 個以上なら、先に `groupNodes` してから包む（`commit` は 1 回）。選択が無ければ `notice = '図形を選んでから押してください'`。包んだ入れ物を選ぶ。`heldHandle = null`。
- `setMirrorMode`: 主の図形が mirror のとき `mode` を変える。
- 既存の action を入れ物に対応させる（Task A の関数を使う）:
  - 移動（クリック、`Space`、`nudge`、揃える、間隔）: `translateNode`。吸着と anchor の基準は `sourceBounds`。
  - `scaleSelection`: `scaleNodeAbout`。基準の外枠は、選んだ図形の `sourceBounds` を合わせたもの。
  - 回転（`rotateMode` の `nudge`）: 葉は今までどおり自分の中心で。入れ物は `rotateNodeAbout(node, nodeCenter(node), 角度)`。
  - `toggleFillNoneSelection`、色の変更（`setNodeProp` で `style` を変える所）: 入れ物には `mapSourceLeaves` で全部の元の葉に当てる。そのために `setLeafStyle(s, id, patch: Partial<Style>, coalesceKey, now?)` を足し、UI はこれを使えるようにする。
  - `convertToPath` `toggleSmooth` `toggleClosed` `toggleCornerAtHandle` `insertPointAtHandle`、点を消す `deleteSelection`: `editableLeaf` があればそれに当てる（`withEditableLeaf`）。group には当てず、`notice = 'グループの中の図形は、解いてから直してください（U）'`。
  - つまみ（`clickCanvas` の 1〜2、`cycleHandle`、`nudge`）: `getHandles` と `moveHandle` が入れ物に対応しているので、そのまま通ること。`axis:0` をつかんでクリック → 軸が動く。
  - `setNodeProp`: 入れ物の `count` `dx` などは今までどおり `patch` を重ねる。`count` は整数に丸め、範囲に収める。
- キー: `g` `group` グループ（編集）、`u` `ungroup` 解く・ばらす（編集）、`a` `repeat` 連続配置（置く）、`x` `mirror` 対称（置く）。
- `hintsFor`: 複数選択の途中の案内に `G: グループ` を足す。入れ物を選んでいるときの案内に `U: 解く・ばらす` を足す。図形を選んでいるときの案内に `A: 連続配置`、`X: 対称` を足す。mirror で `axis:0` をつかんでいるときは `クリック / 矢印: 軸を動かす`。
- 線を引いている間（`drawing`）は、`g` `u` `a` `x` は何もしない。

### B のテスト（最低限）

- `groupSelection`: 2 個選ぶ → 一番上の階層が 1 個（group）、選択が group の id。`undoAction` で 2 個に戻る。
- `ungroupSelection`: group → 2 個が選ばれる。repeat `count 3` → 葉が 3 個選ばれ、`notice` に `ばらしました`。
- `repeatSelection`: rect を選ぶ → `kind 'repeat'`、`count 5`。2 個選ぶ → `repeat` の `child` が `group`、`history.past` は 1 だけ増える。
- `mirrorSelection` → `kind 'mirror'`、`mode 'h'`。`setMirrorMode('rotate')`。
- repeat を選んで `nudge(1,0)` → child の中心が動き、`dx` は変わらない。吸着は child の外枠（`sourceBounds.minX` が 20 の倍数）。
- repeat を選んで `scaleSelection(1)` → child と `dx` が同じ割合で変わる。
- repeat を選んで `rotateMode` の `nudge(1,0)` → `dx` `dy` のベクトルが 15° 回る。
- repeat(rect) で `cycleHandle` → `heldHandle 'edge:0'`。`nudge(0,-1)` → child の高さが変わり、`kind` は `repeat` のまま。
- mirror で `axis:0` をつかんで何もない点をクリック → `axisX` `axisY` がその吸着先。
- `setLeafStyle` を repeat(group(2 個)) に → 2 個の葉の `fill` が両方変わる。
- group を選んで `toggleSmooth` → 変わらず、`notice` に `解いてから`。
- repeat(線) で `toggleSmooth` → child の `smooth` が真。
- `duplicateSelection`（repeat）→ 2 個になり、木の中に id の重複が無い。
- `deleteSelection`（repeat）→ 0 個。
- keymap: `g` `u` `a` `x` が引ける。キーの重複なし。

コミット: `feat(editor): group, ungroup, repeat and mirror actions`

---

## Task C: 画面（canvas + panels + e2e）

**Files:** Modify `src/ui/{CanvasView,PropsPanel,ShapeList,Toolbar,ColorField}.tsx`、`src/styles.css`、`e2e/*.spec.ts`、`README.md`。Create `e2e/containers.spec.ts`。

- **キャンバス**: 一番上の図形ごとに `<g data-node-id={id}>` を作り、その中に `nodeToSvgList` の要素を描く（葉 1 個の図形も `<g>` で包む。既存の e2e が `[data-node-id]` の直下の要素を見ている所は直す）。選んだ図形の強調は `worldOutlines` を全部描く（元の葉は実線、複製は点線）。
- **対称の軸**: mirror を選んでいる間、軸を線で描く（`h` は縦の線、`v` は横の線、`both` は両方、`rotate` は中心に十字と丸）。色は `--guide`。`axis:0` のつまみは、ひし形で少し大きく（18px）。`data-handle-id="axis:0"`。
- **図形リスト**: 入れ物の行は、名前の後ろに中身を短く出す（`連続配置 1（×5）`、`対称 1（左右）`、`グループ 1（3 個）`）。行の高さと操作は今までどおり。
- **設定パネル**:
  - repeat・mirror: `propDefsFor` の項目がスライダーで出る（入れ物の項目が上、葉の項目が下）。
  - mirror: 種類のボタン `左右` `上下` `上下左右` `回転`（`data-mirror-mode`、今の種類は押された見た目）。
  - 色の欄: 入れ物では、元の葉の 1 個目の色を表示し、変えると `setLeafStyle` で全部の元の葉に当たる。
  - 入れ物を選んでいるとき、操作のボタンの列に `解く U`（group）か `ばらす U`（repeat・mirror）を足す。図形を選んでいるとき `連続配置 A`、`対称 X`。2 個以上選んでいるとき `グループ G`。
- **道具の帯**: `A 連続配置`、`X 対称`、`G グループ`、`U 解く` を足す。幅 1280px で `header.toolbar` の高さが 120px 以下のまま（収まらなければ、`Delete 消す` `F 手前へ` `B 奥へ` を「その他」の列として 2 段目の右に寄せるなど、並びを変えてよい。ボタンは 40px 以上）。
- **e2e**（`e2e/containers.spec.ts`。単独キーとクリックとホイールだけ）:
  - 四角を置いて `a` → `kind 'repeat'`、キャンバスに `rect` が 5 個。`[data-prop="count"]` に `3` を打つ → 3 個。
  - `[data-prop="scaleStep"]` を `0.8` にする → 複製の幅がだんだん小さくなる（展開した葉の幅を `window.__shapeSnap` 経由で確かめる。そのために DEV の窓口に `expand: (id) => expandNode(その図形)` を足す）。
  - `[data-prop="dx"]` を変える → 複製の間隔が変わる。
  - 連続配置を矢印キーで動かす → 全部の複製が一緒に動く。
  - 連続配置の元の図形のつまみ（`edge:1`）をつかんでクリック → 全部の複製の幅が変わる。
  - `u` → 独立した図形が 3 個になり、3 個とも選ばれている。`z` で連続配置に戻る。
  - 三角形を置いて `x` → `kind 'mirror'`、キャンバスに図形が 2 個。`[data-mirror-mode="rotate"]` → 6 個。`[data-prop="count"]` を 8 → 8 個。
  - `[data-handle-id="axis:0"]` をつかんで別の点をクリック → `axisX` `axisY` が変わり、複製の位置が変わる。
  - 図形を 2 個置いて `m` で選び `g` → 一番上の階層が 1 個。矢印で動かすと 2 個とも動く。`u` → 2 個に戻る。
  - グループを `a` で連続配置にする → キャンバスの葉が 10 個。
  - 色の見本を押す → 元の葉と複製の全部の色が変わる。
  - SVG を書き出す → 連続配置 5 個分の `<rect` が 5 個ある。
  - 作業ファイルを書き出して読み込む → 入れ物がそのまま戻る。
  - 幅 1280px で `header.toolbar` の高さが 120px 以下。足した全部のボタンが 40px 以上。
  - 既存の e2e は、変えた仕様に合わせて直す（消さない）。`e2e/promises.spec.ts` の通しの筋書きに「連続配置にして個数を変える」を足す。
  - スクリーンショットを `.superpowers/sdd/2026-11-14-stage-3-repeat-mirror-group/screens/` に保存（1280×800、明るい表示）: `repeat.png`（四角 ×5、`scaleStep 0.85`、選んだ状態）、`mirror.png`（三角形を回転 6 個、選んだ状態）。
- **README**: `A` `X` `G` `U` と、連続配置・対称・グループの説明を足す。

コミット: `feat(ui): repeat, mirror and group in canvas, list and panels`
