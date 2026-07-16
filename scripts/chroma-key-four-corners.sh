#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "用法：$0 INPUT.png OUTPUT.png" >&2
  exit 2
fi

input=$1
output=$2
ffmpeg_bin=${FFMPEG_BIN:-ffmpeg}
ffprobe_bin=${FFPROBE_BIN:-ffprobe}

read -r width height < <(
  "$ffprobe_bin" -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=p=0:s=' ' "$input"
)

if (( width < 2 || height < 2 )); then
  echo "圖片尺寸異常：${width}x${height}" >&2
  exit 1
fi

sample_corner() {
  local x=$1 y=$2
  "$ffmpeg_bin" -v error -i "$input" \
    -vf "crop=1:1:${x}:${y},format=rgb24" -frames:v 1 -f rawvideo - \
    | od -An -tx1 -N3 | tr -d ' \n'
}

colors=(
  "$(sample_corner 0 0)"
  "$(sample_corner $((width - 1)) 0)"
  "$(sample_corner 0 $((height - 1)))"
  "$(sample_corner $((width - 1)) $((height - 1)))"
)

filters="format=rgba"
for color in "${colors[@]}"; do
  [[ $color =~ ^[0-9a-fA-F]{6}$ ]] || {
    echo "四角取色失敗：$color" >&2
    exit 1
  }
  filters+=",colorkey=0x${color}:0.18:0.06"
done

mkdir -p "$(dirname "$output")"
"$ffmpeg_bin" -y -v error -i "$input" -vf "$filters" \
  -frames:v 1 -c:v png -compression_level 0 -pix_fmt rgba "$output"

size=$(stat -f%z "$output")
if (( size <= 1048576 )); then
  echo "去背檔小於或等於 1MB：$output ($size bytes)" >&2
  exit 1
fi

# 驗證至少含透明像素，且可見像素中沒有高飽和洋紅殘留。
"$ffmpeg_bin" -v error -i "$output" -f rawvideo -pix_fmt rgba - \
  | perl -e '
      use strict; use warnings;
      local $/; my $data = <STDIN> // q{};
      my ($transparent, $magenta) = (0, 0);
      for (my $i = 0; $i + 3 < length($data); $i += 4) {
        my ($r, $g, $b, $a) = unpack("C4", substr($data, $i, 4));
        $transparent++ if $a < 240;
        $magenta++ if $a >= 32 && $r >= 180 && $b >= 180 && $g <= 120;
      }
      print "transparent=$transparent magenta=$magenta\n";
      exit 1 if $transparent == 0 || $magenta > 0;
    '

printf 'OK %s %s bytes corners=%s\n' "$output" "$size" "${colors[*]}"
