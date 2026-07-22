// Whack-a-Mole — single Phaser scene.
// Conventions: render at S× so Scale.FIT downscales (crisp on big screens);
// Scale.FIT + CENTER_BOTH keep it responsive; give emoji text `padding: { y: 6 }`.

const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 480 * S;
const GAME_H = 640 * S;

const GAME_TIME = 30; // seconds
// One thing pops per interval; 595 → 50 pops (50th at 29 750 ms, in-round; 51st after the buzzer).
// With bombs, some pops aren't scorable moles, so the mole-only ceiling is below 50 and varies.
const POP_INTERVAL = 595; // ms between pop attempts
const UP_TIME = 650; // ms a mole stays up before ducking on its own
const BOMB_CHANCE = 0.15; // fraction of pops that are bombs instead of moles
const BOMB_PENALTY = 3; // seconds knocked off the clock for whacking a bomb (ends the game at 0)

const COLS = [0.22, 0.5, 0.78];
const ROWS = [0.44, 0.63, 0.82];

class WhackAMoleGame extends Phaser.Scene {
	create() {
		this.score = 0;
		this.timeLeft = GAME_TIME;
		this.over = false;

		// field: sky band on top, grass below
		this.add.rectangle(0, 0, GAME_W, GAME_H, 0x8fd0ef).setOrigin(0);
		this.add
			.rectangle(0, GAME_H * 0.28, GAME_W, GAME_H * 0.72, 0x5fae3a)
			.setOrigin(0);

		// holes
		this.holes = [];
		for (const ry of ROWS)
			for (const cx of COLS) this.makeHole(cx * GAME_W, ry * GAME_H);

		// HUD
		this.scoreText = this.add
			.text(16 * S, 12 * S, "Score: 0", {
				fontSize: px(20),
				color: "#ffd166",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setDepth(50);
		this.timeText = this.add
			.text(GAME_W - 16 * S, 12 * S, "Time: " + GAME_TIME, {
				fontSize: px(20),
				color: "#ffd166",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(1, 0)
			.setDepth(50);

		// hammer follows the pointer
		this.hammer = this.add
			.text(GAME_W / 2, GAME_H / 2, "🔨", {
				fontSize: px(52),
				padding: { y: 8 },
			})
			.setOrigin(0.82, 0.85) // pivot at the handle grip (bottom-right of the glyph)
			.setDepth(100);
		// keep the HEAD (not the grip) under the pointer so clicking with the head hits;
		// rotation still pivots at the grip origin. Offset = grip→head vector in the glyph.
		const HEAD = 0.28;
		const offX = (0.82 - HEAD) * this.hammer.width,
			offY = (0.85 - HEAD) * this.hammer.height;
		const place = (p) => this.hammer.setPosition(p.x + offX, p.y + offY);
		place({ x: GAME_W / 2, y: GAME_H / 2 });
		this.input.setDefaultCursor("none");
		this.input.on("pointermove", place);
		this.input.on("pointerdown", (p) => {
			place(p);
			this.swing();
			// canRestart gates out the same click that ended the game (a bomb whack sets
			// this.over via its own handler, which fires just before this one)
			if (this.over && this.canRestart) this.scene.restart();
		});

		// timers
		this.popTimer = this.time.addEvent({
			delay: POP_INTERVAL,
			loop: true,
			callback: this.popRandom,
			callbackScope: this,
		});
		this.time.addEvent({
			delay: 1000,
			loop: true,
			callback: this.tick,
			callbackScope: this,
		});
	}

	makeHole(x, y) {
		const g = this.add.graphics();
		g.fillStyle(0x7a5433, 1); // dirt mound
		g.fillEllipse(x, y + 8 * S, 108 * S, 52 * S);
		g.fillStyle(0x341f0e, 1); // hole opening
		g.fillEllipse(x, y, 82 * S, 34 * S);

		const upY = y - 22 * S,
			downY = y + 64 * S;
		const mole = this.add
			.text(x, downY, "🐹", { fontSize: px(46), padding: { y: 8 } })
			.setOrigin(0.5, 0.5)
			.setDepth(10);
		// mask so the mole only shows above the hole rim (looks like it rises from inside)
		const maskG = this.make.graphics();
		maskG.fillStyle(0xffffff);
		maskG.fillRect(0, 0, GAME_W, y + 6 * S);
		mole.setMask(maskG.createGeometryMask());

		const hole = {
			x,
			y,
			mole,
			upY,
			downY,
			up: false,
			moving: false,
			bomb: false,
			duck: null,
		};
		// hit area a bit larger than the mole glyph, for forgiving whacks
		const pad = 16 * S;
		mole.setInteractive(
			new Phaser.Geom.Rectangle(
				-pad,
				-pad,
				mole.width + pad * 2,
				mole.height + pad * 2,
			),
			Phaser.Geom.Rectangle.Contains,
		);
		mole.on("pointerdown", () => this.whack(hole));
		this.holes.push(hole);
	}

	popRandom() {
		if (this.over) return;
		const down = this.holes.filter((h) => !h.up && !h.moving);
		if (!down.length) return;
		const h = Phaser.Utils.Array.GetRandom(down);
		h.bomb = Math.random() < BOMB_CHANCE;
		h.mole.setText(h.bomb ? "💣" : "🐹");
		h.up = true;
		h.moving = true;
		this.tweens.add({
			targets: h.mole,
			y: h.upY,
			duration: 130,
			ease: "Back.easeOut",
			onComplete: () => (h.moving = false),
		});
		h.duck = this.time.delayedCall(UP_TIME, () => this.duckHole(h));
	}

	duckHole(h) {
		if (!h.up) return;
		h.up = false;
		h.moving = true;
		if (h.duck) h.duck.remove();
		this.tweens.add({
			targets: h.mole,
			y: h.downY,
			duration: 110,
			ease: "Quad.easeIn",
			onComplete: () => (h.moving = false),
		});
	}

	whack(h) {
		if (this.over || !h.up) return;
		if (h.bomb) {
			this.timeLeft = Math.max(0, this.timeLeft - BOMB_PENALTY); // lose seconds
			this.timeText.setText("Time: " + this.timeLeft);
			this.boom(h.x, h.upY, "💥", 56); // bomb explosion
			this.penaltyPop(h.x, h.upY); // "-Ns" rises from behind the blast
			this.cameras.main.shake(180, 0.012);
			this.duckHole(h);
			if (this.timeLeft <= 0) this.endGame();
			return;
		}
		this.score += 1;
		this.scoreText.setText("Score: " + this.score);
		this.stun(h);
	}

	// whacked mole: a dizzy 💫 pops up out of its head (same easing as a mole leaving the
	// hole), then mole + stars fade out together
	stun(h) {
		if (h.duck) h.duck.remove();
		h.up = false;
		h.moving = true; // keep it out of the pop pool until the fade finishes
		const dizzy = this.add
			.text(h.x, h.upY - 6 * S, "💫", { fontSize: px(24), padding: { y: 8 } })
			.setOrigin(0.45)
			.setAngle(-45) // lay the swoosh horizontal instead of angled
			.setDepth(20);
		this.tweens.add({
			targets: dizzy,
			y: h.upY - 40 * S, // rise above the head
			duration: 150,
			ease: "Back.easeOut",
		});
		this.tweens.add({
			targets: [h.mole, dizzy],
			alpha: 0,
			duration: 160,
			delay: 110, // let the pop read before fading
			onComplete: () => {
				dizzy.destroy();
				h.mole.setAlpha(1).setY(h.downY); // reset for reuse (still hidden below the rim)
				h.moving = false;
			},
		});
	}

	// "-Ns" penalty label pops up out of the bomb (behind the explosion), then rises and fades
	penaltyPop(x, y) {
		const t = this.add
			.text(x, y - 6 * S, "-" + BOMB_PENALTY + "s", {
				fontSize: px(22),
				color: "#ff5a5a",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(0.5)
			.setDepth(70); // behind the explosion (depth 80)
		this.tweens.add({
			targets: t,
			y: y - 44 * S, // rise above the blast
			duration: 150,
			ease: "Back.easeOut",
		});
		this.tweens.add({
			targets: t,
			alpha: 0,
			duration: 300,
			delay: 130,
			onComplete: () => t.destroy(),
		});
	}

	boom(x, y, symbol, size = 40) {
		const b = this.add
			.text(x, y, symbol, { fontSize: px(size), padding: { y: 8 } })
			.setOrigin(0.5)
			.setDepth(80);
		this.tweens.add({
			targets: b,
			scale: { from: 0.6, to: 1.5 },
			alpha: { from: 1, to: 0 },
			duration: 320,
			onComplete: () => b.destroy(),
		});
	}

	swing() {
		// quick cock-and-release, pivoting at the handle grip; returns to rest (0°)
		this.tweens.killTweensOf(this.hammer);
		this.hammer.setAngle(0);
		this.tweens.add({
			targets: this.hammer,
			angle: -55,
			duration: 55,
			yoyo: true,
			ease: "Quad.easeOut",
		});
	}

	tick() {
		if (this.over) return;
		this.timeLeft -= 1;
		this.timeText.setText("Time: " + this.timeLeft);
		if (this.timeLeft <= 0) this.endGame();
	}

	endGame() {
		this.over = true;
		// block restart briefly so the click that ended the game (e.g. a bomb whack) can't restart it
		this.canRestart = false;
		this.time.delayedCall(350, () => (this.canRestart = true));
		this.popTimer.remove();
		this.holes.forEach((h) => this.duckHole(h));
		this.add
			.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.75)
			.setDepth(90);
		this.add
			.text(GAME_W / 2, GAME_H / 2 - 26 * S, "Time's up! ⏰", {
				fontSize: px(34),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 8 },
			})
			.setOrigin(0.5)
			.setDepth(91);
		this.add
			.text(
				GAME_W / 2,
				GAME_H / 2 + 30 * S,
				"Score: " + this.score + "\n\ntap to play again",
				{
					fontSize: px(18),
					color: "#aab",
					align: "center",
					padding: { y: 6 },
				},
			)
			.setOrigin(0.5)
			.setDepth(91);
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
	scene: WhackAMoleGame,
});
