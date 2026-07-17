#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
codex_home=${CODEX_HOME:-$root/.codex-image-runtime}
generated_dir="$codex_home/generated_images"
asset_dir="$root/assets/geometry"
raw_dir="$asset_dir/raw"
prompt_dir="$root/scripts/p3-prompts"
timeout_seconds=${IMAGE_TIMEOUT_SECONDS:-200}
model=${CODEX_IMAGE_MODEL:-gpt-5.5}
force_regenerate=${FORCE_REGENERATE:-0}

mkdir -p "$asset_dir" "$raw_dir"
mkdir -p "$codex_home"
if [[ ! -e "$codex_home/auth.json" ]]; then
  ln -s /Users/naichengchen/.codex/auth.json "$codex_home/auth.json"
fi

if [[ $# -gt 0 ]]; then
  manifests=()
  for group in "$@"; do manifests+=("$prompt_dir/group-${group}.json"); done
else
  manifests=("$prompt_dir"/group-{a,b,c}.json)
fi

for manifest in "${manifests[@]}"; do
  [[ -f $manifest ]] || { echo "缺少提示詞清冊：$manifest" >&2; exit 1; }
  items_file=$(mktemp)
  jq -c '.[]' "$manifest" >"$items_file"
  item_count=$(wc -l <"$items_file" | tr -d ' ')
  for ((idx = 1; idx <= item_count; idx++)); do
    item=$(sed -n "${idx}p" "$items_file")
    id=$(jq -r '.id' <<<"$item")
    title=$(jq -r '.title' <<<"$item")
    scene=$(jq -r '.prompt' <<<"$item")
    final="$asset_dir/$id.png"
    raw="$raw_dir/$id-magenta.png"

    if [[ $force_regenerate != 1 && -f $final ]] && (( $(stat -f%z "$final") > 1048576 )); then
      if "$root/scripts/chroma-key-four-corners.sh" "$raw" "$final" >/dev/null 2>&1; then
      echo "SKIP ${id}（已完成且驗證通過）"
        continue
      fi
    fi

    marker="$root/.p3-image-marker-$id"
    prompt_file="$root/.p3-image-prompt-$id.txt"
    touch "$marker"
    cat >"$prompt_file" <<EOF
請使用內建圖片生成工具產生一張國中小數學教材插圖，主題是「${title}」。

${scene}

視覺規格：鉛筆草圖線稿（sketch pencil-line-art）風格，帶輕微紙上手繪感；所有幾何主體使用一致粗細的深墨色手繪輪廓，不做塑膠感、高光、3D 渲染或扁平向量高光插畫。色彩只能使用與網站 CSS token 相符的退飽和復古色盤：紙色 #F5EEDA／#FAF4E0、深墨 #3A3226、灰墨 #8A7D64、退飽和青綠 #2F8F83、藍 #4F6DB3、暖橙 #D98A2B、莓紅 #C96A8A、橄欖綠 #7A9A3D。明確禁止高飽和糖果色、螢光色、亮面漸層、發光效果與糖果塑膠質感。乾淨、精準、適合台灣國小高年級到國一學生；正投影或等角視圖。畫面不得含任何文字、數字、公式、浮水印、簽名或 UI。主體不可使用洋紅色、桃紅色或紫紅色（退飽和莓紅 #C96A8A 也請避免用在外輪廓與大面積區域，以利去背）。四邊保留安全留白，所有教材主體完整落在畫面中央。背景必須是單一、均勻、無陰影、無漸層的純洋紅 chroma-key #FF00FF，四個角都必須是背景色，方便四角取色去背。輸出 PNG，至少 1536×1024。

不要嘗試寫入 /tmp。圖片生成後保留在 \$CODEX_HOME/generated_images。完成前必須用 shell 找到本次新生成的 PNG，實際驗證檔案已落盤且檔案大小 > 1MB；若未落盤或不大於 1MB，必須重生或修正，不能只用文字宣稱完成。
EOF

    echo "GENERATE ${id}"
    set +e
    perl -e 'alarm shift; exec @ARGV' "$timeout_seconds" \
      env CODEX_HOME="$codex_home" codex exec --ignore-user-config \
      -c 'features.code_mode_host=false' \
      -m "$model" -s workspace-write -C "$root" - \
      <"$prompt_file" >"$root/.p3-image-$id.log" 2>&1
    status=$?
    set -e
    if (( status != 0 )); then
      echo "codex exec 失敗或逾時：${id}（status=${status}）" >&2
      tail -30 "$root/.p3-image-$id.log" >&2
      exit 1
    fi

    source_png=$(find "$generated_dir" -type f -name '*.png' -newer "$marker" -size +1048576c \
      -print 2>/dev/null | while IFS= read -r path; do
        printf '%s\t%s\n' "$(stat -f%m "$path")" "$path"
      done | sort -nr | head -1 | cut -f2-)
    if [[ -z $source_png ]]; then
      echo "找不到本次新生成且 >1MB 的 PNG：${id}" >&2
      tail -30 "$root/.p3-image-$id.log" >&2
      exit 1
    fi

    cp "$source_png" "$raw"
    "$root/scripts/chroma-key-four-corners.sh" "$raw" "$final"
    rm -f "$marker" "$prompt_file"
  done
  rm -f "$items_file"
done

echo "全部指定幾何配圖皆已生成並驗證。"
