# 段階 1（土台）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 進め方の決まりは `AGENTS.md`、進み具合は `docs/PROGRESS.md` にある。

**Goal:** グリッドに吸着する四角・円・多角形を、クリックと単独キーだけで置く・選ぶ・動かす・辺のつまみで変形する・書き出すところまでを作る。

**Architecture:** 絵の中身（`Document`）は画面から切り離した不変データで持つ。`src/core` は純粋関数だけ（DOM を触らない）。編集の状態は `src/editor` の純粋な関数 `(state, 引数) => state` で進め、zustand のストアが包む。画面（React + SVG）と書き出しは、同じ `src/render` の関数から SVG を作る。

**Tech Stack:** TypeScript（strict）、Vite、React 19、zustand、idb-keyval、Vitest、Playwright（chromium）。パッケージ管理は npm。

## Global Constraints

- ドラッグ、同時押し（Shift・Ctrl・Alt・Meta）、ダブルクリック、ホバー専用の操作を、どの機能にも使わない。`mousedown` から `mouseup` までの移動に意味を持たせない。入力は `click`、`contextmenu`、`wheel`、`keydown` だけで受ける。
- キーは単独キー。`event.ctrlKey || event.altKey || event.metaKey` が真の `keydown` は無視する（ブラウザの操作を邪魔しない）。
- 自動連打（`event.repeat`）は、矢印キーとスライダーの増減だけに効かせる。ほかのキーは `event.repeat` が真なら無視する。
- 文字入力欄（`input`、`textarea`、`select`）にフォーカスがある間は、`Enter`・`Esc`・`Tab` 以外の単独キーを働かせない。
- 座標は「単位」（1 単位 = 書き出した SVG の 1px）。y は下向きが正。回転は度、時計回りが正。グリッドの間隔は単位で持つ。グリッドの間隔を変えても図形の大きさは変わらない。
- `Document.nodes` は奥から手前の順（最後の要素が一番手前）。
- `src/core` は DOM・React・`window` を import しない。関数はすべて純粋で、引数を書き換えない。
- 画面の文字はすべて日本語。コード、識別子、コミットメッセージは英語。
- 押せる部品（ボタン、リストの行）は高さ 40px 以上。
- 各タスクの終わりに `npm run typecheck` と `npm test` が通ること。通らないままコミットしない。
- コミットは Task ごとに 1 回以上。`git push` はしない。
- 依存を足すのは、この計画に書いてあるものだけ。

## File Structure

```
index.html
package.json  tsconfig.json  vite.config.ts  playwright.config.ts
src/
  main.tsx                      React の起動
  App.tsx                       全体の配置
  styles.css                    全体の見た目（明暗の両方）
  core/
    types.ts                    Document と図形の型
    model.ts                    図形の生成、Document の操作
    validate.ts                 作業ファイルの検査
    geometry.ts                 吸着、座標変換、外形、外枠、当たり判定
    handles.ts                  つまみの位置と動かし方
    history.ts                  取り消しとやり直し
  render/
    svg.ts                      図形 → SVG の要素、Document → SVG の文字列
  editor/
    state.ts                    EditorState の型と初期値
    actions.ts                  状態を進める純粋な関数
    store.ts                    zustand のストア
  input/
    keymap.ts                   キーの割り当て表と案内
    keyboard.ts                 keydown を action に振り分ける
  ui/
    CanvasView.tsx              キャンバス（グリッド、図形、つまみ、吸着先）
    Toolbar.tsx                 道具の帯
    ShapeList.tsx               図形リスト
    PropsPanel.tsx              選んだ図形の設定
    GridPanel.tsx               グリッドの設定
    SliderField.tsx             スライダー + 数値の欄
    ColorField.tsx              色の見本 + 色コード + HSL
    KeyHints.tsx                今使えるキー
    ExportDialog.tsx            書き出し
    WorksMenu.tsx               作品の一覧
    Banner.tsx                  お知らせと失敗の帯
  io/
    storage.ts                  自動保存と作品の一覧（IndexedDB）
    files.ts                    作業ファイルの読み書き、ダウンロード
    png.ts                      SVG → PNG
tests/
  core/*.test.ts  render/*.test.ts  editor/*.test.ts  input/*.test.ts
e2e/
  *.spec.ts
```

---

### Task 1: 雛形と道具立て

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `tests/smoke.test.ts`, `e2e/smoke.spec.ts`

**Interfaces:**
- Produces: npm scripts `dev`（Vite、ポート 5173）、`build`、`typecheck`（`tsc --noEmit`）、`test`（`vitest run`）、`e2e`（`playwright test`）。

- [ ] **Step 1:** `npm create vite@latest . -- --template react-ts` は使わず、ファイルを手で作る（フォルダに `docs/` があるため）。`package.json` の `"type": "module"`、`"private": true`、`"name": "shape-snap"`。
- [ ] **Step 2:** 依存を入れる。

```bash
npm install react react-dom zustand idb-keyval
npm install -D typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom @playwright/test
npx playwright install chromium
```

- [ ] **Step 3:** `tsconfig.json` は `strict: true`、`noUncheckedIndexedAccess: true`、`jsx: "react-jsx"`、`moduleResolution: "bundler"`、`target: "ES2022"`、`include: ["src", "tests", "e2e", "*.ts"]`。
- [ ] **Step 4:** `vite.config.ts` に `test: { include: ["tests/**/*.test.ts"], environment: "node" }` を入れる（`/// <reference types="vitest/config" />`）。
- [ ] **Step 5:** `playwright.config.ts`: `testDir: "e2e"`、`webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true }`、`use: { baseURL: "http://localhost:5173" }`、project は chromium だけ。
- [ ] **Step 6:** `src/App.tsx` は `<div className="app"><h1>Shape Snap</h1></div>` だけを返す。`index.html` の `lang="ja"`、`<title>Shape Snap</title>`。
- [ ] **Step 7:** `tests/smoke.test.ts` に `expect(1 + 1).toBe(2)`。`e2e/smoke.spec.ts` に「`/` を開くと `Shape Snap` の見出しが見える」。
- [ ] **Step 8:** `npm run typecheck && npm test && npm run build && npm run e2e` がすべて通ることを確かめる。
- [ ] **Step 9:** コミット `chore: scaffold vite react ts project`。

---

### Task 2: データの型と操作（core/types, core/model, core/validate）

**Files:**
- Create: `src/core/types.ts`, `src/core/model.ts`, `src/core/validate.ts`
- Test: `tests/core/model.test.ts`, `tests/core/validate.test.ts`

**Interfaces（Produces）:**

```ts
// src/core/types.ts
export interface Point { x: number; y: number }
export type Role = 'add' | 'subtract';
export interface Style { fill: string | null; stroke: string | null; strokeWidth: number; opacity: number }
export interface Transform { x: number; y: number; rotation: number }   // x,y = 図形の中心
export interface NodeBase {
  id: string; name: string; visible: boolean; locked: boolean;
  role: Role; transform: Transform; style: Style;
}
export interface RectNode extends NodeBase { kind: 'rect'; width: number; height: number; cornerRadius: number }
export interface EllipseNode extends NodeBase { kind: 'ellipse'; rx: number; ry: number }
export interface PolygonNode extends NodeBase { kind: 'polygon'; sides: number; radius: number; starRatio: number }
export interface PathPoint { x: number; y: number; corner: boolean }      // 図形の中心からの相対位置
export interface PathNode extends NodeBase { kind: 'path'; points: PathPoint[]; closed: boolean; smooth: boolean; tension: number }
export type SceneNode = RectNode | EllipseNode | PolygonNode | PathNode;
export type NodeKind = SceneNode['kind'];
export interface GridSettings { size: number; visible: boolean; snap: boolean }
export interface Document { version: 1; grid: GridSettings; nodes: SceneNode[] }
export type Anchor = 'center' | 'tl' | 'tr' | 'bl' | 'br';
export const GRID_MIN = 5; export const GRID_MAX = 160;
```

