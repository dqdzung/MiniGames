// Match 3 — swap adjacent gems to line up 3+, clears cascade. Single Phaser scene.
// Model (this.grid: int types) is kept separate from the view (this.sprites) so the
// core logic — match detection, gravity, refill — is pure array work and easy to reason about.

// Render at S× resolution so Scale.FIT downscales (crisp) on big screens. One knob for all sizes.
const S = 2;
const px = (n) => `${n * S}px`;

// gem types as drawn circles (not emoji) → pixel-perfect centering, no glyph offset/clipping
const GEM_COLORS = [0xff4d4d, 0xffcf33, 0x37c837, 0x3b8eff, 0xa64dff, 0x2ec4c4];
const COLS = 8;
const ROWS = 8;
const CELL = 54 * S;
const MARGIN = 20 * S;
const TOP = 64 * S;
const GEM_R = CELL * 0.34; // gem radius

const GAME_W = COLS * CELL + MARGIN * 2;
const GAME_H = ROWS * CELL + MARGIN * 2 + TOP;

const SWAP_MS = 140;
const CLEAR_MS = 180;
const FALL_MS = 220;
const GAME_SECONDS = 120; // 2-minute round

const randType = () => Math.floor(Math.random() * GEM_COLORS.length);
const cellX = (c) => MARGIN + c * CELL + CELL / 2;
const cellY = (r) => TOP + MARGIN + r * CELL + CELL / 2;

