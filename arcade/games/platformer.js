// Platformer, ported from platformer/platformer.py.
// Physics run once per fixed 60 Hz tick with the original per-frame constants. Like pygame's
// integer Rects, positions are rounded after every move.
//
// Changes from the original:
// - The original's "Game Over! Press R to Restart" put the player back at the start with the
//   collected coins kept, as often as you liked. Here that restart costs one of 3 lives.
// - The original crashed after level 2 (create_level(3) returned None); clearing level 2 now wins.
// - The player could walk off the left/right edge of the screen; they are now kept on it.
// - A jump pressed up to JUMP_BUFFER ticks before landing still happens on landing, which makes
//   touch play forgiving. The jump itself is unchanged.

const W = 800;
const H = 600;
const PLAYER_SIZE = 32;
const JUMP_POWER = -20;
const MOVE_SPEED = 7;
const GRAVITY = 0.6;
const START_X = 50;
const START_Y = H - 100;
const LIVES = 3;
const LEVEL_COUNT = 2;
const LEVEL_PAUSE = 120; // the original's 2 s "Level Complete!" pause
const DEATH_PAUSE = 75;
const JUMP_BUFFER = 6;

const BLACK = '#000';
const WHITE = '#fff';
const GREEN = '#00ff00';
const BLUE = '#0000ff';
const BLUE_EDGE = '#6f8cff';
const RED = '#ff0000';
const BROWN = '#8b4513';
const BROWN_EDGE = '#c0702e';
const YELLOW = '#ffff00';
const PURPLE = '#800080';
const PURPLE_EDGE = '#c040c0';
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'platformer',
  title: 'PLATFORMER',
  width: W,
  height: H,
  players: 1,
  keyboard: {
    p1: {
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fire: ['Space'],
    },
  },
  keyHints: { stick: 'ARROWS', fire: 'SPACE' },
};

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const rect = (x, y, w, h) => ({ x, y, w, h });

function createLevel(levelNum) {
  if (levelNum === 1) {
    return {
      platforms: [
        rect(0, H - 40, W, 40),
        rect(100, 450, 200, 20),
        rect(400, 350, 200, 20),
        rect(200, 250, 200, 20),
        rect(500, 150, 200, 20),
      ],
      coins: [rect(150, 430, 16, 16), rect(450, 330, 16, 16), rect(250, 230, 16, 16), rect(550, 130, 16, 16), rect(700, H - 60, 16, 16)],
      spikes: [],
      movers: [],
    };
  }
  return {
    platforms: [
      rect(0, H - 40, 300, 40),
      rect(350, H - 40, 300, 40),
      rect(700, H - 40, 100, 40),
      rect(100, 450, 200, 20),
      rect(350, 390, 200, 20),
      rect(150, 330, 150, 20),
      rect(350, 270, 200, 20),
      rect(150, 210, 150, 20),
      rect(350, 150, 200, 20),
      rect(550, 150, 150, 20),
      rect(100, 150, 150, 20),
      rect(250, 330, 50, 20),
      rect(500, 330, 50, 20),
      rect(250, 210, 50, 20),
      rect(300, 520, 50, 20),
    ],
    coins: [
      rect(150, 430, 16, 16),
      rect(400, 370, 16, 16),
      rect(200, 310, 16, 16),
      rect(400, 250, 16, 16),
      rect(200, 190, 16, 16),
      rect(400, 130, 16, 16),
      rect(600, 130, 16, 16),
      rect(150, 130, 16, 16),
      rect(400, H - 60, 16, 16),
    ],
    spikes: [rect(310, H - 60, 30, 20), rect(540, 290, 20, 10)],
    movers: [new MovingPlatform(200, 250, 150, 20, 1, 0, 100, 0)],
  };
}

class MovingPlatform {
  constructor(x, y, w, h, xSpeed, ySpeed, xRange, yRange) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.xSpeed = xSpeed;
    this.ySpeed = ySpeed;
    this.originalX = x;
    this.originalY = y;
    this.xRange = xRange;
    this.yRange = yRange;
  }

  clone() {
    const copy = Object.create(MovingPlatform.prototype);
    return Object.assign(copy, this);
  }

  update() {
    this.x += this.xSpeed;
    this.y += this.ySpeed;
    if (this.xRange > 0) {
      if (this.x > this.originalX + this.xRange) this.xSpeed = -Math.abs(this.xSpeed);
      else if (this.x < this.originalX) this.xSpeed = Math.abs(this.xSpeed);
    }
    if (this.yRange > 0) {
      if (this.y > this.originalY + this.yRange) this.ySpeed = -Math.abs(this.ySpeed);
      else if (this.y < this.originalY) this.ySpeed = Math.abs(this.ySpeed);
    }
  }
}

