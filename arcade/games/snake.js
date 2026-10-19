// Snake, ported from snake/snake.py.
// The original's 60x60 grid and 5 moves per second are kept: the 1200x1200 window is drawn at
// 600x600 (10 px cells) and a snake moves once every 12 ticks of the fixed 60 Hz update.
//
// Modes (the original's number-key menu is replaced by the cabinet's start buttons):
//   1 PLAYER  = the original's mode 2: you (BLUE) vs the AI snake (ORANGE)
//   2 PLAYER  = the original's mode 5: two humans plus the GREEN AI bot snake
//   attract   = AI (BLUE) vs AI (ORANGE)
// TURBO (fire) is new: hold it to move at double speed. The rules never needed a button.
//
// Fixes to the original:
// - Two turns pressed within one move could reverse a snake into its own neck (the reversal
//   check only looked at the current direction). Turns are now queued and each is checked
//   against the one before it, which also lets a quick double tap make a tight U-turn.
// - In a head-on collision only the first snake in the list died, because collisions were
//   applied one snake at a time. Now all collisions are found first, then applied.
// - The AI only ever steered toward the nearest food and drove into walls and bodies. It still
//   chases food the same way, but now avoids moves that kill it or trap it (with the
//   occasional careless slip, so it is beatable and the attract demo ends).

const W = 600;
const H = 600;
const BLOCK = 10;
const GRID_W = 60;
const GRID_H = 60;
const MOVE_TICKS = 12; // 60 Hz / 5 moves per second, the original's clock.tick(5)
const TURBO_RATE = 2; // TURBO doubles the speed
const MAX_FOOD = 5;
const INIT_LENGTH = 3;
const MAX_QUEUED_TURNS = 2;

// Okabe-Ito colour-blind safe palette, as in the original.
const BLUE = [0, 114, 178];
const ORANGE = [230, 159, 0];
const GREEN = [0, 158, 115];
const FOOD_COLOR = '#ff0000';
const BG_COLOR = '#000';
const HUD_FONT = '"Press Start 2P", monospace';

// Per step, the chance the AI plays the original's careless greedy move instead. It grows as
// the round goes on, so even two CPUs finish the attract demo within a few minutes.
const BOT_SLIP_CHANCE = 0.015;
const BOT_SLIP_GROWTH = 0.00005;
const BOT_TURBO_MIN_RUN = 8;

const UP = Object.freeze([0, -1]);
const DOWN = Object.freeze([0, 1]);
const LEFT = Object.freeze([-1, 0]);
const RIGHT = Object.freeze([1, 0]);
const DIRS = [UP, DOWN, LEFT, RIGHT];

export const meta = {
  id: 'snake',
  title: 'SNAKE',
  width: W,
  height: H,
  players: 2,
  // The original's bindings: P1 WASD, P2 arrows. Enter is a start key in the shell, so P2's
  // TURBO is right shift (or slash).
  keyboard: {
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space', 'ShiftLeft'] },
    p2: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['ShiftRight', 'Slash'],
    },
  },
  keyHints: { p1: { stick: 'WASD', fire: 'SPACE' }, p2: { stick: 'ARROWS', fire: 'R-SHIFT' } },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const lighten = (color) => color.map((c) => Math.min(255, c + 90));
const key = (x, y) => y * GRID_W + x;
const inGrid = (x, y) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
const sameDir = (a, b) => a[0] === b[0] && a[1] === b[1];
const isReverse = (a, b) => a[0] === -b[0] && a[1] === -b[1];

class Snake {
  constructor(color, start, direction, name) {
    this.color = color;
    this.direction = direction;
    this.name = name;
    this.length = INIT_LENGTH;
    // The head is the last element, as in the original.
    this.positions = [];
    for (let i = 0; i < INIT_LENGTH; i++) {
      const back = INIT_LENGTH - 1 - i;
      this.positions.push([start[0] - back * direction[0], start[1] - back * direction[1]]);
    }
    this.alive = true;
    this.turns = [];
    this.progress = 0;
    this.moves = 0;
    this.turbo = false;
  }

