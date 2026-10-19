#!/usr/bin/env bash
# Builds the Q1 video (1920x1080, 30 fps, about 20 s) from:
#   - the two Grok clips (video and their own music)    ../clips/
#   - scene frames and caption overlays                  frames/ (from scenes.html)
#   - the ElevenLabs v3 voice over                       vo-roger-try1.mp3
# Scene cuts follow the pauses in the voice over (silencedetect), which starts at 0.4 s.
set -euo pipefail
cd "$(dirname "$0")"

CLIP1=../clips/clip1-grok-6s-720p.mp4
CLIP2=../clips/clip2-grok-6s-720p.mp4
VO=vo-roger-try1.mp3
OUT=zolva-q1-1920x1080.mp4
TOTAL=20

# Still scenes get a slow push in. Durations in seconds.
still() { # $1 png, $2 seconds
  echo "loop=loop=-1:size=1:start=0,trim=duration=$2,zoompan=z='1+0.035*on/($2*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,setsar=1"
}

ffmpeg -y -v error \
  -i "$CLIP1" -i "$CLIP2" \
  -i frames/scene-build.png -i frames/scene-test.png -i frames/scene-why.png -i frames/scene-end.png \
  -i "$VO" \
  -i frames/cap-1.png -i frames/cap-2.png -i frames/cap-3.png -i frames/cap-4.png \
  -i frames/cap-5.png -i frames/cap-6.png -i frames/cap-7.png -i frames/cap-8.png \
  -filter_complex "
    [0:v]trim=0:5.3,setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,fps=30,setsar=1[a];
    [1:v]trim=0:3.7,setpts=PTS-STARTPTS,scale=2400:1350:flags=lanczos,crop=1920:1080:240:0,fps=30,setsar=1[b];
    [2:v]$(still x 1.45)[c];
    [3:v]$(still x 2.05)[d];
    [4:v]$(still x 3.1)[e];
    [5:v]$(still x 4.4)[f];
    [a][b][c][d][e][f]concat=n=6:v=1:a=0,format=yuv420p[base];
    [base][7:v]overlay=enable='between(t,0.3,5.3)'[v1];
    [v1][8:v]overlay=enable='between(t,5.6,7.45)'[v2];
    [v2][9:v]overlay=enable='between(t,7.5,9.0)'[v3];
    [v3][10:v]overlay=enable='between(t,9.15,10.45)'[v4];
    [v4][11:v]overlay=enable='between(t,10.5,12.5)'[v5];
    [v5][12:v]overlay=enable='between(t,12.6,15.6)'[v6];
    [v6][13:v]overlay=enable='between(t,15.9,17.1)'[v7];
    [v7][14:v]overlay=enable='between(t,17.15,$TOTAL)',fade=t=in:st=0:d=0.4,fade=t=out:st=$((TOTAL-1)):d=1[vout];

    [0:a]aresample=48000,atrim=0:6[m1];
    [1:a]aresample=48000,atrim=0:6[m2];
    [m1][m2]acrossfade=d=1[bed1];
    [bed1]asplit=2[bedA][bedB];
    [bedA][bedB]acrossfade=d=1.5,atrim=0:$TOTAL,volume=0.55,afade=t=in:st=0:d=0.5,afade=t=out:st=$((TOTAL-2)):d=2[bed];
    [6:a]aresample=48000,adelay=400|400,apad=whole_dur=$TOTAL,volume=1.6,asplit=2[vo][vokey];
    [bed][vokey]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[ducked];
    [ducked][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]
  " \
  -map "[vout]" -map "[aout]" -t $TOTAL \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo "built $OUT"
