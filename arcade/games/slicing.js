// Monster Slicing, ported from slicing/monster_slicing/game.py.
// One original frame per fixed 60 Hz tick, with the original per-frame constants.
//
// Changes from the original:
// - Twin-stick controls instead of WASD + mouse: the left stick moves, the right stick slices
//   in the direction it's pushed. A slice starts when the aim stick leaves neutral or changes
//   direction and repeats while it's held. The original has no slice cooldown (every click
//   restarts the 10-frame swing), so a held stick re-swings as soon as each swing ends.
//   The SLICE button swings toward the last aim (or, failing that, movement) direction.
// - Monsters charge at where the hero is when they spawn (straight line, +-20 degrees), as the
//   README promises ("monsters run at you"); the original picked any inward heading, so most
//   monsters missed by a mile and standing still was a winning strategy.
// - Waves: the original spawns at a fixed rate forever, so a careful player (or the CPU) could
//   never lose. Wave 1 is exactly the original; every WAVE_FRAMES the spawn rate and monster
//   speed rise a little, so games end and the score / wave reached means something.
// - Bugs fixed: the hero's mouth was drawn with the upper half of an ellipse (a frown, though the
//   code says "smile"); health could go negative and draw a negative-width bar.
// - Small additions for reading through the CRT: a fading swoosh showing the slice's 90-degree
//   reach, a burst of bits when a monster is sliced, and a red flash when the hero is hit.

const W = 800;
const H = 600;
const PLAYER_SIZE = 64;
const MONSTER_SIZE = 64;
const HEALTH_BAR_LENGTH = 200;
const HEALTH_BAR_HEIGHT = 20;
const MAX_HEALTH = 100;
const SWORD_LENGTH = 100;
const SWORD_WIDTH = 10;
const SLICE_DURATION = 10; // frames
const SLICE_HALF_ARC = 45; // degrees either side of the slice angle that the sword reaches
const MONSTER_SPEED_MIN = 2;
const MONSTER_SPEED_MAX = 5;
const MONSTER_SPAWN_RATE = 100; // lower is more frequent
const DROP_CHANCE = 0.2;
const HEALTH_BOOST = 10;
const WEAPON_BOOST_DURATION = 500; // frames
const PLAYER_SPEED = 5;
const MONSTER_DAMAGE = [5, 8, 12, 15];

const WAVE_FRAMES = 60 * 30;
const WAVE_SPAWN_FACTOR = 0.75; // spawn interval multiplier per wave
const MIN_SPAWN_RATE = 8;
const WAVE_SPEED_STEP = 0.1; // extra monster speed per wave
const MAX_SPEED_SCALE = 2;
const CHARGE_JITTER = 20; // degrees either side of the hero that a monster charges toward
const AIM_DEADZONE = 0.5;
const MOVE_DEADZONE = 0.2;

const WHITE = '#ffffff';
const BLACK = '#000000';
const RED = '#ff0000';
const GREEN = '#00ff00';
const BLUE = '#0000ff';
const YELLOW = '#ffff00';
const MONSTER_COLORS = ['#ff0000', '#00b400', '#800080', '#ffa500'];
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'slicing',
  title: 'MONSTER SLICING',
  width: W,
  height: H,
  players: 1,
  keyboard: {
    p1: {
      up: ['KeyW'],
      down: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      aimUp: ['ArrowUp'],
      aimDown: ['ArrowDown'],
      aimLeft: ['ArrowLeft'],
      aimRight: ['ArrowRight'],
      fire: ['Space'],
    },
  },
  keyHints: { p1: { stick: 'WASD', aim: 'ARROWS', fire: 'SPACE' } },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const uniform = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
