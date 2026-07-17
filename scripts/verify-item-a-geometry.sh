#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
asset_dir="$root/assets/geometry"
expected=(
  geometry-angle-family geometry-area-family geometry-box-volume geometry-circle-family
  geometry-lines geometry-nets geometry-quadrilateral-family geometry-scale
  geometry-shapes-solids geometry-symmetry
)

[[ $(find "$asset_dir" -maxdepth 1 -type f -name 'geometry-*.png' | wc -l | tr -d ' ') == 10 ]]
grep -q 'sketch pencil-line-art' "$root/scripts/generate-p3-geometry.sh"
grep -q '禁止高飽和糖果色' "$root/scripts/generate-p3-geometry.sh"

for id in "${expected[@]}"; do
  file="$asset_dir/$id.png"
  [[ -s $file ]]
  ffmpeg -v error -i "$file" -f rawvideo -pix_fmt rgba - \
    | perl -e '
        use strict; use warnings; local $/; my $data = <STDIN> // q{};
        my ($transparent, $visible_magenta) = (0, 0);
        for (my $i = 0; $i + 3 < length($data); $i += 4) {
          my ($r, $g, $b, $a) = unpack("C4", substr($data, $i, 4));
          $transparent++ if $a < 32;
          $visible_magenta++ if $a >= 32 && $r >= 180 && $b >= 180 && $g <= 120;
        }
        die "no transparent pixels\n" if $transparent == 0;
        die "visible magenta=$visible_magenta\n" if $visible_magenta > 60;
      '
  echo "OK $id alpha/chroma"
done
