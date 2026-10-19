// Spacewar entities, ported from spacewar/entities.py.
// The world keeps the original 1600x1200 coordinates and per-frame constants; only drawing is
// scaled down to the arcade screen.

export const WORLD_W = 1600;
export const WORLD_H = 1200;
export const FPS = 60;

export const WHITE = [255, 255, 255];
export const RED = [255, 0, 0];
export const GREEN = [0, 255, 0];
export const BLUE = [0, 0, 255];
export const YELLOW = [255, 255, 0];
export const ORANGE = [255, 165, 0];
export const PURPLE = [128, 0, 128];

export const SHIP_SIZE = 20;
export const SHIP_SPEED = 0.2;
export const SHIP_ROTATION_SPEED = 3;
export const SHIP_DRAG = 0.005;
export const MAX_VELOCITY = 5;
const SHIP_DRAW_SCALE = 1.5;

export const ASTEROID_SIZES = { large: 40, medium: 20, small: 10 };
export const ASTEROID_SPEED_RANGE = [0.5, 2.0];
export const MAX_ASTEROIDS = 15;

export const ZONE_SIZE = 60;
export const ZONE_SPAWN_INTERVAL = 10 * FPS;
// The original allowed 1.0 here. With SHIP_DRAG = 0.005 a ship coasting in at 1.5 px/frame drifts
// ~120 px (through and out of the 80 px interaction radius) before it falls under 1.0, so pickups
// were nearly impossible for people. Raised to 2.0, the same fix made in spacewar-web.
export const MAX_PICKUP_VELOCITY = 2.0;
export const ZONE_ACTIVE_TIME = 20 * FPS;
export const INTERACTION_COOLDOWN = 1 * FPS;

export const HUD_FONT = '"Press Start 2P", monospace';

// --- Python-compatible helpers -------------------------------------------------------------------

export const uniform = (a, b) => a + Math.random() * (b - a);
export const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const choice = (items) => items[Math.floor(Math.random() * items.length)];
/** Python's float modulo: the result takes the sign of the divisor. */
export const pymod = (a, n) => ((a % n) + n) % n;
export const degrees = (r) => (r * 180) / Math.PI;
export const radians = (d) => (d * Math.PI) / 180;
export const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

function weightedChoice(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export class Entity {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.destroyed = false;
  }

  /** Wrap around screen edges. */
  checkBoundary() {
    if (this.x < 0) this.x += WORLD_W;
    else if (this.x > WORLD_W) this.x -= WORLD_W;
    if (this.y < 0) this.y += WORLD_H;
    else if (this.y > WORLD_H) this.y -= WORLD_H;
  }

  /** Distance to another entity, the short way round the wrapping field. */
  getDistance(other) {
    const dx = Math.min(Math.abs(this.x - other.x), WORLD_W - Math.abs(this.x - other.x));
    const dy = Math.min(Math.abs(this.y - other.y), WORLD_H - Math.abs(this.y - other.y));
    return Math.sqrt(dx * dx + dy * dy);
  }

  isColliding(other) {
    return this.getDistance(other) < this.size + other.size;
  }
}

export class Ship extends Entity {
  /**
   * @param {number[]} color RGB
   * @param {string} label 'P1', 'P2' or 'CPU'
   */
  constructor(x, y, angle, color, label) {
    super(x, y, SHIP_SIZE);
    this.angle = angle; // degrees
    this.velocityX = 0;
    this.velocityY = 0;
    this.rotation = 0; // -1 counter-clockwise, 0, 1 clockwise
    this.thrust = 0;
    this.color = color;
    this.label = label;
    this.hasCargo = false;
    this.credits = 0;
    this.interactionCooldown = 0;
  }

  get speed() {
    return Math.sqrt(this.velocityX ** 2 + this.velocityY ** 2);
  }

  update() {
    this.angle = pymod(this.angle + this.rotation * SHIP_ROTATION_SPEED, 360);
    if (this.thrust) {
      const a = radians(this.angle);
      this.velocityX += Math.cos(a) * SHIP_SPEED * this.thrust;
      this.velocityY += Math.sin(a) * SHIP_SPEED * this.thrust;
      const v = this.speed;
      if (v > MAX_VELOCITY) {
        this.velocityX *= MAX_VELOCITY / v;
        this.velocityY *= MAX_VELOCITY / v;
      }
    }
    this.velocityX *= 1 - SHIP_DRAG;
    this.velocityY *= 1 - SHIP_DRAG;
    this.x += this.velocityX;
    this.y += this.velocityY;
    this.checkBoundary();
    if (this.interactionCooldown > 0) this.interactionCooldown--;
  }

  setControls(thrust, rotation) {
    this.thrust = thrust;
    this.rotation = rotation;
  }

  /** Drawn in world coordinates (the caller scales the context). */
  draw(ctx) {
    const a = radians(this.angle);
    const point = (angle, r) => [this.x + Math.cos(angle) * r, this.y + Math.sin(angle) * r];
    // Drawn larger than the original so ships read at phone size; the hitbox (radius `size`)
    // was already wider than the original's triangle, so this only brings the two closer.
    const size = this.size * SHIP_DRAW_SCALE;
    const front = point(a, size);
    const left = point(a + radians(140), size * 0.7);
    const right = point(a - radians(140), size * 0.7);

    if (this.thrust) {
      const flame = a + Math.PI;
      const [fx, fy] = point(flame, size * 0.5);
      const length = uniform(0.3, 0.7) * size;
      ctx.strokeStyle = rgb(YELLOW);
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(flame) * length, fy + Math.sin(flame) * length);
      ctx.stroke();
    }

    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.moveTo(...front);
    ctx.lineTo(...left);
    ctx.lineTo(...right);
    ctx.closePath();
    ctx.fill();

