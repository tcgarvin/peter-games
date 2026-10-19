// Racing, ported from racing/racing.py.
// Physics run once per fixed 60 Hz tick with the original per-frame constants, in the original's
// 1728x1080 world coordinates. Only the drawing is scaled down to the 864x540 canvas.
//
// Changes from the original:
// - The "top-centre island" power-up at (864, 380) sat in the infield, out of reach of any car
//   (cars can't leave the asphalt). It now sits on the track between waypoints 8 and 9.
// - Two cars touching a power-up on the same frame both used to get it; now only the first does.
// - The splash screen, "press R" restart and ESC quit belong to the arcade shell now. The
//   3-second countdown stays: it is part of the race.
// - Cars, power-ups and bullets are drawn larger than their hit sizes (and HUD text much larger)
//   so they read on a phone through the CRT. Collision sizes are unchanged.
// - A destroyed car bursts into an explosion instead of just stopping.

const WORLD_W = 1728;
const WORLD_H = 1080;
const DRAW_SCALE = 0.5;
const W = WORLD_W * DRAW_SCALE;
const H = WORLD_H * DRAW_SCALE;
const FPS = 60;
const TOTAL_LAPS = 3;

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const TRACK_COLOR = [75, 75, 75];
const TRACK_BORDER = [220, 220, 220];
const GRASS_COLOR = [45, 110, 45];
const BLUE = [0, 114, 178];
const ORANGE = [230, 159, 0];
const YELLOW = [255, 215, 0];
const GREEN_PU = [0, 200, 100];
const RED = [210, 50, 50];
const DARK_RED = [140, 0, 0];
const LIGHT_GRAY = [180, 180, 180];
const HUD_FONT = '"Press Start 2P", monospace';

// Track center-line waypoints (closed loop, clockwise), with a hairpin at the bottom right.
const TRACK_WAYPOINTS = [
  [864, 85], // 0  start/finish
  [1380, 110],
  [1620, 295],
  [1620, 545], // 3  required checkpoint
  [1560, 715],
  [1450, 845],
  [1310, 895], // 6  hairpin apex, required
  [1170, 845],
  [1060, 715],
  [830, 820],
  [570, 950], // 10 required
  [270, 835],
  [110, 610], // 12 required
  [110, 370],
  [310, 130],
];
const TRACK_WIDTH = 140;
const CHECKPOINT_RADIUS = 85;
const CHECKPOINT_COOLDOWN = FPS * 3;
const REQUIRED_CHECKPOINTS = [3, 6, 10, 12];

// Car physics
const MAX_SPEED = 3.5;
const ACCELERATION = 0.1;
const BRAKING = 0.18;
const FRICTION = 0.04;
const WALL_SPEED_LOSS = 0.45;
const TURN_SPEED = 3.0; // degrees/frame at max speed

// Power-ups and weapons
const SPEED_BOOST_MULT = 1.8;
const SPEED_BOOST_FRAMES = 5 * FPS;
const ARMOR_MAX = 3;
const MAX_AMMO = 5;
const BULLET_SPEED = 12;
const BULLET_RADIUS = 5;
const BULLET_LIFETIME = FPS * 2;
const SHOOT_COOLDOWN = 15;
const MAX_HEALTH = 3;
const POWERUP_RESPAWN_FRAMES = 9 * FPS;
const POWERUP_RADIUS = 18;
const POWERUP_FLOAT_SPEED = 0.05;
const POWERUP_KINDS = ['speed', 'armor', 'gun'];
const POWERUP_POSITIONS = [
  [945, 768], // was (864, 380) in the unreachable infield
  [1250, 115],
  [1620, 420],
  [1310, 895],
  [700, 885],
  [110, 490],
];

const CAR_W = 42;
const CAR_H = 24;
const CAR_HEIGHT_PX = 10; // pseudo-3D height of the car body above ground
const CAR_DRAW_SCALE = 1.35; // drawn larger than the hit size so it reads on a phone
const COUNTDOWN_FRAMES = FPS * 3;

