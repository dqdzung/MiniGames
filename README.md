# Mini Games

A small collection of browser mini-games built with [Phaser 3](https://phaser.io/),
served as a single static site. No build step, no framework, no bundler — just
HTML, CSS, and vanilla JS, with Phaser loaded from a CDN.

**Live:** https://iris-minigames.netlify.app

## Games

| Game | Folder | How to play |
|------|--------|-------------|
| 🧠 Memory Match | `memory-game/` | Flip cards, find all matching pairs in the fewest moves. |
| 🎁 Mystery Boxes | `mystery-boxes/` | Pick one of 9 gift boxes; it reveals a prize or a "good luck" wish, then the rest are revealed. |
| 🧺 Loot Catcher | `loot-catcher/` | Move the basket (mouse/touch or ←/→) to catch rewards and dodge bombs. 5 lives; rarer rewards score more. |
| 💎 Match 3 | `match-3/` | Swap adjacent gems to line up 3+. Cascades chain. 2-minute timer; lose if time runs out or no moves remain. |
| 🍉 Fruit Slicer | `fruit-slicer/` | Swipe to slice launched fruit, avoid bombs. 3 lives, 2-minute timer. |

## Tech stack

- **Phaser 3.80.1** via CDN (`<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/...">`) — no npm install.
- **Vanilla JS / HTML / CSS.** Each game is one `game.js` + one `index.html`.
- **No build step.** Files are served as-is; deploys upload the folder directly.

## Project structure

```
MiniGames/
├── index.html          # portal — links to each game
├── styles.css          # portal styles
├── game.css            # shared by every game's page (canvas fills viewport)
├── memory-game/
│   ├── index.html      # loads ../game.css + Phaser CDN + game.js
│   └── game.js         # the whole game (one Phaser scene)
├── mystery-boxes/
├── loot-catcher/
├── match-3/
└── fruit-slicer/
```

Each game folder has the same two files: a minimal `index.html` (title, favicon,
shared `../game.css`, Phaser CDN, and `game.js`) and a self-contained `game.js`.

## Running locally

No server required for the games themselves — just open a game's `index.html` in a
browser (Phaser loads from the CDN, so you need an internet connection).

For the portal's relative links to resolve, serve the root folder:

```
npx live-server        # then open the printed localhost URL
```

Any static file server works (`python3 -m http.server`, etc.).

## Conventions (shared across games)

- **2× internal resolution.** Each game defines `const S = 2` and multiplies sizes by
  it, rendering at 2× so Phaser's `Scale.FIT` *downscales* to the viewport (crisp text)
  instead of upscaling a small canvas (blurry). One knob per game.
- **Responsive.** `Scale.FIT` + `CENTER_BOTH` scale the canvas to any screen while
  preserving aspect ratio.
- **Emoji text padding.** Phaser sizes a text's canvas to the font ascent, which emoji
  overflow; text objects use `padding: { y: 6 }` so glyphs aren't clipped.
- **Emoji favicons.** Each page uses an inline SVG data-URI favicon (no icon files).

## Adding a new game

1. Create a folder, e.g. `snake/`.
2. Add `snake/index.html` (copy any existing game's — change the `<title>` and favicon emoji; keep `<link rel="stylesheet" href="../game.css">` and the Phaser CDN tag).
3. Write `snake/game.js` as a single Phaser scene (follow the `S`-factor + `Scale.FIT` conventions above).
4. Add a card to the portal `index.html` linking to `./snake/`.

## Deploying

Hosted on Netlify (static). From the repo root:

```
npx netlify-cli deploy --prod --dir .
```

The site is linked via the local `.netlify/` folder (gitignored), so no `--site`
flag is needed. Netlify serves the folder as-is — no build command.