```ts
// src/core/model.ts
export const DEFAULT_STYLE: Style;   // { fill: '#1d2330', stroke: null, strokeWidth: 2, opacity: 1 }
export function createDocument(): Document;                         // grid { size: 20, visible: true, snap: true }, nodes []
export function nextName(doc: Document, kind: NodeKind): string;    // '四角 1' '円 1' '多角形 1' '自由な形 1'。同じ種類の名前の最大番号 + 1
export function createNode(doc: Document, kind: 'rect' | 'ellipse' | 'polygon', at: Point, id?: string): SceneNode;
export function addNode(doc: Document, node: SceneNode): Document;  // 一番手前（配列の最後）に足す
export function getNode(doc: Document, id: string): SceneNode | undefined;
export function updateNode(doc: Document, id: string, fn: (n: SceneNode) => SceneNode): Document;
export function removeNodes(doc: Document, ids: string[]): Document;
export function translateNodes(doc: Document, ids: string[], dx: number, dy: number): Document;
export function reorderNode(doc: Document, id: string, dir: 1 | -1): Document;   // 1 = 一つ手前へ。端なら元の doc をそのまま返す
export function duplicateNodes(doc: Document, ids: string[], dx: number, dy: number, makeId?: () => string): { doc: Document; newIds: string[] };
export function setGrid(doc: Document, patch: Partial<GridSettings>): Document;  // size は GRID_MIN..GRID_MAX に収める
```

```ts
// src/core/validate.ts
export type ValidateResult = { ok: true; doc: Document } | { ok: false; errors: string[] };
export function validateDocument(data: unknown): ValidateResult;
```

**決まり:**
- `createNode` の初期の大きさ: rect は `width = height = 4 * grid.size`、`cornerRadius = 0`。ellipse は `rx = ry = 2 * grid.size`。polygon は `sides = 3`、`radius = 2 * grid.size`、`starRatio = 1`。`rotation = 0`、`visible = true`、`locked = false`、`role = 'add'`、`style = DEFAULT_STYLE` の写し。
- `id` を省くと `crypto.randomUUID()`。
- 複製の名前は `nextName` で付け直す。複製は元の並びの直後ではなく、一番手前に足す。
- `validateDocument` は、`version === 1`、`grid` の型と範囲、`nodes` が配列、各図形の `kind` と必須の数値（有限の数）・真偽値・文字列、`id` の重複なし、を確かめる。エラーは日本語で、どの図形のどの項目かを書く（例: `図形 2（四角 1）: width が数値ではありません`）。知らない `kind` はエラー。

- [ ] **Step 1: 失敗するテストを書く。** 最低限、次を含める。
  - `createDocument()` は `grid.size === 20`、`nodes.length === 0`。
  - `createNode(doc, 'rect', {x:100,y:100}, 'a')` は `width 80`、`height 80`、`transform {x:100,y:100,rotation:0}`、`name '四角 1'`。
  - 四角を 2 個足すと 2 個目の名前は `四角 2`。`四角 2` だけ残して足すと `四角 3`。
  - `addNode` は元の `doc` を書き換えない（`Object.isFrozen` ではなく、元の `nodes.length` が変わらないことで確かめる）。
  - `translateNodes(doc, ['a'], 20, -20)` で `a` だけが動く。
  - `reorderNode`: `[a,b,c]` で `b` を `1` → `[a,c,b]`。`c` を `1` → 同じ参照の `doc` が返る。
  - `duplicateNodes`: 新しい id、位置が `dx, dy` ずれる、`newIds.length === ids.length`、配列の最後に入る。
  - `setGrid(doc, {size: 1})` → `size 5`。`{size: 999}` → `160`。
  - `validateDocument(createDocument())` → `ok: true`。`{version: 2}` → `ok: false`。`nodes` に `width: 'x'` の rect → `ok: false` でエラー文に `width` を含む。id の重複 → `ok: false`。
- [ ] **Step 2:** `npm test` で失敗を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run typecheck && npm test` が通る。
- [ ] **Step 5:** コミット `feat(core): document model, operations and validation`。

---

### Task 3: 図形の計算（core/geometry）

**Files:**
- Create: `src/core/geometry.ts`
- Test: `tests/core/geometry.test.ts`

**Interfaces:**
- Consumes: `src/core/types.ts`
- Produces:

```ts
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export function snapValue(v: number, size: number): number;                 // Math.round(v / size) * size
export function snapPoint(p: Point, grid: GridSettings): Point;             // grid.snap が false なら p をそのまま返す
export function toWorld(node: SceneNode, local: Point): Point;              // 回転してから中心を足す
export function toLocal(node: SceneNode, world: Point): Point;
export function rotateVector(v: Point, degrees: number): Point;
export function localOutline(node: SceneNode): Point[];                     // 外形を表す多角形（図形の中心が原点）
export function worldOutline(node: SceneNode): Point[];
export function nodeBounds(node: SceneNode): Bounds;                        // worldOutline の外枠（線の太さは含めない）
export function nodesBounds(nodes: SceneNode[]): Bounds | null;             // 空なら null
export function anchorPoint(node: SceneNode, anchor: Anchor): Point;        // center = transform の位置、tl など = nodeBounds の角
export function pointInPolygon(p: Point, polygon: Point[]): boolean;
export function distanceToPolygonEdge(p: Point, polygon: Point[], closed: boolean): number;
export function hitTest(node: SceneNode, p: Point, tolerance: number): boolean;
export function hitStack(doc: Document, p: Point, tolerance: number, only?: string[]): string[];  // 手前から順の id
```

**決まり:**
- `localOutline`: rect は `[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]`（角の丸みは外形に入れない）。ellipse は 64 角形（i 番目の角度は `2πi/64`、0 番は `(rx, 0)`）。polygon は i 番目の角度が `-90° + i * 360°/sides`。`starRatio < 1` のときは点が `2 * sides` 個で、偶数番が `radius`、奇数番が `radius * starRatio`、角度の刻みは `180°/sides`。path は `points`。
- `hitTest`: 閉じた形は「内側にある」または「外形の辺から `tolerance` 以内」で真。塗りが `null` でも内側は真（狙いやすさを優先する）。閉じていない path は辺から `max(tolerance, strokeWidth / 2)` 以内だけ。
- `hitStack`: `visible === false` と `locked === true` の図形は入れない。`only` があれば、その id だけを対象にする。

- [ ] **Step 1: 失敗するテストを書く。** 最低限、次を含める（小数は `toBeCloseTo`）。
  - `snapPoint({x:23,y:38},{size:20,visible:true,snap:true})` → `{20,40}`。`snap:false` → `{23,38}`。
  - 中心 `(100,100)`、回転 90 の rect で `toWorld(node,{x:10,y:0})` → `(100,110)`。`toLocal` はその逆。
  - 中心 `(100,100)`、80×80 の rect: `nodeBounds` → `60,60,140,140`。回転 45 → `minX ≈ 100 - 56.57`。
  - 同じ rect: `hitTest(p=(100,100))` 真、`(150,100)` 偽、`(141,100), tolerance 2` 真。
  - ellipse `rx 40, ry 20`: `(100,119)` 真、`(100,125)` 偽、`(139,100)` 真。
  - polygon `sides 3, radius 40`: `worldOutline` の 0 番は `(100,60)`。`sides 5, starRatio 0.5` は点が 10 個。
  - `anchorPoint(rect,'tl')` → `(60,60)`、`'br'` → `(140,140)`、`'center'` → `(100,100)`。
  - `hitStack`: 重なった `[a,b,c]`（c が手前）で `['c','b','a']`。`b` が locked なら `['c','a']`。`c` が非表示なら `['b','a']`。`only: ['a']` なら `['a']`。
  - `nodesBounds([])` → `null`。
- [ ] **Step 2:** 失敗を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run typecheck && npm test` が通る。
- [ ] **Step 5:** コミット `feat(core): geometry, snapping and hit testing`。