/** Smallest difference between two angles in degrees, in [0, 180]. */
const angleDiff = (a, b) => {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};
/** Angle in degrees, maths convention (y up), of a screen-space (y down) vector. */
const screenAngle = (x, y) => deg(Math.atan2(-y, x));

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.health = MAX_HEALTH;
    this.slicing = 0;
    this.sliceAngle = 0;
    this.weaponBoost = 0;
    this.swordRange = SWORD_LENGTH;
    this.hurt = 0;
  }

  get reach() {
    return this.weaponBoost > 0 ? this.swordRange * 1.5 : this.swordRange;
  }

  slice(angle) {
    this.slicing = SLICE_DURATION;
    this.sliceAngle = angle;
  }

  move(dx, dy) {
    this.x = clamp(this.x + dx * PLAYER_SPEED, PLAYER_SIZE / 2, W - PLAYER_SIZE / 2);
    this.y = clamp(this.y + dy * PLAYER_SPEED, PLAYER_SIZE / 2, H - PLAYER_SIZE / 2);
  }

  update() {
    if (this.slicing > 0) this.slicing--;
    if (this.weaponBoost > 0) this.weaponBoost--;
    if (this.hurt > 0) this.hurt--;
  }

  draw(ctx) {
    const s = PLAYER_SIZE;
    const eye = s / 6;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.hurt > 0 && this.hurt % 6 < 3 ? RED : BLUE;
    circle(ctx, 0, 0, s / 2 - 5);
    ctx.fillStyle = WHITE;
    circle(ctx, -eye, -eye, eye);
    circle(ctx, eye, -eye, eye);
    ctx.fillStyle = BLACK;
    circle(ctx, -eye, -eye, eye / 2);
    circle(ctx, eye, -eye, eye / 2);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, s / 8, s / 6, s / 8, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  drawSword(ctx) {
    if (this.slicing <= 0) return;
    const color = this.weaponBoost > 0 ? YELLOW : WHITE;
    const reach = this.reach;
    const a = rad(this.sliceAngle);
    // Swoosh: the sword's full reach, fading as the swing ends.
    ctx.save();
    ctx.globalAlpha = 0.28 * (this.slicing / SLICE_DURATION);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, reach, -a - rad(SLICE_HALF_ARC), -a + rad(SLICE_HALF_ARC));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = SWORD_WIDTH;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(a) * reach, this.y - Math.sin(a) * reach);
    ctx.stroke();
  }
}

// Monster shapes from create_monster_surface_variant, as fractions of MONSTER_SIZE.
const MONSTER_POINTS = [
  [[1 / 2, 0], [1, 1 / 3], [4 / 5, 1], [1 / 2, 5 / 6], [1 / 5, 1], [0, 1 / 3]],
  [[1 / 2, 0], [1, 1], [0, 1]],
  [[1 / 2, 0], [3 / 4, 1 / 4], [1, 1 / 2], [3 / 4, 3 / 4], [1 / 2, 1], [1 / 4, 3 / 4], [0, 1 / 2], [1 / 4, 1 / 4]],
  [[1 / 2, 0], [1, 1 / 2], [1 / 2, 1], [0, 1 / 2]],
];

export class Monster {
  /**
   * @param {number} speedScale the current wave's speed multiplier
   * @param {{x: number, y: number}|null} target where the monster charges (the hero at spawn)
   */
  constructor(speedScale = 1, target = null) {
    const side = randint(0, 3); // 0: top, 1: right, 2: bottom, 3: left
    let angle;
    if (side === 0) {
      this.x = randint(0, W);
      this.y = -MONSTER_SIZE;
      angle = uniform(Math.PI / 4, (3 * Math.PI) / 4);
    } else if (side === 1) {
      this.x = W + MONSTER_SIZE;
      this.y = randint(0, H);
      angle = uniform((3 * Math.PI) / 4, (5 * Math.PI) / 4);
    } else if (side === 2) {
      this.x = randint(0, W);
      this.y = H + MONSTER_SIZE;
      angle = uniform((5 * Math.PI) / 4, (7 * Math.PI) / 4);
    } else {
      this.x = -MONSTER_SIZE;
      this.y = randint(0, H);
      angle = uniform((7 * Math.PI) / 4, (9 * Math.PI) / 4);
    }
    if (target) angle = Math.atan2(target.y - this.y, target.x - this.x) + rad(uniform(-CHARGE_JITTER, CHARGE_JITTER));
    this.variant = randint(0, 3);
    // Stronger monsters move faster and are worth more.
    this.speed = uniform(MONSTER_SPEED_MIN, MONSTER_SPEED_MAX) * (this.variant > 1 ? 1.2 : 1) * speedScale;
    this.dx = Math.cos(angle) * this.speed;
    this.dy = Math.sin(angle) * this.speed;
  }

  update() {
    this.x += this.dx;
    this.y += this.dy;
  }

  isOffScreen() {
    return this.x < -MONSTER_SIZE || this.x > W + MONSTER_SIZE || this.y < -MONSTER_SIZE || this.y > H + MONSTER_SIZE;
  }

  distanceTo(player) {
    return Math.hypot(this.x - player.x, this.y - player.y);
  }

