#!/usr/bin/env bash
# 五守護者立繪去背重生（V8）：原檔含整片背景=畫中畫，改繪成 magenta 底→chroma-key 去背的
# 浮空角色，並壓成帶 alpha 的 WebP（原 2.7MB→ ~100KB，順帶解 V2）。雙線並行：各 lane 自己 CODEX_HOME。
# 用法：generate-guardian-cutouts.sh <lane-name> <id1> <id2> ...
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
lane="${1:?需要 lane 名稱}"; shift
codex_home="$root/.codex-guardian-$lane"
generated_dir="$codex_home/generated_images"
out_dir="$root/assets/mythos/guardians"
raw_dir="$out_dir/raw"
timeout_seconds=${IMAGE_TIMEOUT_SECONDS:-260}
model=${CODEX_IMAGE_MODEL:-gpt-5.5}

mkdir -p "$out_dir" "$raw_dir" "$codex_home"
cp -f /Users/naichengchen/.codex/auth.json "$codex_home/auth.json"

STYLE="storybook watercolor illustration, soft colored-pencil texture, warm candlelight palette, child-friendly cute chibi proportions (large head, small body), single full-body character centered and filling most of the frame, clean silhouette, friendly and cozy, no text or letters or numbers anywhere, solid pure magenta #FF00FF background filling the entire canvas edge to edge with all four corners pure magenta for chroma-key removal, the character itself must contain absolutely no magenta pink or fuchsia tones, portrait 1024x1536"

desc_for() {
  case "$1" in
    minotaur) echo "a cute friendly chibi baby Minotaur temple guardian, small fluffy bull head with tiny rounded horns, big gentle eyes, wearing a simple bronze belt, holding a small bronze measuring ruler, warm welcoming smile";;
    sphinx) echo "a cute friendly chibi Greek winged sphinx guardian, small lion body with soft feathered wings, a sweet girl face wearing a little golden Athena-style helm, gentle smile, paws resting politely";;
    cyclops) echo "a cute friendly chibi one-eyed Cyclops blacksmith guardian, one big kind round eye, small leather blacksmith apron, holding a little smith hammer, cheerful helpful grin";;
    moirai) echo "a cute friendly chibi Fate weaver guardian girl, flowing simple Greek robe, holding a small glowing golden spindle with a gentle thread of light, calm caring smile";;
    pythia) echo "a cute friendly chibi Delphi oracle priestess guardian girl, laurel wreath on her head, simple white Greek robe, holding a small bronze tripod bowl with soft golden vapor, serene gentle expression";;
    *) echo "";;
  esac
}

for id in "$@"; do
  desc="$(desc_for "$id")"
  [[ -z $desc ]] && { echo "未知 id：$id" >&2; continue; }
  final="$out_dir/$id.webp"
  raw="$raw_dir/$id-magenta.png"
  keyed="$raw_dir/$id-keyed.png"

  if [[ -f $final && $(stat -f%z "$final") -gt 20000 ]]; then
    echo "SKIP $id（已存在）"; continue
  fi

  marker="$root/.guardian-marker-$lane-$id"
  prompt_file="$root/.guardian-prompt-$lane-$id.txt"
  touch "$marker"
  cat >"$prompt_file" <<EOF
Please generate one image with the built-in image generation tool.

Subject: $desc

Style requirements: $STYLE

不要嘗試寫入 /tmp。圖片生成後保留在 \$CODEX_HOME/generated_images。完成前必須用 shell 找到本次新生成的 PNG，實際驗證檔案已落盤且檔案大小 > 500KB；若未落盤，必須重生，不能只用文字宣稱完成。
EOF
  echo "GENERATE [$lane] $id"
  set +e
  perl -e 'alarm shift; exec @ARGV' "$timeout_seconds" \
    env CODEX_HOME="$codex_home" codex exec --ignore-user-config \
    -c 'features.code_mode_host=false' \
    -m "$model" -s workspace-write -C "$root" - \
    <"$prompt_file" >"$root/.guardian-$lane-$id.log" 2>&1
  status=$?
  set -e
  (( status != 0 )) && echo "codex 失敗/逾時 $id (status=$status)，查是否已落盤" >&2
  source_png=$(find "$generated_dir" -type f -name '*.png' -newer "$marker" -size +500000c \
    -print 2>/dev/null | while IFS= read -r p; do printf '%s\t%s\n' "$(stat -f%m "$p")" "$p"; done \
    | sort -nr | head -1 | cut -f2-)
  if [[ -z $source_png ]]; then
    echo "找不到 $id 的新 PNG" >&2; tail -15 "$root/.guardian-$lane-$id.log" >&2; continue
  fi
  cp "$source_png" "$raw"
  "$root/scripts/chroma-key-four-corners.sh" "$raw" "$keyed"
  # 帶 alpha 的 WebP，384px 顯示綽綽有餘（框只有 96px）
  cwebp -quiet -q 82 -resize 384 0 "$keyed" -o "$final"
  /bin/rm -f "$marker" "$prompt_file"
  echo "OK $id $(stat -f%z "$final") bytes (webp+alpha)"
done
echo "[$lane] 完成"