---

### Task 4: つまみ（core/handles）

**Files:**
- Create: `src/core/handles.ts`
- Test: `tests/core/handles.test.ts`

**Interfaces:**
- Consumes: `types.ts`、`geometry.ts` の `toWorld` `toLocal` `rotateVector` `localOutline`
- Produces:

```ts
export interface Handle {
  id: string;            // 'edge:0' のように、種類:番号
  kind: 'edge';          // 段階 2 で 'vertex' が加わる
  index: number;
  pos: Point;            // ワールド座標
  normal: Point;         // ワールド座標の単位ベクトル（外向き）
}
export function getHandles(node: SceneNode): Handle[];
export function findHandleAt(node: SceneNode, p: Point, tolerance: number): Handle | null;   // 一番近いもの。tolerance より遠ければ null
export function nextHandleId(node: SceneNode, current: string | null): string | null;         // 最後の次は最初に戻る。つまみが無ければ null
export function moveHandle(node: SceneNode, handleId: string, target: Point, minSize: number): SceneNode;
export function nudgeHandle(node: SceneNode, handleId: string, dir: Point, step: number, minSize: number): SceneNode;
export function polygonToPath(node: PolygonNode): PathNode;
```

**決まり:**
- 辺の番号: rect と ellipse は 0 = 上、1 = 右、2 = 下、3 = 左（回転する前の向き）。ローカル座標での位置と法線は、上 `(0,-h/2)`・`(0,-1)`、右 `(w/2,0)`・`(1,0)`、下 `(0,h/2)`・`(0,1)`、左 `(-w/2,0)`・`(-1,0)`。ellipse は `w = 2rx`、`h = 2ry`。
- polygon と path（閉じた形）は、辺 i が点 i と点 i+1（最後は 0 に戻る）の間。位置は中点。法線は辺に垂直で、「中点 − 全点の平均」との内積が正になる向き。
- `moveHandle` の計算: `d = dot(target - handle.pos, handle.normal)`。
  - rect: 上下の辺なら `height`、左右なら `width` を `d` 増やす。`d` は `新しい大きさ >= minSize` になるよう下から切る（`d = max(d, minSize - 今の大きさ)`）。中心を `normal * d / 2` 動かす。反対側の辺は動かない。
  - ellipse: 同じ考えで、`rx` か `ry` を `d / 2` 増やす（`2r >= minSize`）。中心を `normal * d / 2` 動かす。
  - polygon: まず `polygonToPath` で path に変え、path と同じ処理をする。
  - path: 辺 i の両端の点を、ローカル座標の法線 × `d` だけ動かす。`transform` は変えない。`minSize` は使わない。
- `polygonToPath`: `kind: 'path'`、`points` は `localOutline` の点（`corner: true`）、`closed: true`、`smooth: false`、`tension: 0.5`。`id`・`name`・`transform`・`style`・`visible`・`locked`・`role` は引き継ぐ。
- `nudgeHandle`: `moveHandle(node, id, handle.pos + dir * step, minSize)` と同じ。`dir` は `(1,0)` `(-1,0)` `(0,1)` `(0,-1)` のどれか。法線に垂直な向きなら図形は変わらない。
- 知らない `handleId` は元の `node` をそのまま返す。

- [ ] **Step 1: 失敗するテストを書く。** 最低限、次を含める。
  - 中心 `(100,100)`、80×80 の rect: `getHandles` は 4 個。`edge:0` の `pos (100,60)`・`normal (0,-1)`、`edge:1` の `pos (140,100)`・`normal (1,0)`。
  - `moveHandle(rect,'edge:1',{x:180,y:130},20)` → `width 120`、`height 80`、中心 `(120,100)`。
  - 回転 90 の同じ rect: `edge:1` は `pos (100,140)`・`normal (0,1)`。`moveHandle` で `(100,180)` → `width 120`、中心 `(100,120)`。
  - 縮めすぎ: `moveHandle(rect,'edge:1',{x:40,y:100},20)` → `width 20`、中心 `(70,100)`（左の辺は `x = 60` のまま）。
  - ellipse `rx 40, ry 40`: `edge:1` を `(180,100)` へ → `rx 60`、`ry 40`、中心 `(120,100)`。
  - polygon `sides 4, radius 40`: `edge:0` は `pos (120,80)`、`normal ≈ (0.7071,-0.7071)`。`moveHandle` で `(140,60)` → 結果は `kind 'path'`、`points` が `[(20,-60),(60,-20),(0,40),(-40,0)]`、`transform` は `(100,100)` のまま、`id` と `name` は同じ。
  - `nextHandleId(rect,null)` → `'edge:0'`、`'edge:3'` の次 → `'edge:0'`。
  - `findHandleAt(rect,{x:138,y:101},5)` → `edge:1`。`{x:100,y:100}` → `null`。
  - `nudgeHandle(rect,'edge:1',{x:0,y:1},20,20)` → `width` は変わらない。`{x:1,y:0}` → `width 100`。
