// Army, ported from army/ (army.py, entities.py, ai.py, game_logic.py, rendering.py).
// The battle runs in the original's 2000x1400 world with its per-frame constants, one original
// frame per 60 Hz tick; only the drawing is scaled down by half to a 1000x700 canvas.
//
// The original is AI vs AI. Here a player commands an army through one stick and two buttons:
// - NEXT (fire2) switches command to the next living regiment (highlighted in yellow).
// - The stick marches the commanded regiment, relative to its facing, exactly like the
//   original's regiment actions: up = move_forward, down = move_backward, left/right = wheel.
// - VOLLEY (fire) orders it to make ready and fire at will (the original "fire" action, held
//   every frame, so it volleys whenever it has stood still long enough and is reloaded).
// Every regiment keeps its last order when command passes to another one, so a regiment left
// marching keeps marching, and one ordered to fire keeps volleying, until it is given a new order.
// The CPU (attract mode, and Blue in 1-player games) is the original per-regiment AI: each tick it
// decides an action for all three regiments, and the bot works the stick and buttons to pass
// those decisions on, switching regiments with NEXT whenever an unattended one's order is stale.
//
// Changes from the original, for the cabinet:
// - Menus, speed keys, the debug overlay and the always-on "R:<n>" retreat counter (a leftover
//   debug readout from the retreat-behaviour commit) are gone; the HUD is resized for the CRT.
// - Regiments show their front rank, current order and readiness, and volleys puff smoke, so the
//   battle reads at phone size. Musket balls are drawn larger than they collide.
// - The health bar sat 130 px above each regiment's centre, far from it; it now sits just above.
// Not changed: FlankingAI's flanking manoeuvre can never trigger in the original, because each AI
// commands a single regiment and so never has allies; Flanking regiments fight like the base AI
// with their own personality, here too.

const WORLD_W = 2000;
const WORLD_H = 1400;
const MARGIN = 100;
const SCALE = 0.5;
const W = WORLD_W * SCALE;
const H = WORLD_H * SCALE;

// entities.py
const REGIMENT_WIDTH = 60; // depth of the formation
const REGIMENT_HEIGHT = 120; // frontage
const REGIMENT_SPEED = 0.5;
const WHEEL_ANGLE = 0.4;
const COOLDOWN_TICKS = 180;
const BULLET_SPEED = 10.0;
const BULLET_LIFETIME = 250;
const BULLET_DAMAGE = 5;
const BULLET_RADIUS = 4;
const BULLETS_PER_VOLLEY = 10;
const REGIMENT_HEALTH = 100;
const MAX_BULLETS = 500;
const SETUP_TIME = 45;
const RECOVERY_TIME = 60;
const REGIMENTS_PER_ARMY = 3;

const MOVES = ['move_forward', 'move_backward', 'wheel_left', 'wheel_right'];
const TEAMS = ['red', 'blue'];

const GRASS = 'rgb(100,200,100)';
const BROWN = 'rgb(139,69,19)';
const TEAM_RGB = { red: [255, 50, 50], blue: [50, 50, 255] };
const TEAM_LIGHT = { red: 'rgb(255,190,180)', blue: 'rgb(190,200,255)' };
const TEAM_DARK = { red: 'rgb(110,10,10)', blue: 'rgb(10,10,100)' };
const SELECT_COLOR = '#ffd23f';
const HUD_FONT = '"Press Start 2P", monospace';

// The CPU passes an unattended regiment a new order once its AI has wanted it for this many ticks,
// so one-tick random twitches don't make it hop between regiments.
const BOT_DEBOUNCE = 3;
const BOT_FIRE_HOLD = 6; // ticks the CPU keeps VOLLEY down, so the panel shows the press

export const meta = {
  id: 'army',
  title: 'ARMY',
  width: W,
  height: H,
  players: 2,
  keyboard: {
    p1: {
      up: ['KeyW'],
      down: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      fire: ['Space', 'KeyF'],
      fire2: ['KeyE', 'KeyG'],
    },
    p2: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['Slash', 'Numpad0'],
      fire2: ['Period', 'NumpadDecimal'],
    },
  },
  keyHints: {
    p1: { stick: 'WASD', fire: 'SPACE', fire2: 'E' },
    p2: { stick: 'ARROWS', fire: '/', fire2: '.' },
  },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const uniform = (a, b) => a + Math.random() * (b - a);
