# デスクトップアプリ（Windows）

ブラウザ版と同じ画面を、Tauri v2 で包んだ Windows のアプリです。

## 必要なもの

- Node.js と npm（`npm install` 済み）
- Rust（stable、MSVC 版）と Visual Studio Build Tools（C++ のビルド環境）
- WebView2 ランタイム（Windows 11 には最初から入っています）

## 起動とビルド

| 目的 | コマンド |
|---|---|
| 開発（窓が開き、変更がすぐ映る） | `npm run app:dev` |
| 手元で使うビルド | `npm run app:build` |
| Rust の部品の著作権表示だけ作る | `npm run licenses` |
| アイコンの作り直し | `npm run icon` |

初回は Rust の部品の取得とコンパイルで 10 分以上かかります。2 回目からは差分だけなので早くなります。

## できるファイル

- 実行ファイル: `src-tauri/target/release/app.exe`
- インストーラー: `src-tauri/target/release/bundle/nsis/Shape Snap_0.1.0_x64-setup.exe`

インストーラーをエクスプローラーで選んでクリックして開くと、案内に沿って入ります。
入れずに試すだけなら、`app.exe` を直接開いてもかまいません。

## 人に配るとき

**手元で作ったインストーラーを人に渡さないこと。** Rust の実行ファイルには、作った PC のパス（ユーザー名を含む）が入ります。
配るものは GitHub の上で作ります。

1. `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` の版を上げて `main` に入れる（同じ版の下書きやリリースがあると失敗する）。
2. `gh workflow run release.yml --ref main` を実行する（GitHub の Actions の画面から「Run workflow」を押してもよい）。テスト、ビルド、インストール、起動の確認が通ると、下書きのリリースができる。
3. 下書きの中身を確かめてから、使う人の指示で公開する。

入れた場所の `licenses` フォルダに、`LICENSE` と、組み込んだ部品（JavaScript と Rust）の著作権表示が入ります。
Rust の表示は `scripts/rust-licenses.mjs` が集めます。表示の無い部品が増えるとビルドが止まるので、元のリポジトリの文を `scripts/license-texts/` に足します。

## ブラウザ版との違い

- 書き出し（作業ファイル・SVG・PNG）と、自動保存に失敗したときの「作業ファイルを書き出す」で、保存先を選ぶ窓が出ます。ファイル名の初期値は作品の名前です。窓を閉じると何も保存されません。
- 書き込みに失敗すると `保存できませんでした` と出ます。
- 作品の自動保存は、ブラウザ版とデスクトップ版で別々に持ちます。一方で作った作品をもう一方で使うには、作業ファイルを書き出して、もう一方で読み込みます。
- 作業ファイルの読み込みは、ブラウザ版と同じ「ファイルを選ぶ」ボタンです。

## 権限

アプリに許しているのは、保存先を選ぶ窓（`dialog:allow-save`）と、選ばれた場所への書き込み（`fs:allow-write-file`）だけです。
ファイルを読む・消す、シェルを呼ぶ、ネットにつなぐ権限は付けていません（`src-tauri/capabilities/default.json`）。

## 署名について

インストーラーとアプリには署名をしていません。そのため Windows が「不明な発行元」「PC が保護されました」と出すことがあります。
自分で作ったものなら、「詳細情報」を選んでから「実行」で進めます。