- [ ] **Step 2:** 失敗を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run typecheck && npm test` が通る。
- [ ] **Step 5:** コミット `feat(core): edge handles`。

---

### Task 5: 取り消しと編集の状態（core/history, editor/*）

**Files:**
- Create: `src/core/history.ts`, `src/editor/state.ts`, `src/editor/actions.ts`, `src/editor/store.ts`
- Test: `tests/core/history.test.ts`, `tests/editor/actions.test.ts`

**Interfaces:**
- Consumes: Task 2〜4 の全部
- Produces:

```ts
// src/core/history.ts
export interface History<T> { past: T[]; present: T; future: T[]; lastKey: string | null; lastTime: number }
export const COALESCE_MS = 800;
export function createHistory<T>(initial: T): History<T>;
export function commit<T>(h: History<T>, next: T, opts?: { coalesceKey?: string; now?: number }): History<T>;
export function undo<T>(h: History<T>): History<T>;
export function redo<T>(h: History<T>): History<T>;
```

`commit` の決まり: `next === h.present` なら `h` をそのまま返す。`coalesceKey` が `h.lastKey` と同じで、`now - h.lastTime <= COALESCE_MS` なら、`past` を増やさず `present` だけ置き換える。それ以外は `past` に今の `present` を積み、`future` を空にする。`undo` と `redo` は `lastKey` を `null` に戻す。回数の上限は設けない。

```ts
// src/editor/state.ts
export type FocusArea = 'canvas' | 'list' | 'props';
export interface View { zoom: number; panX: number; panY: number }   // 画面 = ワールド * zoom + pan
export const ZOOM_MIN = 0.1; export const ZOOM_MAX = 16;
export interface EditorState {
  history: History<Document>;
  selection: string[];          // 最後の要素が「主」の図形
  heldHandle: string | null;    // 選択が 1 個のときだけ意味を持つ
  multiSelect: boolean;
  solo: boolean;
  focusArea: FocusArea;
  view: View;
  cursor: Point | null;         // ワールド座標。キャンバスの外なら null
  anchor: Anchor;
  lastClick: Point | null;      // 重なりの切り替え用
  notice: string | null;        // 画面下の案内に出す一言
}
export function createEditorState(doc?: Document): EditorState;      // view { zoom: 1, panX: 0, panY: 0 }、anchor 'center'
export function currentDoc(s: EditorState): Document;                // s.history.present
export function primaryNode(s: EditorState): SceneNode | undefined;  // 選択の最後の図形
```

```ts
// src/editor/actions.ts  すべて (s: EditorState, ...) => EditorState の純粋な関数
export interface ClickOptions { hitTolerance: number; handleTolerance: number; now?: number }   // どちらもワールドの長さ
export function placeShape(s, kind: 'rect' | 'ellipse' | 'polygon', fallbackCenter: Point): EditorState;
export function clickCanvas(s, p: Point, button: 'left' | 'right', opts: ClickOptions): EditorState;
export function moveToCursor(s): EditorState;                        // Space
export function nudge(s, dx: -1 | 0 | 1, dy: -1 | 0 | 1): EditorState;   // 矢印キー（キャンバス）
export function cycleSelection(s, dir: 1 | -1): EditorState;         // Q / E
export function cycleHandle(s): EditorState;                         // W
export function escape(s): EditorState;                              // Esc
export function toggleMultiSelect(s): EditorState;                   // M
export function duplicateSelection(s): EditorState;                  // D
export function deleteSelection(s): EditorState;                     // Delete / Backspace
export function undoAction(s): EditorState;                          // Z
export function redoAction(s): EditorState;                          // Y
export function reorderSelection(s, dir: 1 | -1): EditorState;       // F / B
export function toggleVisible(s): EditorState;                       // H
export function toggleLocked(s): EditorState;                        // K
export function toggleSolo(s): EditorState;                          // O
export function selectOnly(s, id: string | null): EditorState;       // 図形リストから
export function setNodeProp(s, id: string, patch: Partial<SceneNode>, coalesceKey: string, now?: number): EditorState;
export function setGridProp(s, patch: Partial<GridSettings>, coalesceKey: string, now?: number): EditorState;
export function gridFiner(s): EditorState;                           // 1: size を半分（GRID_MIN まで）
export function gridCoarser(s): EditorState;                         // 2: size を 2 倍（GRID_MAX まで）
export function zoomAt(s, screenPoint: Point, factor: number): EditorState;   // screenPoint の下のワールド座標を保つ
export function panBy(s, dxScreen: number, dyScreen: number): EditorState;
export function fitView(s, viewport: { width: number; height: number }): EditorState;   // 0
export function setCursor(s, p: Point | null): EditorState;
export function setAnchor(s, anchor: Anchor): EditorState;
export function cycleFocus(s): EditorState;                          // Tab: canvas → list → props → canvas
export function loadDocument(s, doc: Document): EditorState;         // 履歴・選択・つまみを初期化する
```

```ts
// src/editor/store.ts
export const editorStore: StoreApi<EditorState>;          // zustand/vanilla の createStore
export function useEditor<T>(selector: (s: EditorState) => T): T;
export function dispatch(fn: (s: EditorState) => EditorState): void;   // editorStore.setState(fn(editorStore.getState()), true)
```

**`actions` の決まり:**

- `placeShape`: 位置は `s.cursor` があれば `snapPoint(s.cursor, grid)`、無ければ `snapPoint(fallbackCenter, grid)`。図形を足して `commit` し、その図形だけを選ぶ。`heldHandle = null`、`focusArea = 'canvas'`。
- `clickCanvas` の左クリックは、次の順で最初に当てはまるものを行う。
  1. 選択が 1 個で、その図形が locked でなく、`findHandleAt(node, p, handleTolerance)` がつまみを返す → `heldHandle = そのつまみの id`。
  2. `heldHandle` がある → `moveHandle(node, heldHandle, snapPoint(p, grid), grid.size)` の結果で図形を置き換えて `commit`。`heldHandle` は保つ。図形の `kind` が変わったら `notice = '自由な形に変わりました（Z で戻せます）'`。
  3. `hitStack(doc, p, hitTolerance, solo のとき selection)` が空でない →
     - `multiSelect` なら、先頭の図形を選択に足す（すでにあれば外す）。
     - それ以外で、主の図形がスタックに入っていて、`lastClick` が `p` から `hitTolerance * 2` 以内なら、スタックの次の図形を選ぶ（最後なら先頭に戻る）。
     - それ以外は先頭の図形だけを選ぶ。
     - どの場合も `heldHandle = null`、`lastClick = p`。
  4. スタックが空で、選択があり、`multiSelect` でない → 主の図形の `anchorPoint(node, s.anchor)` が `snapPoint(p, grid)` に重なるよう、選択した全図形（locked を除く）を同じ量だけ動かして `commit`。
  5. どれでもない → 何もしない。
- `clickCanvas` の右クリック: `escape` と同じ。
- `escape`: `heldHandle` があれば外すだけ。無ければ選択を空にし、`multiSelect = false`。`notice = null`。
- `moveToCursor`: `cursor` が無ければ何もしない。`heldHandle` があれば手順 2 と同じ（`p = cursor`）。無ければ手順 4 と同じ（スタックは見ない）。
- `nudge`: `heldHandle` があれば `nudgeHandle(node, heldHandle, {x:dx,y:dy}, grid.size, grid.size)` で `commit`（`coalesceKey: 'nudge-handle'`）。選択があれば `translateNodes` で `grid.size` 分動かして `commit`（`coalesceKey: 'nudge'`）。選択が無ければ `panBy(s, -dx * 40, -dy * 40)`。
- `cycleSelection`: 対象は「見えていて、locked でない」図形を奥から手前の順に並べたもの。選択が無ければ、`dir = 1` で一番手前、`-1` で一番奥。`heldHandle = null`。
- `cycleHandle`: 選択が 1 個のとき `nextHandleId` で進める。
- `duplicateSelection`: `duplicateNodes(doc, selection, grid.size, grid.size)`。新しい図形を選ぶ。
- `deleteSelection`: 消して選択を空にする。locked の図形は消さない。
- `undoAction` / `redoAction`: 戻したあと、存在しない id を選択から除く。`heldHandle = null`。
- `toggleSolo`: 選択が無ければ何もしない。solo の間、`hitStack` と `cycleSelection` は選択した図形だけを対象にする。選択が空になったら `solo = false`。
- `setNodeProp`: `updateNode` で `patch` を重ねて `commit`（`coalesceKey` 付き）。
- `zoomAt`: `zoom` を `ZOOM_MIN..ZOOM_MAX` に収め、`pan = screenPoint - world * 新しい zoom`。
- `fitView`: `nodesBounds` が `null` なら `{zoom: 1, panX: viewport.width / 2, panY: viewport.height / 2}`。あれば、40px の余白を残して全体が収まる最大の `zoom`（`ZOOM_MAX` 以下）にし、中央に置く。

- [ ] **Step 1: 失敗するテストを書く。** 最低限、次を含める。
  - history: `commit` で `past` が増える。`undo` → `redo` で元に戻る。`undo` のあとの `commit` で `future` が空になる。同じ `coalesceKey` で 500ms 後 → `past` は増えない。900ms 後 → 増える。`commit(h, h.present)` → 同じ参照。
  - `placeShape` で図形が 1 個でき、選択がその id、位置がカーソルの吸着先。カーソルが `null` なら `fallbackCenter` の吸着先。
  - 図形を選んだ状態で何もない点 `(203,198)` を左クリック → 中心が `(200,200)`。
  - `anchor = 'tl'` で同じことをする → `nodeBounds.minX === 200`、`minY === 200`。
  - つまみをクリック → `heldHandle === 'edge:1'`、図形は動かない。続けて `(183,131)` を左クリック → `width 120`。右クリック → `heldHandle === null` で選択は残る。もう一度右クリック → 選択が空。
  - 重なった 2 個（b が手前）: 重なりをクリック → `b`。同じ点をもう一度 → `a`。もう一度 → `b`。離れた点で `a` だけをクリック → `a`。
  - `multiSelect`: 2 個を順にクリック → 選択が 2 個。同じ図形をもう一度 → 外れる。
  - `nudge(s,1,0)`: 選択あり → x が 20 増える。つまみあり → `width` が 20 増える。選択なし → `panX` が 40 減る。
  - 連続した `nudge` は取り消し 1 回で全部戻る（`now` を渡せないので、`nudge` を 2 回呼んで `past.length` が 1 だけ増えることで確かめる。そのために `nudge` などに省略できる引数 `now?: number` を足してよい）。
  - `cycleSelection`: 3 個で `1` を繰り返すと 手前 → 奥 → … と一巡する。locked は飛ばす。
  - `deleteSelection` → `undoAction` で図形が戻る。
  - `duplicateSelection` で図形が 2 個になり、新しいほうが選ばれ、位置が `(+20,+20)`。
  - `gridFiner` を繰り返しても `size` は 5 未満にならない。図形の `width` は変わらない。
  - `zoomAt(s,{x:100,y:100},2)` の前後で、画面の `(100,100)` に当たるワールド座標が同じ。
  - polygon の辺を動かす → `kind === 'path'`、`notice` に `自由な形` を含む。`undoAction` で polygon に戻る。
- [ ] **Step 2:** 失敗を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run typecheck && npm test` が通る。
- [ ] **Step 5:** コミット `feat(editor): history and editor actions`。

