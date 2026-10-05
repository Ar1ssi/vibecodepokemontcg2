#!/bin/bash
# Design 063: cuts sheet.png, <name>.mp4 and <name>-closeup.mp4 from <name>.webm using the rects.json
# the recorder wrote next to it (card rects, bannerAt, moveAt in video ms). usage: cut-move.sh <outDir> [name]
cd "$1" && NAME="${2:-fire-blast}"
read CROP START CLIP < <(python3 -c "
import json;r=json.load(open('rects.json'));f,t=r['from'],r['to']
cx=(f['left']+f['width']/2+t['left']+t['width']/2)/2; cy=(f['top']+f['height']/2+t['top']+t['height']/2)/2
h=max(f['height'],t['height']); w=int(h*5.2)//2*2; hh=(int(abs((f['top']+f['height']/2)-(t['top']+t['height']/2))+h*4.4))//2*2
print(f'{w}:{hh}:{int(cx-w/2)}:{int(cy-hh/2)}', (r['moveAt']-150)/1000, max(0,(r['bannerAt']-300)/1000))")
echo "$CROP" > crop.txt
ffmpeg -v error -y -ss $START -t 2.9 -i "$NAME.webm" -vf "fps=12.5,crop=$CROP,scale=300:-1,tile=6x6:padding=2:color=black" -frames:v 1 sheet.png
ffmpeg -v error -y -ss $CLIP -t 5.2 -i "$NAME.webm" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$NAME.mp4"
ffmpeg -v error -y -ss $CLIP -t 5.2 -i "$NAME.webm" -vf "crop=$CROP,scale=640:-2" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$NAME-closeup.mp4"
echo "cut from $START / $CLIP crop $CROP"
