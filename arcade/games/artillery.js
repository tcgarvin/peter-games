// Artillery, ported from artillery/artillery.py.
// Physics run once per fixed 60 Hz tick with the original per-frame constants.

const W = 800;
const H = 600;
const GRAVITY = 0.5;
const TERRAIN_POINTS = 100;
const MAX_POWER = 100;
const STEP = 5;

const SKY_BLUE = '#87ceeb';
const BROWN = [139, 69, 19];
const PLAYER_RGB = [[255, 0, 0], [0, 0, 255]];
const BLAST_RGB = [[255, 50, 50], [255, 165, 0], [255, 255, 0]];
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'artillery',
  title: 'ARTILLERY',
  width: W,
  height: H,
  // Turn-based: one set of keys drives whichever player's turn it is.
  keyboard: {
    shared: {
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fire: ['Space', 'KeyF'],
    },
  },
  keyHints: { stick: 'ARROWS', fire: 'SPACE' },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const uniform = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const rad = (deg) => (deg * Math.PI) / 180;

class Terrain {
  constructor() {
    this.points = [];
    let height = randint(Math.floor(H * 0.5), Math.floor(H * 0.8));
    for (let i = 0; i <= TERRAIN_POINTS; i++) {
      if (i > 0) height = clamp(height + randint(-10, 10), H * 0.3, H * 0.8);
      this.points.push([(i * W) / TERRAIN_POINTS, height]);
    }
  }

  heightAt(x) {
    if (x < 0 || x > W) return H;
    const i = Math.min(Math.floor(x / (W / TERRAIN_POINTS)), TERRAIN_POINTS - 1);
    const [x1, y1] = this.points[i];
    const [x2, y2] = this.points[i + 1];
    return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }

  draw(ctx) {
    ctx.fillStyle = rgb(BROWN);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const [x, y] of this.points) ctx.lineTo(x, y);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

class Cannon {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.angle = index === 0 ? 45 : 135;
    this.power = 50;
    this.size = 20;
    this.alive = true;
  }

  adjustAngle(change) {
    const [lo, hi] = this.index === 0 ? [0, 90] : [90, 180];
    this.angle = clamp(this.angle + change, lo, hi);
  }

  adjustPower(change) {
    this.power = clamp(this.power + change, 10, MAX_POWER);
  }

  barrelEnd(angle = this.angle) {
    const length = this.size * 1.5;
    return [this.x + length * Math.cos(rad(angle)), this.y - length * Math.sin(rad(angle))];
  }

  fire(angle = this.angle, power = this.power) {
    const [x, y] = this.barrelEnd(angle);
    const speed = power / 5;
    return new Projectile(x, y, speed * Math.cos(rad(angle)), -speed * Math.sin(rad(angle)), PLAYER_RGB[this.index]);
  }

