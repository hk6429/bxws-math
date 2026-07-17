#!/usr/bin/env bash
# 魔法學院改版：吉祥物改繪為魔法導師（覆寫原檔名，程式零改動）
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
codex_home=${CODEX_HOME:-$root/.codex-image-runtime}
generated_dir="$codex_home/generated_images"
mascot_dir="$root/assets/mascot"
raw_dir="$mascot_dir/raw"
timeout_seconds=${IMAGE_TIMEOUT_SECONDS:-240}
model=${CODEX_IMAGE_MODEL:-gpt-5.5}

mkdir -p "$raw_dir" "$codex_home"
if [[ ! -e "$codex_home/auth.json" ]]; then
  ln -s /Users/naichengchen/.codex/auth.json "$codex_home/auth.json"
fi

STYLE="storybook watercolor wizard illustration, warm candlelight color palette, soft colored-pencil texture, child-friendly cute chibi proportions (large head, small body), single full-body character centered and filling most of the frame vertically, clean silhouette, no text or letters or numbers anywhere, solid pure magenta #FF00FF background filling the entire canvas edge to edge with all four corners pure magenta for chroma-key removal, the character itself must contain absolutely no magenta pink or fuchsia tones, portrait 1024x1536"

ALDRIC="elderly wizard mentor: long flowing white beard down to his chest, deep burgundy velvet soft pointed hat drooping to one side, warm brown floor-length robe with dark-gold geometric trim, brass compass and a rolled parchment hanging from his belt, oak staff topped with a glowing golden octahedron crystal"
CORIN="young prodigy apprentice wizard: curly brown hair, midnight-blue short apprentice robe with silver star-pattern lining, white high-collar shirt, small round brass academy badge pinned on chest, short wooden wand topped with one small pale-gold star of light"

items=(
  "davinci-idle|$ALDRIC — standing calmly, gentle wise smile, eyes half-closed in calm thought"
  "davinci-happy|$ALDRIC — smiling warmly with bright open eyes, one hand raised giving an encouraging thumbs-up, small golden sparkles floating around his hand, cheerful approving expression"
  "davinci-sad|$ALDRIC but the staff crystal dimmed and unlit — gently disappointed but kind expression, eyebrows raised in sympathy, one hand stroking his beard thoughtfully, slight head tilt, comforting not scary"
  "davinci-celebrate|$ALDRIC — joyfully raising his oak staff high overhead with both arms wide, the golden octahedron crystal bursting with radiant golden light and a swirl of tiny glowing stars and geometric shapes spiraling upward, beard swept by magical wind, huge delighted laugh"
  "gauss-idle|$CORIN — standing confidently, calm clever smile"
  "gauss-happy|$CORIN — grinning brightly with sparkling eyes, waving his star-tipped wand leaving a small trail of golden sparkles in the air, other fist clenched in a cheerful yes pose"
  "gauss-sad|$CORIN with the wand star light flickering weakly — pouting slightly with drooping shoulders, wand lowered, scratching his head puzzled but determined, endearing not miserable"
  "gauss-celebrate|$CORIN — jumping mid-air in triumph, both arms thrown up, his wand shooting a fountain of golden star sparkles overhead like tiny fireworks, robe and hair lifted by the jump, ecstatic open-mouthed laugh"
)

for entry in "${items[@]}"; do
  id="${entry%%|*}"
  desc="${entry#*|}"
  final="$mascot_dir/$id.png"
  raw="$raw_dir/$id-magenta.png"
  keyed="$raw_dir/$id-keyed.png"

  if [[ -f $raw ]] && "$root/scripts/chroma-key-four-corners.sh" "$raw" "$keyed" >/dev/null 2>&1; then
    echo "SKIP ${id}（raw 已存在且可去背）"
  else
    marker="$root/.mascot-marker-$id"
    prompt_file="$root/.mascot-prompt-$id.txt"
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
      <"$prompt_file" >"$root/.mascot-$id.log" 2>&1
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
      tail -20 "$root/.mascot-$id.log" >&2
      exit 1
    fi
    cp "$source_png" "$raw"
    "$root/scripts/chroma-key-four-corners.sh" "$raw" "$keyed"
    /bin/rm -f "$marker" "$prompt_file"
  fi

  sips -Z 512 "$keyed" --out "$final" >/dev/null
  size=$(stat -f%z "$final")
  echo "OK ${id} $(sips -g pixelWidth -g pixelHeight "$final" | tail -2 | tr -d ' \n' ) ${size} bytes"
done

echo "全部吉祥物已生成並縮版完成。"
