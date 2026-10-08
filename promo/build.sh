#!/bin/bash
# 録画済みのシーン（promo/out）から、完成版のデモ動画と README 用のアニメーション WebP を作る。
#   bash promo/build.sh        （先に node promo/record.mjs all all を実行しておく）
set -e
cd "$(dirname "$0")/.."
OUT=promo/out; MEDIA=docs/media; TMP=promo/.tmp/build
mkdir -p $MEDIA $TMP
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

for L in en ja; do
  # --- 完成版デモ: タイトル → 3シーン → タイトル を、0.5秒のクロスフェードでつなぐ ---
  parts=(title one all folder title)
  inputs=(); for p in "${parts[@]}"; do inputs+=(-i $OUT/$p-$L.mp4); done
  filter=""; prev="[0:v]"; offset=0; fade=0.5
  for i in 1 2 3 4; do
    d=$(dur $OUT/${parts[$((i-1))]}-$L.mp4)
    offset=$(python3 -c "print(round($offset + $d - $fade, 3))")
    filter+="${prev}[$i:v]xfade=transition=fade:duration=$fade:offset=$offset[v$i];"
    prev="[v$i]"
  done
  ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "${filter%;}" -map "$prev" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart $MEDIA/demo-$L.mp4
  echo "demo-$L.mp4 $(du -h $MEDIA/demo-$L.mp4 | cut -f1)"

  # --- ポスター（動画の最初の画面に近い、タイトル）---
  ffmpeg -y -loglevel error -ss 1.4 -i $OUT/title-$L.mp4 -frames:v 1 $MEDIA/poster-$L.png

  # --- README 用のクリップ: 12fps・幅 960px のアニメーション WebP ---
  for n in one all folder; do
    rm -rf $TMP/$n-$L && mkdir -p $TMP/$n-$L
    ffmpeg -y -loglevel error -i $OUT/$n-$L.mp4 -vf "fps=12,scale=960:-1:flags=lanczos" $TMP/$n-$L/f%04d.png
    img2webp -loop 0 -lossy -q ${Q:-82} -m 6 -d 83 $TMP/$n-$L/f*.png -o $MEDIA/clip-$n-$L.webp 2>&1 | tail -1
    echo "clip-$n-$L.webp $(du -h $MEDIA/clip-$n-$L.webp | cut -f1)"
  done

  # --- ソーシャルプレビュー（1280x640）---
  ffmpeg -y -loglevel error -ss 1.4 -i $OUT/title-$L.mp4 -frames:v 1 -vf "crop=1920:960:0:60,scale=1280:640:flags=lanczos" $MEDIA/social-preview-$L.png
done