class Player {
  constructor() {
    this.x = START_X;
    this.y = START_Y;
    this.w = PLAYER_SIZE;
    this.h = PLAYER_SIZE;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
  }

  clone() {
    return Object.assign(new Player(), this);
  }

  jump() {
    if (!this.onGround) return false;
    this.vy = JUMP_POWER;
    this.y -= 2; // the original's small "jump buffer" that unsticks the player from the platform
    return true;
  }

  /** One frame of the original Player.update: gravity, then x and y moves with collisions. */
  update(platforms, movers) {
    this.vy += GRAVITY;

    this.x = Math.round(this.x + this.vx);
    for (const p of platforms) this.pushOutSideways(p);
    for (const p of movers) this.pushOutSideways(p);
    this.x = Math.max(0, Math.min(W - this.w, this.x));

    this.y = Math.round(this.y + this.vy);
    this.onGround = false;
    for (const p of platforms) this.pushOutVertically(p);
    for (const p of movers) this.pushOutVertically(p);
  }

  pushOutSideways(p) {
    if (!overlaps(this, p)) return;
    if (this.vx > 0) this.x = p.x - this.w;
    else if (this.vx < 0) this.x = p.x + p.w;
  }

  pushOutVertically(p) {
    if (!overlaps(this, p)) return;
    if (this.vy > 0 && this.y + this.h - this.vy <= p.y + 5) {
      this.y = p.y - this.h;
      this.onGround = true;
      this.vy = 0;
    } else if (this.vy < 0 && this.y - this.vy >= p.y + p.h - 5) {
      this.y = p.y + p.h;
      this.vy = 0;
    }
  }
}

/**
 * The simulated part of one level: everything that moves or changes. Cheap to clone, so the
 * CPU can try out runs and jumps with exactly the rules of live play.
 */
class World {
  constructor(level) {
    const { platforms, coins, spikes, movers } = createLevel(level);
    this.platforms = platforms;
    this.coins = coins;
    this.spikes = spikes;
    this.movers = movers;
    this.taken = coins.map(() => false);
    this.player = new Player();
    this.jumpBuffer = 0;
  }

  clone() {
    const copy = Object.create(World.prototype);
    copy.platforms = this.platforms;
    copy.coins = this.coins;
    copy.spikes = this.spikes;
    copy.movers = this.movers.map((m) => m.clone());
    copy.taken = [...this.taken];
    copy.player = this.player.clone();
    copy.jumpBuffer = this.jumpBuffer;
    return copy;
  }

  get coinsLeft() {
    return this.taken.filter((t) => !t).length;
  }

  resetPlayer() {
    this.player = new Player();
    this.jumpBuffer = 0;
  }