  draw(ctx) {
    const s = MONSTER_SIZE;
    ctx.save();
    ctx.translate(this.x - s / 2, this.y - s / 2);
    ctx.fillStyle = MONSTER_COLORS[this.variant];
    polygon(ctx, MONSTER_POINTS[this.variant].map(([px, py]) => [px * s, py * s]));
    ctx.fill();

    const eye = s / 7;
    ctx.fillStyle = YELLOW;
    circle(ctx, s / 3, s / 3, eye);
    circle(ctx, (s * 2) / 3, s / 3, eye);
    ctx.fillStyle = BLACK;
    circle(ctx, s / 3, s / 3, eye / 2);
    circle(ctx, (s * 2) / 3, s / 3, eye / 2);

    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    if (this.variant === 0) {
      zigzag(ctx, [[1 / 3, 1 / 2], [0.4, 2 / 3], [1 / 2, 1 / 2], [0.6, 2 / 3], [2 / 3, 1 / 2]], s);
    } else if (this.variant === 1) {
      ctx.moveTo(s / 3, (s * 2) / 3);
      ctx.lineTo((s * 2) / 3, (s * 2) / 3);
    } else if (this.variant === 2) {
      ctx.ellipse(s / 2, (s * 2) / 3, s / 6, s / 6, 0, Math.PI, 2 * Math.PI);
    } else {
      ctx.moveTo(s / 4, s / 4);
      ctx.lineTo((s * 3) / 8, s / 5);
      ctx.moveTo((s * 3) / 4, s / 4);
      ctx.lineTo((s * 5) / 8, s / 5);
      zigzag(ctx, [[1 / 3, 1 / 2], [3 / 8, 2 / 3], [1 / 2, 1 / 2], [5 / 8, 2 / 3], [2 / 3, 1 / 2]], s);
    }
    ctx.stroke();
    ctx.restore();
  }
}

class Drop {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // 'health' or 'weapon'
  }

  distanceTo(player) {
    return Math.hypot(this.x - player.x, this.y - player.y);
  }

  draw(ctx) {
    const s = MONSTER_SIZE / 2;
    ctx.save();
    ctx.translate(this.x - s / 2, this.y - s / 2);
    if (this.type === 'health') {
      const q = s / 4;
      ctx.fillStyle = GREEN;
      circle(ctx, q, q, q);
      circle(ctx, s / 2 + q, q, q);
      polygon(ctx, [[0, q], [s / 2, s], [s, q]]);
      ctx.fill();
    } else {
      ctx.fillStyle = '#c0c0c0';
      polygon(ctx, [[s / 2, 0], [(s * 3) / 5, s / 3], [s / 2, (s * 3) / 4], [(s * 2) / 5, s / 3]]);
      ctx.fill();
      ctx.fillStyle = '#8b4513';
      ctx.fillRect((s * 2) / 5, (s * 3) / 4, s / 5, s / 4);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(s / 3, (s * 2) / 3, s / 3, s / 10);
    }
    ctx.restore();
  }
}

/** Bits flying off a sliced monster. */
class Burst {
  constructor(x, y, color) {
    this.age = 0;
    this.duration = 30;
    this.color = color;
    this.bits = Array.from({ length: 14 }, () => {
      const a = uniform(0, Math.PI * 2);
      const v = uniform(2, 7);
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: uniform(4, 9) };
    });
  }

  update() {
    this.age++;
    for (const b of this.bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.92;
      b.vy *= 0.92;
    }
  }

  get finished() {
    return this.age >= this.duration;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 1 - this.age / this.duration;
    ctx.fillStyle = this.color;
    for (const b of this.bits) ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
    ctx.restore();
  }
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function zigzag(ctx, points, s) {
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
}

/** The original's is_slice_hitting: within reach and within 45 degrees of the swing. */
export function isSliceHitting(player, monster) {
  if (player.slicing <= 0) return false;
  if (monster.distanceTo(player) > player.reach + MONSTER_SIZE / 2) return false;
  const toMonster = screenAngle(monster.x - player.x, monster.y - player.y);
  return angleDiff(player.sliceAngle, toMonster) <= SLICE_HALF_ARC;
}

const BOT_SIGHT = 220; // how far away the CPU starts tracking a monster
const BOT_REPLAN = 20; // ticks between CPU decisions (its reaction time)
const BOT_AIM_ERROR = 40; // degrees of sloppiness in the CPU's aim

