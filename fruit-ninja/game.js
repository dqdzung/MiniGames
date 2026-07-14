// Fruit Ninja — swipe to slice launched fruit, avoid bombs. Single Phaser scene.
// Fruit are manual projectiles (gravity). Slicing tests the pointer's frame-to-frame
// SEGMENT against each fruit circle, so fast swipes don't tunnel past a fruit.

const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 480 * S;
const GAME_H = 640 * S;

const FRUITS = [
  { emoji: "🍉", color: 0xff4d6d },
  { emoji: "🍊", color: 0xff922e },
  { emoji: "🍎", color: 0xff4d4d },
  { emoji: "🍋", color: 0xffe14d },
  { emoji: "🥝", color: 0x8bc34a },
  { emoji: "🍇", color: 0x9c4dcc },
];
const BOMB = "💣";
const BOMB_CHANCE = 0.14;

const GRAVITY = 520 * S; // px/s^2 in scaled space
const FRUIT_R = 36 * S;  // slice hit radius (forgiving)
const LIVES = 3;

// true if segment A→B passes within r of circle center C (distance²-to-segment test)
function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const hx = ax + t * dx, hy = ay + t * dy;
  const ex = cx - hx, ey = cy - hy;
  return ex * ex + ey * ey <= r * r;
}

class FruitNinja extends Phaser.Scene {
  create() {
    this.score = 0;
    this.lives = LIVES;
    this.over = false;
    this.objects = [];
    this.trail = [];
    this.lastX = null;
    this.sinceSpawn = 0;
    this.spawnEvery = 1100; // ms, shrinks with score

    this.scoreText = this.add.text(16 * S, 12 * S, "Score: 0", {
      fontSize: px(20), color: "#ffd166", fontStyle: "bold", padding: { y: 6 },
    });
    this.livesText = this.add.text(GAME_W - 16 * S, 12 * S, "❤️".repeat(this.lives), {
      fontSize: px(20), padding: { y: 6 },
    }).setOrigin(1, 0);
    this.add.text(GAME_W / 2, GAME_H - 22 * S, "Swipe to slice — avoid 💣", {
      fontSize: px(13), color: "#889", padding: { y: 4 },
    }).setOrigin(0.5);

    this.trailGfx = this.add.graphics();
  }

  spawnWave() {
    const n = Phaser.Math.Between(1, 3);
    for (let i = 0; i < n; i++) this.spawnObject();
  }

  spawnObject() {
    const isBomb = Math.random() < BOMB_CHANCE;
    const fruit = isBomb ? null : FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const x = Phaser.Math.Between(FRUIT_R * 2, GAME_W - FRUIT_R * 2);
    const dir = x < GAME_W / 2 ? 1 : -1; // aim back toward center so it stays on screen
    this.objects.push({
      x, y: GAME_H + FRUIT_R,
      vx: dir * Phaser.Math.Between(40, 150) * S,
      vy: -Phaser.Math.Between(600, 760) * S,
      spin: Phaser.Math.FloatBetween(-5, 5),
      r: FRUIT_R,
      bomb: isBomb,
      color: isBomb ? 0x888888 : fruit.color,
      sprite: this.add.text(x, GAME_H + FRUIT_R, isBomb ? BOMB : fruit.emoji, {
        fontSize: px(46), padding: { y: 6 },
      }).setOrigin(0.5),
    });
  }

  handleSlice() {
    const p = this.input.activePointer;
    if (!p.isDown) { this.lastX = null; this.trail.length = 0; return; }

    if (this.lastX != null) {
      for (let i = this.objects.length - 1; i >= 0; i--) {
        const o = this.objects[i];
        if (segHitsCircle(this.lastX, this.lastY, p.x, p.y, o.x, o.y, o.r)) {
          this.sliceObject(o, i);
          if (this.over) return;
        }
      }
    }
    this.lastX = p.x; this.lastY = p.y;
    this.trail.push({ x: p.x, y: p.y });
    if (this.trail.length > 12) this.trail.shift();
  }

  sliceObject(o, i) {
    if (o.bomb) { this.gameOver("Boom! 💣"); return; }
    this.score++;
    this.scoreText.setText("Score: " + this.score);
    this.spawnEvery = Math.max(600, 1100 - this.score * 8);
    this.splatter(o);
    o.sprite.destroy();
    this.objects.splice(i, 1);
  }

  splatter(o) {
    for (let k = 0; k < 8; k++) {
      const dot = this.add.circle(o.x, o.y, Phaser.Math.Between(4, 9) * S, o.color);
      const ang = Math.random() * Math.PI * 2;
      const sp = Phaser.Math.Between(60, 190) * S;
      this.tweens.add({
        targets: dot, x: o.x + Math.cos(ang) * sp, y: o.y + Math.sin(ang) * sp,
        alpha: 0, scale: 0.2, duration: 420, ease: "Quad.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  drawTrail() {
    const g = this.trailGfx;
    g.clear();
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const a = i / n; // newest segment = thickest/brightest
      g.lineStyle((2 + a * 10) * S, 0xffffff, a);
      g.beginPath();
      g.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
      g.lineTo(this.trail[i].x, this.trail[i].y);
      g.strokePath();
    }
  }

  loseLife() {
    this.lives--;
    this.livesText.setText("❤️".repeat(Math.max(0, this.lives)));
    this.cameras.main.shake(150, 0.008);
    if (this.lives <= 0) this.gameOver("Game Over");
  }

  update(time, delta) {
    if (this.over) return;
    const dt = delta / 1000;

    this.handleSlice();
    if (this.over) { this.trailGfx.clear(); return; }
    this.drawTrail();

    this.sinceSpawn += delta;
    if (this.sinceSpawn >= this.spawnEvery) { this.sinceSpawn = 0; this.spawnWave(); }

    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      o.vy += GRAVITY * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      // bounce off the side walls so fruit never fly off-screen sideways
      if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx); }
      else if (o.x > GAME_W - o.r) { o.x = GAME_W - o.r; o.vx = -Math.abs(o.vx); }
      o.sprite.setPosition(o.x, o.y);
      o.sprite.rotation += o.spin * dt;
      if (o.y > GAME_H + o.r * 2 && o.vy > 0) { // fell back off the bottom
        if (!o.bomb) this.loseLife();
        o.sprite.destroy();
        this.objects.splice(i, 1);
        if (this.over) return;
      }
    }
  }

  gameOver(msg) {
    if (this.over) return;
    this.over = true;
    this.objects.forEach((o) => o.sprite.destroy());
    this.objects = [];
    this.trail = [];
    this.trailGfx.clear();

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.78);
    this.add.text(GAME_W / 2, GAME_H / 2 - 24 * S, msg, {
      fontSize: px(34), color: "#fff", fontStyle: "bold", padding: { y: 8 },
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, GAME_H / 2 + 22 * S, `Score: ${this.score} — click to play again`, {
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
  scene: FruitNinja,
});
