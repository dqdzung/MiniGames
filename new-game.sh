#!/usr/bin/env bash
# Scaffold a new mini-game: folder + index.html + starter game.js + portal card.
# Usage: ./new-game.sh <slug> ["<Title>"] [<emoji>] ["<description>"]
#   slug         required, kebab-case (e.g. my-game)
#   Title        optional — defaults to the slug title-cased (my-game -> My Game)
#   emoji        optional — defaults to 🎮
#   description  optional — defaults to a placeholder
# Examples:
#   ./new-game.sh snake "Snake" 🐍 "Eat, grow, don't crash."
#   ./new-game.sh snake            # everything but the slug defaulted
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 <slug> [\"<Title>\"] [<emoji>] [\"<description>\"]"
  echo "  only <slug> is required (kebab-case). Title/emoji/description are optional."
  echo "Example: $0 snake \"Snake\" 🐍 \"Eat, grow, don't crash.\""
  exit 1
fi

SLUG="$1"
ROOT="$(cd "$(dirname "$0")" && pwd)"

# slug must be kebab-case (folder + URL friendly)
if ! [[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Error: slug must be lowercase kebab-case (e.g. 'my-game'), got '$SLUG'"; exit 1
fi
if [ -e "$ROOT/$SLUG" ]; then
  echo "Error: $SLUG/ already exists"; exit 1
fi
if ! grep -q "NEW-GAME-CARD" "$ROOT/index.html"; then
  echo "Error: portal index.html is missing the <!-- NEW-GAME-CARD --> marker"; exit 1
fi

# optional args with defaults derived from the slug
TITLE_FROM_SLUG="$(echo "$SLUG" | awk -F- '{for(i=1;i<=NF;i++)$i=toupper(substr($i,1,1)) substr($i,2);print}' OFS=' ')"
TITLE="${2:-$TITLE_FROM_SLUG}"
EMOJI="${3:-🎮}"
DESC="${4:-Coming soon.}"

# PascalCase class name from slug (my-game -> MyGame)
CLASS="$(echo "$SLUG" | awk -F- '{s="";for(i=1;i<=NF;i++)s=s toupper(substr($i,1,1)) substr($i,2);print s}')"

mkdir "$ROOT/$SLUG"

# 1. index.html (shared ../game.css, emoji favicon, Phaser CDN, game.js)
cat > "$ROOT/$SLUG/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${TITLE}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${EMOJI}</text></svg>" />
  <link rel="stylesheet" href="../game.css" />
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>
</head>
<body>
  <div id="game"></div>
  <script src="game.js"></script>
</body>
</html>
HTML

# 2. starter game.js following the project conventions
cat > "$ROOT/$SLUG/game.js" <<GAME
// ${TITLE} — single Phaser scene.
// Conventions: render at S× so Scale.FIT downscales (crisp on big screens);
// Scale.FIT + CENTER_BOTH keep it responsive; give emoji text \`padding: { y: 6 }\`.

const S = 2;
const px = (n) => \`\${n * S}px\`;

const GAME_W = 480 * S;
const GAME_H = 640 * S;

class ${CLASS} extends Phaser.Scene {
  create() {
    this.add.text(GAME_W / 2, GAME_H / 2, "${TITLE}\\n\\ncoming soon", {
      fontSize: px(28), color: "#fff", fontStyle: "bold", align: "center", padding: { y: 8 },
    }).setOrigin(0.5);

    // TODO: build the game here.
  }

  update(time, delta) {
    // per-frame logic (delta is ms)
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#16213e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: ${CLASS},
});
GAME

# 3. insert a portal card above the marker
CARDFILE="$(mktemp)"
cat > "$CARDFILE" <<CARD
    <a class="card" href="./${SLUG}/">
      <span class="icon">${EMOJI}</span>
      <span class="name">${TITLE}</span>
      <span class="desc">${DESC}</span>
    </a>
CARD
awk -v cf="$CARDFILE" '
  /NEW-GAME-CARD/ { while ((getline line < cf) > 0) print line }
  { print }
' "$ROOT/index.html" > "$ROOT/index.html.tmp"
mv "$ROOT/index.html.tmp" "$ROOT/index.html"
rm -f "$CARDFILE"

echo "Created $SLUG/ (class ${CLASS}, title \"${TITLE}\", ${EMOJI}) and added it to the portal."
echo "Next: open $SLUG/index.html and build the game in $SLUG/game.js"