/**
 * CPU slicer. It works both sticks like a person would: the right stick points at the most
 * urgent monster it has noticed (with some reaction delay and wobble), the left stick backs away
 * from crowds, picks up drops and drifts back toward the middle of the arena.
 */
class Bot {
  constructor(game) {
    this.game = game;
    this.wait = 0;
    this.move = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
  }

  input() {
    if (this.wait-- <= 0) {
      this.wait = BOT_REPLAN;
      this.plan();
    }
    return { x: this.move.x, y: this.move.y, buttons: {}, aim: this.aim };
  }

  plan() {
    const { player, monsters, drops } = this.game;
    let target = null;
    let soonest = Infinity;
    let pushX = 0;
    let pushY = 0;
    for (const m of monsters) {
      const dist = m.distanceTo(player);
      if (dist > BOT_SIGHT) continue;
      // Only monsters heading this way are threats.
      const closing = -((m.x - player.x) * m.dx + (m.y - player.y) * m.dy) / Math.max(dist, 1);
      if (closing <= 0.3) continue;
      const eta = (dist - (PLAYER_SIZE + MONSTER_SIZE) / 2) / closing;
      if (eta < soonest) {
        soonest = eta;
        target = m;
      }
      const weight = 1 / Math.max(dist - 40, 20);
      pushX -= ((m.x - player.x) / dist) * weight;
      pushY -= ((m.y - player.y) / dist) * weight;
    }

    if (target && target.distanceTo(player) < player.reach + MONSTER_SIZE / 2 + target.speed * 12) {
      const lead = 4;
      const ax = target.x + target.dx * lead - player.x;
      const ay = target.y + target.dy * lead - player.y;
      const a = rad(screenAngle(ax, ay) + uniform(-BOT_AIM_ERROR, BOT_AIM_ERROR));
      this.aim = { x: Math.cos(a), y: -Math.sin(a) };
    } else {
      this.aim = { x: 0, y: 0 };
    }

    let mx = pushX * 60 + (W / 2 - player.x) / 400;
    let my = pushY * 60 + (H / 2 - player.y) / 300;
    const want = player.health < MAX_HEALTH - HEALTH_BOOST ? null : 'weapon';
    let best = null;
    for (const d of drops) {
      if (want && d.type !== want) continue;
      const dist = d.distanceTo(player);
      if (!best || dist < best.dist) best = { d, dist };
    }
    if (best && best.dist < 300) {
      mx += ((best.d.x - player.x) / best.dist) * 0.8;
      my += ((best.d.y - player.y) / best.dist) * 0.8;
    }
    const len = Math.hypot(mx, my);
    this.move = len < 0.15 ? { x: 0, y: 0 } : { x: mx / Math.max(len, 1), y: my / Math.max(len, 1) };
  }
}

class SlicingGame {
  constructor(bots) {
    this.player = new Player(W / 2, H / 2);
    this.monsters = [];
    this.drops = [];
    this.bursts = [];
    this.score = 0;
    this.wave = 1;
    this.waveTick = 0;
    this.banner = 90;
    this.tick = 0;
    this.over = false;
    this.aimDirection = 'neutral';
    this.facing = 0; // degrees; where the SLICE button swings
    this.bot = bots[0] ? new Bot(this) : null;
  }

  get resultText() {
    return `SCORE ${this.score} WAVE ${this.wave}`;
  }

  get spawnRate() {
    return Math.max(MIN_SPAWN_RATE, Math.round(MONSTER_SPAWN_RATE * WAVE_SPAWN_FACTOR ** (this.wave - 1)));
  }

  get speedScale() {
    return Math.min(MAX_SPEED_SCALE, 1 + WAVE_SPEED_STEP * (this.wave - 1));
  }