  get head() {
    return this.positions[this.positions.length - 1];
  }

  /** The direction the next queued turn has to be checked against. */
  get plannedDirection() {
    return this.turns.length ? this.turns[this.turns.length - 1] : this.direction;
  }

  /** Queue a turn; ignored if it is a reversal or no change from the one before it. */
  steer(dir) {
    const last = this.plannedDirection;
    if (this.turns.length >= MAX_QUEUED_TURNS || sameDir(dir, last) || isReverse(dir, last)) return;
    this.turns.push(dir);
  }

  /** Advance the snake's clock; true when it is time to take a step. */
  tick() {
    this.progress += this.turbo ? TURBO_RATE : 1;
    if (this.progress < MOVE_TICKS) return false;
    this.progress -= MOVE_TICKS;
    return true;
  }

  move() {
    if (this.turns.length) this.direction = this.turns.shift();
    const [hx, hy] = this.head;
    this.positions.push([hx + this.direction[0], hy + this.direction[1]]);
    if (this.positions.length > this.length) this.positions.shift();
    this.moves++;
  }

  occupies(x, y) {
    return this.positions.some(([px, py]) => px === x && py === y);
  }

  draw(ctx) {
    const alpha = this.alive ? 1 : 0.3;
    ctx.fillStyle = rgb(this.color, alpha);
    for (const [x, y] of this.positions) ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    if (!this.alive) return;
    // A lighter head, so the direction of travel reads on a phone-sized screen.
    const [hx, hy] = this.head;
    ctx.fillStyle = rgb(lighten(this.color));
    ctx.fillRect(hx * BLOCK + 1, hy * BLOCK + 1, BLOCK - 2, BLOCK - 2);
  }
}

/** The direction a stick position asks for, or null when centred. */
function stickDirection(player, current) {
  const x = player.x;
  const y = player.y;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (Math.max(ax, ay) <= 0.5) return null;
  const horizontal = x > 0 ? RIGHT : LEFT;
  const vertical = y > 0 ? DOWN : UP;
  if (ax > ay + 0.01) return horizontal;
  if (ay > ax + 0.01) return vertical;
  // Diagonal: take the turn, which makes a held diagonal a staircase.
  return current[0] === 0 ? horizontal : vertical;
}

const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/**
 * The original's food-chasing AI, made to look before it leaps. It decides once per step and
 * holds the stick toward that turn until the snake takes it, so the panel shows it steering.
 */
class SnakeAI {
  constructor(game, snake) {
    this.game = game;
    this.snake = snake;
    this.decidedAt = -1;
    this.choice = snake.direction;
    this.turbo = false;
  }

  decide() {
    const snake = this.snake;
    if (this.decidedAt === snake.moves) return;
    this.decidedAt = snake.moves;
    const blocked = this.game.blockedCells();
    const greedy = this.greedy();
    if (Math.random() < BOT_SLIP_CHANCE + snake.moves * BOT_SLIP_GROWTH) {
      this.choice = greedy;
      this.turbo = false;
      return;
    }
    const options = [greedy, ...DIRS.filter((d) => !sameDir(d, greedy))].filter(
      (d) => !isReverse(d, snake.direction),
    );
    const contested = this.contestedCells();
    const need = snake.length + 4;
    const [hx, hy] = snake.head;
    // Rank: room to move and no head-on risk, then room, then the most room. Ties keep the
    // option order, so the greedy move wins whenever it is safe.
    let best = null;
    for (const dir of options) {
      const nx = hx + dir[0];
      const ny = hy + dir[1];
      if (!inGrid(nx, ny) || blocked.has(key(nx, ny))) continue;
      const room = floodArea(nx, ny, blocked, need);
      const score = room >= need ? (contested.has(key(nx, ny)) ? need + 1 : need + 2) : room;
      if (!best || score > best.score) best = { dir, score };
    }
    this.choice = best ? best.dir : greedy;
    this.turbo = sameDir(this.choice, snake.direction) && this.clearRunToFood(blocked);
  }

