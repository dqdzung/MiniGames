// Chicken Shooter — a shooting-gallery (Moorhuhn-style, original art). Single Phaser scene.
// Crosshair tracks the mouse; click shoots a discrete point tested against each chicken's
// bounds. Right-click (or R) reloads (short cooldown). Score by size before time runs out.
// Chickens spawn two ways: fly across the sky, or briefly peek out from a bush (whack-a-mole).
// Some spawn "close" — bigger, lower, and in front (perspective).

const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 640 * S;
const GAME_H = 480 * S;
const GAME_SECONDS = 90;
const MAX_AMMO = 8;
const RELOAD_MS = 550; // reload cooldown; no shooting during it
const POP_CHANCE = 0.55; // fraction of spawns that peek from bushes (rest fly the sky)
const CLOSE_CHANCE = 0.25; // fraction that spawn big/near the viewer
const BUSH_Y = 0.82; // ground line as a fraction of height
const FLYER_BASE = 50; // sky flyers
const POP_BASE = 25; // bush pop-ups
const FLYER_MULT = 1.5; // flyers score 1.5x (harder moving targets)
const MIN_PTS = 10,
	MAX_PTS = 100;

class ChickenShooterGame extends Phaser.Scene {
	create() {
		this.score = 0;
		this.ammo = MAX_AMMO;
		this.reloading = false;
		this.over = false;
		this.timeLeft = GAME_SECONDS;
		this.chickens = [];
		this.sinceSpawn = 0;
		this.spawnEvery = 1000; // ms, shrinks with score

		// scenery: sky (bg color) + ground strip + bushes
		this.add
			.rectangle(0, GAME_H * BUSH_Y, GAME_W, GAME_H * (1 - BUSH_Y), 0x4a7a3a)
			.setOrigin(0, 0)
			.setDepth(3);
		this.bushX = [];
		for (let i = 0; i < 5; i++) {
			const bx = (i + 0.5) * (GAME_W / 5) + Phaser.Math.Between(-30, 30) * S;
			this.bushX.push(bx);
			this.drawBush(bx, GAME_H * BUSH_Y, Phaser.Math.Between(96, 132) * S);
		}

		this.barnX = GAME_W * 0.2;
		this.windmillX = GAME_W * 0.82;
		this.drawBarn(this.barnX, GAME_H * BUSH_Y);
		this.drawWindmill(this.windmillX, GAME_H * BUSH_Y);

		// where pop-ups can peek from: each bush, plus the barn (door + roof) and windmill (base + blades)
		this.popSpots = this.bushX.map((x) => ({ x, y: GAME_H * BUSH_Y - 34 * S }));
		this.popSpots.push({ x: this.barnX, y: GAME_H * BUSH_Y - 30 * S }); // barn doorway
		this.popSpots.push({ x: this.barnX, y: GAME_H * BUSH_Y - 116 * S }); // barn roof
		this.popSpots.push({ x: this.windmillX, y: GAME_H * BUSH_Y - 30 * S }); // windmill base
		this.popSpots.push({ x: this.windmillX, y: GAME_H * BUSH_Y - 150 * S }); // windmill blades/hub

		// HUD
		this.scoreText = this.add
			.text(16 * S, 12 * S, "Score: 0", {
				fontSize: px(20),
				color: "#ffd166",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setDepth(10);
		this.timerText = this.add
			.text(GAME_W / 2, 12 * S, this.fmtTime(this.timeLeft), {
				fontSize: px(20),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(0.5, 0)
			.setDepth(10);
		this.ammoText = this.add
			.text(GAME_W - 16 * S, 12 * S, "", {
				fontSize: px(20),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(1, 0)
			.setDepth(10);
		this.updateAmmo();

		this.timerEvent = this.time.addEvent({
			delay: 1000,
			loop: true,
			callback: () => this.tick(),
		});

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

	drawBarn(cx, groundY) {
		const g = this.add.graphics().setDepth(1);
		const w = 130 * S,
			h = 78 * S;
		const left = cx - w / 2,
			top = groundY - h;
		g.fillStyle(0x5c3a2e, 1); // roof
		g.fillPoints(
			[
				{ x: left - 8 * S, y: top },
				{ x: cx, y: top - 46 * S },
				{ x: left + w + 8 * S, y: top },
			],
			true,
		);
		g.fillStyle(0xb5341f, 1); // body
		g.fillRect(left, top, w, h);
		g.fillStyle(0x3e241b, 1); // door
		g.fillRect(cx - 18 * S, groundY - 46 * S, 36 * S, 46 * S);
		g.lineStyle(3 * S, 0xf2efe6, 1); // white trim: roof line, door frame + cross
		g.beginPath();
		g.moveTo(left - 8 * S, top);
		g.lineTo(cx, top - 46 * S);
		g.lineTo(left + w + 8 * S, top);
		g.strokePath();
		g.strokeRect(cx - 18 * S, groundY - 46 * S, 36 * S, 46 * S);
		g.lineBetween(cx - 18 * S, groundY - 46 * S, cx + 18 * S, groundY);
		g.lineBetween(cx + 18 * S, groundY - 46 * S, cx - 18 * S, groundY);
		g.fillStyle(0xf2efe6, 1); // loft window
		g.fillCircle(cx, top - 4 * S, 8 * S);
	}

	drawWindmill(cx, groundY) {
		const g = this.add.graphics().setDepth(1);
		const h = 150 * S,
			topW = 26 * S,
			botW = 48 * S;
		const topY = groundY - h;
		g.fillStyle(0x9aa0a8, 1); // tapered tower
		g.fillPoints(
			[
				{ x: cx - botW / 2, y: groundY },
				{ x: cx - topW / 2, y: topY },
				{ x: cx + topW / 2, y: topY },
				{ x: cx + botW / 2, y: groundY },
			],
			true,
		);
		g.fillStyle(0x5c3a2e, 1); // cap
		g.fillEllipse(cx, topY, topW + 12 * S, 22 * S);
		// rotating sails on the hub
		const hubY = topY - 6 * S,
			L = 60 * S,
			bw = 12 * S;
		const sails = this.add.graphics({ x: cx, y: hubY }).setDepth(1);
		sails.fillStyle(0xf2efe6, 1);
		sails.fillRect(-bw / 2, -L, bw, L);
		sails.fillRect(-bw / 2, 0, bw, L);
		sails.fillRect(-L, -bw / 2, L, bw);
		sails.fillRect(0, -bw / 2, L, bw);
		sails.fillStyle(0x8a8f98, 1);
		sails.fillCircle(0, 0, 7 * S);
		this.tweens.add({ targets: sails, angle: 360, duration: 7000, repeat: -1 });
	}

	drawBush(cx, baseY, w) {
		const g = this.add.graphics().setDepth(4);
		const dark = 0x2f5326,
			mid = 0x3c6630,
			light = 0x5a9a44;
		const r = w * 0.3;
		const blob = (dx, dy, rr, c) => {
			g.fillStyle(c, 1);
			g.fillCircle(cx + dx, baseY + dy, rr);
		};
		g.fillStyle(dark, 1);
		g.fillEllipse(cx, baseY + r * 0.35, w * 1.02, r * 1.1); // base shadow on the ground
		blob(-w * 0.34, -r * 0.05, r * 1.02, mid); // mid-green body
		blob(w * 0.34, -r * 0.05, r * 1.02, mid);
		blob(-w * 0.12, -r * 0.5, r * 1.1, mid);
		blob(w * 0.16, -r * 0.42, r * 1.0, mid);
		blob(0, -r * 0.15, r * 1.15, mid);
		blob(-w * 0.2, -r * 0.55, r * 0.5, light); // top-left highlights
		blob(w * 0.05, -r * 0.7, r * 0.42, light);
		blob(-w * 0.02, -r * 0.3, r * 0.4, light);
	}

	buildCrosshair() {
		const g = this.add.graphics().setDepth(100);
		const R = 18 * S,
			gap = 6 * S;
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

	updateScore() {
		this.scoreText.setText("Score: " + this.score);
	}
	updateAmmo() {
		this.ammoText.setText("🔫 " + this.ammo + "/" + MAX_AMMO);
	}

	tick() {
		if (this.over) return;
		this.timeLeft--;
		this.timerText.setText(this.fmtTime(Math.max(0, this.timeLeft)));
		if (this.timeLeft <= 10) this.timerText.setColor("#ff6b6b");
		if (this.timeLeft <= 0) this.gameOver();
	}

	pts(base, scale, mult) {
		return Phaser.Math.Clamp(
			Math.round((base * mult) / scale / 5) * 5,
			MIN_PTS,
			MAX_PTS,
		);
	}

	spawnChicken() {
		if (Math.random() < POP_CHANCE) this.spawnPop();
		else this.spawnFlyer();
	}

	spawnFlyer() {
		const close = Math.random() < CLOSE_CHANCE;
		const fromLeft = Math.random() < 0.5;
		const scale = close
			? Phaser.Math.FloatBetween(1.7, 2.4)
			: Phaser.Math.FloatBetween(0.7, 1.3);
		const points = this.pts(FLYER_BASE, scale, FLYER_MULT);
		const baseY = close
			? Phaser.Math.Between(GAME_H * 0.55, GAME_H * 0.72)
			: Phaser.Math.Between(48 * S, GAME_H * 0.6);
		const speed =
			(close ? Phaser.Math.Between(210, 300) : Phaser.Math.Between(120, 210)) *
			S;
		const x = fromLeft ? -60 * S : GAME_W + 60 * S;
		const sprite = this.add
			.text(x, baseY, "🐔", { fontSize: px(40), padding: { y: 6 } })
			.setOrigin(0.5)
			.setDepth(close ? 8 : 2)
			.setScale(fromLeft ? -scale : scale, scale);
		this.chickens.push({
			mode: "fly",
			sprite,
			points,
			baseY,
			vx: fromLeft ? speed : -speed,
			amp: Phaser.Math.Between(8, 36) * S,
			freq: Phaser.Math.FloatBetween(2, 4),
			phase: Math.random() * Math.PI * 2,
			t: 0,
		});
	}

	// whack-a-mole: pop into view, linger, then duck back out
	spawnPop() {
		const close = Math.random() < CLOSE_CHANCE;
		const scale = close
			? Phaser.Math.FloatBetween(1.7, 2.3)
			: Phaser.Math.FloatBetween(0.8, 1.2);
		const points = this.pts(POP_BASE, scale, 1);
		const spot = Phaser.Utils.Array.GetRandom(this.popSpots);
		const x = close ? Phaser.Math.Between(90 * S, GAME_W - 90 * S) : spot.x;
		const y = close ? GAME_H * 0.92 : spot.y; // close ones sit low; others peek from a bush/barn/windmill
		const sx = (Math.random() < 0.5 ? 1 : -1) * scale;
		const sprite = this.add
			.text(x, y, "🐔", { fontSize: px(40), padding: { y: 6 } })
			.setOrigin(0.5)
			.setDepth(close ? 8 : 5)
			.setScale(0);
		this.tweens.add({
			targets: sprite,
			scaleX: sx,
			scaleY: scale,
			duration: 130,
			ease: "Back.easeOut",
		});

		const linger = close
			? Phaser.Math.Between(1800, 2800)
			: Phaser.Math.Between(1200, 2200);
		const ch = { mode: "pop", sprite, points, leaving: false };
		ch.timer = this.time.delayedCall(linger, () => this.popOut(ch));
		this.chickens.push(ch);
	}

	popOut(ch) {
		if (ch.leaving || !ch.sprite.active) return;
		ch.leaving = true;
		const i = this.chickens.indexOf(ch);
		if (i >= 0) this.chickens.splice(i, 1); // no longer shootable once it ducks out
		this.tweens.add({
			targets: ch.sprite,
			scaleX: 0,
			scaleY: 0,
			duration: 130,
			ease: "Back.easeIn",
			onComplete: () => ch.sprite.destroy(),
		});
	}

	shoot(p) {
		if (this.reloading) return; // can't fire mid-reload
		if (this.ammo <= 0) {
			this.flashAmmo();
			return;
		}
		this.ammo--;
		this.updateAmmo();
		this.recoil();
		// topmost chicken under the crosshair wins the shot
		for (let i = this.chickens.length - 1; i >= 0; i--) {
			const ch = this.chickens[i];
			if (ch.sprite.getBounds().contains(p.x, p.y)) {
				this.hitChicken(ch, i);
				return;
			}
		}
	}

	hitChicken(ch, i) {
		this.score += ch.points;
		this.updateScore();
		this.chickens.splice(i, 1);
		if (ch.timer) ch.timer.remove(); // cancel a pending pop-out
		this.spawnEvery = Math.max(450, 1000 - this.score * 2); // gentle ramp
		this.feathers(ch.sprite.x, ch.sprite.y);
		this.scorePopup(ch.sprite.x, ch.sprite.y, ch.points);
		ch.sprite.setDepth(9); // fall in front of everything
		this.tweens.add({
			targets: ch.sprite,
			y: GAME_H + 80 * S,
			angle: Phaser.Math.Between(360, 720),
			duration: 700,
			ease: "Quad.easeIn",
			onComplete: () => ch.sprite.destroy(),
		});
	}

	feathers(x, y) {
		for (let k = 0; k < 7; k++) {
			const f = this.add
				.circle(x, y, Phaser.Math.Between(3, 7) * S, 0xfff4d6)
				.setDepth(9);
			const ang = Math.random() * Math.PI * 2,
				sp = Phaser.Math.Between(40, 130) * S;
			this.tweens.add({
				targets: f,
				x: x + Math.cos(ang) * sp,
				y: y + Math.sin(ang) * sp + 40 * S,
				alpha: 0,
				scale: 0.3,
				duration: 500,
				ease: "Quad.easeOut",
				onComplete: () => f.destroy(),
			});
		}
	}

	scorePopup(x, y, pts) {
		const t = this.add
			.text(x, y, "+" + pts, {
				fontSize: px(16),
				color: "#ffe14d",
				fontStyle: "bold",
				padding: { y: 4 },
			})
			.setOrigin(0.5)
			.setDepth(60);
		this.tweens.add({
			targets: t,
			y: y - 40 * S,
			alpha: 0,
			duration: 600,
			onComplete: () => t.destroy(),
		});
	}

	recoil() {
		this.cross.setScale(1.35);
		this.tweens.add({
			targets: this.cross,
			scale: 1,
			duration: 90,
			ease: "Quad.easeOut",
		});
	}

	reload() {
		if (this.reloading || this.ammo === MAX_AMMO) return; // already full or in progress
		this.reloading = true;
		this.ammoText.setColor("#ffd166").setText("reloading...");
		this.time.delayedCall(RELOAD_MS, () => {
			if (this.over) return;
			this.ammo = MAX_AMMO;
			this.reloading = false;
			this.ammoText.setColor("#fff");
			this.updateAmmo();
		});
	}

	flashAmmo() {
		this.ammoText.setColor("#ff6b6b").setText("reload! (right-click)");
		this.time.delayedCall(600, () => {
			if (this.over || this.reloading) return;
			this.ammoText.setColor("#fff");
			this.updateAmmo();
		});
	}

	update(time, delta) {
		if (this.over) return;
		const dt = delta / 1000;
		const p = this.input.activePointer;
		this.cross.setPosition(p.x, p.y);

		if (Phaser.Input.Keyboard.JustDown(this.rKey)) this.reload();

		this.sinceSpawn += delta;
		if (this.sinceSpawn >= this.spawnEvery) {
			this.sinceSpawn = 0;
			this.spawnChicken();
		}

		// only flyers move per-frame; pop-ups are tween/timer driven
		for (let i = this.chickens.length - 1; i >= 0; i--) {
			const ch = this.chickens[i];
			if (ch.mode !== "fly") continue;
			ch.t += dt;
			ch.sprite.x += ch.vx * dt;
			ch.sprite.y = ch.baseY + Math.sin(ch.t * ch.freq + ch.phase) * ch.amp;
			if (
				(ch.vx > 0 && ch.sprite.x > GAME_W + 64 * S) ||
				(ch.vx < 0 && ch.sprite.x < -64 * S)
			) {
				ch.sprite.destroy();
				this.chickens.splice(i, 1);
			}
		}
	}

	gameOver() {
		if (this.over) return;
		this.over = true;
		this.timerEvent.remove();
		this.chickens.forEach((ch) => {
			if (ch.timer) ch.timer.remove();
			ch.sprite.destroy();
		});
		this.chickens = [];
		this.input.setDefaultCursor("default");
		this.cross.setVisible(false);

		this.add
			.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72)
			.setDepth(200);
		this.add
			.text(GAME_W / 2, GAME_H / 2 - 24 * S, "Time's up! ⏰", {
				fontSize: px(34),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 8 },
			})
			.setOrigin(0.5)
			.setDepth(201);
		this.add
			.text(
				GAME_W / 2,
				GAME_H / 2 + 22 * S,
				`Score: ${this.score} — click to play again`,
				{
					fontSize: px(16),
					color: "#aab",
					padding: { y: 6 },
				},
			)
			.setOrigin(0.5)
			.setDepth(201);
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