  botInput(index) {
    if (index !== 0 || !this.bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return this.bot.input();
  }

  update(input) {
    this.tick++;
    for (const b of this.bursts) b.update();
    this.bursts = this.bursts.filter((b) => !b.finished);
    if (this.banner > 0) this.banner--;
    if (this.over) return;

    this.handleInput(input.player(0));

    if (++this.waveTick >= WAVE_FRAMES) {
      this.waveTick = 0;
      this.wave++;
      this.banner = 90;
    }
    if (randint(1, this.spawnRate) === 1) this.monsters.push(new Monster(this.speedScale, this.player));

    this.player.update();
    this.updateMonsters();
    this.collectDrops();

    if (this.player.health <= 0) {
      this.player.health = 0;
      this.over = true;
    }
  }

  handleInput(pad) {
    const player = this.player;
    let dx = pad.x;
    let dy = pad.y;
    const len = Math.hypot(dx, dy);
    if (len < MOVE_DEADZONE) {
      dx = 0;
      dy = 0;
    } else if (len > 1) {
      dx /= len;
      dy /= len;
    }
    player.move(dx, dy);
    if (dx || dy) this.facing = screenAngle(dx, dy);

    const aim = pad.aim;
    if (Math.hypot(aim.x, aim.y) >= AIM_DEADZONE) {
      const angle = screenAngle(aim.x, aim.y);
      this.facing = angle;
      // A new push or a new direction slices at once (like a click); holding re-swings as soon
      // as the last swing ends.
      if (aim.direction !== this.aimDirection || player.slicing === 0) player.slice(angle);
      this.aimDirection = aim.direction;
      return;
    }
    this.aimDirection = 'neutral';
    if (pad.pressed('fire') || (pad.down('fire') && player.slicing === 0)) player.slice(this.facing);
  }

  updateMonsters() {
    const player = this.player;
    const keep = [];
    for (const monster of this.monsters) {
      monster.update();
      if (monster.isOffScreen()) continue;
      if (monster.distanceTo(player) < (PLAYER_SIZE + MONSTER_SIZE) / 2) {
        player.health -= MONSTER_DAMAGE[monster.variant];
        player.hurt = 24;
        continue;
      }
      if (isSliceHitting(player, monster)) {
        this.score += (monster.variant + 1) * 10;
        this.bursts.push(new Burst(monster.x, monster.y, MONSTER_COLORS[monster.variant]));
        this.maybeDrop(monster);
        continue;
      }
      keep.push(monster);
    }
    this.monsters = keep;
  }

  maybeDrop(monster) {
    // Higher level monsters have better drop rates, and the strongest favour weapons.
    if (Math.random() >= DROP_CHANCE * (1 + monster.variant * 0.2)) return;
    let type;
    if (monster.variant >= 2 && Math.random() < 0.6) type = 'weapon';
    else type = Math.random() < 0.5 ? 'health' : 'weapon';
    this.drops.push(new Drop(monster.x, monster.y, type));
  }

  collectDrops() {
    const player = this.player;
    this.drops = this.drops.filter((drop) => {
      if (drop.distanceTo(player) >= (PLAYER_SIZE + MONSTER_SIZE / 4) / 2) return true;
      if (drop.type === 'health') player.health = Math.min(MAX_HEALTH, player.health + HEALTH_BOOST);
      else player.weaponBoost = WEAPON_BOOST_DURATION;
      return false;
    });
  }

  draw(ctx) {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'butt';
    for (const d of this.drops) d.draw(ctx);
    for (const m of this.monsters) m.draw(ctx);
    this.player.drawSword(ctx);
    if (!this.over || this.tick % 20 < 10) this.player.draw(ctx);
    for (const b of this.bursts) b.draw(ctx);
    if (this.player.hurt > 18) {
      ctx.fillStyle = 'rgba(255,0,0,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHud(ctx);
  }

  drawHud(ctx) {
    const player = this.player;
    // Health bar, a bit chunkier than the original so it reads through the CRT.
    const barLength = HEALTH_BAR_LENGTH * 1.2;
    const barHeight = HEALTH_BAR_HEIGHT * 1.2;
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, barLength + 6, barHeight + 6);
    ctx.fillStyle = player.health > 30 ? GREEN : RED;
    ctx.fillRect(15, 15, (clamp(player.health, 0, MAX_HEALTH) / MAX_HEALTH) * barLength, barHeight);

    ctx.font = `20px ${HUD_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillStyle = WHITE;
    ctx.fillText(`SCORE ${this.score}`, W - 14, 16);
    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${this.wave}`, W / 2 + 60, 16);

    if (player.weaponBoost > 0) {
      ctx.font = `14px ${HUD_FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = YELLOW;
      ctx.fillText(`SWORD BOOST ${Math.floor(player.weaponBoost / 60) + 1}s`, 12, 52);
    }

    if (this.banner > 0 && !this.over && Math.floor(this.banner / 10) % 2 === 0) {
      ctx.font = `40px ${HUD_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = YELLOW;
      ctx.fillText(`WAVE ${this.wave}`, W / 2, H / 3);
    }
  }
}

/**
 * @param {{bots: boolean[]}} options bots[0] is true when the CPU plays (attract mode)
 */
export function createGame({ bots }) {
  return new SlicingGame(bots);
}