  draw(ctx, isActive, tick) {
    if (!this.alive) return;
    ctx.fillStyle = rgb(PLAYER_RGB[this.index]);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    const [ex, ey] = this.barrelEnd();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = `14px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`PWR ${this.power}`, this.x, this.y - 62);
    ctx.fillText(`ANG ${this.angle}`, this.x, this.y - 40);

    if (isActive) {
      // Bobbing marker so a phone-sized screen still shows whose turn it is.
      const bob = Math.sin(tick * 0.15) * 4;
      const top = this.y - 100 + bob;
      ctx.fillStyle = rgb(PLAYER_RGB[this.index]);
      ctx.beginPath();
      ctx.moveTo(this.x - 12, top);
      ctx.lineTo(this.x + 12, top);
      ctx.lineTo(this.x, top + 14);
      ctx.closePath();
      ctx.fill();
    }
  }
}

class Projectile {
  constructor(x, y, vx, vy, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = 5;
    this.color = color;
    this.active = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += GRAVITY;
  }

  /** True if the shell hit the ground; going off-screen just deactivates it. */
  checkTerrain(terrain) {
    if (!this.active) return false;
    if (this.y + this.radius >= terrain.heightAt(this.x)) {
      this.active = false;
      return true;
    }
    if (this.x < 0 || this.x > W || this.y > H) this.active = false;
    return false;
  }

  /** Returns the cannon this shell hit, or null. Does not mutate the cannon. */
  checkCannons(cannons) {
    if (!this.active) return null;
    for (const cannon of cannons) {
      if (!cannon.alive) continue;
      if (Math.hypot(this.x - cannon.x, this.y - cannon.y) < this.radius + cannon.size) {
        this.active = false;
        return cannon;
      }
    }
    return null;
  }

  draw(ctx) {
    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Explosion {
  constructor(x, y, color) {
    this.age = 0;
    this.duration = 90;
    this.particles = [];
    for (let i = randint(40, 60); i > 0; i--) {
      const angle = uniform(0, Math.PI * 2);
      const speed = uniform(2, 8);
      const shift = randint(-30, 30);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: uniform(2, 6),
        color: color.map((c) => clamp(c + shift, 0, 255)),
        life: uniform(30, this.duration),
      });
    }
  }

  update() {
    this.age++;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.size *= 0.98;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      if (this.age >= p.life) continue;
      ctx.fillStyle = rgb(p.color, 1 - this.age / p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  get finished() {
    return this.age > this.duration;
  }
}

/** Where a shot would land, using the same projectile rules as live play. */
function simulateShot(terrain, cannons, shooter, angle, power) {
  const shell = shooter.fire(angle, power);
  for (let i = 0; i < 2000; i++) {
    shell.update();
    if (shell.checkTerrain(terrain)) return { x: shell.x, hit: null };
    const hit = shell.checkCannons(cannons);
    if (hit) return { x: shell.x, hit };
    if (!shell.active) return { x: shell.x < 0 ? -200 : W + 200, hit: null };
  }
  return { x: shell.x, hit: null };
}

const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/**
 * CPU gunner. It works the joystick and FIRE button like a person would, so the cabinet's
 * panel animates during CPU turns and attract mode. It brackets the target: wide first shot,
 * closer each turn.
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.plan = null;
    this.shotsTaken = 0;
    this.wait = 0;
    this.settle = 0;
    this.fireFrames = 0;
  }

  input() {
    const game = this.game;
    if (this.fireFrames > 0) {
      this.fireFrames--;
      return { x: 0, y: 0, buttons: { fire: true } };
    }
    if (game.over || game.current !== this.index || game.projectile) {
      this.plan = null;
      return NEUTRAL;
    }
    if (!this.plan) {
      this.plan = this.choose();
      this.wait = 40;
      this.settle = 0;
    }
    if (this.wait > 0) {
      this.wait--;
      return NEUTRAL;
    }
    const cannon = game.cannons[this.index];
    if (cannon.angle !== this.plan.angle) {
      return { x: this.plan.angle > cannon.angle ? -1 : 1, y: 0, buttons: {} };
    }
    if (cannon.power !== this.plan.power) {
      return { x: 0, y: this.plan.power > cannon.power ? -1 : 1, buttons: {} };
    }
    if (this.settle < 20) {
      this.settle++;
      return NEUTRAL;
    }
    this.fireFrames = 8;
    this.shotsTaken++;
    return { x: 0, y: 0, buttons: { fire: true } };
  }

  choose() {
    const { terrain, cannons } = this.game;
    const me = cannons[this.index];
    const target = cannons[1 - this.index];
    const spread = [150, 70, 25][Math.min(this.shotsTaken, 2)];
    const aimX = target.x + (Math.random() < 0.5 ? -1 : 1) * spread * uniform(0.4, 1);
    const [lo, hi] = this.index === 0 ? [0, 90] : [90, 180];
    let best = null;
    for (let angle = lo; angle <= hi; angle += STEP) {
      for (let power = 10; power <= MAX_POWER; power += STEP) {
        const shot = simulateShot(terrain, cannons, me, angle, power);
        if (shot.hit === me) continue;
        const miss = shot.hit === target && spread < 30 ? 0 : Math.abs(shot.x - aimX);
        // Prefer aims near the current setting so the stick doesn't swing wildly.
        const effort = (Math.abs(angle - me.angle) + Math.abs(power - me.power)) * 0.15;
        const score = miss + effort;
        if (!best || score < best.score) best = { angle, power, score };
      }
    }
    return best ?? { angle: me.angle, power: me.power };
  }
}

class ArtilleryGame {
  constructor(bots) {
    this.terrain = new Terrain();
    const xs = [W * 0.2, W * 0.8];
    this.cannons = xs.map((x, i) => new Cannon(x, this.terrain.heightAt(x), i));
    this.projectile = null;
    this.current = 0;
    this.over = false;
    this.winner = -1;
    this.explosions = [];
    this.tick = 0;
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  /** The player the shared keyboard controls should drive right now. */
  get activePlayer() {
    return this.current;
  }

  get resultText() {
    return this.winner < 0 ? '' : `PLAYER ${this.winner + 1} WINS`;
  }

  botInput(index) {
    const bot = this.bots[index];
    if (!bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return bot.input();
  }

  update(input) {
    this.tick++;
    for (const e of this.explosions) e.update();
    this.explosions = this.explosions.filter((e) => !e.finished);
    if (this.over) return;

    if (this.projectile) {
      this.updateProjectile();
      return;
    }

    const player = input.player(this.current);
    const cannon = this.cannons[this.current];
    if (player.pulseY) cannon.adjustPower(-player.pulseY * STEP);
    if (player.pulseX) cannon.adjustAngle(-player.pulseX * STEP);
    if (player.pressed('fire')) this.projectile = cannon.fire();
  }

  updateProjectile() {
    const shell = this.projectile;
    shell.update();
    if (shell.checkTerrain(this.terrain)) {
      this.explosions.push(new Explosion(shell.x, shell.y, BROWN));
      this.endTurn();
      return;
    }
    const hit = shell.checkCannons(this.cannons);
    if (hit) {
      hit.alive = false;
      for (const color of BLAST_RGB) this.explosions.push(new Explosion(hit.x, hit.y, color));
      this.over = true;
      this.winner = this.cannons.findIndex((c) => c.alive);
      this.projectile = null;
      return;
    }
    if (!shell.active) this.endTurn();
  }

  endTurn() {
    this.projectile = null;
    this.current = 1 - this.current;
  }

  draw(ctx) {
    ctx.fillStyle = SKY_BLUE;
    ctx.fillRect(0, 0, W, H);
    this.terrain.draw(ctx);
    const waiting = !this.over && !this.projectile;
    this.cannons.forEach((c, i) => c.draw(ctx, waiting && i === this.current, this.tick));
    if (this.projectile) this.projectile.draw(ctx);
    for (const e of this.explosions) e.draw(ctx);

    if (!this.over) {
      const who = this.bots[this.current] ? 'CPU' : `PLAYER ${this.current + 1}`;
      ctx.font = `18px ${HUD_FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = rgb(PLAYER_RGB[this.current]);
      ctx.fillText(`${who} TO FIRE`, 20, 20);
    }
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two players the CPU controls
 */
export function createGame({ bots }) {
  return new ArtilleryGame(bots);
}
