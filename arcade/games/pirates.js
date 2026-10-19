// Pirates, ported from pirates/pirates.py + pirates/entities.py (+ config.json).
// One original frame per fixed 60 Hz tick, with the original per-frame constants.
//
// Fixes to the original:
// - Broadside balls spawned on the opposite side of the hull from the one they fly out of
//   (port balls started at the starboard rail and vice versa); they now leave from the firing side.
// - Holding a sail key changed the sail every frame, so one press jumped straight from NONE to
//   FULL. Sails now step once per stick pulse (press, then auto-repeat while held).
// - Waves animated from the wall clock; they now follow the tick counter.
// - If both ships went down on the same frame, player 2 was declared the winner; it's now a draw.
// - The sail ellipse was drawn off-centre (pygame surface corner); it's centred on the mast now.

const W = 1200;
const H = 900;

// config.json
const SAIL_ACCELERATION = [0.001, 0.02, 0.04]; // none, mid, full
const ROTATION_SPEED = 1.0;
const DRAG = 0.98;
const MAX_VELOCITY = 2.0;
const CANNON_COOLDOWN = 90;
const CANNONBALL_SPEED = 2.5;
const CANNONBALL_LIFETIME = 180;
const BROADSIDE_COUNT = 3;

// entities.py
const SHIP_SIZE = 40;
// Ships and balls are drawn larger than their nominal size so they read at phone size. The
// original's hit circle (SHIP_SIZE + ball radius = 46 px around the centre) is far bigger than
// its 40 px hull, so the bigger drawing is also closer to what actually gets hit.
const SHIP_DRAW_SCALE = 1.6;
const BALL_DRAW_SCALE = 1.4;
const SHIP_WIDTH = 25;
const SHIP_MAX_HP = 5;
const CANNONBALL_RADIUS = 6;
const PORT_RADIUS = 50;
const SAIL_NONE = 0;
const SAIL_MID = 1;
const SAIL_FULL = 2;
const SAIL_NAMES = ['NONE', 'MID', 'FULL'];

const WHITE = '#fff';
const BLACK = '#000';
const BROWN = 'rgb(139,69,19)';
const DARK_BLUE = 'rgb(0,50,100)';
const LIGHT_BLUE = 'rgb(70,130,180)';
const PLAYER_COLORS = ['rgb(255,50,50)', 'rgb(50,50,255)'];
const HUD_COLORS = ['rgb(255,110,100)', 'rgb(140,170,255)']; // lighter than the ships so they read on dark blue
const GREEN = 'rgb(0,255,0)';
const YELLOW = 'rgb(255,255,0)';
const RED = 'rgb(255,50,50)';
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'pirates',
  title: 'PIRATES',
  width: W,
  height: H,
  players: 2,
  // The original's bindings: P1 (red) arrows + , / . ; P2 (blue) WASD + Q / E.
  // Space is an extra P1 PORT key (the arcade's usual fire key, and FIRE resumes from pause).
  keyboard: {
    p1: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['Comma', 'Space'],
      fire2: ['Period'],
    },
    p2: {
      up: ['KeyW'],
      down: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      fire: ['KeyQ'],
      fire2: ['KeyE'],
    },
  },
  keyHints: {
    p1: { stick: 'ARROWS', fire: ',', fire2: '.' },
    p2: { stick: 'WASD', fire: 'Q', fire2: 'E' },
  },
};

