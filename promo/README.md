# promo

README・サイト用の動画とスクリーンショットを作るための仕組み。本物の拡張機能のUI（`src/content/` のスクリプト）を、Moodle風のページの上で動かし、ヘッドレスのChromeで画面を録画する。

```bash
node promo/record.mjs all all     # 動画シーン（title / one / all / folder）を英語・日本語で録画 → promo/out/
node promo/record.mjs shots all   # 設定・ポップアップ・案内のスクリーンショット → docs/media/shot-*.png
bash promo/build.sh               # デモ動画・WebPクリップ・ポスター・ソーシャルプレビュー → docs/media/
```

必要なもの: macOS の Google Chrome、`ffmpeg`、`img2webp`（libwebp）、Node.js 22 以上。

| ファイル | 役割 |
|---|---|
| `stage.html` | 録画の舞台（ブラウザ枠、Finder風の窓、字幕、カーソル） |
| `moodle.html` | Moodle風の科目ページ。拡張機能のAPIを模擬して、本物のスクリプトを読み込む |
| `ext.html` / `shots.html` | 設定・ポップアップ・案内を、APIを模擬した環境で表示してスクリーンショットにする |
| `record.mjs` | Chromeを操作して、マウスの動きを再現しながら収録する |
| `build.sh` | 収録したシーンをつないで、配布用のファイルにする |
