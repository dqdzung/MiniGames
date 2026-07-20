// Gold Miner — a claw swings from the top; click to fire it down the current angle,
// grab gold/gems/rocks (heavier = slower reel-in), and bank their value before time runs out.
// Single Phaser scene. Claw is a small state machine: swing -> extend -> retract -> swing.

const S = 2;
const px = (n) => `${n * S}px`;

const GAME_W = 480 * S;
const GAME_H = 640 * S;
const GAME_SECONDS = 60;

const PIVOT = { x: GAME_W / 2, y: 66 * S }; // where the rope hangs from
const DIRT_Y = 168 * S; // top of the dirt
const NO_SPAWN_H = 65 * S; // dead band at the top of the mine (no loot spawns here)
const SPAWN_TOP = DIRT_Y + NO_SPAWN_H; // loot only spawns below this

const MAX_ANG = 1.15; // rad, swing half-range
const SWING_SPEED = 1.8; // rad/s of the sine swing
const SWING_LEN = 30 * S; // rope length while idle
const MAX_LEN = 660 * S; // furthest the claw reaches
const EXTEND_SPEED = 640 * S;
const RETRACT_SPEED = 380 * S;
const HOOK_R = 12 * S; // grab radius of the claw
const CLAW_REACH = 15 * S; // claw mouth sits this far below the rope ring

const STEP = 0.4; // size & weight increase per tier — one knob keeps the steps consistent

// a family of same-emoji loot: size, weight and value climb evenly by tier; spawn is per-tier
const tiers = (emoji, { value0, valueStep, scale0, weight0, spawns }) =>
	spawns.map((spawn, i) => ({
		emoji,
		value: value0 + valueStep * i,
		scale: Math.round((scale0 + STEP * i) * 10) / 10,
		weight: Math.round((weight0 + STEP * i) * 10) / 10,
		spawn,
	}));

const LOOT = [
	...tiers("💰", {
		value0: 50,
		valueStep: 50,
		scale0: 0.8,
		weight0: 0.8,
		spawns: [20, 22, 10, 4],
	}), // gold
	...tiers("🪨", {
		value0: 5,
		valueStep: 5,
		scale0: 1.0,
		weight0: 1.4,
		spawns: [14, 14, 9, 6],
	}), // rocks (bigger + heavier)
	{ emoji: "💎", value: 300, weight: 0.6, scale: 0.9, spawn: 2 }, // diamond (rarest, top value, fast)
	{ emoji: "💣", value: 0, weight: 1.0, scale: 1.0, spawn: 6, bomb: true }, // bomb (detonates on grab)
];
const ITEM_COUNT = 11;

