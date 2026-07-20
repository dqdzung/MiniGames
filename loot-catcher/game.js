// Loot Catcher — move the basket to catch rewards, dodge bombs. Single Phaser scene.
// Falling items are moved manually each frame; catch = simple AABB overlap with the basket.

// Render at S× resolution so Scale.FIT downscales (crisp) on big screens instead of
// upscaling a small canvas (blurry). Geometry + speeds scale by S; times (ms) + score don't.
const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 480 * S;
const GAME_H = 640 * S;

// caught → +points. Rarer (lower weight) is worth more — keep weight↓ / value↑.
const REWARDS = [
	{ emoji: "🍒", weight: 45, value: 10 },
	{ emoji: "🍎", weight: 28, value: 20 },
	{ emoji: "🎁", weight: 15, value: 40 },
	{ emoji: "💎", weight: 8, value: 75 },
	{ emoji: "⭐", weight: 4, value: 150 },
];
const BOMB = "💣"; // caught → lose a life
const BOMB_CHANCE = 0.5;

const BASKET_Y = GAME_H - 60 * S;
const BASKET_HALF = 42 * S; // horizontal catch radius
const ITEM_HALF = 20 * S;
const MOVE_SPEED = 680 * S; // px/s for keyboard control

class CatchGame extends Phaser.Scene {
	create() {
		this.score = 0;
		this.lives = 3;
		this.over = false;
		this.items = [];

		// difficulty knobs — ramp up over time. ponytail: linear ramp, swap for a curve if it feels off.
		this.fallSpeed = 160 * S; // px/s, grows with score
		this.spawnEvery = 900; // ms between spawns, shrinks with score
		this.sinceSpawn = 0;

		this.scoreText = this.add.text(16 * S, 12 * S, "Score: 0", {
			fontSize: px(20),
			color: "#ffd166",
			fontStyle: "bold",
			padding: { y: 6 },
		});
		this.livesText = this.add
			.text(GAME_W - 16 * S, 12 * S, "❤️".repeat(this.lives), {
				fontSize: px(20),
				padding: { y: 6 },
			})
			.setOrigin(1, 0);

		// basket
		this.basket = this.add
			.text(GAME_W / 2, BASKET_Y, "🧺", { fontSize: px(56), padding: { y: 8 } })
			.setOrigin(0.5);

		// controls: keyboard + pointer (works for touch)
		this.cursors = this.input.keyboard.createCursorKeys();
		this.keys = this.input.keyboard.addKeys("A,D");
		this.input.on("pointermove", (p) => {
			if (!this.over)
				this.basket.x = Phaser.Math.Clamp(
					p.x,
					BASKET_HALF,
					GAME_W - BASKET_HALF,
				);
		});

		this.add
			.text(GAME_W / 2, GAME_H - 20 * S, "← → or drag to move", {
				fontSize: px(13),
				color: "#778",
				padding: { y: 4 },
			})
			.setOrigin(0.5);
	}

	pickReward() {
		// weighted pick: roll into the cumulative weight range
		const total = REWARDS.reduce((s, r) => s + r.weight, 0);
		let roll = Math.random() * total;
		for (const r of REWARDS) if ((roll -= r.weight) < 0) return r;
		return REWARDS[0];
	}

	spawnItem() {
		const isBomb = Math.random() < BOMB_CHANCE;
		const reward = isBomb ? null : this.pickReward();
		const symbol = isBomb ? BOMB : reward.emoji;
		const value = isBomb ? 0 : reward.value;
		const x = Phaser.Math.Between(
			ITEM_HALF + 8 * S,
			GAME_W - ITEM_HALF - 8 * S,
		);
		const t = this.add
			.text(x, -ITEM_HALF, symbol, { fontSize: px(34), padding: { y: 6 } })
			.setOrigin(0.5);
		// value tag under each reward (bombs get none)
		const label = isBomb
			? null
			: this.add
					.text(x, t.y + 22 * S, "+" + value, {
						fontSize: px(13),
						color: "#ffd166",
						fontStyle: "bold",
						padding: { y: 2 },
					})
					.setOrigin(0.5);
		this.items.push({ t, bomb: isBomb, value, label });
	}

	update(time, delta) {
		if (this.over) return;
		const dt = delta / 1000;

		// keyboard movement
		let dir = 0;
		if (this.cursors.left.isDown || this.keys.A.isDown) dir -= 1;
		if (this.cursors.right.isDown || this.keys.D.isDown) dir += 1;
		if (dir)
			this.basket.x = Phaser.Math.Clamp(
				this.basket.x + dir * MOVE_SPEED * dt,
				BASKET_HALF,
				GAME_W - BASKET_HALF,
			);

		// spawn on a shrinking interval
		this.sinceSpawn += delta;
		if (this.sinceSpawn >= this.spawnEvery) {
			this.sinceSpawn = 0;
			this.spawnItem();
		}

		// move + resolve items (iterate backwards for safe removal)
		for (let i = this.items.length - 1; i >= 0; i--) {
			const item = this.items[i];
			item.t.y += this.fallSpeed * dt;
			if (item.label) item.label.y = item.t.y + 22 * S;

			const caught =
				item.t.y >= BASKET_Y - 24 * S &&
				item.t.y <= BASKET_Y + 24 * S &&
				Math.abs(item.t.x - this.basket.x) < BASKET_HALF + ITEM_HALF;

			if (caught) {
				this.resolveCatch(item);
				item.t.destroy();
				item.label?.destroy();
				this.items.splice(i, 1);
			} else if (item.t.y > GAME_H + ITEM_HALF) {
				if (!item.bomb) this.loseLife(); // missed reward hurts; missed bomb is fine
				item.t.destroy();
				item.label?.destroy();
				this.items.splice(i, 1);
			}
			if (this.over) break; // gameOver cleared the list — stop iterating
		}
	}

	loseLife() {
		this.lives--;
		this.livesText.setText("❤️".repeat(Math.max(0, this.lives)));
		this.cameras.main.shake(150, 0.01);
		if (this.lives <= 0) this.gameOver();
	}

	resolveCatch(item) {
		if (item.bomb) {
			this.loseLife();
		} else {
			this.score += item.value;
			this.scoreText.setText("Score: " + this.score);
			// ramp difficulty per 200 points — big threshold keeps it gradual despite varied values
			const level = Math.floor(this.score / 200);
			this.fallSpeed = (160 + level * 40) * S;
			this.spawnEvery = Math.max(400, 900 - level * 80);
		}
	}

	gameOver() {
		this.over = true;
		this.items.forEach((it) => {
			it.t.destroy();
			it.label?.destroy();
		});
		this.items = [];
		this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.75);
		this.add
			.text(GAME_W / 2, GAME_H / 2 - 24 * S, "Game Over 💥", {
				fontSize: px(36),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 8 },
			})
			.setOrigin(0.5);
		this.add
			.text(
				GAME_W / 2,
				GAME_H / 2 + 22 * S,
				`Score: ${this.score} — click to replay`,
				{ fontSize: px(18), color: "#aab", padding: { y: 6 } },
			)
			.setOrigin(0.5);
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
	scene: CatchGame,
});