    if (this.hasCargo) {
      ctx.fillStyle = rgb(RED);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Credit count above the ship, as in the original (bigger, to read through the CRT).
    ctx.fillStyle = rgb(YELLOW);
    ctx.font = `24px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`$${this.credits}`, this.x, this.y - 38);
  }
}

export class Asteroid extends Entity {
  constructor(x, y, sizeCategory) {
    super(x, y, ASTEROID_SIZES[sizeCategory]);
    this.sizeCategory = sizeCategory;
    const speed = uniform(...ASTEROID_SPEED_RANGE);
    const heading = uniform(0, Math.PI * 2);
    this.velocityX = Math.cos(heading) * speed;
    this.velocityY = Math.sin(heading) * speed;
    this.rotationAngle = 0;
    this.rotationSpeed = uniform(-0.2, 0.2);
    this.vertices = [];
    const count = randint(8, 12);
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      const distance = uniform(0.8, 1.2) * this.size;
      this.vertices.push([Math.cos(angle) * distance, Math.sin(angle) * distance]);
    }
  }

  update() {
    this.x += this.velocityX;
    this.y += this.velocityY;
    this.rotationAngle += this.rotationSpeed;
    this.checkBoundary();
  }

  draw(ctx) {
    const c = Math.cos(this.rotationAngle);
    const s = Math.sin(this.rotationAngle);
    ctx.strokeStyle = rgb(WHITE);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.vertices.forEach(([vx, vy], i) => {
      const px = vx * c - vy * s + this.x;
      const py = vx * s + vy * c + this.y;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** Smaller pieces left after a ship hits this rock (none for small rocks). */
  breakApart() {
    if (this.sizeCategory === 'small') return [];
    const newSize = this.sizeCategory === 'medium' ? 'small' : 'medium';
    const pieces = [];
    for (let i = randint(2, 3); i > 0; i--) {
      const ox = uniform(-this.size / 2, this.size / 2);
      const oy = uniform(-this.size / 2, this.size / 2);
      const piece = new Asteroid(this.x + ox, this.y + oy, newSize);
      piece.velocityX = this.velocityX * 0.8 + uniform(-0.5, 0.5);
      piece.velocityY = this.velocityY * 0.8 + uniform(-0.5, 0.5);
      pieces.push(piece);
    }
    return pieces;
  }
}

export class DeliveryZone extends Entity {
  /** @param {'pickup'|'dropoff'} zoneType */
  constructor(x, y, zoneType) {
    super(x, y, ZONE_SIZE);
    this.zoneType = zoneType;
    this.activeTime = ZONE_ACTIVE_TIME;
    this.color = zoneType === 'pickup' ? ORANGE : PURPLE;
  }

  update() {
    this.activeTime--;
  }

  isExpired() {
    return this.activeTime <= 0;
  }

  draw(ctx, tick) {
    ctx.fillStyle = rgb(this.color, 40 / 255);
    ctx.beginPath();
    ctx.arc(this.x, this.y, ZONE_SIZE, 0, Math.PI * 2);
    ctx.fill();

    // The original pulses with pygame.time.get_ticks(); the tick count gives the same rate.
    const pulse = Math.abs(Math.sin((tick * 1000) / FPS / 200));
    // The original's purple outline nearly vanishes through the CRT, so it is lifted a little.
    ctx.strokeStyle = this.zoneType === 'pickup' ? rgb(ORANGE) : 'rgb(190,60,210)';
    ctx.lineWidth = 2 * Math.max(2, Math.trunc(4 * pulse));
    ctx.beginPath();
    ctx.arc(this.x, this.y, ZONE_SIZE, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = rgb(WHITE);
    ctx.font = `16px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.zoneType === 'pickup' ? 'PICKUP' : 'DROPOFF', this.x, this.y);
  }

  /** Loads or unloads cargo if the ship is inside, slow enough and off cooldown. */
  checkShipInteraction(ship) {
    if (!this.isColliding(ship)) return false;
    if (ship.speed > MAX_PICKUP_VELOCITY) return false;
    if (ship.interactionCooldown > 0) return false;
    if (this.zoneType === 'pickup' && !ship.hasCargo) {
      ship.hasCargo = true;
      ship.interactionCooldown = INTERACTION_COOLDOWN;
      return true;
    }
    if (this.zoneType === 'dropoff' && ship.hasCargo) {
      ship.hasCargo = false;
      ship.credits++;
      ship.interactionCooldown = INTERACTION_COOLDOWN;
      return true;
    }
    return false;
  }
}

/** A random point not too close to any entity (gives up after 100 tries, like the original). */
export function randomPointAwayFrom(entities, minDistance = 100) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = uniform(0, WORLD_W);
    const y = uniform(0, WORLD_H);
    const tooClose = entities.some((e) => {
      const dx = Math.min(Math.abs(x - e.x), WORLD_W - Math.abs(x - e.x));
      const dy = Math.min(Math.abs(y - e.y), WORLD_H - Math.abs(y - e.y));
      return Math.sqrt(dx * dx + dy * dy) < minDistance;
    });
    if (!tooClose) return [x, y];
  }
  return [uniform(0, WORLD_W), uniform(0, WORLD_H)];
}

export function generateRandomAsteroids(count, ships) {
  const asteroids = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = randomPointAwayFrom(ships);
    const size = weightedChoice(['large', 'medium', 'small'], [0.5, 0.3, 0.2]);
    asteroids.push(new Asteroid(x, y, size));
  }
  return asteroids;
}
