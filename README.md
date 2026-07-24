# 民法ⅠA 事例問題トレーナー

全131問を収録した、HTML・CSS・JavaScriptのみで動く学習Webアプリです。

## v2.1 独立出題対応

ランダム表示時に前のケースを参照しないと意味が通じなかった設問を修正し、各問だけを読んでも事実関係が分かるようにしました。問題文の参照表現を補っただけで、条文・論点・模範解答・六法の引き方・暗記事項は維持しています。

## 公開するファイル

GitHubの `law-quiz` リポジトリ直下へ、以下をアップロードしてください。

- `index.html`
- `style.css`
- `questions.js`
- `script.js`
- `manifest.webmanifest`
- `service-worker.js`
- `app-icon.svg`
- `app-icon-192.png`
- `app-icon-512.png`

`backup-before-upgrade` は公開不要です。

## ローカル確認

`index.html` をダブルクリックすると基本機能を確認できます。PWA・オフライン機能は `file://` では動かず、GitHub Pages公開後に有効になります。

## GitHub Pages

1. リポジトリで **Add file → Upload files**
2. 上記7ファイルをアップロードし **Commit changes**
3. **Settings → Pages**
4. Sourceを **Deploy from a branch**
5. Branchを **main**、Folderを **/(root)** に設定

## 保存データ

評価・メモ・答案・模試履歴はブラウザの `localStorage` に保存され、外部送信されません。PCとスマホは自動同期されないため、設定画面のJSONバックアップを利用してください。
