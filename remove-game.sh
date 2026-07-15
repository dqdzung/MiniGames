#!/usr/bin/env bash
# Remove a mini-game: delete its folder and its portal card.
# Prompts for confirmation — you must type the exact game name (slug) to proceed.
# Usage: ./remove-game.sh <slug>
# Example: ./remove-game.sh snake
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <slug>"
  echo "Example: $0 snake"
  exit 1
fi

SLUG="$1"
ROOT="$(cd "$(dirname "$0")" && pwd)"

if ! [[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Error: slug must be lowercase kebab-case (e.g. 'my-game'), got '$SLUG'"; exit 1
fi

HAS_FOLDER=0; [ -d "$ROOT/$SLUG" ] && HAS_FOLDER=1
HAS_CARD=0; grep -qF "href=\"./$SLUG/\"" "$ROOT/index.html" && HAS_CARD=1

if [ "$HAS_FOLDER" -eq 0 ] && [ "$HAS_CARD" -eq 0 ]; then
  echo "Error: no game '$SLUG' found (no $SLUG/ folder and no portal card)"; exit 1
fi

# confirmation guard — type the exact game name to proceed
printf "This will permanently delete '%s' (folder + portal card).\n" "$SLUG"
read -r -p "Type the game name to confirm: " CONFIRM
if [ "$CONFIRM" != "$SLUG" ]; then
  echo "Aborted — '$CONFIRM' does not match '$SLUG'. Nothing was removed."
  exit 1
fi

# remove the portal card block (<a class="card" href="./SLUG/"> ... </a>)
if [ "$HAS_CARD" -eq 1 ]; then
  awk -v slug="$SLUG" '
    $0 ~ ("class=\"card\" href=\"\\./" slug "/\"") { del=1; next }
    del && /<\/a>/ { del=0; next }
    del { next }
    { print }
  ' "$ROOT/index.html" > "$ROOT/index.html.tmp"
  mv "$ROOT/index.html.tmp" "$ROOT/index.html"
fi

# delete the game folder
[ "$HAS_FOLDER" -eq 1 ] && rm -rf "$ROOT/$SLUG"

echo "Removed '$SLUG' (folder: $([ "$HAS_FOLDER" -eq 1 ] && echo deleted || echo 'not found'), portal card: $([ "$HAS_CARD" -eq 1 ] && echo removed || echo 'not found'))."