---

### Task 6: SVG を作る（render/svg）

**Files:**
- Create: `src/render/svg.ts`
- Test: `tests/render/svg.test.ts`

**Interfaces:**
- Consumes: `types.ts`、`geometry.ts`
- Produces:

```ts
export interface SvgElementSpec { tag: 'rect' | 'ellipse' | 'polygon'; attrs: Record<string, string | number> }
export function nodeToSvg(node: SceneNode): SvgElementSpec;
export interface ExportOptions {
  area: 'content' | Bounds;      // content = 見えている図形がちょうど収まる枠
  margin: number;                // 単位
  background: string | null;     // null = 透明
}
export function exportBounds(doc: Document, opts: ExportOptions): Bounds;   // 図形が無ければ { 0, 0, 100, 100 } に margin を足したもの
export function documentToSvg(doc: Document, opts: ExportOptions): string;
```

**決まり:**
- `nodeToSvg` はローカル座標の形 + `transform`。rect は `x = -w/2`、`y = -h/2`、`width`、`height`、`rx = cornerRadius`（0 なら付けない）。ellipse は `cx = 0`、`cy = 0`、`rx`、`ry`。polygon と path（閉じた直線の形）は `tag: 'polygon'`、`points = "x1,y1 x2,y2 …"`。
- 共通の属性: `transform = "translate(x y) rotate(r)"`（`r` が 0 なら `rotate` を付けない）、`fill`（`null` は `"none"`）、`stroke`（`null` は付けない。あれば `stroke-width` も付ける）、`opacity`（1 なら付けない）。
- 数値は小数第 3 位で丸め、余分な 0 を落とす（`12.500` → `12.5`、`3.000` → `3`）。
- `exportBounds` の `content` は、線の太さの半分を外枠に足す。非表示の図形は入れない。
- `documentToSvg`: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="minX minY w h" width="w" height="h">`。背景があれば最初に同じ大きさの `<rect>`。非表示の図形は出さない。グリッドは出さない。属性の値は `&` `<` `>` `"` を逃がす。図形ごとに改行する。

- [ ] **Step 1: 失敗するテストを書く。** 最低限: rect の属性（`x -40`、`transform "translate(100 100)"`）。回転 30 で `"translate(100 100) rotate(30)"`。`fill: null` → `"none"`。`stroke` が `null` なら `stroke-width` が無い。polygon（三角形）の `points` が 3 組。`documentToSvg` の `viewBox`（80×80 の rect を `(100,100)`、margin 10 → `"50 50 100 100"`）。非表示の図形が出ない。背景の `<rect>` が最初にある。丸め（`12.3456` → `12.346`）。
- [ ] **Step 2:** 失敗を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** `npm run typecheck && npm test` が通る。
- [ ] **Step 5:** コミット `feat(render): svg generation`。

---

### Task 7: キーの割り当てとキャンバス（input/*, ui/CanvasView, ui/KeyHints）

**Files:**
- Create: `src/input/keymap.ts`, `src/input/keyboard.ts`, `src/ui/CanvasView.tsx`, `src/ui/KeyHints.tsx`
- Modify: `src/App.tsx`, `src/styles.css`, `src/main.tsx`
- Test: `tests/input/keymap.test.ts`, `e2e/canvas.spec.ts`

**Interfaces:**
- Consumes: Task 5 の `actions` と `store`、Task 6 の `nodeToSvg`、Task 4 の `getHandles`
- Produces:

```ts
// src/input/keymap.ts
export type ActionId =
  | 'place-rect' | 'place-ellipse' | 'place-polygon'
  | 'prev-shape' | 'next-shape' | 'next-handle' | 'multi-select' | 'escape' | 'cycle-focus'
  | 'move-up' | 'move-down' | 'move-left' | 'move-right' | 'move-to-cursor'
  | 'forward' | 'backward' | 'duplicate' | 'delete' | 'undo' | 'redo'
  | 'toggle-visible' | 'toggle-locked' | 'toggle-solo'
  | 'fit-view' | 'grid-finer' | 'grid-coarser';
export interface KeyBinding { key: string; action: ActionId; label: string; group: '置く' | '選ぶ' | '動かす' | '編集' | '表示' | '見る'; repeat: boolean }
export const KEYMAP: KeyBinding[];
export function findBinding(key: string): KeyBinding | undefined;      // event.key を小文字にして引く
export function keyLabel(key: string): string;                          // 'r' → 'R'、' ' → 'Space'、'ArrowUp' → '↑'
export interface Hint { keys: string; label: string }
export function hintsFor(s: EditorState): Hint[];
// src/input/keyboard.ts
export function runAction(action: ActionId, viewport: { width: number; height: number }): void;   // dispatch を呼ぶ
export function attachKeyboard(getViewport: () => { width: number; height: number }): () => void; // window に keydown を付け、外す関数を返す
```

**キーの割り当て（`event.key`、英字は小文字で比べる）:**
`r` 四角 / `c` 円 / `p` 多角形 / `q` 前の図形 / `e` 次の図形 / `w` 次のつまみ / `m` 複数選択 / `Escape` / `Tab` / `ArrowUp` `ArrowDown` `ArrowLeft` `ArrowRight`（repeat あり）/ ` `（Space）カーソルの位置へ / `f` 一つ手前へ / `b` 一つ奥へ / `d` 複製 / `Delete` と `Backspace` 消す / `z` 取り消す / `y` やり直す / `h` 隠す・出す / `k` ロック / `o` ソロ / `0` 全体表示 / `1` グリッドを細かく / `2` グリッドを粗く。

**`keyboard.ts` の決まり:**
- Global Constraints のキーの決まり（修飾キーは無視、`repeat` は矢印だけ、入力欄では働かせない）を守る。
- 働かせたキーは `preventDefault()` する（Space のスクロール、Tab のフォーカス移動、Backspace を止める）。
- `focusArea === 'canvas'` のときだけ矢印キーを `nudge` に回す。`'list'` と `'props'` のときの矢印キーは、Task 8 の部品が自分で受ける（ここでは何もしない）。それ以外のキーはどの場所でも働く。
- 入力欄で `Escape` を押したら、その欄の `blur()` を呼ぶだけにする。

