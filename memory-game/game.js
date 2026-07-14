// Memory card matching game. Single Phaser scene.
// Cards are drawn with graphics + emoji text — no image assets to load.

// Render at S× resolution so Scale.FIT downscales (crisp) on big screens
// instead of upscaling a small canvas (blurry). One knob for all sizes.
const S = 2;
const px = (n) => `${n * S}px`;

const SYMBOLS = ["🍎", "🍌", "🍇", "🍒", "🍑", "🥝", "🍍", "🥥"]; // 8 pairs max
const COLS = 4;
const ROWS = 4; // 4x4 = 16 cards = 8 pairs. Must be even.
const CARD_W = 90 * S;
const CARD_H = 110 * S;
const GAP = 16 * S;
const MARGIN = 30 * S;
const TOP_BAR = 60 * S;

const boardW = COLS * CARD_W + (COLS - 1) * GAP;
const boardH = ROWS * CARD_H + (ROWS - 1) * GAP;
const GAME_W = boardW + MARGIN * 2;
const GAME_H = boardH + MARGIN * 2 + TOP_BAR;

class MemoryScene extends Phaser.Scene {
  create() {
    this.moves = 0;
    this.matched = 0;
    this.first = null;
    this.locked = false; // input lock while a mismatched pair is showing

    this.add.text(MARGIN, 18 * S, "Memory Match", { fontSize: px(24), color: "#fff", fontStyle: "bold", padding: { y: 6 } });
    this.movesText = this.add.text(GAME_W - MARGIN, 24 * S, "Moves: 0", {
      fontSize: px(18), color: "#aab", padding: { y: 6 },
    }).setOrigin(1, 0);

    this.buildBoard();
  }

  buildBoard() {
    const pairsNeeded = (COLS * ROWS) / 2;
    // build deck: two of each symbol, then shuffle (Fisher-Yates)
    const deck = [];
    for (let i = 0; i < pairsNeeded; i++) {
      deck.push(SYMBOLS[i], SYMBOLS[i]);
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    this.cards = [];
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = MARGIN + c * (CARD_W + GAP) + CARD_W / 2;
        const y = TOP_BAR + MARGIN + r * (CARD_H + GAP) + CARD_H / 2;
        this.cards.push(this.makeCard(x, y, deck[k++]));
      }
    }
  }

  makeCard(x, y, symbol) {
    const container = this.add.container(x, y);

    const back = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x4e54c8).setStrokeStyle(2 * S, 0x8a8fff);
    const question = this.add.text(0, 0, "?", { fontSize: px(40), color: "#c7caff", padding: { y: 6 } }).setOrigin(0.5);

    const face = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xf5f5fa).setStrokeStyle(2 * S, 0xcfcfe6);
    const emoji = this.add.text(0, 0, symbol, { fontSize: px(48), padding: { y: 6 } }).setOrigin(0.5);
    face.setVisible(false);
    emoji.setVisible(false);

    container.add([back, question, face, emoji]);
    container.setSize(CARD_W, CARD_H);
    container.setInteractive({ useHandCursor: true });

    const card = { container, back, question, face, emoji, symbol, flipped: false, done: false };
    container.on("pointerdown", () => this.onCardClick(card));
    return card;
  }

  showFace(card, faceUp) {
    card.face.setVisible(faceUp);
    card.emoji.setVisible(faceUp);
    card.back.setVisible(!faceUp);
    card.question.setVisible(!faceUp);
    card.flipped = faceUp;
  }

  onCardClick(card) {
    if (this.locked || card.flipped || card.done) return;

    this.showFace(card, true);

    if (!this.first) {
      this.first = card;
      return;
    }

    // second card
    this.moves++;
    this.movesText.setText("Moves: " + this.moves);
    const first = this.first;
    this.first = null;

    if (first.symbol === card.symbol) {
      first.done = card.done = true;
      this.matched += 2;
      if (this.matched === this.cards.length) this.win();
    } else {
      this.locked = true;
      this.time.delayedCall(800, () => {
        this.showFace(first, false);
        this.showFace(card, false);
        this.locked = false;
      });
    }
  }

  win() {
    const overlay = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7);
    this.add.text(GAME_W / 2, GAME_H / 2 - 20 * S, "You win! 🎉", {
      fontSize: px(36), color: "#fff", fontStyle: "bold", padding: { y: 8 },
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, GAME_H / 2 + 24 * S, `${this.moves} moves — click to replay`, {
      fontSize: px(18), color: "#aab", padding: { y: 6 },
    }).setOrigin(0.5);
    overlay.setInteractive().on("pointerdown", () => this.scene.restart());
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
  scene: MemoryScene,
});