const choice = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rad = (deg) => (deg * Math.PI) / 180;
const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const isMove = (action) => MOVES.includes(action);

class Bullet {
  constructor(x, y, angle, team, delay) {
    this.x = x;
    this.y = y;
    this.angle = angle; // radians
    this.team = team;
    this.lifetime = BULLET_LIFETIME;
    this.delay = delay; // ticks before it leaves the musket, for a ragged volley
  }

  /** @returns {boolean} true on the tick the ball is actually fired */
  update() {
    if (this.delay > 0) {
      this.delay--;
      return this.delay === 0;
    }
    this.x += Math.cos(this.angle) * BULLET_SPEED;
    this.y += Math.sin(this.angle) * BULLET_SPEED;
    this.lifetime--;
    return false;
  }

  get expired() {
    return (
      this.lifetime <= 0 ||
      this.x < MARGIN ||
      this.x > WORLD_W - MARGIN ||
      this.y < MARGIN ||
      this.y > WORLD_H - MARGIN
    );
  }

  draw(ctx) {
    if (this.delay > 0) return;
    ctx.fillStyle = rgb(TEAM_RGB[this.team]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, BULLET_RADIUS * 1.75, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Regiment {
  constructor(x, y, angle, team) {
    this.x = x;
    this.y = y;
    this.angle = angle; // degrees
    this.angleRad = rad(angle);
    this.team = team;
    this.health = REGIMENT_HEALTH;
    this.cooldown = 0;
    this.destroyed = false;
    this.stationaryTime = 0;
    this.recoveryTime = 0;
    this.consecutiveRetreats = 0;
    this.aiType = 'Standard';
    // The standing order from its commander: 'hold', 'fire' or one of MOVES.
    this.order = 'hold';
  }

  update(action) {
    if (this.destroyed) return;
    if (this.recoveryTime > 0) {
      this.recoveryTime--;
      action = 'hold';
    }
    if (isMove(action)) this.stationaryTime = 0;
    else this.stationaryTime++;
    this.consecutiveRetreats = action === 'move_backward' ? this.consecutiveRetreats + 1 : 0;

    if (action === 'move_forward') {
      this.x += Math.cos(this.angleRad) * REGIMENT_SPEED;
      this.y += Math.sin(this.angleRad) * REGIMENT_SPEED;
    } else if (action === 'move_backward') {
      this.x -= Math.cos(this.angleRad) * REGIMENT_SPEED;
      this.y -= Math.sin(this.angleRad) * REGIMENT_SPEED;
    } else if (action === 'wheel_left') {
      this.angle = (((this.angle - WHEEL_ANGLE) % 360) + 360) % 360;
      this.angleRad = rad(this.angle);
    } else if (action === 'wheel_right') {
      this.angle = (this.angle + WHEEL_ANGLE) % 360;
      this.angleRad = rad(this.angle);
    }

    const inset = MARGIN + 60;
    this.x = clamp(this.x, inset, WORLD_W - inset);
    this.y = clamp(this.y, inset, WORLD_H - inset);
    if (this.cooldown > 0) this.cooldown--;
  }

  canFire() {
    return !this.destroyed && this.cooldown <= 0 && this.stationaryTime >= SETUP_TIME;
  }

  /** A volley of musket balls from along the front rank, or [] if not ready. */
  fire() {
    if (!this.canFire()) return [];
    const front = this.angleRad;
    const perpendicular = front + Math.PI / 2;
    const frontX = this.x + Math.cos(front) * (REGIMENT_WIDTH / 2);
    const frontY = this.y + Math.sin(front) * (REGIMENT_WIDTH / 2);
    const bullets = [];
    for (let i = 0; i < BULLETS_PER_VOLLEY; i++) {
      const angle = front + uniform(-rad(15), rad(15));
      const offset = uniform(-REGIMENT_HEIGHT / 2 + 5, REGIMENT_HEIGHT / 2 - 5);
      const x = frontX + Math.cos(perpendicular) * offset;
      const y = frontY + Math.sin(perpendicular) * offset;
      bullets.push(new Bullet(x, y, angle, this.team, randint(0, 15)));
    }
    this.cooldown = COOLDOWN_TICKS;
    this.recoveryTime = RECOVERY_TIME;
    return bullets;
  }

  corners() {
    const hw = REGIMENT_WIDTH / 2;
    const hh = REGIMENT_HEIGHT / 2;
    const c = Math.cos(this.angleRad);
    const s = Math.sin(this.angleRad);
    return [
      [hw * c - hh * s + this.x, hw * s + hh * c + this.y],
      [hw * c + hh * s + this.x, hw * s - hh * c + this.y],
      [-hw * c + hh * s + this.x, -hw * s - hh * c + this.y],
      [-hw * c - hh * s + this.x, -hw * s + hh * c + this.y],
    ];
  }

  /** Axis-aligned bounding box, which is what the original collides bullets against. */
  bounds() {
    const pts = this.corners();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  takeDamage(amount) {
    if (this.destroyed) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.destroyed = true;
    }
  }
}

/** pygame Rect.colliderect between a regiment's bounds and a bullet's square. */
function hits(box, bullet) {
  const r = BULLET_RADIUS;
  return box.left < bullet.x + r && bullet.x - r < box.right && box.top < bullet.y + r && bullet.y - r < box.bottom;
}

// --- ai.py -------------------------------------------------------------------------------------

const PERSONALITIES = {
  Cautious: () => ({
    min: 350 + randint(-30, 30),
    max: 500 + randint(-40, 40),
    alignment: 8 + uniform(-1.5, 1.5),
    maneuver: 15 + uniform(-2, 2),
    random: Math.max(0.001, 0.01 + uniform(-0.005, 0.01)),
    aggression: clamp(0.2 + uniform(-0.1, 0.1), 0.1, 0.4),
    caution: clamp(0.9 + uniform(-0.1, 0.1), 0.7, 1.0),
  }),
  Aggressive: () => ({
    min: 180 + randint(-30, 30),
    max: 350 + randint(-30, 30),
    alignment: 15 + uniform(-2, 3),
    maneuver: 25 + uniform(-2, 4),
    random: clamp(0.03 + uniform(-0.01, 0.03), 0.01, 0.06),
    aggression: clamp(0.9 + uniform(-0.1, 0.1), 0.7, 1.0),
    caution: clamp(0.2 + uniform(-0.1, 0.1), 0.1, 0.4),
  }),
  Flanking: () => ({
    min: 250 + randint(-30, 30),
    max: 400 + randint(-30, 30),
    alignment: 12 + uniform(-2, 2),
    maneuver: 18 + uniform(-2, 2),
    random: clamp(0.02 + uniform(-0.01, 0.01), 0.01, 0.04),
    aggression: clamp(0.6 + uniform(-0.1, 0.1), 0.4, 0.7),
    caution: clamp(0.4 + uniform(-0.1, 0.1), 0.3, 0.6),
  }),
};

const normalize = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/** One regiment's AI with a random personality, as army.py assigns them. */
class RegimentAI {
  constructor(regiment, type = choice(Object.keys(PERSONALITIES))) {
    this.regiment = regiment;
    this.type = type;
    this.p = PERSONALITIES[type]();
    regiment.aiType = type;
  }

  /** The original AI.make_decisions for this one regiment: an action name, or null if destroyed. */
  decide(enemies) {
    const reg = this.regiment;
    const p = this.p;
    if (reg.destroyed) return null;
    if (reg.recoveryTime > 0) return 'hold';

    let closest = null;
    let distance = Infinity;
    for (const enemy of enemies) {
      if (enemy.destroyed) continue;
      const d = Math.hypot(reg.x - enemy.x, reg.y - enemy.y);
      if (d < distance) {
        distance = d;
        closest = enemy;
      }
    }
    if (!closest) return 'move_forward';

    let toEnemy = Math.atan2(closest.y - reg.y, closest.x - reg.x);
    let current = reg.angleRad;
    while (toEnemy < 0) toEnemy += 2 * Math.PI;
    while (current < 0) current += 2 * Math.PI;
    const diff = normalize(toEnemy - current);

    let minRange = p.min;
    let maxRange = p.max;
    if (p.aggression > 0.5) {
      minRange -= (p.aggression - 0.5) * 100;
      maxRange -= (p.aggression - 0.5) * 100;
    } else if (p.caution > 0.5) {
      minRange += (p.caution - 0.5) * 100;
      maxRange += (p.caution - 0.5) * 100;
    }

    const inRange = minRange <= distance && distance <= maxRange;
    const aligned = Math.abs(diff) < rad(p.alignment);
    const turnToward = () => (diff > 0 ? 'wheel_right' : 'wheel_left');
    let action;
    if (reg.canFire() && aligned && inRange) {
      action = 'fire';
    } else if (aligned && inRange && reg.stationaryTime > 0) {
      action = 'hold'; // keep aiming
    } else if (distance > maxRange) {
      action = Math.abs(diff) < rad(p.maneuver) ? 'move_forward' : turnToward();
    } else if (distance < minRange) {
      if (reg.consecutiveRetreats > 45) {
        // Retreated too long: stand and fight, or turn side-on to the enemy to slip away.
        if (reg.canFire() || reg.stationaryTime > 15) {
          action = 'hold';
        } else {
          let rightDiff = Math.abs(toEnemy + Math.PI / 2 - current);
          while (rightDiff > Math.PI) rightDiff = Math.abs(rightDiff - 2 * Math.PI);
          let leftDiff = Math.abs(toEnemy - Math.PI / 2 - current);
          while (leftDiff > Math.PI) leftDiff = Math.abs(leftDiff - 2 * Math.PI);
          action = rightDiff < leftDiff ? 'wheel_right' : 'wheel_left';
        }
      } else if (reg.canFire()) {
        action = 'fire';
      } else {
        action = Math.abs(diff) < rad(p.maneuver) ? 'move_backward' : turnToward();
      }
    } else if (Math.abs(diff) > rad(p.alignment / 2)) {
      action = turnToward();
    } else {
      action = 'hold';
    }

    if (Math.random() < p.random) action = choice([...MOVES, 'hold']);
    return action;
  }
}

// --- command model -----------------------------------------------------------------------------

/** The march order a stick position gives: the dominant axis wins, null when centred. */
function stickOrder(x, y) {
  if (Math.hypot(x, y) < 0.5) return null;
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'move_forward' : 'move_backward';
  return x < 0 ? 'wheel_left' : 'wheel_right';
}

const STICK_FOR = {
  move_forward: [0, -1],
  move_backward: [0, 1],
  wheel_left: [-1, 0],
  wheel_right: [1, 0],
};

class Army {
  constructor(team) {
    this.team = team;
    const left = team === 'red';
    this.regiments = Array.from({ length: REGIMENTS_PER_ARMY }, (_, i) => {
      const x = left ? MARGIN + 300 : WORLD_W - MARGIN - 300;
      return new Regiment(x, MARGIN + 300 + i * 360, left ? 0 : 180, team);
    });
    this.selected = 0;
    this.shotsFired = 0;
    this.damageDealt = 0;
  }

  get alive() {
    return this.regiments.filter((r) => !r.destroyed).length;
  }

  /** The next living regiment after `from`, cycling; `from` itself if it is the only one. */
  nextAlive(from) {
    for (let step = 1; step <= REGIMENTS_PER_ARMY; step++) {
      const i = (from + step) % REGIMENTS_PER_ARMY;
      if (!this.regiments[i].destroyed) return i;
    }
    return from;
  }

  /** Apply one tick of a player's controls to the commanded regiment's order. */
  command(player) {
    if (player.pressed('fire2')) this.selected = this.nextAlive(this.selected);
    const reg = this.regiments[this.selected];
    if (reg.destroyed) return;
    const march = stickOrder(player.x, player.y);
    if (march) reg.order = march;
    else if (player.pressed('fire')) reg.order = 'fire';
    else if (isMove(reg.order)) reg.order = 'hold'; // stick released: halt
  }
}

// --- CPU ---------------------------------------------------------------------------------------

/** Whether a regiment's standing order already does what its AI wants this tick. */
function orderSatisfies(order, action) {
  if (action === 'hold') return order === 'hold' || order === 'fire';
  return order === action;
}

/**
 * The original per-regiment AIs for one army, played through the stick and buttons: the
 * commanded regiment gets its AI's action on the stick every tick, and NEXT is pressed to reach
 * any other regiment whose AI has wanted a different order for a few ticks (or wants to fire).
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.army = game.armies[index];
    this.enemy = game.armies[1 - index];
    this.ais = this.army.regiments.map((r) => new RegimentAI(r));
    this.stale = this.ais.map(() => 0);
    this.nextWasDown = false;
    this.fireDown = 0;
  }

  input() {
    const army = this.army;
    const wanted = this.ais.map((ai) => ai.decide(this.enemy.regiments));
    let urgent = false;
    army.regiments.forEach((reg, i) => {
      const unattended = i !== army.selected && !reg.destroyed;
      const stale = unattended && !orderSatisfies(reg.order, wanted[i]);
      this.stale[i] = stale ? this.stale[i] + 1 : 0;
      if (stale && (wanted[i] === 'fire' || this.stale[i] >= BOT_DEBOUNCE)) urgent = true;
    });

    // A button press needs a tick with it up in between.
    const next = urgent && !this.nextWasDown && army.nextAlive(army.selected) !== army.selected;
    this.nextWasDown = next;
    const target = next ? army.nextAlive(army.selected) : army.selected;
    const action = wanted[target];

    const [x, y] = STICK_FOR[action] ?? [0, 0];
    let fire = false;
    if (action === 'fire') {
      // Press afresh (release first if it is still down from the last order).
      fire = this.fireDown === 0;
      this.fireDown = fire ? BOT_FIRE_HOLD : 0;
    } else if (this.fireDown > 0 && !next && !isMove(action)) {
      this.fireDown--;
      fire = this.fireDown > 0;
    } else {
      this.fireDown = 0;
    }
    return { x, y, buttons: { fire, fire2: next } };
  }
}

// --- effects (cosmetic) ------------------------------------------------------------------------

class Puff {
  constructor(x, y, kind) {
    this.x = x + uniform(-4, 4);
    this.y = y + uniform(-4, 4);
    this.kind = kind; // 'smoke' from a musket, 'hit' where a ball strikes
    this.age = 0;
    this.life = kind === 'smoke' ? randint(35, 55) : 10;
  }

  update() {
    this.age++;
  }

  get finished() {
    return this.age >= this.life;
  }

  draw(ctx) {
    const t = this.age / this.life;
    if (this.kind === 'smoke') {
      ctx.fillStyle = `rgba(235,235,225,${0.55 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 8 + 14 * t, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = `rgba(255,250,200,${1 - t})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 10 - 4 * t, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// --- the game ----------------------------------------------------------------------------------

class ArmyGame {
  constructor(bots) {
    this.armies = TEAMS.map((team) => new Army(team));
    this.bullets = [];
    this.puffs = [];
    this.tick = 0;
    this.over = false;
    this.winner = null;
    this.humans = bots.map((b) => !b);
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  get resultText() {
    return this.winner ? `${this.winner.toUpperCase()} ARMY WINS` : '';
  }

  botInput(index) {
    const bot = this.bots[index];
    if (!bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return bot.input();
  }

  update(input) {
    this.tick++;
    for (const puff of this.puffs) puff.update();
    this.puffs = this.puffs.filter((p) => !p.finished);
    if (this.over) return;

    this.armies.forEach((army, i) => army.command(input.player(i)));
    for (const army of this.armies) this.advance(army);
    this.updateBullets();
    for (const army of this.armies) {
      if (army.regiments[army.selected].destroyed) army.selected = army.nextAlive(army.selected);
    }
    const [red, blue] = this.armies;
    if (red.alive === 0) this.finish('blue');
    else if (blue.alive === 0) this.finish('red');
  }

  /** Each regiment carries out its standing order: game_logic.update_regiments. */
  advance(army) {
    for (const reg of army.regiments) {
      if (reg.destroyed) continue;
      const action = reg.order;
      reg.update(action);
      if (action === 'fire' && this.bullets.length < MAX_BULLETS) {
        const volley = reg.fire();
        this.bullets.push(...volley);
        army.shotsFired += volley.length;
      }
    }
  }

  /** game_logic.update_bullets */
  updateBullets() {
    const boxes = new Map(this.armies.flatMap((a) => a.regiments.map((r) => [r, r.bounds()])));
    const kept = [];
    for (const bullet of this.bullets) {
      if (bullet.update()) this.puffs.push(new Puff(bullet.x, bullet.y, 'smoke'));
      const shooter = this.armies.find((a) => a.team === bullet.team);
      const target = this.armies.find((a) => a !== shooter);
      const victim = target.regiments.find((r) => !r.destroyed && hits(boxes.get(r), bullet));
      if (victim) {
        victim.takeDamage(BULLET_DAMAGE);
        shooter.damageDealt += BULLET_DAMAGE;
        this.puffs.push(new Puff(bullet.x, bullet.y, 'hit'));
      } else if (!bullet.expired) {
        kept.push(bullet);
      }
    }
    this.bullets = kept;
  }

  finish(winner) {
    this.over = true;
    this.winner = winner;
  }

  // --- drawing ---------------------------------------------------------------------------------

  draw(ctx) {
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 10;
    ctx.strokeRect(MARGIN, MARGIN, WORLD_W - 2 * MARGIN, WORLD_H - 2 * MARGIN);

    for (const bullet of this.bullets) bullet.draw(ctx);
    for (const army of this.armies) {
      army.regiments.forEach((reg, i) => this.drawRegiment(ctx, reg, !this.over && i === army.selected));
    }
    for (const puff of this.puffs) puff.draw(ctx);
    for (const army of this.armies) {
      for (const reg of army.regiments) if (!reg.destroyed) this.drawBars(ctx, reg);
    }
    ctx.restore();
    this.drawHud(ctx);
  }

  drawRegiment(ctx, reg, selected) {
    if (reg.destroyed) return;
    const pts = reg.corners();
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      ctx.closePath();
    };

    if (selected) {
      const pulse = 0.6 + 0.4 * Math.sin(this.tick * 0.2);
      ctx.strokeStyle = `rgba(255,210,63,${pulse})`;
      ctx.lineWidth = 34;
      ctx.lineJoin = 'round';
      path();
      ctx.stroke();
    }
    ctx.fillStyle = rgb(TEAM_RGB[reg.team]);
    path();
    ctx.fill();
    ctx.strokeStyle = TEAM_DARK[reg.team];
    ctx.lineWidth = 4;
    path();
    ctx.stroke();

    // Front rank (corners 0 and 1 are the front edge).
    ctx.strokeStyle = TEAM_LIGHT[reg.team];
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    const inset = (a, b) => [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12];
    const back = (p, q) => [p[0] + (q[0] - p[0]) * 0.12, p[1] + (q[1] - p[1]) * 0.12];
    const f0 = back(inset(pts[0], pts[1]), pts[3]);
    const f1 = back(inset(pts[1], pts[0]), pts[2]);
    ctx.beginPath();
    ctx.moveTo(...f0);
    ctx.lineTo(...f1);
    ctx.stroke();
    ctx.lineCap = 'butt';

    this.drawOrder(ctx, reg);

    if (selected) {
      const bob = Math.sin(this.tick * 0.15) * 8;
      const top = reg.y - 150 + bob;
      ctx.fillStyle = SELECT_COLOR;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(reg.x - 22, top);
      ctx.lineTo(reg.x + 22, top);
      ctx.lineTo(reg.x, top + 26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** A white arrow on the regiment for a march order, so a regiment left marching is obvious. */
  drawOrder(ctx, reg) {
    const order = reg.order;
    if (!isMove(order) || reg.recoveryTime > 0) return;
    ctx.save();
    ctx.translate(reg.x, reg.y);
    ctx.rotate(reg.angleRad);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (order === 'move_forward' || order === 'move_backward') {
      const d = order === 'move_forward' ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(-10 * d, -22);
      ctx.lineTo(12 * d, 0);
      ctx.lineTo(-10 * d, 22);
      ctx.stroke();
    } else {
      // Curved arrow around the centre: clockwise on screen for wheel_right.
      const cw = order === 'wheel_right';
      const r = 26;
      const start = cw ? -Math.PI * 0.7 : Math.PI * 0.7;
      const end = cw ? Math.PI * 0.2 : -Math.PI * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, start, end, !cw);
      ctx.stroke();
      const tip = [Math.cos(end) * r, Math.sin(end) * r];
      const tangent = end + (cw ? Math.PI / 2 : -Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(tip[0] + Math.cos(tangent) * 12, tip[1] + Math.sin(tangent) * 12);
      ctx.lineTo(tip[0] + Math.cos(tangent + 2.4) * 12, tip[1] + Math.sin(tangent + 2.4) * 12);
      ctx.lineTo(tip[0] + Math.cos(tangent - 2.4) * 12, tip[1] + Math.sin(tangent - 2.4) * 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Health bar, and below it a readiness bar: aiming (yellow), reloading (grey), ready (white). */
  drawBars(ctx, reg) {
    const w = 80;
    const x = reg.x - w / 2;
    const y = reg.y - 100;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 3, w + 6, 30);
    const health = reg.health / REGIMENT_HEALTH;
    ctx.fillStyle = health < 0.3 ? 'rgb(255,50,50)' : health < 0.7 ? 'rgb(255,255,0)' : 'rgb(0,255,0)';
    ctx.fillRect(x, y, w * health, 14);

    let ready;
    let color;
    if (reg.cooldown > 0) {
      ready = 1 - reg.cooldown / COOLDOWN_TICKS;
      color = '#888';
    } else if (reg.stationaryTime < SETUP_TIME) {
      ready = reg.stationaryTime / SETUP_TIME;
      color = 'rgb(255,200,0)';
    } else {
      ready = 1;
      color = '#fff';
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 17, w * ready, 7);
  }

  drawHud(ctx) {
    ctx.textBaseline = 'middle';
    this.armies.forEach((army, i) => {
      const left = i === 0;
      const who = this.humans[i] ? `P${i + 1}` : 'CPU';
      const label = `${army.team.toUpperCase()} ${who}`;
      ctx.font = `20px ${HUD_FONT}`;
      ctx.textAlign = left ? 'left' : 'right';
      const x = left ? 16 : W - 16;
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 2, 27);
      ctx.fillStyle = rgb(TEAM_RGB[army.team]);
      ctx.fillText(label, x, 25);

      // One pip per regiment, filled to its health.
      const labelW = ctx.measureText(label).width;
      army.regiments.forEach((reg, k) => {
        const px = left ? x + labelW + 18 + k * 34 : x - labelW - 18 - (3 - k) * 34;
        ctx.fillStyle = '#000';
        ctx.fillRect(px, 14, 28, 22);
        ctx.fillStyle = rgb(TEAM_RGB[army.team]);
        ctx.fillRect(px + 3, 17 + 16 * (1 - reg.health / REGIMENT_HEALTH), 22, 16 * (reg.health / REGIMENT_HEALTH));
        if (!this.over && k === army.selected && this.humans[i]) {
          ctx.strokeStyle = SELECT_COLOR;
          ctx.lineWidth = 3;
          ctx.strokeRect(px - 2, 12, 32, 26);
        }
      });

      ctx.font = `14px ${HUD_FONT}`;
      ctx.fillStyle = '#000';
      ctx.fillText(`SHOTS ${army.shotsFired}  HITS ${army.damageDealt / BULLET_DAMAGE}`, x, H - 25);
    });
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two armies the CPU commands
 */
export function createGame({ bots }) {
  return new ArmyGame(bots);
}
