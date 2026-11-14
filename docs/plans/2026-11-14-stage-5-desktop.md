# 段階 5（キーの割り当て変更とデスクトップアプリ化）Implementation Plan

> **For agentic workers:** 進め方は `AGENTS.md`。Global Constraints は `docs/plans/2026-11-13-stage-1-foundation.md` の同名の節をそのまま守る（ドラッグ・同時押し・ダブルクリック・ホバー専用の操作なし、押せる部品は 40px 以上、画面の文字は日本語）。これまでの決まりは `docs/design.html` の 16〜19 章にある。

**Goal:** (A) 押しにくいキーを、使う人が自分で別の単独キーに変えられるようにする。(B) 同じアプリを、ブラウザなしで起動できる Windows のデスクトップアプリにする。ブラウザ版はそのまま使える。

**Architecture:** キーの割り当ては「初期の表 + 使う人の変更」で持つ。変更は `localStorage` に保存し、小さなストアから画面の全部（道具の帯、画面下の案内、設定のボタンの札）が読む。デスクトップアプリは Tauri v2 で包む。アプリの中身は今のビルド結果（`dist/`）をそのまま使い、違うのはファイルの保存だけ（保存先を選ぶ窓を出して書き込む）。

**確かめてある環境（2026-11-14）:** `cargo 1.99.1`（`stable-x86_64-pc-windows-msvc`）、Visual Studio 2022 のビルドツール、WebView2 が入っている。Node は v26、npm は 12。

---

## Task A: キーの割り当てを変える（input + ui + e2e）

**Files:** Create `src/input/keymapStore.ts`、`src/ui/KeysDialog.tsx`、`tests/input/keymapStore.test.ts`、`e2e/keys.spec.ts`。Modify `src/input/{keymap,keyboard}.ts`、`src/ui/{Toolbar,KeyHints,PropsPanel,GridPanel,App}.tsx`（キーの札を出している所の全部）、`src/styles.css`、`README.md`、既存のテスト。

### A-1 決まり

- 変えられるのは、`KEYMAP` にある action のうち、今のキーが「文字 1 個」のもの（英字、数字、`, . / - ; ' [ ] \ =` と `` ` ``）。
- **変えられないキー（固定）:** `Escape`、`Enter`、`Tab`、矢印 4 つ、`Delete`、`Backspace`、`Space`。これらが割り当てられている action は、一覧に出すが `固定` と表示して変えられない。これらのキーを、ほかの action に割り当てることもできない。
- 割り当てられるキーは、上の「文字 1 個」だけ。英字は小文字にそろえる。それ以外のキー（`F1`、`Home` など）を押したら、`このキーは使えません` と出して割り当てない。
- **重なったとき:** 新しいキーを別の action が使っていたら、入れ替える（相手の action に、こちらの元のキーが移る）。どの action も、キーが無い状態にならない。入れ替えたことを一言出す（`「円」と入れ替えました`）。
- 保存: `localStorage` の `shape-snap:keys` に、`{ [ActionId]: key }`（初期と違うものだけ）を JSON で持つ。読めない・知らない action・使えないキー・キーの重複がある保存内容は、その項目だけ捨てる（全部が壊れていたら初期に戻す）。
- `localStorage` が使えないとき（例外）は、変更をその場だけ有効にし、`キーの設定を保存できませんでした` と出す。

### A-2 Interfaces

```ts
// src/input/keymap.ts（純粋）
export const DEFAULT_KEYMAP: KeyBinding[];                 // 今の KEYMAP の中身。KEYMAP という名前は別名として残す
export const FIXED_KEYS: string[];                         // 変えられないキー
export function isAssignableKey(key: string): boolean;     // 小文字にそろえた後の「文字 1 個」か
export function normalizeKey(key: string): string;         // 英字は小文字に
export type KeyOverrides = Partial<Record<ActionId, string>>;
export function applyOverrides(defaults: KeyBinding[], overrides: KeyOverrides): KeyBinding[];
export function sanitizeOverrides(defaults: KeyBinding[], raw: unknown): KeyOverrides;
export interface RebindResult { overrides: KeyOverrides; swappedWith: ActionId | null; error: string | null }
export function rebind(defaults: KeyBinding[], overrides: KeyOverrides, action: ActionId, key: string): RebindResult;
export function findBindingIn(map: KeyBinding[], key: string): KeyBinding | undefined;
export function keyFor(map: KeyBinding[], action: ActionId): string;   // その action の（最初の）キー
// hintsFor は、キーの文字を直に書かず、今の表から作る
export function hintsFor(s: EditorState, map?: KeyBinding[]): Hint[];  // map を省いたら DEFAULT_KEYMAP

