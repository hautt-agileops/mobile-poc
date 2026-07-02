#!/usr/bin/env bash
# Deploy a Unity WebGL build to Vercel as a static site.
# Runs the local smoke test first and ABORTS on failure — never deploys a broken build.
# Usage: deploy-vercel.sh <webglBuildDir> [projectName]
set -euo pipefail

DIR="${1:?webgl build dir required}"
NAME="${2:-bbp-vertical-slice}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$DIR/index.html" ] || { echo "no index.html in $DIR"; exit 1; }

# Vercel project names must be lowercase, no '---'.
NAME="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/-{3,}/-/g')"

# 1. Local pre-deploy gate
echo "=== pre-deploy local test ==="
bash "$HERE/local-test.sh" "$DIR" || { echo "ABORT: local test failed, not deploying"; exit 1; }

# 2. Static config (Unity WebGL ships uncompressed -> no content-encoding headers needed)
cat > "$DIR/vercel.json" <<'JSON'
{ "headers": [ { "source": "/(.*)", "headers": [ { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" } ] } ] }
JSON

# 3. Link (idempotent) then deploy. CLI v50+ dropped --name, so link sets the project name.
cd "$DIR"
echo "=== deploying to Vercel project: $NAME ==="
npx --no-install vercel link --yes --project "$NAME" >/dev/null 2>&1 || true
npx --no-install vercel deploy --prod --yes 2>&1 | grep -vE "npm notice|Changelog|To update"

# Stable production alias for a Vercel project is <project-name>.vercel.app.
GAME_URL="https://${NAME}.vercel.app"

# 4. Register the build in the shared Studio portal UNDER ITS CATEGORY, so it shows up
#    alongside the 3D gallery. The portal has one category dir per kind:
#      gallery -> models/   (3D models, published by the 3d-prompt skill)
#      games   -> games/    (WebGL builds, published here)
#    A category is just <portal>/<category>/{manifest.json, <id>.png}. This skill deploys into
#    PORTAL_CATEGORY (default "games"). Best-effort: never fail the build deploy on this — the
#    build keeps its own deployment; the portal only lists + embeds it. Skip with NO_PORTAL=1.
PORTAL_VIEWER_DIR="${PORTAL_VIEWER_DIR:-$HERE/../../../../../.claude/skills/3d-prompt/viewer}"
PORTAL_CATEGORY="${PORTAL_CATEGORY:-games}"
if [ "${NO_PORTAL:-0}" = "1" ]; then
  echo "=== portal registration skipped (NO_PORTAL=1) ==="
elif [ ! -d "$PORTAL_VIEWER_DIR" ]; then
  echo "=== portal viewer not found at $PORTAL_VIEWER_DIR — skipping portal registration ==="
else
  PORTAL_VIEWER_DIR="$(cd "$PORTAL_VIEWER_DIR" && pwd)"
  echo "=== registering '$NAME' in Studio portal (category: $PORTAL_CATEGORY) ==="
  CAT_DIR="$PORTAL_VIEWER_DIR/$PORTAL_CATEGORY"
  mkdir -p "$CAT_DIR"
  # thumbnail = the boot screenshot the local test just captured (fallbacks are harmless)
  [ -f "$DIR/_localtest.png" ] && cp "$DIR/_localtest.png" "$CAT_DIR/$NAME.png" || true
  TITLE="${GAME_TITLE:-$(echo "$NAME" | sed -E 's/-/ /g' | awk '{for(i=1;i<=NF;i++)$i=toupper(substr($i,1,1)) substr($i,2)}1')}"
  GAME_TITLE="$TITLE" GAME_DESC="${GAME_DESC:-}" GAME_URL="$GAME_URL" GAME_ID="$NAME" \
  GAME_ENGINE="${GAME_ENGINE:-Unity WebGL}" \
  CAT_MANIFEST="$CAT_DIR/manifest.json" GAME_DATE="$(date +%Y-%m-%d)" \
  node -e '
    const fs = require("fs");
    const p = process.env.CAT_MANIFEST;
    let list = [];
    try { list = JSON.parse(fs.readFileSync(p, "utf8")); if (!Array.isArray(list)) list = []; } catch {}
    const id = process.env.GAME_ID;
    const entry = {
      id, title: process.env.GAME_TITLE || id, url: process.env.GAME_URL,
      thumb: id + ".png", engine: process.env.GAME_ENGINE, created: process.env.GAME_DATE,
      description: process.env.GAME_DESC || undefined,
    };
    const i = list.findIndex(g => g && g.id === id);
    if (i >= 0) entry.created = list[i].created || entry.created, list[i] = { ...list[i], ...entry };
    else list.unshift(entry);
    fs.writeFileSync(p, JSON.stringify(list, null, 2) + "\n");
    console.log(`portal "${process.env.GAME_ENGINE}" category now lists ${list.length} item(s)`);
  '
  # redeploy the portal so the new entry appears publicly
  ( cd "$PORTAL_VIEWER_DIR" \
    && npx --no-install vercel deploy --prod --yes 2>&1 | grep -vE "npm notice|Changelog|To update" ) \
    || echo "WARN: portal redeploy failed (build itself is deployed at $GAME_URL)"
fi

echo "game URL: $GAME_URL"
