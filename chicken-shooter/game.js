// Chicken Shooter — a shooting-gallery (Moorhuhn-style, original art). Single Phaser scene.
// Crosshair tracks the mouse; click shoots a discrete point tested against each chicken's
// bounds. Right-click (or R) reloads. Score by size before the timer runs out.

const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 640 * S;
const GAME_H = 480 * S;
const GAME_SECONDS = 90;
const MAX_AMMO = 8;

class ChickenShooterGame extends Phaser.Scene {
  create() {
    this.score = 0;
    this.ammo = MAX_AMMO;
    this.over = false;
    this.timeLeft = GAME_SECONDS;
    this.chickens = [];
    this.sinceSpawn = 0;
    this.spawnEvery = 1000; // ms, shrinks with score

    // scenery: sky (bg color) + ground strip + a few bushes
    this.add.rectangle(0, GAME_H * 0.82, GAME_W, GAME_H * 0.18, 0x4a7a3a).setOrigin(0, 0);
    for (let i = 0; i < 5; i++) {
      const bx = (i + 0.5) * (GAME_W / 5) + Phaser.Math.Between(-30, 30) * S;
      this.add.ellipse(bx, GAME_H * 0.82, Phaser.Math.Between(70, 120) * S, 60 * S, 0x3c6630);
    }

    // HUD
    this.scoreText = this.add.text(16 * S, 12 * S, "Score: 0", {
      fontSize: px(20), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    }).setDepth(10);
    this.timerText = this.add.text(GAME_W / 2, 12 * S, this.fmtTime(this.timeLeft), {
      fontSize: px(20), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    }).setOrigin(0.5, 0).setDepth(10);
    this.ammoText = this.add.text(GAME_W - 16 * S, 12 * S, "", {
      fontSize: px(20), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    }).setOrigin(1, 0).setDepth(10);
    this.updateAmmo();

    this.timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });

    // crosshair replaces the OS cursor
    this.input.setDefaultCursor("none");
    this.input.mouse.disableContextMenu();
    this.cross = this.buildCrosshair();

    this.rKey = this.input.keyboard.addKey("R");
    this.input.on("pointerdown", (p) => {
      if (this.over) return;
      if (p.rightButtonDown()) this.reload();
      else this.shoot(p);
    });
  }

  buildCrosshair() {
    const g = this.add.graphics().setDepth(100);
    const R = 18 * S, gap = 6 * S;
    g.lineStyle(3 * S, 0xff3b3b, 1);
    g.strokeCircle(0, 0, R);
    g.lineBetween(-R - gap, 0, -gap, 0);
    g.lineBetween(gap, 0, R + gap, 0);
    g.lineBetween(0, -R - gap, 0, -gap);
    g.lineBetween(0, gap, 0, R + gap);
    g.fillStyle(0xff3b3b, 1).fillCircle(0, 0, 2.5 * S);
    return g;
  }

  fmtTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  updateScore() { this.scoreText.setText("Score: " + this.score); }
  updateAmmo() { this.ammoText.setText("🔫 " + this.ammo + "/" + MAX_AMMO); }

  tick() {
    if (this.over) return;
    this.timeLeft--;
    this.timerText.setText(this.fmtTime(Math.max(0, this.timeLeft)));
    if (this.timeLeft <= 10) this.timerText.setColor("#ff6b6b");
    if (this.timeLeft <= 0) this.gameOver();
  }

  spawnChicken() {
    const fromLeft = Math.random() < 0.5;
    const scale = Phaser.Math.FloatBetween(0.7, 1.3);
    const points = Math.round((40 / scale) / 5) * 5; // smaller = worth more
    const baseY = Phaser.Math.Between(48 * S, GAME_H * 0.62);
    const speed = Phaser.Math.Between(120, 210) * S;
    const vx = fromLeft ? speed : -speed;
    const x = fromLeft ? -40 * S : GAME_W + 40 * S;
    const sprite = this.add.text(x, baseY, "🐔", { fontSize: px(40), padding: { y: 6 } }).setOrigin(0.5);
    sprite.setScale(fromLeft ? -scale : scale, scale); // face travel direction
    this.chickens.push({
      sprite, vx, baseY, points,
      amp: Phaser.Math.Between(8, 36) * S,
      freq: Phaser.Math.FloatBetween(2, 4),
      phase: Math.random() * Math.PI * 2,
      t: 0,
    });
  }

  shoot(p) {
    if (this.ammo <= 0) { this.flashAmmo(); return; }
    this.ammo--;
    this.updateAmmo();
    this.recoil();
    // topmost chicken under the crosshair wins the shot
    for (let i = this.chickens.length - 1; i >= 0; i--) {
      const ch = this.chickens[i];
      if (ch.sprite.getBounds().contains(p.x, p.y)) { this.hitChicken(ch, i); return; }
    }
  }

  hitChicken(ch, i) {
    this.score += ch.points;
    this.updateScore();
    this.chickens.splice(i, 1);
    this.spawnEvery = Math.max(450, 1000 - this.score * 2); // gentle ramp
    this.feathers(ch.sprite.x, ch.sprite.y);
    this.scorePopup(ch.sprite.x, ch.sprite.y, ch.points);
    this.tweens.add({
      targets: ch.sprite, y: GAME_H + 80 * S, angle: Phaser.Math.Between(360, 720),
      duration: 700, ease: "Quad.easeIn", onComplete: () => ch.sprite.destroy(),
    });
  }

  feathers(x, y) {
    for (let k = 0; k < 7; k++) {
      const f = this.add.circle(x, y, Phaser.Math.Between(3, 7) * S, 0xfff4d6).setDepth(5);
      const ang = Math.random() * Math.PI * 2, sp = Phaser.Math.Between(40, 130) * S;
      this.tweens.add({
        targets: f, x: x + Math.cos(ang) * sp, y: y + Math.sin(ang) * sp + 40 * S,
        alpha: 0, scale: 0.3, duration: 500, ease: "Quad.easeOut",
        onComplete: () => f.destroy(),
      });
    }
  }

  scorePopup(x, y, pts) {
    const t = this.add.text(x, y, "+" + pts, {
      fontSize: px(16), color: "#ffe14d", fontStyle: "bold", padding: { y: 4 },
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 40 * S, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  recoil() {
    this.cross.setScale(1.35);
    this.tweens.add({ targets: this.cross, scale: 1, duration: 90, ease: "Quad.easeOut" });
  }

  reload() {
    this.ammo = MAX_AMMO;
    this.updateAmmo();
    this.ammoText.setColor("#7CFC7C");
    this.time.delayedCall(150, () => this.ammoText.setColor("#fff"));
  }

  flashAmmo() {
    this.ammoText.setColor("#ff6b6b");
    this.ammoText.setText("reload! (right-click)");
    this.time.delayedCall(500, () => { this.ammoText.setColor("#fff"); this.updateAmmo(); });
  }

  update(time, delta) {
    if (this.over) return;
    const dt = delta / 1000;
    const p = this.input.activePointer;
    this.cross.setPosition(p.x, p.y);

    if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.reload();

    this.sinceSpawn += delta;
    if (this.sinceSpawn >= this.spawnEvery) { this.sinceSpawn = 0; this.spawnChicken(); }

    for (let i = this.chickens.length - 1; i >= 0; i--) {
      const ch = this.chickens[i];
      ch.t += dt;
      ch.sprite.x += ch.vx * dt;
      ch.sprite.y = ch.baseY + Math.sin(ch.t * ch.freq + ch.phase) * ch.amp;
      if ((ch.vx > 0 && ch.sprite.x > GAME_W + 44 * S) ||
          (ch.vx < 0 && ch.sprite.x < -44 * S)) {
        ch.sprite.destroy();
        this.chickens.splice(i, 1);
      }
    }
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    this.timerEvent.remove();
    this.chickens.forEach((ch) => ch.sprite.destroy());
    this.chickens = [];
    this.input.setDefaultCursor("default");
    this.cross.setVisible(false);

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72).setDepth(200);
    this.add.text(GAME_W / 2, GAME_H / 2 - 24 * S, "Time's up! ⏰", {
      fontSize: px(34), color: "#fff", fontStyle: "bold", padding: { y: 8 },
    }).setOrigin(0.5).setDepth(201);
    this.add.text(GAME_W / 2, GAME_H / 2 + 22 * S, `Score: ${this.score} — click to play again`, {
      fontSize: px(16), color: "#aab", padding: { y: 6 },
    }).setOrigin(0.5).setDepth(201);
    this.input.once("pointerdown", () => this.scene.restart());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#8ecae6",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: ChickenShooterGame,
});
