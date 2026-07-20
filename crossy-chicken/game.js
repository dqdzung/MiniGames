// Crossy Chicken — hop across endless rows, dodge cars. ISOMETRIC render.
// Game logic is pure grid (col, row); rendering projects the grid to an isometric view
// (diamond tiles + drawn cubes) and depth-sorts by (col+row). Rows stream ahead / cull behind.

const S = 2;
const px = (n) => `${n * S}px`;

const COLS = 9;
const TW = 64 * S; // iso tile width on screen
const TH = 32 * S; // iso tile height (2:1)
const BLOCK_H = 26 * S; // cube height
const HW = TW / 2,
	HH = TH / 2;
const CAR_MIN = -0.5; // cars travel edge-to-edge of the road...
const CAR_MAX = COLS - 0.5;
const CAR_FADE = 0.9; // ...and fade in/out over this many columns at the edges

const GAME_W = 560 * S;
const GAME_H = 640 * S;

const HOP_MS = 95;
const LOOKAHEAD = 14;
const BEHIND = 22; // keep passed rows until they are well off the bottom of the screen
const CHICK_HALF = 0.3; // chicken half-width; a car adds its own len/2 for collision
const CHICK_SCALE = 0.8; // render the chicken a bit smaller than the cars
const ROW_HALF = 0.4; // vehicle width within a lane (rows)
const CHICK_COLOR = 0xfff3d0;

// vehicle shapes (length in columns, height) and a separate colour pool
const VEHICLE_TYPES = [
	{ len: 1.0, h: 1.0 }, // car
	{ len: 1.5, h: 1.15 }, // van
	{ len: 2.2, h: 1.2 }, // truck
	{ len: 2.0, h: 1.4 }, // bus
];
const VEHICLE_COLORS = [
	0xff5a5a, 0x4a90d9, 0xf4c542, 0x9b59b6, 0x2ecc71, 0xe67e22, 0xff8fc7,
	0x16a085,
];
// every shape × colour combination; a lane picks one at random, so colour is independent of shape
const VEHICLES = VEHICLE_TYPES.flatMap((t) =>
	VEHICLE_COLORS.map((color) => ({ ...t, color })),
);

// grid (col,row) -> screen. forward (row+) and right (col+) both recede up the screen.
const project = (col, row) => ({ x: (row - col) * HW, y: -(col + row) * HH });
const depthOf = (col, row) => -(col + row) * 10;
const GROUND_DEPTH = -100000; // all floor tiles below every moving object (tiles never overlap each other)