export const meta = {
  id: 'racing',
  title: 'RACING',
  width: W,
  height: H,
  players: 2,
  keyboard: {
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter'] },
  },
  keyHints: { p1: { stick: 'WASD', fire: 'SPACE' }, p2: { stick: 'ARROWS', fire: 'ENTER' } },
};

const uniform = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;
const shade = (color, factor) => color.map((c) => clamp(Math.floor(c * factor), 0, 255));
const rad = (deg) => (deg * Math.PI) / 180;
/** Signed difference a - b in degrees, in (-180, 180]. */
const angleDiff = (a, b) => {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};

/** Unit vector of the clockwise track direction at a waypoint. */
function trackDirectionAt(index) {
  const n = TRACK_WAYPOINTS.length;
  const [px, py] = TRACK_WAYPOINTS[(index - 1 + n) % n];
  const [nx, ny] = TRACK_WAYPOINTS[(index + 1) % n];
  const length = Math.hypot(nx - px, ny - py);
  return [(nx - px) / length, (ny - py) / length];
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

/**
 * The original paints each segment as a TRACK_WIDTH-wide rectangle with round caps and treats
 * the asphalt pixels as the drivable mask. That shape is exactly "within TRACK_WIDTH / 2 of
 * the center line", which is what we test here (on whole pixels, like the mask lookup).
 */
export function isOnTrack(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || xi >= WORLD_W || yi < 0 || yi >= WORLD_H) return false;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    if (distanceToSegment(xi, yi, TRACK_WAYPOINTS[i], TRACK_WAYPOINTS[(i + 1) % n]) <= TRACK_WIDTH / 2) return true;
  }
  return false;
}

let trackCanvas = null;

/** The static track, rendered once at canvas resolution. */
function trackImage() {
  if (trackCanvas) return trackCanvas;
  trackCanvas = document.createElement('canvas');
  trackCanvas.width = W;
  trackCanvas.height = H;
  const ctx = trackCanvas.getContext('2d');
  ctx.scale(DRAW_SCALE, DRAW_SCALE);
  ctx.fillStyle = rgb(GRASS_COLOR);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const wps = TRACK_WAYPOINTS;
  const loop = () => {
    ctx.beginPath();
    wps.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgb(TRACK_BORDER);
  ctx.lineWidth = TRACK_WIDTH + 14;
  loop();
  ctx.stroke();
  ctx.strokeStyle = rgb(TRACK_COLOR);
  ctx.lineWidth = TRACK_WIDTH;
  loop();
  ctx.stroke();

  // Dashed centre line, a little thicker than the original's 3px so it survives the scaling.
  ctx.strokeStyle = rgb(LIGHT_GRAY);
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  wps.forEach(([x1, y1], i) => {
    const [x2, y2] = wps[(i + 1) % wps.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.max(1, Math.floor(Math.hypot(dx, dy) / 30));
    for (let s = 0; s < steps; s += 2) {
      const t1 = s / steps;
      const t2 = (s + 0.5) / steps;
      ctx.moveTo(x1 + dx * t1, y1 + dy * t1);
      ctx.lineTo(x1 + dx * t2, y1 + dy * t2);
    }
  });
  ctx.stroke();

  // Checkered start/finish line at waypoint 0, two rows so it reads as a flag.
  const [p0x, p0y] = wps[0];
  const [fx, fy] = trackDirectionAt(0);
  const [perpX, perpY] = [-fy, fx];
  const half = TRACK_WIDTH / 2 + 7;
  const cells = 10;
  const cell = (half * 2) / cells;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < cells; k++) {
      ctx.fillStyle = (k + row) % 2 === 0 ? rgb(WHITE) : rgb(BLACK);
      const a = -half + k * cell;
      const b = (row - 1) * cell;
      ctx.beginPath();
      ctx.moveTo(p0x + perpX * a + fx * b, p0y + perpY * a + fy * b);
      ctx.lineTo(p0x + perpX * (a + cell) + fx * b, p0y + perpY * (a + cell) + fy * b);
      ctx.lineTo(p0x + perpX * (a + cell) + fx * (b + cell), p0y + perpY * (a + cell) + fy * (b + cell));
      ctx.lineTo(p0x + perpX * a + fx * (b + cell), p0y + perpY * a + fy * (b + cell));
      ctx.closePath();
      ctx.fill();
    }
  }
  return trackCanvas;
}