**`hintsFor` の決まり（上から順に、当てはまるものを返す）:**
- つまみをつかんでいる: `クリック / 矢印 / Space: つまみを動かす`、`W: 次のつまみ`、`右クリック / Esc: つかむのをやめる`
- 複数選択の途中: `クリック: 足す・外す`、`M: 複数選択を終える`、`矢印: 動かす`
- 図形を選んでいる: `つまみをクリック: つかむ`、`何もない点をクリック / Space / 矢印: 動かす`、`W: つまみ`、`D: 複製`、`Delete: 消す`、`右クリック / Esc: 選択を外す`
- 何も選んでいない: `R: 四角`、`C: 円`、`P: 多角形`、`図形をクリック / Q / E: 選ぶ`、`ホイール: 拡大縮小`、`矢印: 表示を動かす`
- `s.notice` があれば、先頭に `{ keys: '', label: s.notice }` を足す。

**`CanvasView` の決まり:**
- 親いっぱいに広がる `<svg data-testid="canvas">`。中身は `<g transform="translate(panX panY) scale(zoom)">` の中に図形を奥から順に描く（`nodeToSvg` の結果を `React.createElement` に渡す。属性名は `stroke-width` → `strokeWidth` に直す）。各図形に `data-node-id`。
- 最初の表示で、ワールドの原点が画面の中央に来るよう `pan` を決める（`fitView` を呼ぶ）。
- グリッドは点で描く（`<pattern>`）。画面上の間隔 `size * zoom` が 8px 未満なら、8px 以上になるまで間隔を 2 倍にして描く。`grid.visible === false` なら描かない。
- カーソルに一番近いグリッド点に、吸着先の印（輪）を出す。`grid.snap === false` なら出さない。
- 選んだ図形は外形を強調する（`worldOutline` を太さ 2px の線で。色は `--accent`）。線と、つまみと、吸着先の印は、`zoom` が変わっても画面上の大きさが同じ（`vector-effect="non-scaling-stroke"`、大きさは `/ zoom`）。
- つまみは、選択が 1 個で locked でないときだけ出す。画面上で 14px の四角。`data-handle-id`。つかんでいるつまみは塗りつぶす。
- solo の間、選択していない図形は `opacity 0.25`。非表示の図形は描かない。locked の図形は普通に描く。
- イベント: `onMouseMove` と `onMouseLeave` で `setCursor`。`onClick` で `clickCanvas(…, 'left', { hitTolerance: 4 / zoom, handleTolerance: 14 / zoom })`。`onContextMenu` で `preventDefault()` して `'right'`。`wheel` は `passive: false` で付け、`preventDefault()` して `zoomAt(カーソルの位置, deltaY < 0 ? 1.15 : 1 / 1.15)`。クリックしたら `focusArea = 'canvas'` にする。
- 画面 → ワールドの変換は `(screen - pan) / zoom`。`svg.getBoundingClientRect()` で画面内の位置を出す。
- テスト用に、`import.meta.env.DEV` のときだけ `window.__shapeSnap = { getState: () => editorStore.getState() }` を置く（`main.tsx`）。

**`App` の配置（Task 8 で中身が入る場所を空で用意する）:** CSS grid で、上に `header.toolbar`（56px）、左にキャンバス、右に `aside.side`（幅 320px）、下に `footer.hints`（48px）。画面いっぱい（`100vh`）で、ページ全体はスクロールしない。`styles.css` は明るい表示と暗い表示（`prefers-color-scheme`）の両方に色を決める。色の変数は `docs/design.html` の `:root` と同じ名前と値を使う。

- [ ] **Step 1:** `tests/input/keymap.test.ts` を書く: すべての `ActionId` に割り当てが 1 つ以上ある。同じ `key` が 2 回出ない。`repeat: true` は矢印 4 つだけ。`findBinding('R')` が `place-rect`。`hintsFor` が 4 つの状況それぞれで上の決まりどおりの先頭の項目を返す。
- [ ] **Step 2:** 失敗を確かめ、`keymap.ts` を実装して通す。
- [ ] **Step 3:** `keyboard.ts`、`CanvasView.tsx`、`KeyHints.tsx`、`App.tsx`、`styles.css` を実装する。
- [ ] **Step 4:** `e2e/canvas.spec.ts` を書く。操作は `page.mouse.move`、`page.mouse.click`、`page.mouse.wheel`、`page.keyboard.press`（単独キー）だけを使う。状態は `page.evaluate(() => window.__shapeSnap.getState())` で読む。
  - キャンバスの中央にカーソルを置いて `r` → 図形が 1 個、`kind 'rect'`、`[data-node-id]` の要素が 1 個。
  - 何もない場所をクリック → 図形の中心がクリックした点の吸着先に移る。
  - `ArrowRight` を 3 回 → x が 60 増える。
  - `w` → `heldHandle` が `edge:0`。`ArrowUp` → `height` が 20 増える。`Escape` → `heldHandle` が `null` で選択は残る。
  - `[data-handle-id="edge:1"]` の中心をクリック → `heldHandle` が `edge:1`。右に 40px の点をクリック → `width` が増える。
  - 右クリック 2 回 → 選択が空。
  - `z` を繰り返す → 図形が 0 個。`y` → 1 個。
  - `c`、`p` で円と多角形ができる。
  - ホイール → `view.zoom` が変わる。
  - 画面下に `今使えるキー` の案内が出ていて、図形を選ぶと文が変わる。
- [ ] **Step 5:** `npm run typecheck && npm test && npm run e2e` が通る。
- [ ] **Step 6:** コミット `feat(ui): canvas, keymap and key hints`。

---

### Task 8: パネル（Toolbar, ShapeList, PropsPanel, GridPanel, SliderField, ColorField）

**Files:**
- Create: `src/ui/Toolbar.tsx`, `src/ui/ShapeList.tsx`, `src/ui/PropsPanel.tsx`, `src/ui/GridPanel.tsx`, `src/ui/SliderField.tsx`, `src/ui/ColorField.tsx`, `src/ui/propDefs.ts`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `tests/ui/propDefs.test.ts`, `e2e/panels.spec.ts`

**Interfaces:**
- Consumes: Task 5 の `actions` と `store`、Task 7 の `runAction` `KEYMAP` `keyLabel`
- Produces:

```ts
// src/ui/propDefs.ts  図形の種類ごとの、設定に出す項目の表（純粋。テストできる）
export interface PropDef {
  key: string;                 // 'width' 'x' 'strokeWidth' など。data-prop に使う
  label: string;               // '幅'
  min: number; max: number; step: number;
  get: (n: SceneNode) => number;
  set: (n: SceneNode, v: number) => Partial<SceneNode>;
}
export function propDefsFor(node: SceneNode, grid: GridSettings): PropDef[];
export function clampToDef(def: PropDef, v: number): number;
// src/ui/SliderField.tsx
export interface SliderFieldProps {
  propKey: string; label: string; value: number; min: number; max: number; step: number;
  active: boolean;                       // 設定の中で今選ばれている行か
  onChange: (v: number) => void;
}
```

**`propDefsFor` の項目（上から順）:**
- 共通の先頭: `x`（横の位置）、`y`（縦の位置）。範囲 `-2000..2000`、刻み `grid.size`。
- rect: `width`（幅）、`height`（高さ）: `grid.size..2000`、刻み `grid.size`。`cornerRadius`（角の丸み）: `0..min(width,height)/2`、刻み 1。
- ellipse: `rx`（横の半径）、`ry`（縦の半径）: `grid.size/2..1000`、刻み `grid.size/2`。
- polygon: `sides`（辺の数）: `3..12`、刻み 1。`radius`（半径）: `grid.size/2..1000`、刻み `grid.size/2`。`starRatio`（星形の割合）: `0.1..1`、刻み 0.05。
- path: 固有の項目なし。
- 共通の末尾: `rotation`（回転）: `0..359`、刻み 15。`strokeWidth`（線の太さ）: `0..40`、刻み 1。`opacity`（不透明度）: `0..1`、刻み 0.05。
- `set` は `{ transform: {...} }` や `{ style: {...} }` のように、入れ子を丸ごと作り直して返す。