// src/input/keymapStore.ts（localStorage を読む。zustand/vanilla）
export const keymapStore: StoreApi<{ overrides: KeyOverrides; map: KeyBinding[]; saveError: boolean }>;
export function useKeymap(): KeyBinding[];
export function loadKeymap(): void;                        // 起動時に 1 回
export function rebindKey(action: ActionId, key: string): RebindResult;
export function resetKey(action: ActionId): void;
export function resetAllKeys(): void;
```

- 1 つの action に複数のキーがある場合（`delete` は `Delete` と `Backspace`）は、今のまま扱う（どちらも固定）。
- `keyboard.ts` は、`findBinding` の代わりに今の表（`keymapStore.getState().map`）から引く。
- 道具の帯・画面下の案内・設定パネルと各パネルのボタンに出しているキーの札は、全部、今の表から作る（`keyLabel(keyFor(map, action))`）。札を直に文字で書いている所を無くす。`hintsFor` の中の `R: 四角` のような文も、今の表のキーに変わること。

### A-3 画面（`KeysDialog`）

- 道具の帯の右（`作品` の左）に `キー` ボタン。押すと `キーの設定` のダイアログ（`data-modal`、`Esc` と `閉じる` で閉じる。既存のダイアログと同じ作り）。
- 一覧は group ごと（置く・選ぶ・動かす・編集・表示・見る）。各行: action のラベル、今のキーのボタン（`data-key-action={ActionId}`）、初期と違うときだけ `初めに戻す` ボタン。固定の行は、キーの札と `固定` の文字だけ。
- キーのボタンを押すと、その行が「待ち」になり、`新しいキーを押してください（Esc でやめる）` と出る。次に押したキーで `rebindKey` を呼ぶ。使えないキーなら、その行に文を出して待ちを続ける。`Esc` は待ちをやめる（ダイアログは閉じない）。待ちの間に別の行のボタンを押したら、待ちがその行に移る。
- 入れ替えが起きたら、行の下に `「円」と入れ替えました` と出す。
- 一番下に `全部を初めに戻す`（押すと同じ枠の中に `全部のキーを初めに戻します` と `戻す` `やめる` を出す。`window.confirm` は使わない）。
- 全部のボタンは高さ 40px 以上。ダイアログは中でスクロールする（ページ全体はスクロールしない）。

### A のテスト

単体（`tests/input/keymapStore.test.ts` と既存の keymap のテスト）:
- `applyOverrides(DEFAULT_KEYMAP, { 'place-rect': ';' })` → `place-rect` のキーが `;`、ほかは変わらない。
- `rebind(…, {}, 'place-rect', ';')` → `overrides { 'place-rect': ';' }`、`swappedWith null`。
- `rebind(…, {}, 'place-rect', 'c')`（`c` は円）→ `place-rect: 'c'`、`place-ellipse: 'r'`、`swappedWith 'place-ellipse'`。
- 入れ替えで初期に戻った項目は `overrides` から消える（`rebind` をもう一度逆に呼ぶと `overrides` が空）。
- `rebind(…, 'place-rect', 'Enter')` と `'F1'` → `error` が入り、`overrides` は変わらない。固定の action（`escape`）を変えようとする → `error`。
- `rebind(…, 'place-rect', 'R')` → `r` として扱う（初期と同じなので `overrides` は空）。
- `sanitizeOverrides`: `{ 'place-rect': ';', 'nope': 'x', 'place-ellipse': 'Enter' }` → `{ 'place-rect': ';' }`。文字列や `null` → `{}`。2 つの action が同じキー → 両方捨てる。
- どの `rebind` の後も、`applyOverrides` の結果にキーの重複が無い。
- `hintsFor(s, map)`: `place-rect` を `;` にした表で、何も選んでいないときの案内に `;` が入り、`R` が入らない。

e2e（`e2e/keys.spec.ts`。単独キーとクリックだけ）:
- `キー` → `[data-key-action="place-rect"]` を押す → `;` を押す → ダイアログを閉じる → `;` で四角が置ける、`r` では置けない。道具の帯の `四角` のボタンの札が `;` になっている。画面下の案内にも `;` が出る。
- ページを開き直しても `;` のまま。
- `place-rect` に `c` を割り当てる → `入れ替えました` が出て、`c` で四角、`r` で円が置ける。
- 待ちの間に `F1` → `このキーは使えません`。`Escape` → 待ちが終わり、ダイアログは開いたまま。
- `初めに戻す` → `r` に戻る。`全部を初めに戻す` → `戻す` → 全部が初期に戻る。
- 固定の行（`escape` など）にキーのボタンが無く、`固定` と出ている。
- ダイアログの全部のボタンが 40px 以上。幅 1280px で `header.toolbar` の高さが 120px 以下。
- 既存の e2e は通す。`e2e/promises.spec.ts` の通しの筋書きに「キーを 1 つ変えて、そのキーで操作する」を足す（最後に初期へ戻す）。
- スクリーンショットを `.superpowers/sdd/2026-11-14-stage-5-desktop/screens/keys.png`（ダイアログを開いた状態、1280×800）に保存。

README にキーの設定の説明を足す。

コミット: `feat(input): user-configurable single-key bindings`

---

## Task B: デスクトップアプリ（Tauri v2）

**Files:** Create `src-tauri/**`（Tauri の雛形）、`src/io/platform.ts`、`scripts/make-icon.mjs`、`docs/desktop.md`。Modify `package.json`、`.gitignore`、`src/io/files.ts`（と保存を呼んでいる所）、`vite.config.ts`（必要なら）、`README.md`、テスト。

### B-1 依存（足してよいもの）

- dev: `@tauri-apps/cli`
- 実行時: `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
- Rust 側: `tauri`、`tauri-build`、`tauri-plugin-dialog`、`tauri-plugin-fs`、`serde`、`serde_json`（Tauri の雛形が入れるもの）

Tauri は v2 の、入れた時点の安定版を使う。雛形は `npx tauri init --ci`（対話なし）で作ってよい。設定の書き方に迷ったら、入った版の公式の説明（`npx tauri --help`、`node_modules/@tauri-apps/cli` の README、https://tauri.app の v2 の説明）で確かめる。記憶だけで書かない。

### B-2 決まり

- **アプリの設定（`src-tauri/tauri.conf.json`）:** `productName: "Shape Snap"`、`identifier: "dev.shapesnap.app"`、`version` は `package.json` と同じ（`0.1.0` にそろえる）。窓の題 `Shape Snap`、初期の大きさ `1280×800`、最小 `1024×700`。`beforeDevCommand: "npm run dev"`、`devUrl: "http://localhost:5173"`、`beforeBuildCommand: "npm run build"`、`frontendDist: "../dist"`。
- **権限は最小に:** 許すのは、保存先を選ぶ窓（dialog の save）と、選んだ場所への書き込み（fs の書き込み）だけ。ファイルを読む・消す・シェルを呼ぶ・ネットにつなぐ権限は付けない。CSP を設定する（`default-src 'self'`。画像の `data:` `blob:` と、アプリの中のスタイルに要る分だけ足す）。
- **保存の分かれ道（`src/io/platform.ts`）:**

```ts
export function isDesktop(): boolean;      // Tauri の中で動いているか（'__TAURI_INTERNALS__' in window）
export async function saveFile(blob: Blob, fileName: string): Promise<'saved' | 'cancelled'>;
```

  - ブラウザ: 今までどおり `downloadBlob`（`'saved'` を返す）。
  - デスクトップ: 保存先を選ぶ窓を出し（初期のファイル名は `fileName`、拡張子の絞り込み付き）、選ばれた場所に書き込む。やめたら `'cancelled'`。書き込みに失敗したら例外を投げ、呼んだ側（書き出しのダイアログ、作業ファイルの書き出し、自動保存に失敗したときの帯）が `保存できませんでした` と出す。
  - Tauri の部品は `await import(...)` で読み、ブラウザ版のビルドに混ざらないようにする（ブラウザ版の `npm run build` と e2e が今までどおり通ること）。
  - `downloadBlob` を直に呼んでいる所は、全部 `saveFile` に変える。
- 作業ファイルの読み込みは、今の `<input type="file">` のまま（デスクトップでも動く）。自動保存（IndexedDB）もそのまま。
- **アイコン:** `scripts/make-icon.mjs` が、Playwright（入っている chromium）で 1024×1024 の PNG を作る（紙の色の地に、暗い四角と、その上に重なるアクセント色の円、の単純な絵。文字は入れない）。それを `npx tauri icon` に渡して `src-tauri/icons/` を作る。作ったアイコンはコミットする。
- **npm scripts:** `"app:dev": "tauri dev"`、`"app:build": "tauri build"`、`"icon": "node scripts/make-icon.mjs"`。
- `.gitignore` に `src-tauri/target/` と `src-tauri/gen/` を足す。`src-tauri/Cargo.lock` はコミットする。
- `tests/promises.test.ts` と `tsc` が `src-tauri/target` を見に行かないこと。

### B-3 確かめること

- `npm run typecheck`、`npm test`、`npm run build`、`npm run e2e`（ブラウザ版）が今までどおり通る。
- `tests/io/platform.test.ts`: `isDesktop()` は、`window` に印が無ければ偽（Vitest の node 環境では `globalThis` を使って確かめる）。
- `npm run app:build` が通り、`src-tauri/target/release/` に実行ファイル、`src-tauri/target/release/bundle/` にインストーラーができる。**初回は Rust の部品の取得とコンパイルで 10 分以上かかることがある。途中で止めず、裏で走らせて終わるまで待つ。**
- できた実行ファイルを起動し、10 秒後もプロセスが生きていること（すぐ落ちないこと）を確かめてから、止める。画面の中身は自動では確かめられないので、「起動して落ちないことだけ確かめた」と報告に書く。
- ビルドに失敗したら、エラーの文を読んで原因を直す（道具が足りないなら、何が足りないかを報告する。勝手に大きな道具を入れない）。2 回違う直し方を試しても通らなければ、`BLOCKED` で止めて、エラーの文と試したことを報告する。

### B-4 説明（`docs/desktop.md` と README）

- 起動の仕方（開発: `npm run app:dev`、ビルド: `npm run app:build`）、できるファイルの場所、インストーラーの使い方。
- ブラウザ版との違い（保存のとき、保存先を選ぶ窓が出る）。作品の自動保存は、ブラウザ版とデスクトップ版で別々に持つこと（一方で作った作品は、作業ファイルを書き出して、もう一方で読み込めば移せる）。
- 署名していないので、Windows が「不明な発行元」と出すことがあること。

コミット: `feat(desktop): tauri v2 app with save dialogs`
