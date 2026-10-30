#!/usr/bin/env bash
# vfx-design skill: label and tile the seven frames rec/seven-frames.mjs wrote, and stack them under a
# reference row when one is given, so the rubric is scored from one image.
#   rec/seven-sheet.sh <frames-dir> [label] [reference-row.png]
# Writes <frames-dir>/row.png and, with a reference, <frames-dir>/compare.png (reference above, ours below).
# A reference row: cut the clip at the seven beats (ffmpeg -ss <s> -i clip.mp4 -frames:v 1 ...), label
# each with drawtext, then tile them 7x1 the same way this script does.
set -euo pipefail
dir="${1:?frames dir}"
label="${2:-ours}"
ref="${3:-}"
for f in "$dir"/[1-7]-*.png; do
  b="$(basename "$f" .png)"
  ffmpeg -v error -y -i "$f" -vf "scale=400:-1,drawtext=text='${label} ${b}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6" "$dir/lab-$b.png"
done
ffmpeg -v error -y -framerate 1 -pattern_type glob -i "$dir/lab-*.png" -vf "tile=7x1" "$dir/row.png"
rm -f "$dir"/lab-*.png
if [[ -n "$ref" ]]; then
  ffmpeg -v error -y -i "$ref" -i "$dir/row.png" -filter_complex "[0:v]scale=2800:-1[a];[1:v]scale=2800:-1[b];[a][b]vstack=inputs=2" "$dir/compare.png"
  echo "wrote $dir/compare.png"
else
  echo "wrote $dir/row.png"
fi