  /** Cells another living snake's head could step into next. */
  contestedCells() {
    const cells = new Set();
    for (const other of this.game.alive) {
      if (other === this.snake) continue;
      const [ox, oy] = other.head;
      for (const [dx, dy] of DIRS) cells.add(key(ox + dx, oy + dy));
    }
    return cells;
  }

  /** The original bot_decision: step toward the nearest food, never reversing. */
  greedy() {
    const snake = this.snake;
    const [hx, hy] = snake.head;
    let nearest = null;
    let nearestDist = Infinity;
    for (const [fx, fy] of this.game.foods) {
      const d = Math.abs(fx - hx) + Math.abs(fy - hy);
      if (d < nearestDist) {
        nearest = [fx, fy];
        nearestDist = d;
      }
    }
    if (!nearest) return snake.direction;
    const dx = nearest[0] - hx;
    const dy = nearest[1] - hy;
    const candidates = [];
    if (dx !== 0) candidates.push(dx > 0 ? RIGHT : LEFT);
    if (dy !== 0) candidates.push(dy > 0 ? DOWN : UP);
    if (candidates.length === 2 && Math.random() < 0.5) candidates.reverse();
    return candidates.find((c) => !isReverse(c, snake.direction)) ?? snake.direction;
  }

  /** True when food lies straight ahead, far enough away, with nothing in between. */
  clearRunToFood(blocked) {
    const snake = this.snake;
    const [dx, dy] = snake.direction;
    let [x, y] = snake.head;
    for (let step = 1; step < GRID_W; step++) {
      x += dx;
      y += dy;
      if (!inGrid(x, y) || blocked.has(key(x, y))) return false;
      if (this.game.foods.some(([fx, fy]) => fx === x && fy === y)) return step >= BOT_TURBO_MIN_RUN;
    }
    return false;
  }

  input() {
    if (this.game.over || !this.snake.alive) return NEUTRAL;
    this.decide();
    const turning = !sameDir(this.choice, this.snake.direction);
    return { x: turning ? this.choice[0] : 0, y: turning ? this.choice[1] : 0, buttons: { fire: this.turbo } };
  }
}