class Match3Game extends Phaser.Scene {
  create() {
    this.score = 0;
    this.busy = false;   // input lock during animated resolution
    this.over = false;
    this.selected = null;

    this.add.text(MARGIN, 20 * S, "Match 3", {
      fontSize: px(26), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    });
    this.scoreText = this.add.text(GAME_W - MARGIN, 26 * S, "Score: 0", {
      fontSize: px(18), color: "#ffd166", fontStyle: "bold", padding: { y: 6 },
    }).setOrigin(1, 0);

    // 2-minute countdown
    this.timeLeft = GAME_SECONDS;
    this.timerText = this.add.text(GAME_W / 2, 26 * S, this.fmtTime(this.timeLeft), {
      fontSize: px(20), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    }).setOrigin(0.5, 0);
    this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });

    // board background
    this.add.rectangle(
      MARGIN, TOP + MARGIN,
      COLS * CELL, ROWS * CELL, 0x0f1830,
    ).setOrigin(0, 0).setStrokeStyle(2 * S, 0x2a3a63);

    // model with no pre-existing matches, then aligned sprites
    this.buildGemTextures();
    this.grid = this.makeInitialGrid();
    this.sprites = this.grid.map((row, r) =>
      row.map((type, c) => this.makeGem(type, cellX(c), cellY(r))),
    );

    this.selectedGem = null; // pulse tween + glow live on the gem itself

    this.input.on("pointerdown", (p) => this.onPick(p));
  }

  makeGem(type, x, y) {
    return this.add.image(x, y, "gem" + type).setOrigin(0.5);
  }

  // bake each gem color into a faceted-jewel texture once (reused across restarts)
  buildGemTextures() {
    const size = Math.ceil(GEM_R * 2 + 6 * S);
    GEM_COLORS.forEach((base, i) => {
      const key = "gem" + i;
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      this.drawGem(g, base, size / 2, size / 2, GEM_R);
      g.generateTexture(key, size, size);
      g.destroy();
    });
  }

  // brilliant-cut gem centered at (cx,cy): table + crown/pavilion facets, dark edge, glint
  drawGem(g, base, cx, cy, R) {
    const C = Phaser.Display.Color.IntegerToColor(base);
    const lighter = C.clone().brighten(60).color;
    const light = C.clone().brighten(28).color;
    const dark = C.clone().darken(32).color;
    const edge = C.clone().darken(58).color;
    const P = (dx, dy) => ({ x: cx + dx * R, y: cy + dy * R });
    const T1 = P(-0.55, -0.62), T2 = P(0.55, -0.62); // table (top) corners
    const M1 = P(-1, -0.05), M2 = P(1, -0.05);         // girdle (widest) points
    const IL = P(-0.45, -0.05), IR = P(0.45, -0.05);   // inner table-base points
    const B = P(0, 1);                                  // pavilion tip

    g.fillStyle(lighter); g.fillPoints([T1, T2, IR, IL], true); // table
    g.fillStyle(light);   g.fillPoints([T1, IL, M1], true);     // crown left (lit)
    g.fillStyle(dark);    g.fillPoints([T2, M2, IR], true);     // crown right (shade)
    g.fillStyle(base);    g.fillPoints([IL, IR, B], true);      // pavilion center
    g.fillStyle(light);   g.fillPoints([M1, IL, B], true);      // pavilion left
    g.fillStyle(dark);    g.fillPoints([IR, M2, B], true);      // pavilion right

    g.lineStyle(2 * S, edge, 1);
    g.strokePoints([T1, T2, M2, B, M1], true);                  // silhouette

    g.fillStyle(0xffffff, 0.45);
    g.fillPoints([P(-0.4, -0.55), P(-0.05, -0.55), P(-0.22, -0.34)], true); // glint
  }

  // fill so no cell completes a horizontal or vertical triple at start
  makeInitialGrid() {
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let t;
        do {
          t = randType();
        } while (
          (c >= 2 && g[r][c - 1] === t && g[r][c - 2] === t) ||
          (r >= 2 && g[r - 1][c] === t && g[r - 2][c] === t)
        );
        g[r][c] = t;
      }
    }
    return g;
  }

  // returns a Set of "r,c" cells that are part of any run of 3+ (rows and columns)
  findMatches() {
    const m = new Set();
    // rows
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const same = c < COLS && this.grid[r][c] !== null && this.grid[r][c] === this.grid[r][c - 1];
        if (same) { run++; } else {
          if (run >= 3) for (let k = c - run; k < c; k++) m.add(`${r},${k}`);
          run = 1;
        }
      }
    }
    // cols
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const same = r < ROWS && this.grid[r][c] !== null && this.grid[r][c] === this.grid[r - 1][c];
        if (same) { run++; } else {
          if (run >= 3) for (let k = r - run; k < r; k++) m.add(`${k},${c}`);
          run = 1;
        }
      }
    }
    return m;
  }

  onPick(p) {
    if (this.busy || this.over) return;
    const c = Math.floor((p.x - MARGIN) / CELL);
    const r = Math.floor((p.y - TOP - MARGIN) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;

    if (!this.selected) { this.select(r, c); return; }
    if (this.selected.r === r && this.selected.c === c) { this.deselect(); return; }

    const adj = Math.abs(this.selected.r - r) + Math.abs(this.selected.c - c) === 1;
    if (adj) {
      const a = this.selected;
      this.deselect();
      this.trySwap(a, { r, c });
    } else {
      this.select(r, c); // reselect a different gem
    }
  }

  select(r, c) {
    this.deselect(); // clear any previously selected gem first
    this.selected = { r, c };
    const gem = this.sprites[r][c];
    this.selectedGem = gem;
    this.selTween = this.tweens.add({
      targets: gem, scale: 1.15, duration: 320, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
    if (gem.postFX) this.selGlow = gem.postFX.addGlow(0xffffff, 6); // WebGL only; pulse still shows on Canvas
  }

  deselect() {
    this.selected = null;
    if (this.selTween) { this.selTween.stop(); this.selTween = null; }
    const gem = this.selectedGem;
    if (gem && gem.active) {
      gem.setScale(1);
      if (gem.postFX) gem.postFX.clear();
    }
    this.selectedGem = null;
  }

  swapModel(a, b) {
    [this.grid[a.r][a.c], this.grid[b.r][b.c]] = [this.grid[b.r][b.c], this.grid[a.r][a.c]];
    [this.sprites[a.r][a.c], this.sprites[b.r][b.c]] = [this.sprites[b.r][b.c], this.sprites[a.r][a.c]];
  }

  tweenTo(sprite, r, c, ms, ease) {
    this.tweens.add({ targets: sprite, x: cellX(c), y: cellY(r), duration: ms, ease: ease || "Quad.easeInOut" });
  }

  trySwap(a, b) {
    this.busy = true;
    this.swapModel(a, b);
    this.tweenTo(this.sprites[a.r][a.c], a.r, a.c, SWAP_MS);
    this.tweenTo(this.sprites[b.r][b.c], b.r, b.c, SWAP_MS);

    this.time.delayedCall(SWAP_MS, () => {
      if (this.findMatches().size > 0) {
        this.resolve();
      } else {
        // no match → swap back
        this.swapModel(a, b);
        this.tweenTo(this.sprites[a.r][a.c], a.r, a.c, SWAP_MS);
        this.tweenTo(this.sprites[b.r][b.c], b.r, b.c, SWAP_MS);
        this.time.delayedCall(SWAP_MS, () => { this.busy = false; });
      }
    });
  }

  // clear matches → gravity + refill → recurse for cascades; unlock when nothing matches
  resolve() {
    if (this.over) return;
    const matches = this.findMatches();
    if (matches.size === 0) {
      if (this.hasValidMove()) this.busy = false;
      else this.gameOver("No moves left! 🚫");
      return;
    }

    this.score += matches.size * 10;
    this.scoreText.setText("Score: " + this.score);

    matches.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      const s = this.sprites[r][c];
      if (s) this.tweens.add({ targets: s, scale: 0, duration: CLEAR_MS, onComplete: () => s.destroy() });
      this.grid[r][c] = null;
      this.sprites[r][c] = null;
    });

    this.time.delayedCall(CLEAR_MS, () => {
      if (this.over) return;
      this.collapse();
      this.time.delayedCall(FALL_MS, () => this.resolve());
    });
  }

  // per column: settle survivors to the bottom, spawn new gems above and drop them in
  collapse() {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this.grid[r][c] !== null) {
          if (r !== write) {
            this.grid[write][c] = this.grid[r][c];
            this.sprites[write][c] = this.sprites[r][c];
            this.grid[r][c] = null;
            this.sprites[r][c] = null;
            this.tweenTo(this.sprites[write][c], write, c, FALL_MS, "Quad.easeIn");
          }
          write--;
        }
      }
      // holes remain in rows [0 .. write]; fill with fresh gems dropping from above
      const holes = write + 1;
      for (let r = write; r >= 0; r--) {
        const type = randType();
        this.grid[r][c] = type;
        const sprite = this.makeGem(type, cellX(c), cellY(r) - holes * CELL);
        this.sprites[r][c] = sprite;
        this.tweenTo(sprite, r, c, FALL_MS, "Quad.easeIn");
      }
    }
  }

  fmtTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  tick() {
    if (this.over) return;
    this.timeLeft--;
    this.timerText.setText(this.fmtTime(Math.max(0, this.timeLeft)));
    if (this.timeLeft <= 10) this.timerText.setColor("#ff6b6b");
    if (this.timeLeft <= 0) this.gameOver("Time's up! ⏰");
  }

  // is any single adjacent swap able to create a match? (checked on the model only)
  hasValidMove() {
    const swap = (r1, c1, r2, c2) => {
      const t = this.grid[r1][c1];
      this.grid[r1][c1] = this.grid[r2][c2];
      this.grid[r2][c2] = t;
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) {
          swap(r, c, r, c + 1);
          const ok = this.findMatches().size > 0;
          swap(r, c, r, c + 1);
          if (ok) return true;
        }
        if (r + 1 < ROWS) {
          swap(r, c, r + 1, c);
          const ok = this.findMatches().size > 0;
          swap(r, c, r + 1, c);
          if (ok) return true;
        }
      }
    }
    return false;
  }

  gameOver(msg) {
    if (this.over) return;
    this.over = true;
    this.busy = true;
    this.timerEvent.remove();
    this.deselect();

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.78);
    this.add.text(GAME_W / 2, GAME_H / 2 - 24 * S, msg, {
      fontSize: px(30), color: "#fff", fontStyle: "bold", align: "center",
      wordWrap: { width: GAME_W - 40 * S }, padding: { y: 8 },
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, GAME_H / 2 + 26 * S, `Score: ${this.score} — click to play again`, {
      fontSize: px(16), color: "#aab", padding: { y: 6 },
    }).setOrigin(0.5);
    this.input.once("pointerdown", () => this.scene.restart());
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
  scene: Match3Game,
});

// Lose conditions: 2-minute timer runs out, or the board has no valid move.
