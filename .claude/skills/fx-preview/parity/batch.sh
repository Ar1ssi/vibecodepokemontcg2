#!/bin/bash
# batch.sh <name> <id...> → review/<name>.png: the ids' comparisons stacked, each labelled.
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
cd "${PARITY_DIR:-$(dirname "$0")/../../../../.agent/scratch/075/parity}"; mkdir -p review tmp
name=$1; shift
ins=(); n=0
for id in "$@"; do
  [ -f cmp/$id.png ] || "$SCRIPTS/compose.sh" $id > /dev/null
  [ -f cmp/$id.png ] || continue
  ffmpeg -loglevel error -y -i cmp/$id.png -vf "drawtext=text='$id':x=8:y=8:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.7" tmp/lab-$id.png 2>/dev/null || cp cmp/$id.png tmp/lab-$id.png
  ins+=(-i tmp/lab-$id.png); n=$((n+1))
done
if [ "$n" -eq 1 ]; then cp "${ins[1]}" review/$name.png; else ffmpeg -loglevel error -y "${ins[@]}" -filter_complex "vstack=inputs=$n" review/$name.png; fi && echo "review/$name.png ($n)"
