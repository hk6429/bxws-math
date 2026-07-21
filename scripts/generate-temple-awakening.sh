#!/usr/bin/env bash
# 五座神殿甦醒圖：繆思聖所五主題橫幅（沉睡石殿在神光中甦醒點亮）。
# 場景圖、非去背立繪。雙線並行：各 lane 自己的 CODEX_HOME。
# 用法：generate-temple-awakening.sh <lane-name> <key1> <key2> ...
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
lane="${1:?需要 lane 名稱}"; shift
codex_home="$root/.codex-temple-$lane"
generated_dir="$codex_home/generated_images"
out_dir="$root/assets/mythos/temples"
timeout_seconds=${IMAGE_TIMEOUT_SECONDS:-260}
model=${CODEX_IMAGE_MODEL:-gpt-5.5}

mkdir -p "$out_dir" "$codex_home"
# 各 lane 複製一份最新 auth.json（不共用 CODEX_HOME 以免兩個 codex 相撞）
cp -f /Users/naichengchen/.codex/auth.json "$codex_home/auth.json"

STYLE="soft colored-pencil storybook watercolor children's book illustration, cute whimsical cozy chibi fantasy style, a floating fantasy island in a deep starry midnight-blue night sky with tiny golden stars and soft clouds, warm candlelight glow at the awakening moment as little braziers and lanterns gently ignite, hand-drawn colored-pencil texture with soft gentle edges, child-friendly and hopeful, matching a gentle storybook game map aesthetic, NO people or human characters, NO text or letters or numbers anywhere, wide landscape banner composition 1536x1024"

# bash 3.2（macOS 內建）沒有 associative array，改用 case 對照
desc_for() {
  case "$1" in
    labyrinth) echo "a cute storybook floating island holding an ancient Greek stone labyrinth maze with a small friendly Minotaur totem and little bronze measuring-rule pillars, torches gently lighting up along the maze walls";;
    sphinx) echo "a cute storybook floating island with a small friendly winged sphinx statue guarding a gentle Greek temple of riddles, little glowing steles, columns and warm braziers softly awakening";;
    cyclops) echo "a cute storybook floating island with a cozy one-eyed Cyclops blacksmith forge, a little anvil, geometric stone molds and friendly floating polyhedron crystals, the forge fire warmly glowing to life";;
    moirai) echo "a cute storybook floating island with a cozy weaving pavilion of the three Fates, a little loom and a glowing spindle, gentle luminous golden threads of pattern flowing softly, lanterns awakening";;
    delphi) echo "a cute storybook floating island with a small friendly Greek oracle temple of Delphi, a little bronze tripod cauldron with soft golden vapor, laurel wreaths and gentle glowing light awakening the shrine";;
    *) echo "";;
  esac
}

for key in "$@"; do
  desc="$(desc_for "$key")"
  [[ -z $desc ]] && { echo "未知 key：$key" >&2; continue; }
  final="$out_dir/$key-awaken.webp"
  if [[ -f $final && $(stat -f%z "$final") -gt 40000 ]]; then
    echo "SKIP $key（已存在）"; continue
  fi
  marker="$root/.temple-marker-$lane-$key"
  prompt_file="$root/.temple-prompt-$lane-$key.txt"
  touch "$marker"
  cat >"$prompt_file" <<EOF
Please generate one image with the built-in image generation tool.

Subject: $desc

Style requirements: $STYLE

不要嘗試寫入 /tmp。圖片生成後保留在 \$CODEX_HOME/generated_images。完成前必須用 shell 找到本次新生成的 PNG，實際驗證檔案已落盤且檔案大小 > 500KB；若未落盤，必須重生，不能只用文字宣稱完成。
EOF
  echo "GENERATE [$lane] $key"
  set +e
  perl -e 'alarm shift; exec @ARGV' "$timeout_seconds" \
    env CODEX_HOME="$codex_home" codex exec --ignore-user-config \
    -c 'features.code_mode_host=false' \
    -m "$model" -s workspace-write -C "$root" - \
    <"$prompt_file" >"$root/.temple-$lane-$key.log" 2>&1
  status=$?
  set -e
  (( status != 0 )) && echo "codex 失敗/逾時 $key (status=$status)，查是否已落盤" >&2
  source_png=$(find "$generated_dir" -type f -name '*.png' -newer "$marker" -size +500000c \
    -print 2>/dev/null | while IFS= read -r p; do printf '%s\t%s\n' "$(stat -f%m "$p")" "$p"; done \
    | sort -nr | head -1 | cut -f2-)
  if [[ -z $source_png ]]; then
    echo "找不到 $key 的新 PNG" >&2; tail -15 "$root/.temple-$lane-$key.log" >&2; continue
  fi
  # 童書橫幅只顯示 ~120–640px 高，壓成 960px 寬 WebP（省 ~90% 體積，解 V2）
  cwebp -quiet -q 80 -resize 960 0 "$source_png" -o "$final"
  /bin/rm -f "$marker" "$prompt_file"
  echo "OK $key $(stat -f%z "$final") bytes (webp)"
done
echo "[$lane] 完成"