const uniform = (a, b) => a + Math.random() * (b - a);
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
/** Angle in degrees wrapped into (-180, 180]. */
const wrap180 = (a) => {
  const r = ((((a + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

class Port {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  draw(ctx) {
    ctx.fillStyle = BROWN;
    ctx.beginPath();
    ctx.arc(this.x, this.y, PORT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Plank lines, darker than the original's same-colour lines so they show.
    ctx.strokeStyle = 'rgb(95,45,10)';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(this.x - PORT_RADIUS, this.y + i * 15);
      ctx.lineTo(this.x + PORT_RADIUS, this.y + i * 15);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, PORT_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
}

class Cannonball {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.lifetime = CANNONBALL_LIFETIME;
    this.vx = Math.cos(rad(angle)) * CANNONBALL_SPEED;
    this.vy = Math.sin(rad(angle)) * CANNONBALL_SPEED;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;
  }

  get expired() {
    return this.lifetime <= 0 || this.x < 0 || this.x > W || this.y < 0 || this.y > H;
  }

  hits(ship) {
    if (ship.index === this.owner || ship.destroyed) return false;
    return Math.hypot(this.x - ship.x, this.y - ship.y) < CANNONBALL_RADIUS + SHIP_SIZE;
  }

  draw(ctx) {
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.arc(this.x, this.y, CANNONBALL_RADIUS * BALL_DRAW_SCALE, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(70,70,70)';
    ctx.beginPath();
    ctx.arc(this.x - 3, this.y - 3, (CANNONBALL_RADIUS * BALL_DRAW_SCALE) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Ship {
  constructor(x, y, angle, index) {
    this.x = x;
    this.y = y;
    this.angle = angle; // degrees, clockwise on screen (y down); 0 = east
    this.vx = 0;
    this.vy = 0;
    this.index = index;
    this.color = PLAYER_COLORS[index];
    this.sail = SAIL_MID;
    this.hp = SHIP_MAX_HP;
    this.destroyed = false;
    this.fled = false;
    this.cooldown = { port: 0, starboard: 0 };
  }

  /** @param {number} rotation -1 (to port), 0 or 1 (to starboard) @param {number} sailStep -1, 0 or 1 */
  update(rotation, sailStep) {
    this.angle = (((this.angle + rotation * ROTATION_SPEED) % 360) + 360) % 360;
    this.sail = Math.max(SAIL_NONE, Math.min(SAIL_FULL, this.sail + sailStep));

    const accel = SAIL_ACCELERATION[this.sail];
    this.vx = (this.vx + Math.cos(rad(this.angle)) * accel) * DRAG;
    this.vy = (this.vy + Math.sin(rad(this.angle)) * accel) * DRAG;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > MAX_VELOCITY) {
      this.vx *= MAX_VELOCITY / speed;
      this.vy *= MAX_VELOCITY / speed;
    }
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) {
      this.fled = true;
      this.destroyed = true;
    }
    for (const side of ['port', 'starboard']) if (this.cooldown[side] > 0) this.cooldown[side]--;
  }

  /** Degrees the given broadside fires towards. Port is the ship's left: heading - 90. */
  sideAngle(side) {
    return this.angle + (side === 'port' ? -90 : 90);
  }

  /** Where the cannon at `slot` (0..BROADSIDE_COUNT-1) on `side` sits. */
  gunPosition(side, slot) {
    const a = rad(this.angle);
    const out = rad(this.sideAngle(side));
    const offset = (slot - Math.floor(BROADSIDE_COUNT / 2)) * (SHIP_SIZE / BROADSIDE_COUNT);
    return [
      this.x + Math.cos(a) * offset + Math.cos(out) * (SHIP_WIDTH / 2),
      this.y + Math.sin(a) * offset + Math.sin(out) * (SHIP_WIDTH / 2),
    ];
  }

  fireBroadside(side) {
    if (this.cooldown[side] > 0) return [];
    this.cooldown[side] = CANNON_COOLDOWN;
    const balls = [];
    for (let slot = 0; slot < BROADSIDE_COUNT; slot++) {
      const [x, y] = this.gunPosition(side, slot);
      balls.push(new Cannonball(x, y, this.sideAngle(side) + uniform(-5, 5), this.index));
    }
    return balls;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.destroyed = true;
  }

  draw(ctx) {
    if (this.destroyed) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(rad(this.angle));
    ctx.scale(SHIP_DRAW_SCALE, SHIP_DRAW_SCALE);
    // Hull in ship coordinates: +x is the bow, -y is port.
    const half = SHIP_SIZE / 2;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(0, SHIP_WIDTH / 2);
    ctx.lineTo(-half, SHIP_WIDTH / 3);
    ctx.lineTo(-half, 0);
    ctx.lineTo(-half, -SHIP_WIDTH / 3);
    ctx.lineTo(0, -SHIP_WIDTH / 2);
    ctx.closePath();
    ctx.fillStyle = BROWN;
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (this.sail > SAIL_NONE) {
      const along = (SHIP_WIDTH * 0.6) / 2;
      const across = ((this.sail === SAIL_MID ? 0.4 : 0.6) * SHIP_SIZE) / 2;
      ctx.fillStyle = WHITE;
      ctx.beginPath();
      ctx.ellipse(SHIP_SIZE * 0.1, 0, along, across, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.drawHpBar(ctx);
  }

  drawHpBar(ctx) {
    const bw = 70;
    const bh = 10;
    const bx = this.x - bw / 2;
    const by = this.y - SHIP_SIZE - 18;
    const ratio = this.hp / SHIP_MAX_HP;
    ctx.fillStyle = BLACK;
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = ratio > 0.6 ? GREEN : ratio > 0.3 ? YELLOW : RED;
    ctx.fillRect(bx, by, bw * ratio, bh);
  }
}

/** Short-lived puff of particles: a hit, a sinking, or a splash where a ball runs out. */
class Burst {
  constructor(x, y, colors, count, speed, life) {
    this.age = 0;
    this.life = life;
    this.particles = Array.from({ length: count }, () => {
      const a = uniform(0, Math.PI * 2);
      const s = uniform(speed * 0.3, speed);
      return {
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: uniform(2, 6),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: uniform(life * 0.4, life),
      };
    });
  }

  update() {
    this.age++;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }

  get finished() {
    return this.age >= this.life;
  }

  draw(ctx) {
    for (const p of this.particles) {
      if (this.age >= p.life) continue;
      ctx.globalAlpha = 1 - this.age / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

const HIT_COLORS = ['rgb(255,200,40)', 'rgb(255,120,20)', 'rgb(255,60,30)'];
const SINK_COLORS = ['rgb(255,200,40)', 'rgb(255,120,20)', BROWN, 'rgb(90,45,10)', WHITE];
const SPLASH_COLORS = ['rgb(200,230,255)', WHITE];

// --- CPU captain ------------------------------------------------------------------------------

const BOT_EDGE_MARGIN = 190; // turning circle at full speed is ~115 px
const BOT_RANGES = [170, 340]; // preferred fighting range, re-picked now and then (balls fly 450 px)
const BOT_TACTIC_TICKS = [180, 420]; // how long a captain sticks to one range / sail plan
const BOT_HIT_RADIUS = 22; // fire when the middle ball's predicted miss distance is under this
const BOT_LEAD_ERROR = [0.3, 1.7]; // multiplier on the enemy's velocity when leading a shot
const BOT_AIM_ERROR = 40; // px of misjudged enemy position
const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/** Closest approach (px) between a ball fired now and a target moving at constant velocity. */
function predictedMiss(ship, side, target, error = { lead: 1, dx: 0, dy: 0 }) {
  const [bx, by] = ship.gunPosition(side, Math.floor(BROADSIDE_COUNT / 2));
  const a = rad(ship.sideAngle(side));
  const rx = target.x + error.dx - bx;
  const ry = target.y + error.dy - by;
  const vx = target.vx * error.lead - Math.cos(a) * CANNONBALL_SPEED;
  const vy = target.vy * error.lead - Math.sin(a) * CANNONBALL_SPEED;
  const v2 = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(CANNONBALL_LIFETIME, v2 > 0 ? -(rx * vx + ry * vy) / v2 : 0));
  return Math.hypot(rx + vx * t, ry + vy * t);
}

/**
 * CPU captain. Steers to bring the enemy abeam at a comfortable range (closing in when far,
 * opening out when too close), leads the target, keeps clear of the map edge (sailing off it
 * loses), and fires a broadside when its own prediction says the shot will land. It works the
 * stick and both buttons like a player, so the cabinet panel animates.
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.sailHold = 0; // ticks left holding the stick up/down for one sail step
    this.sailRest = 0; // ticks to centre the stick before the next step
    this.sailDir = 0;
    this.fireHold = { port: 0, starboard: 0 };
    this.aimDelay = 0; // reaction time once a firing solution appears
    this.preferredSide = Math.random() < 0.5 ? 1 : -1;
    this.tacticTimer = 0;
    this.misjudge();
  }

  /**
   * Re-picks the fighting range and sail plan every few seconds. Two identical captains
   * otherwise settle into a perfectly symmetric orbit where neither ever gets a shot.
   */
  rethink() {
    this.idealRange = uniform(BOT_RANGES[0], BOT_RANGES[1]);
    this.fullSail = Math.random() < 0.35;
    if (Math.random() < 0.3) this.preferredSide = -this.preferredSide;
    this.tacticTimer = Math.floor(uniform(BOT_TACTIC_TICKS[0], BOT_TACTIC_TICKS[1]));
  }

  /** The captain's eye isn't perfect: each shot misreads the enemy's speed and position a bit. */
  misjudge() {
    this.error = {
      lead: uniform(BOT_LEAD_ERROR[0], BOT_LEAD_ERROR[1]),
      dx: uniform(-1, 1) * BOT_AIM_ERROR,
      dy: uniform(-1, 1) * BOT_AIM_ERROR,
    };
  }

  input() {
    const game = this.game;
    const me = game.ships[this.index];
    const enemy = game.ships[1 - this.index];
    if (game.over || me.destroyed) return NEUTRAL;
    if (--this.tacticTimer <= 0) this.rethink();

    const heading = this.desiredHeading(me, enemy);
    const error = wrap180(heading - me.angle);
    const x = Math.abs(error) > 1.5 ? Math.sign(error) : 0;

    const y = this.sailStick(me, this.desiredSail(me, enemy, error));

    const buttons = {};
    for (const side of ['port', 'starboard']) {
      if (this.fireHold[side] > 0) {
        this.fireHold[side]--;
        buttons[side === 'port' ? 'fire' : 'fire2'] = this.fireHold[side] > 0;
      }
    }
    this.considerFiring(me, enemy);
    return { x, y, buttons };
  }

  desiredHeading(me, enemy) {
    const distance = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    // Lead the target by the time a ball takes to get there.
    const t = Math.min(CANNONBALL_LIFETIME, distance / CANNONBALL_SPEED);
    const bearing = deg(Math.atan2(enemy.y + enemy.vy * t - me.y, enemy.x + enemy.vx * t - me.x));
    const relative = wrap180(bearing - me.angle);
    // Keep the enemy on whichever side they're on (starboard = +), unless dead ahead/astern.
    const side = Math.abs(relative) < 15 || Math.abs(relative) > 165 ? this.preferredSide : Math.sign(relative);
    const beam = 90 - Math.max(-50, Math.min(60, (distance - this.idealRange) / 4));
    let hx = Math.cos(rad(bearing - side * beam));
    let hy = Math.sin(rad(bearing - side * beam));

    // Push away from the edges, harder the closer we are, looking ahead along our drift.
    const px = me.x + me.vx * 30;
    const py = me.y + me.vy * 30;
    const push = (d) => (d < BOT_EDGE_MARGIN ? ((BOT_EDGE_MARGIN - d) / BOT_EDGE_MARGIN) * 4 : 0);
    hx += push(px) - push(W - px);
    hy += push(py) - push(H - py);
    return deg(Math.atan2(hy, hx));
  }

  desiredSail(me, enemy, headingError) {
    const edge = Math.min(me.x, W - me.x, me.y, H - me.y);
    const outward = this.headingTowardEdge(me);
    if (edge < 110 && outward) return SAIL_NONE;
    if (Math.abs(headingError) > 60) return SAIL_MID; // tighten the turn
    const distance = Math.hypot(enemy.x - me.x, enemy.y - me.y);
    return this.fullSail || distance > this.idealRange * 1.6 ? SAIL_FULL : SAIL_MID;
  }

  headingTowardEdge(me) {
    const hx = Math.cos(rad(me.angle));
    const hy = Math.sin(rad(me.angle));
    const nearest = [
      [me.x, -1, 0],
      [W - me.x, 1, 0],
      [me.y, 0, -1],
      [H - me.y, 0, 1],
    ].sort((a, b) => a[0] - b[0])[0];
    return hx * nearest[1] + hy * nearest[2] > 0.2;
  }

  /** Steps the sails one notch at a time by flicking the stick up (raise) or down (lower). */
  sailStick(me, wanted) {
    if (this.sailHold > 0) {
      this.sailHold--;
      if (this.sailHold === 0) this.sailRest = 4;
      return this.sailDir;
    }
    if (this.sailRest > 0) {
      this.sailRest--;
      return 0;
    }
    if (wanted === me.sail) return 0;
    this.sailDir = wanted > me.sail ? -1 : 1;
    this.sailHold = 6; // shorter than the stick's auto-repeat delay: exactly one step
    return this.sailDir;
  }

  considerFiring(me, enemy) {
    let side = null;
    for (const s of ['port', 'starboard']) {
      if (me.cooldown[s] === 0 && this.fireHold[s] === 0 && predictedMiss(me, s, enemy, this.error) < BOT_HIT_RADIUS)
        side = s;
    }
    if (!side) {
      this.aimDelay = 0;
      return;
    }
    // A human-ish pause before pulling the lanyard; the shot may slip away meanwhile.
    if (this.aimDelay === 0) this.aimDelay = 10 + Math.floor(Math.random() * 30);
    if (--this.aimDelay > 0) return;
    this.fireHold[side] = 7;
    this.misjudge();
  }
}

class PiratesGame {
  constructor(bots) {
    this.ports = [new Port(W / 2, 50), new Port(W / 2, H - 50), new Port(50, H / 2), new Port(W - 50, H / 2)];
    this.ships = [new Ship(50, H / 2, 0, 0), new Ship(W - 50, H / 2, 180, 1)];
    this.cannonballs = [];
    this.effects = [];
    this.tick = 0;
    this.over = false;
    this.winner = -1; // -1 while playing or on a draw
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  get resultText() {
    if (!this.over) return '';
    if (this.winner < 0) return 'BOTH SHIPS SUNK';
    const loser = this.ships[1 - this.winner];
    return loser.fled ? `P${loser.index + 1} FLED  P${this.winner + 1} WINS` : `PLAYER ${this.winner + 1} WINS`;
  }

  botInput(index) {
    const bot = this.bots[index];
    if (!bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return bot.input();
  }

  update(input) {
    this.tick++;
    for (const e of this.effects) e.update();
    this.effects = this.effects.filter((e) => !e.finished);
    if (this.over) {
      // Shots still in the air finish their flight (harmlessly) behind the GAME OVER card.
      for (const ball of this.cannonballs) ball.update();
      this.cannonballs = this.cannonballs.filter((b) => !b.expired);
      return;
    }

    this.ships.forEach((ship, i) => {
      if (ship.destroyed) return;
      const player = input.player(i);
      const rotation = Math.abs(player.x) > 0.3 ? Math.sign(player.x) : 0;
      ship.update(rotation, -player.pulseY);
      if (player.pressed('fire')) this.cannonballs.push(...ship.fireBroadside('port'));
      if (player.pressed('fire2')) this.cannonballs.push(...ship.fireBroadside('starboard'));
    });

    this.updateCannonballs();

    const [a, b] = this.ships;
    if (a.destroyed || b.destroyed) {
      this.over = true;
      this.winner = a.destroyed && b.destroyed ? -1 : a.destroyed ? 1 : 0;
      for (const ship of this.ships) {
        if (ship.destroyed && !ship.fled) this.effects.push(new Burst(ship.x, ship.y, SINK_COLORS, 70, 6, 80));
      }
    }
  }

  updateCannonballs() {
    const remaining = [];
    for (const ball of this.cannonballs) {
      ball.update();
      if (ball.expired) {
        if (ball.lifetime <= 0) this.effects.push(new Burst(ball.x, ball.y, SPLASH_COLORS, 8, 1.5, 25));
        continue;
      }
      const target = this.ships.find((s) => ball.hits(s));
      if (target) {
        target.takeDamage(1);
        this.effects.push(new Burst(ball.x, ball.y, HIT_COLORS, 22, 4, 40));
        continue;
      }
      remaining.push(ball);
    }
    this.cannonballs = remaining;
  }

  drawOcean(ctx) {
    ctx.fillStyle = DARK_BLUE;
    ctx.fillRect(0, 0, W, H);
    const spacing = 40;
    const ms = (this.tick * 1000) / 60;
    const offset = Math.floor(ms / 50) % spacing;
    ctx.strokeStyle = LIGHT_BLUE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = -spacing; y < H + spacing; y += spacing) {
      for (let x = 0; x < W; x += 100) {
        for (let i = 0; i < 100; i += 4) {
          const wx = x + i;
          const wy = y + offset + Math.sin((wx + ms / 100) / 20) * 3;
          if (i === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
      }
    }
    ctx.stroke();
  }

  drawHud(ctx) {
    ctx.textBaseline = 'top';
    this.ships.forEach((ship, i) => {
      const left = i === 0;
      const x = left ? 16 : W - 16;
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillStyle = HUD_COLORS[i];
      ctx.font = `30px ${HUD_FONT}`;
      ctx.shadowColor = BLACK;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      const who = this.bots[i] ? 'CPU' : `P${i + 1}`;
      ctx.fillText(`${who} HP ${ship.hp}/${SHIP_MAX_HP}`, x, 16);
      ctx.font = `22px ${HUD_FONT}`;
      ctx.fillText(`SAILS ${SAIL_NAMES[ship.sail]}`, x, 58);
      ctx.shadowColor = 'transparent';
      // Reload lamps: P(ort) and S(tarboard), green when that broadside is ready.
      const lamps = [
        ['P', ship.cooldown.port],
        ['S', ship.cooldown.starboard],
      ];
      lamps.forEach(([label, cd], k) => {
        const slot = left ? k : 1 - k;
        const lx = left ? x + slot * 60 : x - slot * 60 - 44;
        ctx.fillStyle = cd === 0 ? GREEN : 'rgb(120,60,40)';
        ctx.fillRect(lx, 92, 44, 24);
        if (cd > 0) {
          ctx.fillStyle = 'rgb(255,160,60)';
          ctx.fillRect(lx, 92, 44 * (1 - cd / CANNON_COOLDOWN), 24);
        }
        ctx.fillStyle = BLACK;
        ctx.textAlign = 'center';
        ctx.font = `14px ${HUD_FONT}`;
        ctx.fillText(label, lx + 22, 97);
        ctx.textAlign = left ? 'left' : 'right';
      });
    });
  }

  draw(ctx) {
    this.drawOcean(ctx);
    for (const port of this.ports) port.draw(ctx);
    for (const ball of this.cannonballs) ball.draw(ctx);
    for (const ship of this.ships) ship.draw(ctx);
    for (const e of this.effects) e.draw(ctx);
    this.drawHud(ctx);
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two captains the CPU controls
 */
export function createGame({ bots }) {
  return new PiratesGame(bots);
}