class CrossyChickenGame extends Phaser.Scene {
	create() {
		this.rows = new Map();
		this.maxRow = -1;
		this.roadRun = 0;
		this.score = 0;
		this.over = false;
		this.pending = null;
		this.buttonTapped = false;

		this.buildChickenTextures();
		this.buildVehicleTextures();
		for (let r = 0; r <= LOOKAHEAD; r++) this.generateRow(r);

		this.chicken = { col: Math.floor(COLS / 2), row: 0, hopping: false };
		const p0 = project(this.chicken.col, this.chicken.row);
		this.chicken.sprite = this.add
			.image(p0.x, p0.y, this.chick.key)
			.setOrigin(this.chick.originX, this.chick.originY)
			.setScale(CHICK_SCALE)
			.setDepth(depthOf(this.chicken.col, this.chicken.row) + 1);

		this.cameras.main.setScroll(p0.x - GAME_W / 2, p0.y - GAME_H * 0.6);

		// HUD pinned to the screen
		this.scoreText = this.add
			.text(16 * S, 12 * S, "Score: 0", {
				fontSize: px(20),
				color: "#ffd166",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setScrollFactor(0)
			.setDepth(1000);
		this.add
			.text(
				GAME_W / 2,
				GAME_H - 22 * S,
				"Swipe, arrow keys / WASD, or the buttons",
				{
					fontSize: px(13),
					color: "#2c4a63",
					padding: { y: 4 },
				},
			)
			.setOrigin(0.5)
			.setScrollFactor(0)
			.setDepth(1000);

		// on-screen arrows (bottom-centre, MacBook inverted-T) — same hop buffer as the keys
		const bw = 52 * S,
			bh = 42 * S,
			sp = 6 * S,
			cx = GAME_W / 2,
			rowY = GAME_H - 100 * S;
		this.makeButton(cx, rowY - bh - sp, bw, bh, "\u25B2", 0, 1); // up / forward
		this.makeButton(cx - bw - sp, rowY, bw, bh, "\u25C0", 1, 0); // left
		this.makeButton(cx, rowY, bw, bh, "\u25BC", 0, -1); // down / back
		this.makeButton(cx + bw + sp, rowY, bw, bh, "\u25B6", -1, 0); // right

		this.cursors = this.input.keyboard.createCursorKeys();
		this.keys = this.input.keyboard.addKeys("W,A,S,D");
		this.input.on("pointerdown", (p) => {
			this.downXY = { x: p.x, y: p.y };
		});
		this.input.on("pointerup", (p) => {
			if (this.buttonTapped) {
				this.buttonTapped = false;
				return;
			}
			if (this.over) {
				this.scene.restart();
				return;
			}
			if (!this.downXY) return;
			const dx = p.x - this.downXY.x,
				dy = p.y - this.downXY.y;
			if (Math.abs(dx) < 12 * S && Math.abs(dy) < 12 * S) return; // ignore taps — swipe or buttons only
			if (Math.abs(dx) > Math.abs(dy)) this.pending = [dx > 0 ? -1 : 1, 0];
			else this.pending = [0, dy < 0 ? 1 : -1];
		});
	}

	// bake an isometric cube texture per colour (top diamond + two shaded side faces)
	// draw an iso cube with its base-diamond centre at (bx,by): footprint half hw/hh, height ch
	drawCube(g, bx, by, hw, hh, ch, top, left, right, edge) {
		const Tt = { x: bx, y: by - ch - hh },
			Tr = { x: bx + hw, y: by - ch },
			Tb = { x: bx, y: by - ch + hh },
			Tl = { x: bx - hw, y: by - ch };
		const Bb = { x: bx, y: by + hh },
			Br = { x: bx + hw, y: by },
			Bl = { x: bx - hw, y: by };
		g.fillStyle(left, 1);
		g.fillPoints([Tl, Tb, Bb, Bl], true);
		g.fillStyle(right, 1);
		g.fillPoints([Tr, Tb, Bb, Br], true);
		g.fillStyle(top, 1);
		g.fillPoints([Tt, Tr, Tb, Tl], true);
		if (edge != null) {
			g.lineStyle(2 * S, edge, 1);
			g.strokePoints([Tt, Tr, Tb, Tl], true);
		}
		return { Tt, Tr, Tb, Tl };
	}

	// iso box aligned to the grid: half-extents cw (cols) x rw (rows), height h. Base centre at (bx,by).
	drawBox(g, bx, by, cw, rw, h, top, left, right) {
		const P = (dc, dr, dz) => ({
			x: bx + (dr - dc) * HW,
			y: by - (dc + dr) * HH - dz,
		});
		const At = P(-cw, -rw, h),
			Bt = P(cw, -rw, h),
			Ct = P(cw, rw, h),
			Dt = P(-cw, rw, h);
		const Ab = P(-cw, -rw, 0),
			Bb = P(cw, -rw, 0),
			Db = P(-cw, rw, 0);
		g.fillStyle(left, 1);
		g.fillPoints([At, Bt, Bb, Ab], true);
		g.fillStyle(right, 1);
		g.fillPoints([At, Dt, Db, Ab], true);
		g.fillStyle(top, 1);
		g.fillPoints([At, Bt, Ct, Dt], true);
		return { topCenter: P(0, 0, h) };
	}

	// Crossy-Road-style chicken: raised body on two legs, pink comb, wedge beak, eye, feet
	buildChickenTextures() {
		const W = Math.ceil(TW * 1.6),
			H = Math.ceil(TH + BLOCK_H * 3.6);
		const BX = W / 2,
			GROUND = H - HH - 14 * S,
			legLen = BLOCK_H * 0.55,
			BY = GROUND - legLen;
		const shade = (col) => {
			const c = Phaser.Display.Color.IntegerToColor(col);
			return [col, c.clone().darken(7).color, c.clone().darken(16).color, null];
		};
		const WHITE = shade(0xffffff),
			PINK = shade(0xff4d94),
			ORANGE = shade(0xff8c1a),
			LEG = shade(0xf08a1a);
		const g = this.add.graphics();
		g.fillStyle(0x101018, 0.16);
		g.fillEllipse(BX, GROUND + HH * 0.5, HW * 1.5, HH * 1.2); // shadow
		// legs + feet drawn BEFORE the body so it hides their tops (they appear from underneath)
		this.drawCube(
			g,
			BX - HW * 0.14,
			GROUND,
			HW * 0.05,
			HH * 0.05,
			legLen,
			...LEG,
		);
		this.drawCube(
			g,
			BX + HW * 0.14,
			GROUND,
			HW * 0.05,
			HH * 0.05,
			legLen,
			...LEG,
		);
		this.drawCube(
			g,
			BX - HW * 0.1,
			GROUND,
			HW * 0.09,
			HH * 0.05,
			BLOCK_H * 0.07,
			...ORANGE,
		); // feet (point forward)
		this.drawCube(
			g,
			BX + HW * 0.18,
			GROUND,
			HW * 0.09,
			HH * 0.05,
			BLOCK_H * 0.07,
			...ORANGE,
		);
		const bch = BLOCK_H * 0.72;
		this.drawBox(g, BX, BY, 0.23, 0.32, bch, WHITE[0], WHITE[1], WHITE[2]); // body longer front-to-back                                    // body (raised)
		const hfwd = 0.09,
			hhw = HW * 0.46,
			hhh = HH * 0.46,
			hch = BLOCK_H * 0.5;
		const headX = BX + hfwd * HW,
			headY = BY - bch - hfwd * HH; // head at the front (up-right) edge of the body
		const head = this.drawCube(g, headX, headY, hhw, hhh, hch, ...WHITE);
		const topCY = headY - hch;
		const RED = shade(0xe0322f);
		this.drawBox(
			g,
			headX,
			topCY,
			0.08,
			0.14,
			BLOCK_H * 0.18,
			RED[0],
			RED[1],
			RED[2],
		); // comb: one red ridge along the top
		const bk = { x: head.Tr.x, y: head.Tr.y }; // beak (toward road)
		g.fillStyle(0xff8c1a, 1);
		g.fillTriangle(
			bk.x - hhw * 0.12,
			bk.y - hhh * 0.08,
			bk.x + hhw * 0.58,
			bk.y - hhh * 0.38,
			bk.x + hhw * 0.06,
			bk.y + hhh * 0.52,
		);
		g.fillStyle(0xdb7614, 1);
		g.fillTriangle(
			bk.x + hhw * 0.58,
			bk.y - hhh * 0.38,
			bk.x + hhw * 0.06,
			bk.y + hhh * 0.52,
			bk.x + hhw * 0.34,
			bk.y + hhh * 0.05,
		);
		g.fillStyle(0x222226, 1);
		g.fillCircle(headX + hhw * 0.58, headY + hhh * 0.42 - hch * 0.6, 2.6 * S); // eye on the right face
		// little wing painted flat on the visible right face (left side isn't seen)
		const cw = 0.23,
			rw = 0.32;
		const wP = (dr, dz) => ({
			x: BX + (dr + cw) * HW,
			y: BY - (dr - cw) * HH - dz,
		});
		const wb = -0.1; // shift toward the back
		const wing = [
			wP(wb + 0.02, bch * 0.86),
			wP(wb + rw * 0.8, bch * 0.86),
			wP(wb + rw * 0.8, bch * 0.46),
			wP(wb + rw * 0.5, bch * 0.34),
			wP(wb + 0.02, bch * 0.36),
		];
		g.fillStyle(0xe4e4ec, 1);
		g.fillPoints(wing, true);
		g.lineStyle(2 * S, 0xc8c8d4, 1);
		g.strokePoints(wing, true);
		g.generateTexture("chick", W, H);
		g.destroy();
		this.chick = { key: "chick", originX: BX / W, originY: GROUND / H };
	}

	// bake an isometric BOX texture per vehicle (elongated along the lane); returns placement info
	buildVehicleTextures() {
		this.veh = VEHICLES.map((v, i) => {
			const key = "veh" + i,
				h = v.h * BLOCK_H,
				hl = v.len / 2;
			const top = (dc, dr) => ({ x: (dr - dc) * HW, y: -(dc + dr) * HH - h });
			const base = (dc, dr) => ({ x: (dr - dc) * HW, y: -(dc + dr) * HH });
			const At = top(-hl, -ROW_HALF),
				Bt = top(hl, -ROW_HALF),
				Ct = top(hl, ROW_HALF),
				Dt = top(-hl, ROW_HALF);
			const Ab = base(-hl, -ROW_HALF),
				Bb = base(hl, -ROW_HALF),
				Db = base(-hl, ROW_HALF);
			const pts = [At, Bt, Ct, Dt, Ab, Bb, Db];
			const minX = Math.min(...pts.map((p) => p.x)),
				minY = Math.min(...pts.map((p) => p.y));
			const maxX = Math.max(...pts.map((p) => p.x)),
				maxY = Math.max(...pts.map((p) => p.y));
			const P = (p) => ({ x: p.x - minX, y: p.y - minY });
			const c = Phaser.Display.Color.IntegerToColor(v.color);
			const side1 = c.clone().darken(22).color,
				side2 = c.clone().darken(38).color,
				edge = c.clone().darken(55).color;
			const L = (a, b, t) => ({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t,
			});
			const TL = P(At),
				TR = P(Bt),
				BR = P(Bb),
				BL = P(Ab);
			const SF = (u, vv) => L(L(P(Ab), P(Db), u), L(P(At), P(Dt), u), vv); // point on the visible end face
			const w = Math.ceil(maxX - minX),
				ht = Math.ceil(maxY - minY);
			// bake one texture; lightColor is drawn on the visible end face
			// (headlight yellow or taillight red, chosen per lane by travel direction)
			const bake = (texKey, lightColor) => {
				const g = this.add.graphics();
				g.fillStyle(side1, 1);
				g.fillPoints([P(At), P(Bt), P(Bb), P(Ab)], true); // long side
				g.fillStyle(side2, 1);
				g.fillPoints([P(At), P(Dt), P(Db), P(Ab)], true); // short side (visible end)
				g.fillStyle(v.color, 1);
				g.fillPoints([P(At), P(Bt), P(Ct), P(Dt)], true); // top
				g.lineStyle(2 * S, edge, 1);
				g.strokePoints([P(At), P(Bt), P(Ct), P(Dt)], true);
				// separate window panes along the long side (pillars between them)
				const F = (t, u) => L(L(TL, BL, u), L(TR, BR, u), t); // t=length 0..1, u=height 0(top)..1
				const uTop = 0.24,
					uBot = 0.54,
					lo = 0.08,
					span = 0.84;
				const nWin = Math.max(2, Math.round(v.len * 2));
				const slot = span / nWin;
				g.fillStyle(0xcdeafe, 1);
				for (let k = 0; k < nWin; k++) {
					const t0 = lo + k * slot + slot * 0.16,
						t1 = lo + k * slot + slot * 0.84;
					g.fillPoints(
						[F(t0, uTop), F(t1, uTop), F(t1, uBot), F(t0, uBot)],
						true,
					);
				}
				// two lights on the visible end face (dc=-hl)
				g.fillStyle(lightColor, 1);
				g.fillPoints(
					[SF(0.16, 0.4), SF(0.32, 0.4), SF(0.32, 0.22), SF(0.16, 0.22)],
					true,
				);
				g.fillPoints(
					[SF(0.68, 0.4), SF(0.84, 0.4), SF(0.84, 0.22), SF(0.68, 0.22)],
					true,
				);
				// windshield glass on the upper part of the visible end face, above the lights
				g.fillStyle(0xcdeafe, 1);
				g.fillPoints(
					[SF(0.2, 0.82), SF(0.8, 0.82), SF(0.8, 0.54), SF(0.2, 0.54)],
					true,
				);
				// wheels on the long side
				const wy = 0.92,
					wr2 = 5 * S;
				const wa = L(L(TL, BL, wy), L(TR, BR, wy), 0.24),
					wb = L(L(TL, BL, wy), L(TR, BR, wy), 0.76);
				g.fillStyle(0x222226, 1);
				g.fillCircle(wa.x, wa.y, wr2);
				g.fillCircle(wb.x, wb.y, wr2);
				g.generateTexture(texKey, w, ht);
				g.destroy();
			};
			bake(key + "h", 0xfff6c0); // headlights on the visible end
			bake(key + "t", 0xe23b3b); // taillights on the visible end
			return {
				keyHead: key + "h",
				keyTail: key + "t",
				len: v.len,
				originX: -minX / (maxX - minX),
				originY: -minY / (maxY - minY),
			};
		});
	}

	generateRow(r) {
		let type;
		if (r < 3) type = "grass";
		else if (this.roadRun >= 4)
			type = "grass"; // cap band length (max 4 lanes)
		else if (this.roadRun === 1)
			type = "road"; // min 2 lanes per road
		else type = Math.random() < 0.55 ? "road" : "grass";
		this.roadRun = type === "road" ? this.roadRun + 1 : 0;

		const row = { type, tiles: [], cars: [] };
		const base = type === "grass" ? 0x66bb5a : 0x565b64;
		const alt = base; // solid tiles (no checker)
		for (let c = 0; c < COLS; c++) {
			const p = project(c, r);
			const g = this.add.graphics().setDepth(GROUND_DEPTH);
			g.fillStyle((c + r) % 2 ? base : alt, 1);
			g.fillPoints(
				[
					{ x: p.x, y: p.y - HH },
					{ x: p.x + HW, y: p.y },
					{ x: p.x, y: p.y + HH },
					{ x: p.x - HW, y: p.y },
				],
				true,
			);
			row.tiles.push(g);
		}

		if (type === "road") {
			// dashed lane divider on the boundary with the previous lane (roadRun>=2 => row r-1 is also road),
			// so it sits BETWEEN lanes instead of under the cars
			if (this.roadRun >= 2) {
				const stripe = this.add.graphics().setDepth(GROUND_DEPTH + 1);
				stripe.fillStyle(0xf2f2f2, 0.9);
				const dl = 0.4,
					dw = 0.035,
					rd = r - 0.5; // long + thin so the road-parallel sides read clearly
				for (let c = 0; c < COLS; c++) {
					stripe.fillPoints(
						[
							project(c - dl, rd - dw),
							project(c + dl, rd - dw),
							project(c + dl, rd + dw),
							project(c - dl, rd + dw),
						],
						true,
					); // flat parallelogram on the ground plane
				}
				row.tiles.push(stripe);
			}

			row.dir = Math.random() < 0.5 ? 1 : -1;
			row.speed = Phaser.Math.FloatBetween(1.4, 2.8); // columns / second
			const veh = Phaser.Utils.Array.GetRandom(this.veh); // one vehicle type per lane
			row.veh = veh;
			// visible end face shows headlights when the car leads with it (moving right, dir<0),
			// taillights when it trails (moving left, dir>0)
			const vehKey = row.dir < 0 ? veh.keyHead : veh.keyTail;
			const hl = veh.len / 2;
			row.carMin = CAR_MIN - hl; // cars fully leave (and fade) before wrapping
			row.carMax = CAR_MAX + hl;
			row.carSpan = row.carMax - row.carMin;
			const desiredGap = veh.len + Phaser.Math.Between(3, 5); // free window ~3-5 cols regardless of length
			const count = Math.max(1, Math.round(row.carSpan / desiredGap));
			const gap = row.carSpan / count; // exact division -> uniform gaps (no seam at the wrap)
			const off = Math.random() * gap;
			for (let i = 0; i < count; i++) {
				const sprite = this.add
					.image(0, 0, vehKey)
					.setOrigin(veh.originX, veh.originY);
				row.cars.push({ c: row.carMin + off + i * gap, sprite });
			}
		}
		this.rows.set(r, row);
		this.maxRow = Math.max(this.maxRow, r);
	}

	placeCar(car, row, r) {
		const p = project(car.c, r);
		const edge = Math.min(car.c - row.carMin, row.carMax - car.c); // distance to nearer edge
		car.sprite
			.setPosition(p.x, p.y)
			.setDepth(depthOf(car.c, r) + 1)
			.setAlpha(Phaser.Math.Clamp(edge / CAR_FADE, 0, 1));
	}

	hop(dc, dr) {
		if (this.over || this.chicken.hopping) return;
		const nc = Phaser.Math.Clamp(this.chicken.col + dc, 0, COLS - 1);
		const nr = Math.max(0, this.chicken.row + dr);
		if (nc === this.chicken.col && nr === this.chicken.row) return;
		this.chicken.col = nc;
		this.chicken.row = nr;
		this.chicken.hopping = true;
		while (this.maxRow < this.chicken.row + LOOKAHEAD)
			this.generateRow(this.maxRow + 1);
		if (this.chicken.row > this.score) {
			this.score = this.chicken.row;
			this.scoreText.setText("Score: " + this.score);
		}
		const p = project(nc, nr);
		this.chicken.sprite.setDepth(depthOf(nc, nr) + 1);
		this.tweens.add({
			targets: this.chicken.sprite,
			x: p.x,
			y: p.y,
			duration: HOP_MS,
			ease: "Quad.easeOut",
			onComplete: () => {
				this.chicken.hopping = false;
			},
		});
		// little hop pop
		this.tweens.add({
			targets: this.chicken.sprite,
			scaleX: CHICK_SCALE * 0.8,
			scaleY: CHICK_SCALE * 0.62,
			duration: HOP_MS / 2,
			yoyo: true,
		});
	}

	update(time, delta) {
		if (this.over) return;
		const dt = delta / 1000;

		const jd = Phaser.Input.Keyboard.JustDown,
			c = this.cursors,
			k = this.keys;
		if (jd(c.up) || jd(k.W)) this.pending = [0, 1];
		else if (jd(c.down) || jd(k.S)) this.pending = [0, -1];
		else if (jd(c.left) || jd(k.A)) this.pending = [1, 0];
		else if (jd(c.right) || jd(k.D)) this.pending = [-1, 0];
		if (this.pending && !this.chicken.hopping) {
			const [dc, dr] = this.pending;
			this.pending = null;
			this.hop(dc, dr);
		}

		// traffic (cars move along columns and wrap)
		this.rows.forEach((row, r) => {
			if (row.type !== "road") return;
			for (const car of row.cars) {
				car.c += row.dir * row.speed * dt;
				if (row.dir > 0 && car.c > row.carMax) car.c -= row.carSpan;
				else if (row.dir < 0 && car.c < row.carMin) car.c += row.carSpan;
				this.placeCar(car, row, r);
			}
		});

		// cull rows behind
		for (const [r, row] of this.rows) {
			if (r < this.chicken.row - BEHIND) {
				row.tiles.forEach((t) => t.destroy());
				row.cars.forEach((c2) => c2.sprite.destroy());
				this.rows.delete(r);
			}
		}

		// camera follows the chicken
		const tx = this.chicken.sprite.x - GAME_W / 2;
		const ty = this.chicken.sprite.y - GAME_H * 0.6;
		this.cameras.main.scrollX = Phaser.Math.Linear(
			this.cameras.main.scrollX,
			tx,
			0.18,
		);
		this.cameras.main.scrollY = Phaser.Math.Linear(
			this.cameras.main.scrollY,
			ty,
			0.18,
		);

		// collision in grid space: a car on the chicken's row overlapping it (len-aware)
		const row = this.rows.get(this.chicken.row);
		if (row && row.type === "road") {
			for (const car of row.cars) {
				if (
					car.sprite.alpha > 0.4 &&
					Math.abs(car.c - this.chicken.col) < row.veh.len / 2 + CHICK_HALF
				) {
					this.die();
					break;
				}
			}
		}
	}

	makeButton(x, y, w, h, arrow, dc, dr) {
		const bg = this.add
			.rectangle(x, y, w, h, 0xffffff, 0.26)
			.setScrollFactor(0)
			.setDepth(500)
			.setStrokeStyle(2 * S, 0xffffff, 0.5)
			.setInteractive({ useHandCursor: true });
		this.add
			.text(x, y, arrow, {
				fontSize: px(22),
				color: "#ffffff",
				fontStyle: "bold",
				padding: { y: 6 },
			})
			.setOrigin(0.5)
			.setScrollFactor(0)
			.setDepth(501);
		bg.on("pointerdown", () => {
			if (this.over) return;
			this.pending = [dc, dr];
			this.buttonTapped = true;
			bg.setFillStyle(0xffffff, 0.5);
			this.time.delayedCall(90, () => bg.setFillStyle(0xffffff, 0.26));
		});
	}

	die() {
		if (this.over) return;
		this.over = true;
		this.chicken.sprite.setScale(0.9, 0.25); // squashed
		this.cameras.main.shake(200, 0.012);
		this.add
			.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.72)
			.setScrollFactor(0)
			.setDepth(1001);
		this.add
			.text(GAME_W / 2, GAME_H / 2 - 24 * S, "Splat! 🐔", {
				fontSize: px(34),
				color: "#fff",
				fontStyle: "bold",
				padding: { y: 8 },
			})
			.setOrigin(0.5)
			.setScrollFactor(0)
			.setDepth(1002);
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
			.setScrollFactor(0)
			.setDepth(1002);
	}
}

new Phaser.Game({
	type: Phaser.AUTO,
	parent: "game",
	backgroundColor: "#a8d8ea",
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
		width: GAME_W,
		height: GAME_H,
	},
	scene: CrossyChickenGame,
});
