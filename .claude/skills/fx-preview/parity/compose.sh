#!/bin/bash
# compose.sh <id> → cmp/<id>.png: the game's video (8 frames, 0.4–4.6 s) over ours (8 stills).
cd "${PARITY_DIR:-$(dirname "$0")/../../../../.agent/scratch/075/parity}"; mkdir -p cmp tmp
id=$1
[ -f sv/$id.mp4 ] || { echo "$id no-video"; exit 0; }
ffmpeg -loglevel error -y -ss 0.4 -t 4.2 -i sv/$id.mp4 -vf "fps=8/4.2,scale=300:-1,tile=8x1" -frames:v 1 tmp/$id-sv.png || exit 1
ffmpeg -loglevel error -y $(for k in 0 1 2 3 4 5 6 7; do printf -- "-i ours/%s-%d.png " $id $k; done) \
  -filter_complex "$(for k in 0 1 2 3 4 5 6 7; do printf "[%d]scale=440:-1,crop=300:300:70:150[o%d];" $k $k; done)[o0][o1][o2][o3][o4][o5][o6][o7]hstack=8" tmp/$id-ours.png || exit 1
ffmpeg -loglevel error -y -i tmp/$id-sv.png -i tmp/$id-ours.png -filter_complex "[0][1]vstack" cmp/$id.png && echo "$id ok"
