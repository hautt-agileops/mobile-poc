#!/usr/bin/env bash
# Headless Unity WebGL build.
# Usage: build-webgl.sh <projectPath> [outputDir] [productName] [unityVersion] [extra Unity args...]
# Any args after the 4th pass straight to Unity, e.g. `-skipPlaytest` to bypass the gate:
#   build-webgl.sh <proj> "" "" "" -skipPlaytest
set -euo pipefail

PROJ="${1:?project path required}"
OUT="${2:-$PROJ/Build/WebGL}"
PRODUCT="${3:-Blood Bloom Protocol}"
UVER="${4:-6000.4.0f1}"
EXTRA=("${@:5}")   # forwarded verbatim to Unity (e.g. -skipPlaytest)
# Build entry point. 2D fighter template = Fighter.*; 3D template = Fighter3D.* — override with
#   BUILD_METHOD=Fighter3D.EditorTools.BuildScript.BuildWebGL scripts/build-webgl.sh ...
METHOD="${BUILD_METHOD:-Fighter.EditorTools.BuildScript.BuildWebGL}"
UNITY="/Applications/Unity/Hub/Editor/$UVER/Unity.app/Contents/MacOS/Unity"

[ -x "$UNITY" ] || { echo "Unity $UVER not found at $UNITY"; exit 1; }
mkdir -p "$OUT"
LOG="$PROJ/build-webgl.log"
echo "Building WebGL -> $OUT (log: $LOG)"

"$UNITY" -batchmode -quit -nographics \
  -projectPath "$PROJ" \
  -buildTarget WebGL \
  -executeMethod "$METHOD" \
  -outputPath "$OUT" \
  -productName "$PRODUCT" \
  -logFile "$LOG" \
  ${EXTRA[@]+"${EXTRA[@]}"}
CODE=$?
echo "Unity exit=$CODE"
[ -f "$OUT/index.html" ] || { echo "FAILED: no index.html"; tail -40 "$LOG"; exit 1; }

# Make the WebGL canvas fill the browser window (the default template locks it to 960x600
# with letterbox margins). Better UX, and gives the browser test deterministic click coords.
IDX="$OUT/index.html"
if ! grep -q "bbp-fullwindow" "$IDX"; then
  python3 - "$IDX" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
style = ('<style id="bbp-fullwindow">'
         'html,body{margin:0;height:100%;background:#0b0b0e;overflow:hidden}'
         '#unity-container{position:fixed;inset:0;width:100vw;height:100vh}'
         '#unity-canvas{width:100vw!important;height:100vh!important;display:block}'
         '#unity-footer{display:none!important}'
         '#unity-loading-bar{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%)}'
         '</style>')
s = s.replace('</head>', style + '\n</head>', 1)
open(p, 'w').write(s)
print('injected full-window canvas CSS')
PY
fi
echo "OK: $OUT/index.html"
