#!/usr/bin/env bash
# Builds features for a setting, trains both networks and scores them on the held-out pieces.
# usage: tools/experiment.sh <name> <periods> <nPieces> <epochs> <hidden>
set -e
NAME=$1; PERIODS=$2; N=${3:-200}; EPOCHS=${4:-6}; HIDDEN=${5:-128,64}
T=${TEMP:-/tmp}
AUD=$(cygpath -m "$T/nwaudio" 2>/dev/null || echo "$T/nwaudio")
OUT=$(cygpath -m "$T/feat_$NAME" 2>/dev/null || echo "$T/feat_$NAME")
rm -rf "$OUT"; mkdir -p "$OUT"
export NW_PERIODS=$PERIODS
for s in $(seq 1 $N); do echo "$s $AUD $OUT"; done | node tools/mkjobs.mjs 11 -- node tools/feat_piece.mjs > "$T/feat_$NAME.log" 2>&1
python tools/train_nn.py "$OUT" "$T/net_${NAME}_onset.json" $EPOCHS $HIDDEN 112 p > "$T/train_${NAME}_onset.log" 2>&1
POSW=1 python tools/train_nn.py "$OUT" "$T/net_${NAME}_offset.json" 25 64,32 29 o > "$T/train_${NAME}_offset.log" 2>&1
node tools/evalnet.mjs "$T/nwval" --onset "$T/net_${NAME}_onset.json" --offset "$T/net_${NAME}_offset.json" > "$T/eval_$NAME.log" 2>&1
tail -1 "$T/train_${NAME}_onset.log"; grep OVERALL "$T/eval_$NAME.log"
