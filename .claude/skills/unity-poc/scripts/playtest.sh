#!/usr/bin/env bash
# Headless playtest: simulates every fighter matchup frame-by-frame and asserts the
# combat actually plays (damage lands, KO resolves, install fires, no exceptions).
# Usage: playtest.sh <projectPath> [unityVersion]
set -euo pipefail

PROJ="${1:?project path required}"
UVER="${2:-6000.4.0f1}"
# 2D fighter template = Fighter.*; 3D template = Fighter3D.* — override with
#   PLAYTEST_METHOD=Fighter3D.EditorTools.BuildScript.RunPlaytest scripts/playtest.sh ...
METHOD="${PLAYTEST_METHOD:-Fighter.EditorTools.BuildScript.RunPlaytest}"
UNITY="/Applications/Unity/Hub/Editor/$UVER/Unity.app/Contents/MacOS/Unity"
[ -x "$UNITY" ] || { echo "Unity $UVER not found"; exit 1; }

LOG="$PROJ/playtest.log"
echo "Running playtest (log: $LOG)"
set +e
"$UNITY" -batchmode -quit -nographics \
  -projectPath "$PROJ" \
  -executeMethod "$METHOD" \
  -logFile "$LOG"
CODE=$?
set -e
echo "--- playtest results ---"
grep -E "\[Playtest\]|\[PASS\]|\[FAIL\]|PLAYTEST (PASS|FAIL)|OVERALL" "$LOG" || true
echo "exit=$CODE"
exit $CODE