// ---------------------------------------------------------------------------
// Bullet
// ---------------------------------------------------------------------------

class Bullet {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.vx = BULLET_SPEED * Math.cos(rad(angle));
    this.vy = -BULLET_SPEED * Math.sin(rad(angle));
    this.owner = owner;
    this.lifetime = BULLET_LIFETIME;
    this.active = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;
    if (this.lifetime <= 0 || this.x < 0 || this.x > WORLD_W || this.y < 0 || this.y > WORLD_H) this.active = false;
  }

  draw(ctx) {
    if (!this.active) return;
    const r = BULLET_RADIUS * 1.6;
    ctx.fillStyle = rgb(DARK_RED);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(YELLOW);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r - 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// PowerUp
// ---------------------------------------------------------------------------

const POWERUP_COLORS = { speed: YELLOW, armor: GREEN_PU, gun: RED };
const POWERUP_ICONS = { speed: 'S', armor: 'A', gun: 'G' };

class PowerUp {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.active = true;
    this.respawnTimer = 0;
    this.floatPhase = uniform(0, Math.PI * 2);
  }

  collect() {
    this.active = false;
    this.respawnTimer = POWERUP_RESPAWN_FRAMES;
  }

  update() {
    if (!this.active) {
      this.respawnTimer--;
      if (this.respawnTimer <= 0) {
        this.active = true;
        this.kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
      }
    }
    this.floatPhase += POWERUP_FLOAT_SPEED;
  }

  draw(ctx) {
    if (!this.active) return;
    const bob = Math.sin(this.floatPhase) * 3;
    const color = POWERUP_COLORS[this.kind];
    const r = POWERUP_RADIUS * 1.35;
    const cx = this.x;
    const cy = this.y + bob;
    ctx.fillStyle = rgb(color);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(WHITE);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = rgb(BLACK);
    ctx.font = `24px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_ICONS[this.kind], cx + 1, cy + 2);
  }
}

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

class Car {
  constructor(x, y, angle, color, name) {
    this.x = x;
    this.y = y;
    this.angle = angle; // degrees; 0 = right, CCW positive
    this.speed = 0;
    this.color = color;
    this.name = name;

    this.health = MAX_HEALTH;
    this.armor = 0;
    this.ammo = 0;
    this.speedBoostTimer = 0;

    this.lap = 0;
    this.checkpointsHit = new Set();
    this.checkpointCooldowns = new Map([[0, CHECKPOINT_COOLDOWN]]);
    this.finished = false;

    this.shootCooldown = 0;
    this.hitFlash = 0;
    this.alive = true;
  }

  get effectiveMaxSpeed() {
    return this.speedBoostTimer > 0 ? MAX_SPEED * SPEED_BOOST_MULT : MAX_SPEED;
  }

  /** @param {{accel: boolean, brake: boolean, left: boolean, right: boolean}} drive */
  update(drive) {
    if (!this.alive) return;

    if (Math.abs(this.speed) > 0.1) {
      const turnFactor = Math.min(Math.abs(this.speed) / MAX_SPEED, 1);
      const direction = this.speed > 0 ? 1 : -1;
      if (drive.left) this.angle += TURN_SPEED * turnFactor * direction;
      if (drive.right) this.angle -= TURN_SPEED * turnFactor * direction;
    }

    const top = this.effectiveMaxSpeed;
    if (drive.accel) this.speed = Math.min(this.speed + ACCELERATION, top);
    else if (drive.brake) this.speed = Math.max(this.speed - BRAKING, -top * 0.5);
    else if (this.speed > 0) this.speed = Math.max(0, this.speed - FRICTION);
    else if (this.speed < 0) this.speed = Math.min(0, this.speed + FRICTION);

    // Wall collision: try to slide along walls.
    const prevX = this.x;
    const prevY = this.y;
    const newX = clamp(this.x + this.speed * Math.cos(rad(this.angle)), CAR_W, WORLD_W - CAR_W);
    const newY = clamp(this.y - this.speed * Math.sin(rad(this.angle)), CAR_H, WORLD_H - CAR_H);
    if (isOnTrack(newX, newY)) {
      this.x = newX;
      this.y = newY;
    } else if (isOnTrack(prevX, newY)) {
      this.y = newY;
      this.speed *= WALL_SPEED_LOSS;
    } else if (isOnTrack(newX, prevY)) {
      this.x = newX;
      this.speed *= WALL_SPEED_LOSS;
    } else {
      this.speed *= 0.2;
    }

    if (this.speedBoostTimer > 0) this.speedBoostTimer--;
    if (this.shootCooldown > 0) this.shootCooldown--;
    if (this.hitFlash > 0) this.hitFlash--;

    for (const [k, left] of this.checkpointCooldowns) {
      if (left <= 1) this.checkpointCooldowns.delete(k);
      else this.checkpointCooldowns.set(k, left - 1);
    }

    TRACK_WAYPOINTS.forEach(([wx, wy], idx) => {
      if (this.checkpointCooldowns.has(idx)) return;
      if (Math.hypot(this.x - wx, this.y - wy) >= CHECKPOINT_RADIUS) return;
      this.checkpointCooldowns.set(idx, CHECKPOINT_COOLDOWN);
      if (idx !== 0) {
        this.checkpointsHit.add(idx);
      } else if (REQUIRED_CHECKPOINTS.every((c) => this.checkpointsHit.has(c)) && !this.finished) {
        this.lap++;
        this.checkpointsHit = new Set();
        if (this.lap >= TOTAL_LAPS) this.finished = true;
      }
    });
  }

  /** @returns {Bullet|null} */
  shoot() {
    if (this.ammo <= 0 || this.shootCooldown !== 0) return null;
    this.ammo--;
    this.shootCooldown = SHOOT_COOLDOWN;
    const r = rad(this.angle);
    return new Bullet(this.x + Math.cos(r) * CAR_W * 0.7, this.y - Math.sin(r) * CAR_W * 0.7, this.angle, this);
  }

  /** @returns {boolean} true if this hit destroyed the car */
  takeHit() {
    this.hitFlash = 20;
    if (this.armor > 0) {
      this.armor--;
      return false;
    }
    this.health--;
    if (this.health <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  collectPowerup(kind) {
    if (kind === 'speed') this.speedBoostTimer = SPEED_BOOST_FRAMES;
    else if (kind === 'armor') this.armor = Math.min(this.armor + 1, ARMOR_MAX);
    else if (kind === 'gun') this.ammo = Math.min(this.ammo + MAX_AMMO, MAX_AMMO * 2);
  }

  draw(ctx) {
    const flashing = this.hitFlash > 0 && Math.floor(this.hitFlash / 3) % 2 === 0;
    const color = !this.alive ? shade(this.color, 0.3) : flashing ? WHITE : this.color;
    this.draw3d(ctx, color);
    const s = CAR_DRAW_SCALE;

    if (this.speedBoostTimer > 0 && this.alive) {
      const r = rad(this.angle);
      ctx.fillStyle = rgb(YELLOW);
      ctx.beginPath();
      ctx.arc(this.x - Math.cos(r) * CAR_W * 0.8 * s, this.y + Math.sin(r) * CAR_W * 0.8 * s, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.armor > 0 && this.alive) {
      ctx.strokeStyle = rgb(GREEN_PU);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, (CAR_W / 2) * s + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** The car as a pseudo-3D box seen from above, with the south-facing sides visible. */
  draw3d(ctx, color) {
    const s = CAR_DRAW_SCALE;
    const Ht = CAR_HEIGHT_PX * s;
    const cosA = Math.cos(rad(this.angle));
    const sinA = Math.sin(rad(this.angle));
    const L = CAR_W * 0.55 * s;
    const Wd = CAR_H * 0.55 * s;
    const fwd = [cosA, -sinA];
    const rgt = [sinA, cosA];
    const { x: cx, y: cy } = this;
    const pt = (fl, rw, elev = 0) => [cx + fwd[0] * fl * L + rgt[0] * rw * Wd, cy + fwd[1] * fl * L + rgt[1] * rw * Wd - elev];
    const poly = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    };
    const shaded = (f) => rgb(shade(color, f));
    const dot = ([x, y], r, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // Drop shadow
    poly(
      [[1.1, 1.2], [1.1, -1.2], [-1.1, -1.2], [-1.1, 1.2]].map(([fl, rw]) => {
        const [x, y] = pt(fl, rw);
        return [x + 1, y + 6];
      }),
      'rgba(0,0,0,0.25)',
    );

    // Body sides: a face is visible when its outward normal points down the screen.
    const box = (f, r, h0, h1) => [pt(f[0], r[0], h0), pt(f[1], r[1], h0), pt(f[1], r[1], h1), pt(f[0], r[0], h1)];
    if (rgt[1] > 0) poly(box([1, -1], [1, 1], 0, Ht), shaded(0.35 + 0.45 * rgt[1]));
    if (-rgt[1] > 0) poly(box([1, -1], [-1, -1], 0, Ht), shaded(0.35 + 0.45 * -rgt[1]));
    if (fwd[1] > 0) poly(box([1, 1], [1, -1], 0, Ht), shaded(0.35 + 0.45 * fwd[1]));
    if (-fwd[1] > 0) poly(box([-1, -1], [1, -1], 0, Ht), shaded(0.35 + 0.45 * -fwd[1]));

    // Body top with a highlight edge
    const top = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([fl, rw]) => pt(fl, rw, Ht));
    poly(top, shaded(1.0));
    ctx.strokeStyle = shaded(1.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();

    // Cabin (raised roof)
    const cabinH = Ht + 5 * s;
    if (rgt[1] > 0) poly(box([0.58, -0.22], [0.62, 0.62], Ht, cabinH), shaded(0.45 + 0.35 * rgt[1]));
    if (-rgt[1] > 0) poly(box([0.58, -0.22], [-0.62, -0.62], Ht, cabinH), shaded(0.45 + 0.35 * -rgt[1]));
    if (fwd[1] > 0) poly(box([0.58, 0.58], [0.62, -0.62], Ht, cabinH), 'rgb(160,205,255)');
    if (-fwd[1] > 0) poly(box([-0.22, -0.22], [0.62, -0.62], Ht, cabinH), 'rgb(140,185,235)');
    poly([[0.58, 0.62], [0.58, -0.62], [-0.22, -0.62], [-0.22, 0.62]].map(([fl, rw]) => pt(fl, rw, cabinH)), shaded(1.2));

    // Windshield and rear window stripes on the body top
    poly([pt(0.58, 0.57, Ht), pt(0.58, -0.57, Ht), pt(0.42, -0.57, Ht), pt(0.42, 0.57, Ht)], 'rgb(160,205,255)');
    poly([pt(-0.22, 0.57, Ht), pt(-0.22, -0.57, Ht), pt(-0.35, -0.57, Ht), pt(-0.35, 0.57, Ht)], 'rgb(140,185,235)');

    for (const [wf, wr] of [[0.78, 1.1], [0.78, -1.1], [-0.65, 1.1], [-0.65, -1.1]]) {
      const p = pt(wf, wr);
      dot(p, 6 * s, 'rgb(20,20,20)');
      dot(p, 3 * s, 'rgb(155,155,165)');
    }
    for (const wr of [0.65, -0.65]) dot(pt(1.12, wr, Ht * 0.45), 3 * s, 'rgb(255,250,180)');
    for (const wr of [0.65, -0.65]) dot(pt(-1.12, wr, Ht * 0.45), 3 * s, 'rgb(210,30,30)');
  }
}

class Explosion {
  constructor(x, y) {
    this.age = 0;
    this.duration = 80;
    this.particles = Array.from({ length: 50 }, () => {
      const a = uniform(0, Math.PI * 2);
      const v = uniform(1.5, 7);
      const c = [RED, ORANGE, YELLOW][Math.floor(Math.random() * 3)];
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: uniform(4, 10), color: c, life: uniform(30, this.duration) };
    });
  }

  update() {
    this.age++;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      if (this.age >= p.life) continue;
      ctx.fillStyle = rgb(p.color, 1 - this.age / p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// CPU driver
// ---------------------------------------------------------------------------

const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/**
 * Drives through the virtual stick by pure pursuit: it steers at a point a little way further
 * along the track's centre line (shifted by a wandering racing line), lifts or brakes when the
 * road ahead bends hard, and backs out when stuck on a wall. It is made beatable by a slow,
 * jittery reaction (the steering is only re-decided every few frames), the wandering line and
 * the odd moment of lifting off the gas. It shoots when the other car is nearly dead ahead,
 * and not every time.
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.segment = TRACK_WAYPOINTS.length - 1; // the grid is just before waypoint 0
    this.line = uniform(-25, 25); // lateral offset from the centre line
    this.steer = 0;
    this.steerHold = 0;
    this.lift = 0;
    this.stuckFrames = 0;
    this.reverseFrames = 0;
    this.fireHeld = false;
  }

  /** Index and parameter t of the closest point on the current or next segment. */
  follow(car) {
    const n = TRACK_WAYPOINTS.length;
    for (let guard = 0; guard < n; guard++) {
      const a = TRACK_WAYPOINTS[this.segment];
      const b = TRACK_WAYPOINTS[(this.segment + 1) % n];
      const c = TRACK_WAYPOINTS[(this.segment + 2) % n];
      const t = ((car.x - a[0]) * (b[0] - a[0]) + (car.y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      if (t < 1 && distanceToSegment(car.x, car.y, a, b) <= distanceToSegment(car.x, car.y, b, c)) return clamp(t, 0, 1);
      this.segment = (this.segment + 1) % n;
    }
    return 0;
  }

  /** The point `ahead` units further along the centre line, shifted sideways by the racing line. */
  pointAhead(t, ahead) {
    const n = TRACK_WAYPOINTS.length;
    let i = this.segment;
    let a = TRACK_WAYPOINTS[i];
    let b = TRACK_WAYPOINTS[(i + 1) % n];
    let len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let along = t * len + ahead;
    while (along > len) {
      along -= len;
      i = (i + 1) % n;
      a = TRACK_WAYPOINTS[i];
      b = TRACK_WAYPOINTS[(i + 1) % n];
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    return [a[0] + ux * along - uy * this.line, a[1] + uy * along + ux * this.line];
  }

  headingError(car, [x, y]) {
    return angleDiff((Math.atan2(-(y - car.y), x - car.x) * 180) / Math.PI, car.angle);
  }

  input() {
    const game = this.game;
    const car = game.cars[this.index];
    if (game.state !== 'racing' || !car.alive) return NEUTRAL;

    const t = this.follow(car);
    this.line = clamp(this.line + uniform(-1.5, 1.5), -35, 35);
    const error = this.headingError(car, this.pointAhead(t, 110 + Math.abs(car.speed) * 15));
    const bend = Math.abs(this.headingError(car, this.pointAhead(t, 260)));

    if (this.reverseFrames > 0) {
      this.reverseFrames--;
      // Reversing turns the car the other way, so steer opposite to swing the nose round.
      return { x: error > 0 ? 1 : -1, y: 1, buttons: {} };
    }
    this.stuckFrames = Math.abs(car.speed) < 0.4 ? this.stuckFrames + 1 : 0;
    if (this.stuckFrames > 45) {
      this.stuckFrames = 0;
      this.reverseFrames = 35;
    }

    if (this.steerHold > 0) {
      this.steerHold--;
    } else {
      this.steer = Math.abs(error) < 5 ? 0 : error > 0 ? -1 : 1;
      this.steerHold = Math.floor(uniform(1, 6));
    }

    if (this.lift > 0) this.lift--;
    else if (Math.random() < 0.004) this.lift = Math.floor(uniform(10, 30));

    let y = -1;
    const top = car.effectiveMaxSpeed;
    if (bend > 70 && car.speed > top * 0.55) y = 1;
    else if ((bend > 35 && car.speed > top * 0.75) || this.lift > 0) y = 0;

    return { x: this.steer, y, buttons: { fire: this.wantsToFire(car) } };
  }

  wantsToFire(car) {
    // FIRE is edge-triggered, so release it every other frame while holding a shot.
    if (this.fireHeld) {
      this.fireHeld = false;
      return false;
    }
    const other = this.game.cars[1 - this.index];
    if (car.ammo <= 0 || car.shootCooldown > 0 || !other.alive) return false;
    const dist = Math.hypot(other.x - car.x, other.y - car.y);
    const bearing = (Math.atan2(-(other.y - car.y), other.x - car.x) * 180) / Math.PI;
    if (dist > 450 || Math.abs(angleDiff(bearing, car.angle)) > 8 || Math.random() > 0.12) return false;
    this.fireHeld = true;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

class RacingGame {
  constructor(bots) {
    const [wx, wy] = TRACK_WAYPOINTS[0];
    const [fx, fy] = trackDirectionAt(0);
    const startAngle = (Math.atan2(-fy, fx) * 180) / Math.PI;
    const [perpX, perpY] = [-fy, fx];
    const back = 60;
    const side = 26;
    this.cars = [
      new Car(wx - fx * back + perpX * side, wy - fy * back + perpY * side, startAngle, BLUE, 'P1'),
      new Car(wx - fx * back - perpX * side, wy - fy * back - perpY * side, startAngle, ORANGE, 'P2'),
    ];
    this.bullets = [];
    this.powerups = POWERUP_POSITIONS.map(([x, y], i) => new PowerUp(x, y, POWERUP_KINDS[i % POWERUP_KINDS.length]));
    this.explosions = [];
    // countdown -> racing -> finished. The attract demo (all CPUs) skips the countdown so its
    // big digit doesn't sit under the shell's title card.
    const demo = bots.every(Boolean);
    this.state = demo ? 'racing' : 'countdown';
    this.countdownTimer = demo ? 0 : COUNTDOWN_FRAMES;
    this.winner = -1;
    this.tick = 0;
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  get over() {
    return this.state === 'finished';
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
    this.explosions = this.explosions.filter((e) => e.age < e.duration);
    for (const pu of this.powerups) pu.floatPhase += this.state === 'racing' ? 0 : POWERUP_FLOAT_SPEED;

    if (this.state === 'countdown') {
      this.countdownTimer--;
      if (this.countdownTimer <= 0) this.state = 'racing';
      return;
    }
    if (this.state === 'finished') return;

    this.cars.forEach((car, i) => {
      const p = input.player(i);
      car.update({ accel: p.y < -0.5, brake: p.y > 0.5, left: p.x < -0.5, right: p.x > 0.5 });
      if (car.alive && p.pressed('fire')) {
        const bullet = car.shoot();
        if (bullet) this.bullets.push(bullet);
      }
    });

    for (const pu of this.powerups) {
      pu.update();
      if (!pu.active) continue;
      const car = this.cars.find((c) => c.alive && Math.hypot(c.x - pu.x, c.y - pu.y) < POWERUP_RADIUS + 20);
      if (car) {
        car.collectPowerup(pu.kind);
        pu.collect();
      }
    }

    for (const bullet of this.bullets) {
      bullet.update();
      if (!bullet.active) continue;
      for (const car of this.cars) {
        if (car === bullet.owner || !car.alive) continue;
        if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < Math.max(CAR_W, CAR_H) / 2 + BULLET_RADIUS) {
          bullet.active = false;
          if (car.takeHit()) this.explosions.push(new Explosion(car.x, car.y));
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.active);

    this.cars.forEach((car, i) => {
      if (this.winner >= 0) return;
      if (car.finished) this.winner = i;
      else if (!car.alive) this.winner = 1 - i;
    });
    if (this.winner >= 0) this.state = 'finished';
  }

  draw(ctx) {
    ctx.drawImage(trackImage(), 0, 0);
    ctx.save();
    ctx.scale(DRAW_SCALE, DRAW_SCALE);
    for (const pu of this.powerups) pu.draw(ctx);
    // Draw the lower car last so its body overlaps the one behind it correctly.
    for (const car of [...this.cars].sort((a, b) => a.y - b.y)) car.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const e of this.explosions) e.draw(ctx);
    ctx.restore();

    this.drawHud(ctx, this.cars[0], 6, false);
    this.drawHud(ctx, this.cars[1], W - 6, true);

    if (this.state === 'countdown') this.drawCountdown(ctx);
    else if (this.state === 'finished') this.banner(ctx, `${this.cars[this.winner].name} WINS!`, this.cars[this.winner].color, 40);
  }

  drawHud(ctx, car, edgeX, alignRight) {
    const panelW = 150;
    const x = alignRight ? edgeX - panelW : edgeX;
    const y = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, panelW, 92);
    const left = x + 8;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `16px ${HUD_FONT}`;
    ctx.fillStyle = rgb(shade(car.color, 1.4)); // brightened: dark blue on black is hard to read
    ctx.fillText(car.name, left, y + 8);
    ctx.font = `12px ${HUD_FONT}`;
    ctx.fillStyle = rgb(WHITE);
    ctx.fillText(`LAP ${Math.min(car.lap + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`, left + 40, y + 10);
    for (let i = 0; i < MAX_HEALTH; i++) {
      ctx.fillStyle = rgb(i < car.health ? RED : LIGHT_GRAY);
      ctx.fillRect(left + i * 18, y + 32, 14, 14);
    }
    for (let i = 0; i < ARMOR_MAX; i++) {
      ctx.fillStyle = rgb(i < car.armor ? GREEN_PU : [90, 90, 90]);
      ctx.fillRect(left + 70 + i * 18, y + 32, 14, 14);
    }
    ctx.font = `10px ${HUD_FONT}`;
    ctx.fillStyle = rgb(car.ammo > 0 ? RED : LIGHT_GRAY);
    ctx.fillText(`AMMO ${car.ammo}`, left, y + 56);
    if (car.speedBoostTimer > 0) {
      ctx.fillStyle = rgb(YELLOW);
      ctx.fillText(`BOOST ${(car.speedBoostTimer / FPS).toFixed(1)}`, left, y + 74);
    }
  }

  drawCountdown(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);
    const secs = Math.ceil(this.countdownTimer / FPS);
    const color = secs === 1 ? [255, 80, 80] : WHITE;
    this.banner(ctx, String(secs), color, 72);
  }

  banner(ctx, text, color, size) {
    ctx.font = `${size}px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillStyle = rgb(color);
    ctx.fillText(text, W / 2, H / 2);
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two players the CPU controls
 */
export function createGame({ bots }) {
  return new RacingGame(bots);
}

export { TRACK_WAYPOINTS, POWERUP_POSITIONS, TOTAL_LAPS };