  /**
   * One original frame.
   * @param {number} dir -1, 0 or 1
   * @param {boolean} jumpPressed the JUMP button went down this tick
   * @returns {{coins: number, died: boolean}}
   */
  step(dir, jumpPressed) {
    const player = this.player;
    if (jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    if (this.jumpBuffer > 0) this.jumpBuffer = player.jump() ? 0 : this.jumpBuffer - 1;
    player.vx = dir * MOVE_SPEED;
    for (const m of this.movers) m.update();
    player.update(this.platforms, this.movers);

    let coins = 0;
    this.coins.forEach((coin, i) => {
      if (!this.taken[i] && overlaps(player, coin)) {
        this.taken[i] = true;
        coins++;
      }
    });
    const died = this.spikes.some((s) => overlaps(player, s)) || player.y > H;
    return { coins, died };
  }
}

// --- CPU ---------------------------------------------------------------------------------------

const WALK_FRAMES = [0, 4, 8, 12, 16, 20, 26, 32, 40, 50];
const AIR_SWITCH = [0, 8, 16, 26, 38];
const MAX_MOVE_FRAMES = 220;
const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/** Every move the CPU considers: walk or wait, maybe jump, then steer in the air until landing. */
function candidateMoves(onGround) {
  const airPatterns = [];
  for (const a1 of [-1, 0, 1]) {
    for (const a2 of [-1, 0, 1]) {
      if (a1 === a2) airPatterns.push({ a1, k: 0, a2 });
      else for (const k of AIR_SWITCH.slice(1)) airPatterns.push({ a1, k, a2 });
    }
  }
  if (!onGround) return airPatterns.map((air) => ({ walkDir: 0, walk: 0, jump: false, ...air }));
  const moves = [];
  for (const walkDir of [-1, 0, 1]) {
    for (const walk of WALK_FRAMES) {
      if (walkDir === 0 && walk > 0 && walk % 8 !== 0) continue;
      if (walkDir !== 0 && walk > 0) moves.push({ walkDir, walk, jump: false, a1: 0, k: 0, a2: 0 });
      if (walkDir === 0 || walk > 0) for (const air of airPatterns) moves.push({ walkDir, walk, jump: true, ...air });
    }
  }
  return moves;
}

/** Plays a move out on a copy of the world; returns its per-tick inputs and where it ended. */
function simulateMove(world, move) {
  const sim = world.clone();
  const inputs = [];
  let coins = 0;
  let airborne = !sim.player.onGround;
  for (let t = 0; t < MAX_MOVE_FRAMES; t++) {
    let dir;
    let jump = false;
    if (t < move.walk) dir = move.walkDir;
    else if (move.jump && t === move.walk) {
      dir = move.a1;
      jump = true;
    } else {
      const airT = t - move.walk;
      dir = airT < move.k ? move.a1 : move.a2;
    }
    inputs.push({ dir, jump });
    const result = sim.step(dir, jump);
    if (result.died) return null;
    coins += result.coins;
    if (!sim.player.onGround) airborne = true;
    const walkDone = t >= move.walk;
    if (walkDone && sim.player.onGround && (airborne || !move.jump)) {
      // A walk that ended still standing on the same ledge needs to have collected something or
      // moved somewhere new; that's judged by the caller.
      return { inputs, coins, world: sim };
    }
  }
  return null;
}

class Bot {
  constructor(game) {
    this.game = game;
    this.plan = [];
    this.lastJump = false;
    this.visits = new Map();
    this.level = 0;
    this.idle = 0;
  }

  input() {
    const game = this.game;
    if (game.over || game.pause > 0) {
      this.plan = [];
      return this.release();
    }
    if (this.level !== game.level) {
      this.level = game.level;
      this.visits.clear();
    }
    if (this.plan.length === 0) {
      // Pause for thought now and then, as a person would, so the demo isn't a blur.
      if (this.idle > 0) {
        this.idle--;
        return this.release();
      }
      this.plan = this.choose(game.world);
      this.idle = game.world.player.onGround && Math.random() < 0.5 ? 6 + Math.floor(Math.random() * 18) : 0;
    }
    const step = this.plan.shift() ?? { dir: 0, jump: false };
    // A press needs a release before it, as with a real button.
    const jump = step.jump && !this.lastJump;
    this.lastJump = jump;
    return { x: step.dir, y: 0, buttons: { fire: jump } };
  }

  release() {
    this.lastJump = false;
    return NEUTRAL;
  }

  cellOf(player) {
    return `${Math.round(player.x / 48)},${Math.round(player.y / 48)}`;
  }

  /** Picks the best-looking move: coins first, then getting near the closest coin left. */
  choose(world) {
    const start = this.cellOf(world.player);
    this.visits.set(start, (this.visits.get(start) ?? 0) + 1);
    let best = null;
    for (const move of candidateMoves(world.player.onGround)) {
      const result = simulateMove(world, move);
      if (!result) continue;
      const score = this.score(result) + Math.random() * 25;
      if (!best || score > best.score) best = { score, inputs: result.inputs };
    }
    if (!best) return Array.from({ length: 10 }, () => ({ dir: 0, jump: false }));
    return this.fumble(best.inputs);
  }

  score({ coins, world, inputs }) {
    const p = world.player;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    let nearest = 0;
    if (world.coinsLeft > 0) {
      nearest = Infinity;
      world.coins.forEach((c, i) => {
        if (world.taken[i]) return;
        // Height counts double: getting up there is the hard part.
        const d = Math.hypot(c.x + c.w / 2 - cx, (c.y + c.h / 2 - cy) * 2);
        nearest = Math.min(nearest, d);
      });
    }
    const visits = this.visits.get(this.cellOf(p)) ?? 0;
    return coins * 1000 - nearest - inputs.length * 0.5 - visits * 120;
  }