**`SliderField` の決まり:**
- 横に並べる: ラベル、`<input type="range">`、`<input type="number">`。行全体に `data-prop={propKey}`。
- range は `min` `max` `step` をそのまま渡す。クリックした位置へつまみが飛ぶ（ブラウザの標準の動き）。
- `wheel`（`passive: false`、`preventDefault()`）: 上に回すと `+step`、下で `-step`。行のどこに乗せていても効く。
- number の欄: 打っている間は確定しない。`Enter` か `blur` で確定する。範囲の外は `clampToDef` で収める。数字でなければ元の値に戻し、欄に `invalid` のクラスを 1 秒付ける（赤くする）。確定したら `blur()` する。
- `active` の行は枠で強調し、`scrollIntoView({ block: 'nearest' })` する。

**`PropsPanel` の決まり:**
- 選択が 1 個のとき、その図形の `propDefsFor` を `SliderField` で並べ、続けて塗りの色と線の色（`ColorField`）、基準点（中心・左上・右上・左下・右下のボタン）。
- 選択が無ければ `図形を選ぶと、ここに設定が出ます`。複数なら `N 個の図形を選んでいます` とだけ出す。
- 値の変更は `setNodeProp(s, id, patch, 'prop:' + key)`。
- キー操作（`focusArea === 'props'` のとき、このパネルが `window` の `keydown` で受ける）: `ArrowUp` `ArrowDown` で行を選ぶ。`ArrowLeft` `ArrowRight` で `∓step`（`repeat` 可）。数字キーか `-` か `.` を押すと、選んでいる行の number の欄にフォーカスを移し、その文字から打ち始める。修飾キーと入力欄の決まりは Global Constraints のとおり。
- 選んでいる行の番号は、このパネルの中の `useState` で持つ。図形が変わったら 0 に戻す。

**`ColorField` の決まり:**
- 見本 12 色のボタン（高さ 32px 以上）: `#1d2330 #ffffff #e5484d #f76808 #ffc53d #46a758 #12a594 #2f6fde #6e56cf #d6409f #8d8d8d #000000`。
- `なし` のボタン（`null` にする）。
- 色コードの欄（`#rrggbb`。`Enter` か `blur` で確定。形が違えば元に戻す）。
- 色相（0..360）・彩度（0..100）・明るさ（0..100）の `SliderField` 3 本。`propDefs.ts` に `hexToHsl(hex): {h,s,l}` と `hslToHex(h,s,l): string` を置き、テストする。
- `data-color-field="fill"` / `"stroke"`。

**`ShapeList` の決まり:**
- 手前の図形が上（`nodes` を逆順に並べる）。行は `<button>` ではなく `<div role="option" data-list-id={id}>`、高さ 40px。名前、`表示`／`非表示` のボタン、`ロック` のボタン。
- 行をクリック → `selectOnly(id)`（`multiSelect` のときは足し引き）。`focusArea = 'list'` にする。
- 選ばれた行は強調し、`scrollIntoView({ block: 'nearest' })`。
- キー操作（`focusArea === 'list'` のとき）: `ArrowUp` で一つ上の行（＝一つ手前の図形）、`ArrowDown` で一つ下。ここでは locked の図形も選べる。
- 名前: 行の `名前を変える` ボタンで入力欄に変わり、`Enter` で確定、`Esc` でやめる。空の名前は元に戻す。名前の変更は `setNodeProp(s, id, { name }, 'rename')`。
- 図形が無ければ `R・C・P で図形を置けます`。

**`GridPanel` の決まり:** `間隔`（`SliderField`、`5..160`、刻み 5、`setGridProp(…, 'grid-size')`）、`グリッドを表示`、`グリッドに吸着` のチェックボックス（高さ 40px の行）。

**`Toolbar` の決まり:** ボタンは `KEYMAP` から作る。並びは `R 四角`、`C 円`、`P 多角形`、区切り、`D 複製`、`Delete 消す`、`F 手前へ`、`B 奥へ`、区切り、`M 複数選択`（入っている間は押された見た目）、`O ソロ`（同じ）、区切り、`Z 戻す`、`Y やり直す`、`0 全体表示`。押すと `runAction`。右端に Task 9 で `作品` と `書き出し` が入る場所を空けておく。各ボタンに `data-action={ActionId}`。ボタンを押したあと、フォーカスをボタンに残さない（`blur()`。Space や Enter が次にボタンを押してしまうのを防ぐ）。

**場所の強調:** `focusArea` に合わせて、キャンバス・図形リスト・設定のどれかの枠を `--accent` で強調する。

- [ ] **Step 1:** `tests/ui/propDefs.test.ts` を書く: rect の項目の並びが `x,y,width,height,cornerRadius,rotation,strokeWidth,opacity`。`set` が元の図形を書き換えない。`width` の `set(n, 120)` → `{ width: 120 }`。`x` の `set` → `transform.x` だけが変わり `y` と `rotation` は残る。`clampToDef`。`hslToHex(hexToHsl('#2f6fde'))` が元の色から各チャンネル 2 以内。`hexToHsl('#ffffff')` → `l 100`。
- [ ] **Step 2:** 失敗を確かめ、`propDefs.ts` を実装して通す。
- [ ] **Step 3:** 部品を実装し、`App.tsx` に入れる。
- [ ] **Step 4:** `e2e/panels.spec.ts` を書く（単独キーとクリックとホイールだけ）。
  - ツールバーの `四角` を押す → 図形が 1 個。リストに `四角 1` の行が出る。
  - `[data-prop="width"]` の number の欄に `200` を打って `Enter` → `width 200`。`abc` → 値は変わらない。
  - `[data-prop="width"]` の上でホイールを上に 1 回 → `width` が `grid.size` 増える。
  - `Tab` を 2 回 → `focusArea 'props'`。`ArrowDown` を 2 回、`ArrowRight` を 1 回 → `width` が増える。`Tab` → `'canvas'`。
  - `Tab` を 1 回 → `'list'`。図形を 2 個にして `ArrowDown` → 選択が奥の図形に移る。
  - 塗りの見本 `#e5484d` を押す → `style.fill` が `#e5484d`。`なし` → `null`。
  - リストの `非表示` を押す → キャンバスから消え、`visible false`。
  - `ロック` を押す → キャンバスでその図形をクリックしても選ばれない。
  - グリッドの `間隔` を 40 にする → `grid.size 40`、図形の `width` は変わらない。`1` キー → 20。
  - スライダーの値を続けて 3 回変えて `z` を 1 回 → 3 回分がまとめて戻る。
- [ ] **Step 5:** `npm run typecheck && npm test && npm run e2e` が通る。
- [ ] **Step 6:** コミット `feat(ui): toolbar, shape list and property panels`。

---

### Task 9: 保存と書き出し（io/*, ExportDialog, WorksMenu, Banner）

**Files:**
- Create: `src/io/storage.ts`, `src/io/files.ts`, `src/io/png.ts`, `src/ui/ExportDialog.tsx`, `src/ui/WorksMenu.tsx`, `src/ui/Banner.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/ui/Toolbar.tsx`, `src/styles.css`
- Test: `tests/io/files.test.ts`, `e2e/io.spec.ts`

**Interfaces:**
- Consumes: `validateDocument`、`documentToSvg`、`exportBounds`、`loadDocument`、`store`
- Produces:

