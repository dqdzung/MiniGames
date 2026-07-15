// Mystery Boxes — pick one gift box, reveal it, then reveal the rest.
// Single Phaser scene. Each box hides a prize or a "good luck" wish.

// Render at S× resolution so Scale.FIT downscales (crisp) on big screens
// instead of upscaling a small canvas (blurry). One knob for all sizes.
const S = 2;
const px = (n) => `${n * S}px`;

// Pool of 9 box contents (shuffled each round so position is random).
const CONTENTS = [
  { win: true,  emoji: "🎁", label: "$100 Voucher" },
  { win: true,  emoji: "☕", label: "Free Coffee" },
  { win: true,  emoji: "🎟️", label: "50% Off Coupon" },
  { win: true,  emoji: "🍿", label: "Movie Ticket" },
  { win: false, emoji: "🍀", label: "Good luck\nnext time!" },
  { win: false, emoji: "🍀", label: "Good luck\nnext time!" },
  { win: false, emoji: "🍀", label: "Good luck\nnext time!" },
  { win: false, emoji: "🍀", label: "Good luck\nnext time!" },
  { win: false, emoji: "🍀", label: "Good luck\nnext time!" },
];

const COLS = 3;
const ROWS = 3; // 3x3 bingo-like grid
const BOX = 110 * S;
const GAP = 20 * S;
const MARGIN = 40 * S;
const TOP_BAR = 70 * S;
const BOTTOM_BAR = 80 * S;

const boardW = COLS * BOX + (COLS - 1) * GAP;
const boardH = ROWS * BOX + (ROWS - 1) * GAP;
const GAME_W = boardW + MARGIN * 2;
const GAME_H = boardH + MARGIN * 2 + TOP_BAR + BOTTOM_BAR;

class MysteryBoxGame extends Phaser.Scene {
  create() {
    this.picked = false;

    this.add.text(GAME_W / 2, 26 * S, "Pick a Gift Box 🎁", {
      fontSize: px(26), color: "#fff", fontStyle: "bold", padding: { y: 6 },
    }).setOrigin(0.5);
    this.hint = this.add.text(GAME_W / 2, 52 * S, "Choose one — good luck!", {
      fontSize: px(15), color: "#aab", padding: { y: 6 },
    }).setOrigin(0.5);

    // shuffle contents (Fisher-Yates)
    const deck = CONTENTS.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    this.boxes = deck.map((content, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (BOX + GAP) + BOX / 2;
      const y = TOP_BAR + MARGIN + row * (BOX + GAP) + BOX / 2;
      return this.makeBox(x, y, content);
    });
  }

  makeBox(x, y, content) {
    const container = this.add.container(x, y);
    const rect = this.add.rectangle(0, 0, BOX, BOX, 0x4e54c8).setStrokeStyle(3 * S, 0x8a8fff);
    const front = this.add.text(0, 0, "🎁", { fontSize: px(50), padding: { y: 6 } }).setOrigin(0.5);
    const emoji = this.add.text(0, -18 * S, content.emoji, { fontSize: px(40), padding: { y: 6 } }).setOrigin(0.5).setVisible(false);
    const label = this.add.text(0, 28 * S, content.label, {
      fontSize: px(13), color: "#fff", align: "center", fontStyle: "bold",
      wordWrap: { width: BOX - 14 * S }, // wrap long prize names inside the box
    }).setOrigin(0.5).setVisible(false);

    container.add([rect, front, emoji, label]);
    container.setSize(BOX, BOX).setInteractive({ useHandCursor: true });

    const box = { container, rect, front, emoji, label, content };
    container.on("pointerdown", () => this.onPick(box));
    return box;
  }

  reveal(box, chosen) {
    box.front.setVisible(false);
    box.emoji.setVisible(true);
    box.label.setVisible(true);
    // chosen box pops; the win/lose color; unchosen boxes are dimmed
    box.rect.setFillStyle(box.content.win ? 0x2a9d8f : 0x6c6f93);
    if (chosen) {
      box.rect.setStrokeStyle(4 * S, 0xffd166);
      box.container.setScale(1.12);
    } else {
      box.container.setAlpha(0.6);
    }
  }

  onPick(chosen) {
    if (this.picked) return;
    this.picked = true;
    this.boxes.forEach((b) => b.container.disableInteractive());

    this.reveal(chosen, true);

    // reveal the rest after a beat
    this.time.delayedCall(700, () => {
      this.boxes.forEach((b) => { if (b !== chosen) this.reveal(b, false); });
      this.showResult(chosen.content);
    });
  }

  showResult(content) {
    const msg = content.win
      ? `You won: ${content.label.replace("\n", " ")}! 🎉`
      : "Good luck next time! 🍀";
    this.hint.setText(msg).setColor(content.win ? "#ffd166" : "#aab").setFontSize(px(18));

    this.add.text(GAME_W / 2, GAME_H - BOTTOM_BAR / 2, "Click anywhere to play again", {
      fontSize: px(14), color: "#889",
    }).setOrigin(0.5);
    this.input.once("pointerdown", () => this.scene.restart());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#16213e",
  scale: {
    mode: Phaser.Scale.FIT,          // scale canvas to fit viewport, keep aspect ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_W,
    height: GAME_H,
  },
  scene: MysteryBoxGame,
});