  /** Now and then the CPU mistimes a jump by a couple of frames, so it is beatable. */
  fumble(inputs) {
    if (Math.random() > 0.12) return inputs;
    const i = inputs.findIndex((s) => s.jump);
    if (i < 0) return inputs;
    const shift = Math.random() < 0.5 ? -2 : 3;
    const j = Math.max(0, Math.min(inputs.length - 1, i + shift));
    const out = inputs.map((s) => ({ ...s, jump: false }));
    out[j].jump = true;
    return out;
  }
}

// --- game --------------------------------------------------------------------------------------

class PlatformerGame {
  constructor(bots) {
    this.level = 1;
    this.world = new World(this.level);
    this.score = 0;
    this.lives = LIVES;
    this.over = false;
    this.won = false;
    this.pause = 0; // ticks left of a death or level-complete pause
    this.pauseKind = '';
    this.tick = 0;
    this.bot = bots[0] ? new Bot(this) : null;
  }

  get resultText() {
    if (this.won) return `ALL CLEAR! SCORE ${this.score}`;
    return this.over ? `LEVEL ${this.level} SCORE ${this.score}` : '';
  }

  botInput(index) {
    if (index !== 0 || !this.bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return this.bot.input();
  }

  update(input) {
    this.tick++;
    if (this.over) return;
    if (this.pause > 0) {
      this.pause--;
      if (this.pause === 0) this.endPause();
      return;
    }
    const player = input.player(0);
    const dir = player.x > 0.5 ? 1 : player.x < -0.5 ? -1 : 0;
    const { coins, died } = this.world.step(dir, player.pressed('fire'));
    this.score += coins;
    if (died) {
      this.lives--;
      if (this.lives <= 0) this.over = true;
      else this.startPause('dead', DEATH_PAUSE);
    } else if (this.world.coinsLeft === 0) {
      if (this.level >= LEVEL_COUNT) {
        this.won = true;
        this.over = true;
      } else {
        this.startPause('clear', LEVEL_PAUSE);
      }
    }
  }

  startPause(kind, ticks) {
    this.pauseKind = kind;
    this.pause = ticks;
  }

  endPause() {
    if (this.pauseKind === 'clear') {
      this.level++;
      this.world = new World(this.level);
    } else {
      this.world.resetPlayer();
    }
  }

  draw(ctx) {
    const world = this.world;
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, W, H);

    for (const p of world.platforms) drawBlock(ctx, p, BROWN, BROWN_EDGE);
    for (const m of world.movers) drawBlock(ctx, m, PURPLE, PURPLE_EDGE);

    ctx.fillStyle = YELLOW;
    world.coins.forEach((c, i) => {
      if (world.taken[i]) return;
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = RED;
    for (const s of world.spikes) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + s.h);
      ctx.lineTo(s.x + s.w / 2, s.y);
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.closePath();
      ctx.fill();
    }

    const dead = this.pauseKind === 'dead' && this.pause > 0;
    const flashOff = (dead || (this.over && !this.won)) && Math.floor(this.tick / 6) % 2 === 0;
    if (!flashOff) drawBlock(ctx, world.player, dead || this.over ? RED : BLUE, BLUE_EDGE);

    this.drawHud(ctx);
  }

  drawHud(ctx) {
    ctx.font = `20px ${HUD_FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = WHITE;
    ctx.fillText(`SCORE ${this.score}`, 14, 14);
    ctx.fillText(`LEVEL ${this.level}`, 14, 46);
    for (let i = 0; i < this.lives; i++) {
      drawBlock(ctx, { x: W - 40 - i * 32, y: 14, w: 22, h: 22 }, BLUE, BLUE_EDGE);
    }

    let message = null;
    if (this.won) message = ['YOU WIN!', GREEN];
    else if (this.pause > 0 && this.pauseKind === 'clear') message = ['LEVEL COMPLETE!', GREEN];
    else if (this.pause > 0 && this.pauseKind === 'dead') message = ['OUCH!', RED];
    if (message) {
      ctx.font = `32px ${HUD_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = BLACK;
      ctx.strokeText(message[0], W / 2, H / 2 - 60);
      ctx.fillStyle = message[1];
      ctx.fillText(message[0], W / 2, H / 2 - 60);
    }
  }
}

/** A filled block with a lighter rim, so thin ledges still read through the CRT. */
function drawBlock(ctx, r, fill, edge) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
}

/**
 * @param {{bots: boolean[]}} options bots[0] is true when the CPU plays (attract mode)
 */
export function createGame({ bots }) {
  return new PlatformerGame(bots);
}

export { World, PlatformerGame };