class GoldMinerGame extends Phaser.Scene {
	create() {
		this.score = 0;
		this.over = false;
		this.timeLeft = GAME_SECONDS;
		this.state = "swing";
		this.theta = 0;
		this.len = SWING_LEN;
		this.swingT = 0;
		this.carry = null;
		this.items = [];

		// scenery
		this.cameras.main.setBackgroundColor("#2e2119");
		this.add
			.rectangle(0, DIRT_Y, GAME_W, GAME_H - DIRT_Y, 0x6b4f38)
			.setOrigin(0, 0);
		this.add.rectangle(0, DIRT_Y, GAME_W, 4 * S, 0x8a6a4a).setOrigin(0, 0); // dirt surface line
		this.add
			.text(PIVOT.x, 58 * S, "👷", { fontSize: px(34), padding: { y: 6 } })
			.setOrigin(0.5)
			.setDepth(6);

		// HUD (matches the other games: score gold, timer white)
		this.scoreText = this.add
			.text(16 * S, 12 * S, "Score: 0", {
				fontSize: px(20),
				color: "#ffd166",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setDepth(10);
		this.timerText = this.add
			.text(GAME_W - 16 * S, 12 * S, this.fmtTime(this.timeLeft), {
				fontSize: px(20),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(1, 0)
			.setDepth(10);
		this.add
			.text(GAME_W / 2, GAME_H - 20 * S, "Click / tap to drop the claw", {
				fontSize: px(13),
				color: "#cbbfa8",
				padding: { y: 4 },
			})
			.setOrigin(0.5)
			.setDepth(10);

		this.timerEvent = this.time.addEvent({
			delay: 1000,
			loop: true,
			callback: () => this.tick(),
		});

		for (let i = 0; i < ITEM_COUNT; i++) this.spawnItem();

		this.hookGfx = this.add.graphics().setDepth(4);

		this.input.on("pointerdown", () => {
			if (!this.over && this.state === "swing") this.state = "extend";
		});
	}

	fmtTime(s) {
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
	}

	tick() {
		if (this.over) return;
		this.timeLeft--;
		this.timerText.setText(this.fmtTime(Math.max(0, this.timeLeft)));
		if (this.timeLeft <= 10) this.timerText.setColor("#ff6b6b");
		if (this.timeLeft <= 0) this.gameOver();
	}

	pickLoot() {
		const total = LOOT.reduce((sum, l) => sum + l.spawn, 0);
		let roll = Math.random() * total;
		for (const l of LOOT) if ((roll -= l.spawn) < 0) return l;
		return LOOT[0];
	}

	spawnItem() {
		const type = this.pickLoot();
		const r = 20 * S * type.scale;
		// find a spot that doesn't overlap existing loot (and stays fully on screen)
		let x,
			y,
			tries = 0;
		do {
			x = Phaser.Math.Between(40 * S + r, GAME_W - 40 * S - r);
			y = Phaser.Math.Between(SPAWN_TOP + r, GAME_H - r - 26 * S);
			tries++;
		} while (
			tries < 40 &&
			this.items.some(
				(it) =>
					Phaser.Math.Distance.Between(x, y, it.x, it.y) < r + it.r + 8 * S,
			)
		);
		const sprite = this.add
			.text(x, y, type.emoji, {
				fontSize: px(34 * type.scale),
				padding: { y: 6 },
			})
			.setOrigin(0.5)
			.setDepth(2);
		this.items.push({
			sprite,
			x,
			y,
			r,
			value: type.value,
			weight: type.weight,
			bomb: type.bomb,
		});
	}

	hookTip() {
		return {
			x: PIVOT.x + Math.sin(this.theta) * this.len,
			y: PIVOT.y + Math.cos(this.theta) * this.len,
		};
	}

	// the actual grabbing point: the claw mouth, a bit below the rope ring
	clawPoint() {
		const tip = this.hookTip();
		return {
			x: tip.x + Math.sin(this.theta) * CLAW_REACH,
			y: tip.y + Math.cos(this.theta) * CLAW_REACH,
		};
	}

	drawHook(tip) {
		const g = this.hookGfx;
		g.clear();
		// rope
		g.lineStyle(3 * S, 0x9a9a9a, 1);
		g.lineBetween(PIVOT.x, PIVOT.y, tip.x, tip.y);
		// local frame: u = down along the rope, v = perpendicular (right). w() maps local -> world.
		const ux = Math.sin(this.theta),
			uy = Math.cos(this.theta);
		const vx = Math.cos(this.theta),
			vy = -Math.sin(this.theta);
		const w = (pv, pu) => ({
			x: tip.x + vx * pv * S + ux * pu * S,
			y: tip.y + vy * pv * S + uy * pu * S,
		});
		// ring where the rope attaches
		g.lineStyle(2.5 * S, 0xd0d0d8, 1);
		g.strokeCircle(tip.x, tip.y, 4 * S);
		// shaft + two prongs that curl inward at the tips (hook shape)
		g.lineStyle(4 * S, 0xd0d0d8, 1);
		g.strokePoints([w(0, 2), w(0, 7)], false);
		const prong = (sgn) =>
			g.strokePoints(
				[
					w(0, 6),
					w(sgn * 2.5, 9),
					w(sgn * 6, 12),
					w(sgn * 9, 15),
					w(sgn * 9, 18),
					w(sgn * 5, 20),
				],
				false,
			);
		prong(1);
		prong(-1);
	}

	update(time, delta) {
		if (this.over) return;
		const dt = delta / 1000;

		if (this.state === "swing") {
			this.swingT += dt;
			this.theta = MAX_ANG * Math.sin(this.swingT * SWING_SPEED);
			this.len = SWING_LEN;
		} else if (this.state === "extend") {
			this.len += EXTEND_SPEED * dt;
			const claw = this.clawPoint();
			// grab the first item the claw reaches
			for (let i = this.items.length - 1; i >= 0; i--) {
				const it = this.items[i];
				if (
					Phaser.Math.Distance.Between(claw.x, claw.y, it.x, it.y) <
					HOOK_R + it.r
				) {
					this.items.splice(i, 1);
					if (it.bomb) {
						this.detonate(it); // reels back empty
					} else {
						this.carry = it;
						it.sprite.setDepth(5);
					}
					this.state = "retract";
					break;
				}
			}
			// hit the limits → reel back empty
			if (
				this.state === "extend" &&
				(this.len >= MAX_LEN ||
					claw.y >= GAME_H - 8 * S ||
					claw.x <= 8 * S ||
					claw.x >= GAME_W - 8 * S)
			) {
				this.state = "retract";
			}
		} else if (this.state === "retract") {
			const sp = this.carry
				? RETRACT_SPEED / this.carry.weight
				: RETRACT_SPEED * 1.8;
			this.len -= sp * dt;
			if (this.carry) {
				const claw = this.clawPoint();
				this.carry.sprite.setPosition(claw.x, claw.y);
			}
			if (this.len <= SWING_LEN) {
				this.len = SWING_LEN;
				if (this.carry) {
					this.score += this.carry.value;
					this.scoreText.setText("Score: " + this.score);
					this.scorePopup(PIVOT.x, PIVOT.y + 30 * S, this.carry.value);
					this.carry.sprite.destroy();
					this.carry = null;
					this.spawnItem(); // keep the field populated
				}
				this.state = "swing";
			}
		}

		this.drawHook(this.hookTip());
	}

	detonate(bomb) {
		const bx = bomb.sprite.x,
			by = bomb.sprite.y,
			AOE = 130 * S;
		bomb.sprite.destroy();
		this.explosion(bx, by, AOE);
		this.cameras.main.shake(180, 0.012);
		// destroy every loot within the blast radius
		for (let i = this.items.length - 1; i >= 0; i--) {
			const it = this.items[i];
			if (Phaser.Math.Distance.Between(bx, by, it.x, it.y) <= AOE) {
				it.sprite.destroy();
				this.items.splice(i, 1);
			}
		}
		while (this.items.length < ITEM_COUNT) this.spawnItem(); // refill the field
	}

	explosion(x, y, radius) {
		const blast = this.add
			.circle(x, y, radius, 0xff7b00, 0.45)
			.setDepth(7)
			.setScale(0.2);
		this.tweens.add({
			targets: blast,
			scale: 1,
			alpha: 0,
			duration: 350,
			onComplete: () => blast.destroy(),
		});
		const boom = this.add
			.text(x, y, "💥", { fontSize: px(50), padding: { y: 6 } })
			.setOrigin(0.5)
			.setDepth(8)
			.setScale(0.5);
		this.tweens.add({
			targets: boom,
			scale: 1.4,
			alpha: 0,
			duration: 420,
			onComplete: () => boom.destroy(),
		});
	}

	scorePopup(x, y, pts) {
		const t = this.add
			.text(x, y, "+" + pts, {
				fontSize: px(18),
				color: "#ffe14d",
				fontStyle: "bold",
				padding: { y: 4 },
			})
			.setOrigin(0.5)
			.setDepth(11);
		this.tweens.add({
			targets: t,
			y: y - 40 * S,
			alpha: 0,
			duration: 700,
			onComplete: () => t.destroy(),
		});
	}

	gameOver() {
		if (this.over) return;
		this.over = true;
		this.timerEvent.remove();

		this.add
			.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.74)
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
	backgroundColor: "#2e2119",
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
		width: GAME_W,
		height: GAME_H,
	},
	scene: GoldMinerGame,
});