```ts
// src/io/storage.ts  (idb-keyval)
export interface WorkMeta { id: string; name: string; updatedAt: number }
export async function listWorks(): Promise<WorkMeta[]>;                 // 新しい順
export async function loadWork(id: string): Promise<Document | null>;   // 検査に通らなければ null
export async function saveWork(meta: WorkMeta, doc: Document): Promise<void>;
export async function deleteWork(id: string): Promise<void>;
export async function getCurrentWorkId(): Promise<string | null>;
export async function setCurrentWorkId(id: string): Promise<void>;
// キー: 'works'（WorkMeta[]）、'work:' + id（Document）、'current'（id）
// src/io/files.ts
export function serializeDocument(doc: Document): string;               // JSON.stringify(doc, null, 2)
export function parseDocument(text: string): ValidateResult;            // JSON として読めなければ { ok: false, errors: ['ファイルを JSON として読めません'] }
export function safeFileName(name: string): string;                     // \ / : * ? " < > | と前後の空白を除く。空なら 'shape-snap'
export function downloadBlob(blob: Blob, fileName: string): void;       // <a download> を作って click する
// src/io/png.ts
export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob>;
```

**決まり:**
- **起動:** `current` の作品を読む。無ければ `名前のない作品 1` を作る。読めたら `loadDocument` する。
- **自動保存:** `editorStore.subscribe` で `history.present` の参照が変わるたびに、400ms のデバウンスで `saveWork` する。失敗したら `Banner` に `自動保存に失敗しました。作業ファイルを書き出して控えを取ってください。` と `作業ファイルを書き出す` ボタンを出す。作業は止めない。次に成功したら帯を消す。
- **`WorksMenu`（ツールバー右の `作品` ボタンで開く）:** 作品の一覧（名前、更新日時）。`新しい作品`、選んだ作品を `開く`、`名前を変える`、`消す`（`この作品を消します。元に戻せません。` と `消す`・`やめる` のボタンを、同じ枠の中に出す。`window.confirm` は使わない）、`作業ファイルを読み込む`（`<input type="file" accept=".json,application/json">`）。読み込みに失敗したら、エラーの一覧を出し、今の作品は変えない。成功したら新しい作品として足して開く。
- **`ExportDialog`（`書き出し` ボタンで開く）:** 形式（`SVG`・`PNG`・`作業ファイル`）、範囲（`図形がちょうど収まる枠`・`画面に見えている範囲` ではなく、段階 1 は `図形がちょうど収まる枠` だけ）、余白（`SliderField`、`0..200`、刻み `grid.size / 2`）、背景（`透明`・`白`・色コード）、PNG の大きさ（長い辺を `512`・`1024`・`2048`・数値入力）。`書き出す` で `downloadBlob`。ファイル名は `safeFileName(作品の名前) + 拡張子`。図形が 1 個も無ければ、`書き出す` を押せなくして `図形がありません` と出す。
- ダイアログとメニューは `Esc` と `閉じる` ボタンで閉じる。開いている間、キャンバスの単独キーは働かせない（`keyboard.ts` に「`document.querySelector('[data-modal]')` があれば `Escape` 以外を無視する」を足す。`Escape` は開いているものを閉じる）。ボタンはすべて高さ 40px 以上。
- `svgToPngBlob`: SVG を `Blob`（`image/svg+xml`）→ `URL.createObjectURL` → `Image` → `canvas.drawImage` → `canvas.toBlob('image/png')`。終わったら `revokeObjectURL`。読み込みに失敗したら `Error('PNG を作れませんでした')` を投げ、ダイアログの中にその文を出す。
- テスト用の窓口に `getSvg: (opts) => documentToSvg(現在の doc, opts)` を足す（DEV のときだけ）。

- [ ] **Step 1:** `tests/io/files.test.ts` を書く: `parseDocument(serializeDocument(doc))` が `ok` で中身が同じ。壊れた JSON → `ok: false`。`{"version":1}` → `ok: false`。`safeFileName('a/b:c ')` → `'abc'`、`safeFileName('  ')` → `'shape-snap'`。
- [ ] **Step 2:** 失敗を確かめ、`files.ts` を実装して通す。
- [ ] **Step 3:** 残りを実装する。
- [ ] **Step 4:** `e2e/io.spec.ts` を書く。
  - 図形を置いて 1 秒待ち、ページを開き直す → 図形が残っている。
  - `書き出し` → `SVG` → `書き出す` で、ダウンロードされたファイル（`page.waitForEvent('download')`）の中身に `<svg` と `<rect` があり、`viewBox` の幅と高さが「図形 + 余白 × 2」。
  - `PNG` を書き出す → ダウンロードの先頭 8 バイトが PNG の印。
  - `作業ファイル` を書き出し、`新しい作品` を作ってから、そのファイルを読み込む → 図形の数と位置が同じ。
  - 壊れたファイル（`{"version": 9}`）を読み込む → エラーの文が出て、今の作品の図形は変わらない。
  - `作品` で新しい作品を作ると空になり、元の作品を開くと図形が戻る。
  - 図形が無いとき、`書き出す` が押せない。
- [ ] **Step 5:** `npm run typecheck && npm test && npm run e2e` が通る。
- [ ] **Step 6:** コミット `feat(io): autosave, works menu and export`。

---

### Task 10: 約束の検査と仕上げ

**Files:**
- Create: `e2e/promises.spec.ts`, `tests/promises.test.ts`, `README.md`
- Modify: 見つかった不具合のあるファイル

- [ ] **Step 1:** `tests/promises.test.ts`: `src/` の全ファイルを読み、次の文字列が無いことを確かめる: `onMouseDown`、`onMouseUp`、`onDoubleClick`、`onDrag`、`mousedown`、`mouseup`、`dblclick`、`pointerdown`、`pointerup`、`shiftKey`、`draggable`。（`ctrlKey` `altKey` `metaKey` は「無視する」判定のために `keyboard.ts` と、キーを自分で受ける部品にだけ出てよい。）`src/core/` の全ファイルに `react`、`window`、`document.` が無いことも確かめる。
- [ ] **Step 2:** `e2e/promises.spec.ts`: 一本の通しの筋書きを、`mouse.move` `mouse.click` `mouse.wheel` と単独キーだけで行う。四角・円・三角形を置く → それぞれ違う点へ動かす → 四角の右の辺をつまみで広げる → 円の上の辺を矢印で縮めて楕円にする → 三角形の辺を動かして `自由な形` の案内が出る → 円の色を変える → 重なった 2 個を同じ点のクリックで切り替える → 複数選択で 2 個を選んで矢印で一緒に動かす → 複製 → 一つ消す → 取り消す → SVG を書き出し、要素の数が見えている図形の数と同じ。
- [ ] **Step 3:** 画面を実際に開いて確かめる（`npm run dev`）: 明るい表示と暗い表示の両方で文字が読める。画面の幅 1280px と 1024px で崩れない。ボタンと行の高さが 40px 以上（e2e に `boundingBox().height >= 40` の検査を足す）。ページ全体がスクロールしない。
- [ ] **Step 4:** `README.md`（日本語）: 何のツールか、起動の仕方（`npm install`、`npm run dev`）、キーの一覧、テストの仕方。
- [ ] **Step 5:** `npm run typecheck && npm test && npm run build && npm run e2e` がすべて通る。
- [ ] **Step 6:** コミット `test: accessibility promises and stage 1 walkthrough`。

---

## 段階 1 に入れないもの（設計書にあり、あとの段階で作る）

- 線、曲線、頂点のつまみ、円を点に変える（段階 2）。`PathNode` の型は入っているが、段階 1 で作られるのは「多角形の辺を動かしてできた、閉じた直線の形」だけ。
- グループ、連続配置、対称コピー（段階 3）。
- 足す・抜くの切り替えと結合（段階 4）。`role` は型にだけある。
- キーの割り当てを変える画面、デスクトップアプリ化（段階 5）。