/** Number of free cells reachable from (x, y), counting no further than `limit`. */
function floodArea(x, y, blocked, limit) {
  const seen = new Set([key(x, y)]);
  const stack = [[x, y]];
  while (stack.length && seen.size < limit) {
    const [cx, cy] = stack.pop();
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = key(nx, ny);
      if (!inGrid(nx, ny) || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return seen.size;
}

class SnakeGame {
  /** @param {boolean[]} bots which of the two player slots the CPU drives */
  constructor(bots) {
    const humans = bots.filter((b) => !b).length;
    const name = (i) => (bots[i] ? (humans ? 'CPU' : `CPU ${i + 1}`) : `PLAYER ${i + 1}`);
    this.snakes = [
      new Snake(BLUE, [5, GRID_H / 2], RIGHT, name(0)),
      new Snake(ORANGE, [GRID_W - 6, GRID_H / 2], LEFT, name(1)),
    ];
    // Two humans get the original's mode 5 third snake, the GREEN bot, coming down from the top.
    this.botSnake = humans === 2 ? new Snake(GREEN, [GRID_W / 2, 5], DOWN, 'BOT') : null;
    if (this.botSnake) this.snakes.push(this.botSnake);
    this.ais = bots.map((isBot, i) => (isBot ? new SnakeAI(this, this.snakes[i]) : null));
    this.botSnakeAI = this.botSnake ? new SnakeAI(this, this.botSnake) : null;
    this.foods = [];
    this.refillFood();
    this.over = false;
    this.resultText = '';
    this.tick = 0;
  }

  botInput(index) {
    const ai = this.ais[index];
    if (!ai) throw new Error(`Player ${index + 1} is not a CPU player`);
    return ai.input();
  }

  get alive() {
    return this.snakes.filter((s) => s.alive);
  }

  /** Cells a snake can't move into: every living snake's body. */
  blockedCells() {
    const blocked = new Set();
    for (const s of this.alive) for (const [x, y] of s.positions) blocked.add(key(x, y));
    return blocked;
  }

  refillFood() {
    while (this.foods.length < MAX_FOOD) {
      const x = randint(0, GRID_W - 1);
      const y = randint(0, GRID_H - 1);
      if (this.snakes.some((s) => s.occupies(x, y))) continue;
      if (this.foods.some(([fx, fy]) => fx === x && fy === y)) continue;
      this.foods.push([x, y]);
    }
  }

  update(input) {
    this.tick++;
    if (this.over) return;

    this.snakes.slice(0, 2).forEach((snake, i) => {
      const player = input.player(i);
      const dir = stickDirection(player, snake.plannedDirection);
      if (dir) snake.steer(dir);
      snake.turbo = player.down('fire');
    });
    if (this.botSnake?.alive) {
      // The third snake has no panel controls, so the AI steers it directly.
      const ai = this.botSnakeAI.input();
      const dir = stickDirection(ai, this.botSnake.plannedDirection);
      if (dir) this.botSnake.steer(dir);
      this.botSnake.turbo = ai.buttons.fire;
    }

    const movers = this.alive.filter((s) => s.tick());
    if (!movers.length) return;
    for (const s of movers) s.move();
    this.eat(movers);
    this.collide(movers);
  }

  eat(movers) {
    const eaten = [];
    for (const food of this.foods) {
      for (const s of movers) {
        const [hx, hy] = s.head;
        if (hx === food[0] && hy === food[1]) {
          s.length++;
          if (!eaten.includes(food)) eaten.push(food);
        }
      }
    }
    this.foods = this.foods.filter((f) => !eaten.includes(f));
    this.refillFood();
  }

  collide(movers) {
    const living = this.alive;
    const dead = movers.filter((s) => {
      const [hx, hy] = s.head;
      if (!inGrid(hx, hy)) return true;
      if (s.positions.slice(0, -1).some(([x, y]) => x === hx && y === hy)) return true;
      return living.some((other) => other !== s && other.occupies(hx, hy));
    });
    for (const s of dead) s.alive = false;
    const alive = this.alive;
    if (alive.length > 1) return;
    this.over = true;
    this.resultText = alive.length === 1 ? `${alive[0].name} WINS` : 'DRAW';
  }

  draw(ctx) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);
    // The walls are the screen edge; a faint frame shows where it is through the CRT curve.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    for (const s of this.snakes) if (!s.alive) s.draw(ctx);
    for (const s of this.snakes) if (s.alive) s.draw(ctx);
    ctx.fillStyle = FOOD_COLOR;
    for (const [fx, fy] of this.foods) {
      ctx.beginPath();
      ctx.arc(fx * BLOCK + BLOCK / 2, fy * BLOCK + BLOCK / 2, BLOCK * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawHud(ctx);
  }

  drawHud(ctx) {
    ctx.font = `18px ${HUD_FONT}`;
    ctx.textBaseline = 'top';
    const slots = [
      { align: 'left', x: 12 },
      { align: 'right', x: W - 12 },
      { align: 'center', x: W / 2 },
    ];
    this.snakes.forEach((s, i) => {
      const label = s.name === 'BOT' || s.name === 'CPU' ? s.name : `P${i + 1}`;
      ctx.textAlign = slots[i].align;
      ctx.fillStyle = rgb(lighten(s.color), s.alive ? 1 : 0.35);
      ctx.fillText(`${label} ${s.length}`, slots[i].x, 12);
    });
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two players the CPU controls
 */
export function createGame({ bots }) {
  return new SnakeGame(bots);
}
