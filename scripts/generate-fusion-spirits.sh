#!/usr/bin/env bash
# 星靈融合模組：7 隻英雄星靈立繪（沿用吉祥物 magenta 去背產線，程式以 art id 對應檔名）
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
codex_home=${CODEX_HOME:-$root/.codex-image-runtime}
generated_dir="$codex_home/generated_images"
out_dir="$root/assets/spirits"
raw_dir="$out_dir/raw"
timeout_seconds=${IMAGE_TIMEOUT_SECONDS:-240}
model=${CODEX_IMAGE_MODEL:-gpt-5.5}

mkdir -p "$raw_dir" "$codex_home"
if [[ ! -e "$codex_home/auth.json" ]]; then
  ln -s /Users/naichengchen/.codex/auth.json "$codex_home/auth.json"
fi

STYLE="storybook watercolor magical creature illustration, warm candlelight color palette, soft colored-pencil texture, child-friendly cute chibi mascot proportions, single small floating spirit creature centered and filling most of the frame, clean silhouette, no text or letters or numbers anywhere, solid pure magenta #FF00FF background filling the entire canvas edge to edge with all four corners pure magenta for chroma-key removal, the creature itself must contain absolutely no magenta pink or fuchsia tones, portrait 1024x1536"

# id|描述——id 必須對應 fusion.js HERO_SPIRITS 的 art 欄位
items=(
  "spirit-2|a tiny round twin-flame elemental spirit glowing soft teal, two symmetrical little flames mirrored perfectly, calm balanced serene face, the essence of evenness and pairing"
  "spirit-3|a small three-pointed origami-triangle sprite in warm amber, three tiny wings arranged in a triangle, curious bright eyes, playful and stable"
  "spirit-5|a little five-pointed star fairy in golden yellow, five gentle rays like soft petals, cheerful sparkling eyes, radiant and lucky"
  "spirit-7|a mystical seven-stringed lyre spirit in deep violet, faint musical note glyphs floating (no readable text), dreamy oracle-like calm expression, sacred and rare"
  "spirit-6|a warm harmonious hearth-flame guardian spirit in rich orange-gold, perfectly balanced glowing aura, gentle nurturing smile, radiating a sense of completeness and warmth, the first perfect being"
  "spirit-28|a serene silver-blue moon spirit with a soft crescent halo, tranquil closed-eye smile, gentle nightlight glow, majestic and legendary, the great perfect being"
  "spirit-12|a plump cheerful abundance spirit in harvest gold and green, surrounded by tiny floating fruits and grains, generous joyful laughing face, bountiful and rich in blessings"
)

for entry in "${items[@]}"; do
  id="${entry%%|*}"
  desc="${entry#*|}"
  final="$out_dir/$id.png"
  raw="$raw_dir/$id-magenta.png"
  keyed="$raw_dir/$id-keyed.png"

  if [[ -f $raw ]] && "$root/scripts/chroma-key-four-corners.sh" "$raw" "$keyed" >/dev/null 2>&1; then
    echo "SKIP ${id}（raw 已存在且可去背）"
  else
    marker="$root/.spirit-marker-$id"
    prompt_file="$root/.spirit-prompt-$id.txt"
    touch "$marker"
    cat >"$prompt_file" <<EOF
Please generate one image with the built-in image generation tool.

Subject: $desc

Style requirements: $STYLE

不要嘗試寫入 /tmp。圖片生成後保留在 \$CODEX_HOME/generated_images。完成前必須用 shell 找到本次新生成的 PNG，實際驗證檔案已落盤且檔案大小 > 500KB；若未落盤，必須重生，不能只用文字宣稱完成。
EOF
    echo "GENERATE ${id}"
    set +e
    perl -e 'alarm shift; exec @ARGV' "$timeout_seconds" \
      env CODEX_HOME="$codex_home" codex exec --ignore-user-config \
      -c 'features.code_mode_host=false' \
      -m "$model" -s workspace-write -C "$root" - \
      <"$prompt_file" >"$root/.spirit-$id.log" 2>&1
    status=$?
    set -e
    if (( status != 0 )); then
      echo "codex exec 失敗或逾時：${id}（status=${status}），檢查是否已落盤" >&2
    fi
    source_png=$(find "$generated_dir" -type f -name '*.png' -newer "$marker" -size +500000c \
      -print 2>/dev/null | while IFS= read -r path; do
        printf '%s\t%s\n' "$(stat -f%m "$path")" "$path"
      done | sort -nr | head -1 | cut -f2-)
    if [[ -z $source_png ]]; then
      echo "找不到本次新生成的 PNG：${id}" >&2
      tail -20 "$root/.spirit-$id.log" >&2
      continue
    fi
    cp "$source_png" "$raw"
    "$root/scripts/chroma-key-four-corners.sh" "$raw" "$keyed"
    /bin/rm -f "$marker" "$prompt_file"
  fi

  sips -Z 512 "$keyed" --out "$final" >/dev/null
  size=$(stat -f%z "$final")
  echo "OK ${id} ${size} bytes"
done

echo "全部星靈立繪處理完成。"
