// ============================================================
// SPACEWAR - Three.js port
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================
// A: CONSTANTS
// ============================================================
const W = 1600, H = 1200;
const FPS = 60;
const FIXED_DT = 1 / FPS;

const SHIP_SIZE = 20;
const SHIP_SPEED = 0.2;
const SHIP_ROTATION_SPEED = 3;  // degrees per frame
const SHIP_DRAG = 0.005;
const MAX_VELOCITY = 5;
const MAX_PICKUP_VELOCITY = 2.0;

const ASTEROID_SIZES = { large: 40, medium: 20, small: 10 };
const ASTEROID_SPEED_MIN = 0.5, ASTEROID_SPEED_MAX = 2.0;
const MAX_ASTEROIDS = 15;

const ZONE_SIZE = 60;
const ZONE_ACTIVE_FRAMES = 20 * FPS;
const ZONE_SPAWN_INTERVAL = 10 * FPS;
const INTERACTION_COOLDOWN = 10;  // frames — just enough to prevent re-triggering the same zone

const DANGER_DISTANCE = 100;
const REACTION_DISTANCE = 150;
const PREDICTION_TIME = 60;
const COURSE_CHANGE_DELAY = 30;

const CREDIT_GOAL = 5;

// Palette (HDR for bloom)
const COL_PLAYER1   = 0x00ffff;
const COL_PLAYER2   = 0xff00ff;
const COL_AI        = 0x4488ff;
const COL_ASTEROID  = 0xaaaacc;
const COL_PICKUP    = 0xff8800;
const COL_DROPOFF   = 0xdd00ff;
const COL_CARGO     = 0xff3333;
const COL_THRUST    = 0xff8800;
const COL_STAR      = 0xffffff;

// Ship label colors for HUD
const SHIP_COLORS_HEX = ['#00ffff', '#ff00ff', '#4488ff'];

// ============================================================
// B: MATH / NAVIGATION UTILITIES
// ============================================================
function wrapX(x) { return ((x % W) + W) % W; }
function wrapY(y) { return ((y % H) + H) % H; }
function wrappedDX(ax, bx) {
  const d = ax - bx;
  if (Math.abs(d) <= W / 2) return d;
  return d > 0 ? d - W : d + W;
}
function wrappedDY(ay, by) {
  const d = ay - by;
  if (Math.abs(d) <= H / 2) return d;
  return d > 0 ? d - H : d + H;
}
function wrappedDist(ax, ay, bx, by) {
  const dx = wrappedDX(ax, bx), dy = wrappedDY(ay, by);
  return Math.sqrt(dx * dx + dy * dy);
}
function angleTo(x1, y1, x2, y2) {
  return (Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 360) % 360;
}
function steeringDir(cur, tgt) {
  const diff = ((tgt - cur + 180 + 360) % 360) - 180;
  if (Math.abs(diff) < 5) return 0;
  return diff > 0 ? 1 : -1;
}
function estimateBrakingDistance(speed, targetSpeed = 0) {
  if (speed <= targetSpeed) return 0;
  if (targetSpeed <= 0.01) return speed / SHIP_DRAG;
  const frames = Math.log(targetSpeed / speed) / Math.log(1 - SHIP_DRAG);
  return speed * (1 - Math.pow(1 - SHIP_DRAG, frames)) / SHIP_DRAG;
}
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// ============================================================
// C: ENTITY CLASSES (pure logic)
// ============================================================
class Entity {
  constructor(x, y, size) {
    this.x = x; this.y = y; this.size = size;
    this.destroyed = false;
  }
  wrap() {
    this.x = wrapX(this.x);
    this.y = wrapY(this.y);
  }
  distTo(other) { return wrappedDist(this.x, this.y, other.x, other.y); }
  collidesWith(other) { return this.distTo(other) < this.size + other.size; }
}

class Ship extends Entity {
  constructor(x, y, angle, aiControlled) {
    super(x, y, SHIP_SIZE);
    this.angle = angle;      // degrees
    this.vx = 0; this.vy = 0;
    this.rotation = 0;       // -1,0,1
    this.thrust = 0;
    this.aiControlled = aiControlled;
    this.hasCargo = false;
    this.credits = 0;
    this.interactionCooldown = 0;
  }
  update() {
    this.angle = (this.angle + this.rotation * SHIP_ROTATION_SPEED + 360) % 360;
    if (this.thrust) {
      const rad = this.angle * Math.PI / 180;
      this.vx += Math.cos(rad) * SHIP_SPEED * this.thrust;
      this.vy += Math.sin(rad) * SHIP_SPEED * this.thrust;
      const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (spd > MAX_VELOCITY) { const s = MAX_VELOCITY / spd; this.vx *= s; this.vy *= s; }
    }
    this.vx *= (1 - SHIP_DRAG);
    this.vy *= (1 - SHIP_DRAG);
    this.x += this.vx; this.y += this.vy;
    this.wrap();
    if (this.interactionCooldown > 0) this.interactionCooldown--;
  }
  setControls(thrust, rotation) { this.thrust = thrust; this.rotation = rotation; }
  get speed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }
}

class Asteroid extends Entity {
  constructor(x, y, sizeCategory) {
    const sz = ASTEROID_SIZES[sizeCategory];
    super(x, y, sz);
    this.sizeCategory = sizeCategory;
    const spd = rand(ASTEROID_SPEED_MIN, ASTEROID_SPEED_MAX);
    const ang = rand(0, Math.PI * 2);
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;
    this.rotAngle = 0;
    this.rotSpeed = rand(-0.02, 0.02) * 10;  // store as deg/frame
    const nv = randInt(8, 12);
    this.vertices = [];
    for (let i = 0; i < nv; i++) {
      const a = 2 * Math.PI * i / nv;
      const d = rand(0.8, 1.2) * sz;
      this.vertices.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.rotAngle += this.rotSpeed;
    this.wrap();
  }
  breakApart() {
    if (this.sizeCategory === 'small') return [];
    const newCat = this.sizeCategory === 'large' ? 'medium' : 'small';
    const count = randInt(2, 3);
    const frags = [];
    for (let i = 0; i < count; i++) {
      const ox = rand(-this.size / 2, this.size / 2);
      const oy = rand(-this.size / 2, this.size / 2);
      const a = new Asteroid(this.x + ox, this.y + oy, newCat);
      a.vx = this.vx * 0.8 + rand(-0.5, 0.5);
      a.vy = this.vy * 0.8 + rand(-0.5, 0.5);
      frags.push(a);
    }
    return frags;
  }
}

class DeliveryZone extends Entity {
  constructor(x, y, zoneType) {
    super(x, y, ZONE_SIZE);
    this.zoneType = zoneType;  // 'pickup' or 'dropoff'
    this.activeTime = ZONE_ACTIVE_FRAMES;
  }
  update() { this.activeTime--; }
  isExpired() { return this.activeTime <= 0; }
  checkShipInteraction(ship) {
    if (!this.collidesWith(ship)) return false;
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

// ============================================================
// D: AI UTILITIES
// ============================================================
function predictCollision(ship, asteroid, predTime = PREDICTION_TIME) {
  const sfx = wrapX(ship.x + ship.vx * predTime);
  const sfy = wrapY(ship.y + ship.vy * predTime);
  const afx = wrapX(asteroid.x + asteroid.vx * predTime);
  const afy = wrapY(asteroid.y + asteroid.vy * predTime);
  const fd = wrappedDist(sfx, sfy, afx, afy);
  return fd < ship.size + asteroid.size + 10;
}

function findDangerousAsteroids(ship, asteroids, reactionDist = REACTION_DISTANCE, predTime = PREDICTION_TIME) {
  const dangerous = [];
  for (const ast of asteroids) {
    const d = ship.distTo(ast);
    if (d > reactionDist) continue;
    if (predictCollision(ship, ast, predTime)) dangerous.push([ast, d]);
  }
  dangerous.sort((a, b) => a[1] - b[1]);
  return dangerous;
}

function findClosestAsteroid(ship, asteroids) {
  let closest = null, minD = Infinity;
  for (const ast of asteroids) {
    const d = ship.distTo(ast);
    if (d < minD) { minD = d; closest = ast; }
  }
  return [closest, minD];
}

// ============================================================
// E: AI CLASSES
// ============================================================
class BaseShipAI {
  constructor(ship) {
    this.ship = ship;
    this.currentMode = 'cruise';
    this.courseChangeTimer = 0;
    this.currentTargetAngle = rand(0, 360);
    this.targetZone = null;
  }
  makeDecision(asteroids, otherShips, zones) { return [0, 0]; }

  _evadeAsteroids(dangerList) {
    if (!dangerList.length) return [0, 0];
    const [ast] = dangerList[0];
    const rvx = ast.vx - this.ship.vx, rvy = ast.vy - this.ship.vy;
    let escAngle;
    if (Math.abs(rvx) < 0.01 && Math.abs(rvy) < 0.01) {
      escAngle = Math.atan2(this.ship.y - ast.y, this.ship.x - ast.x);
    } else {
      const appAngle = Math.atan2(rvy, rvx);
      const p1 = appAngle + Math.PI / 2, p2 = appAngle - Math.PI / 2;
      const astAngle = Math.atan2(ast.y - this.ship.y, ast.x - this.ship.x);
      const d1 = Math.abs(((p1 - astAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
      const d2 = Math.abs(((p2 - astAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
      escAngle = d1 > d2 ? p1 : p2;
    }
    const escDeg = ((escAngle * 180 / Math.PI) + 360) % 360;
    const diff = ((escDeg - this.ship.angle + 180 + 360) % 360) - 180;
    return [1, Math.abs(diff) < 10 ? 0 : (diff > 0 ? 1 : -1)];
  }

  _avoidAsteroid(ast) {
    if (!ast) return [0, 0];
    const angToAst = Math.atan2(ast.y - this.ship.y, ast.x - this.ship.x);
    const tgt = ((angToAst + Math.PI) * 180 / Math.PI + 360) % 360;
    const d = this.ship.distTo(ast);
    const intensity = 1 - Math.min(1, (d - this.ship.size - ast.size) / (REACTION_DISTANCE - this.ship.size - ast.size));
    const rot = steeringDir(this.ship.angle, tgt);
    return [intensity > 0.3 ? 1 : 0, rot];
  }

  _cruise() {
    const diff = ((this.currentTargetAngle - this.ship.angle + 180 + 360) % 360) - 180;
    const thrust = Math.random() < 0.1 && this.ship.speed < 2 ? 1 : 0;
    return [thrust, Math.abs(diff) < 5 ? 0 : diff > 0 ? 1 : -1];
  }
}

class OriginalShipAI extends BaseShipAI {
  makeDecision(asteroids, otherShips, zones) {
    if (this.courseChangeTimer > 0) this.courseChangeTimer--;
    const [closestAst, dClosest] = findClosestAsteroid(this.ship, asteroids);
    const dangerous = findDangerousAsteroids(this.ship, asteroids);

    if (zones && !dangerous.length) {
      const tType = this.ship.hasCargo ? 'dropoff' : 'pickup';
      const suitable = zones.filter(z => z.zoneType === tType);
      if (suitable.length) {
        const zone = suitable.reduce((a, b) => this.ship.distTo(a) < this.ship.distTo(b) ? a : b);
        const d = this.ship.distTo(zone);
        if (d < REACTION_DISTANCE * 3) {
          this.currentMode = tType; this.targetZone = zone;
          return this._approachZone(zone);
        }
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade'; this.targetZone = null;
    } else if (closestAst && dClosest < REACTION_DISTANCE) {
      this.currentMode = 'avoid'; this.targetZone = null;
    } else {
      if (this.courseChangeTimer === 0 && !['pickup','dropoff'].includes(this.currentMode)) {
        this.currentMode = 'cruise'; this.targetZone = null;
        if (Math.random() < 0.01) { this.currentTargetAngle = rand(0, 360); this.courseChangeTimer = COURSE_CHANGE_DELAY; }
      }
    }

    if (this.currentMode === 'evade') return this._evadeAsteroids(dangerous);
    if (this.currentMode === 'avoid') return this._avoidAsteroid(closestAst);
    if (['pickup','dropoff'].includes(this.currentMode) && this.targetZone) return this._approachZone(this.targetZone);
    return this._cruise();
  }

  _approachZone(zone) {
    const angToZone = angleTo(this.ship.x, this.ship.y, zone.x, zone.y);
    const d = this.ship.distTo(zone);
    const spd = this.ship.speed;
    const rot = steeringDir(this.ship.angle, angToZone);
    const diff = ((angToZone - this.ship.angle + 180 + 360) % 360) - 180;
    let thrust;
    if (d < zone.size) {
      if (spd > MAX_PICKUP_VELOCITY * 0.8) {
        const brakeAngle = (this.ship.angle + 180) % 360;
        const bDiff = Math.abs(((brakeAngle - angToZone + 180 + 360) % 360) - 180);
        thrust = bDiff < 30 ? 1 : 0;
      } else thrust = 0;
    } else {
      if (d < zone.size * 2 && spd > MAX_PICKUP_VELOCITY) thrust = 0;
      else thrust = Math.abs(diff) < 45 ? 1 : 0;
    }
    return [thrust, rot];
  }
}

class CautiousShipAI extends BaseShipAI {
  constructor(ship) {
    super(ship);
    this.safeSpotX = null; this.safeSpotY = null;
  }
  makeDecision(asteroids, otherShips, zones) {
    if (this.courseChangeTimer > 0) this.courseChangeTimer--;
    const dangerous = findDangerousAsteroids(this.ship, asteroids, 200, 90);
    const [closestAst, dClosest] = findClosestAsteroid(this.ship, asteroids);

    if (zones && dangerous.length <= 1) {
      const tType = this.ship.hasCargo ? 'dropoff' : 'pickup';
      const suitable = zones.filter(z => z.zoneType === tType);
      if (suitable.length) {
        const zone = suitable.reduce((a, b) => this.ship.distTo(a) < this.ship.distTo(b) ? a : b);
        if (this.ship.distTo(zone) < 400 && !this._pathHasThreats(zone, asteroids)) {
          this.currentMode = tType; this.targetZone = zone;
          return this._approachZoneSafely(zone);
        }
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade';
      if (dangerous.length > 1 && Math.random() < 0.1) this._findSafeSpot(asteroids);
    } else if (closestAst && dClosest < 200) {
      this.currentMode = 'avoid';
    } else {
      if (this.courseChangeTimer === 0 && !['pickup','dropoff'].includes(this.currentMode)) {
        this.currentMode = 'cruise';
        this.safeSpotX = null; this.safeSpotY = null;
        if (Math.random() < 0.01) { this.currentTargetAngle = rand(0, 360); this.courseChangeTimer = COURSE_CHANGE_DELAY; }
      }
    }

    if (this.currentMode === 'evade') {
      if (this.safeSpotX !== null) return this._moveToSafeSpot();
      return this._evadeEnhanced(dangerous);
    }
    if (this.currentMode === 'avoid') return this._avoidAsteroid(closestAst);
    if (['pickup','dropoff'].includes(this.currentMode) && this.targetZone) return this._approachZoneSafely(this.targetZone);
    return this._cruiseSafely(asteroids);
  }

  _pathHasThreats(zone, asteroids) {
    const dx0 = zone.x - this.ship.x, dy0 = zone.y - this.ship.y;
    const dist = Math.sqrt(dx0*dx0 + dy0*dy0);
    if (dist < 1) return false;
    const nx = dx0/dist, ny = dy0/dist;
    for (const ast of asteroids) {
      const ax = ast.x - this.ship.x, ay = ast.y - this.ship.y;
      const proj = ax*nx + ay*ny;
      if (proj < 0 || proj > dist) continue;
      const cx = this.ship.x + nx*proj - ast.x, cy = this.ship.y + ny*proj - ast.y;
      if (Math.sqrt(cx*cx+cy*cy) < ast.size + this.ship.size + 20) return true;
    }
    return false;
  }

  _findSafeSpot(asteroids) {
    let bestD = -1, bx, by;
    for (let i = 0; i < 20; i++) {
      const x = rand(0, W), y = rand(0, H);
      let minD = Infinity;
      for (const ast of asteroids) minD = Math.min(minD, wrappedDist(x, y, ast.x, ast.y));
      if (minD > bestD) { bestD = minD; bx = x; by = y; }
    }
    if (bestD > 150) { this.safeSpotX = bx; this.safeSpotY = by; }
  }

  _moveToSafeSpot() {
    const tgt = angleTo(this.ship.x, this.ship.y, this.safeSpotX, this.safeSpotY);
    const rot = steeringDir(this.ship.angle, tgt);
    const d = wrappedDist(this.ship.x, this.ship.y, this.safeSpotX, this.safeSpotY);
    if (d < 50) { this.safeSpotX = null; this.safeSpotY = null; }
    const diff = Math.abs(((tgt - this.ship.angle + 180 + 360) % 360) - 180);
    return [diff < 45 ? 1 : 0, rot];
  }

  _evadeEnhanced(dangerous) {
    if (!dangerous.length) return [0, 0];
    if (dangerous.length > 1) {
      let avgX = 0, avgY = 0, total = 0;
      for (const [ast, d] of dangerous.slice(0, 3)) {
        const w = 1 / Math.max(d, 1);
        const dx = wrappedDX(ast.x, this.ship.x), dy = wrappedDY(ast.y, this.ship.y);
        const len = Math.max(Math.sqrt(dx*dx+dy*dy), 0.1);
        avgX += dx/len*w; avgY += dy/len*w; total += w;
      }
      if (total > 0) {
        const esc = ((Math.atan2(-avgY/total, -avgX/total) * 180/Math.PI) + 360) % 360;
        const diff = ((esc - this.ship.angle + 180 + 360) % 360) - 180;
        return [1, Math.abs(diff) < 10 ? 0 : diff > 0 ? 1 : -1];
      }
    }
    return this._evadeAsteroids(dangerous);
  }

  _approachZoneSafely(zone) {
    const angToZone = angleTo(this.ship.x, this.ship.y, zone.x, zone.y);
    const d = this.ship.distTo(zone);
    const spd = this.ship.speed;
    const rot = steeringDir(this.ship.angle, angToZone);
    const diff = Math.abs(((angToZone - this.ship.angle + 180 + 360) % 360) - 180);
    if (d < zone.size) {
      if (spd > MAX_PICKUP_VELOCITY * 0.7) {
        const mvAngle = (Math.atan2(this.ship.vy, this.ship.vx) * 180/Math.PI + 360) % 360;
        const brakeAngle = (mvAngle + 180) % 360;
        const bDiff = Math.abs(((brakeAngle - this.ship.angle + 180 + 360) % 360) - 180);
        return [bDiff < 60 ? 1 : 0, steeringDir(this.ship.angle, brakeAngle)];
      }
      return [0, 0];
    }
    const brakeDist = spd * 10;
    if (d < brakeDist && spd > MAX_PICKUP_VELOCITY * 1.5) return [0, rot];
    return [diff < 30 ? 1 : 0, rot];
  }

  _cruiseSafely(asteroids) {
    const spd = this.ship.speed;
    const rad = this.ship.angle * Math.PI / 180;
    const ahead = spd * 10;
    const ax = this.ship.x + Math.cos(rad)*ahead, ay = this.ship.y + Math.sin(rad)*ahead;
    for (const ast of asteroids) {
      const d = wrappedDist(ax, ay, ast.x, ast.y);
      if (d < ast.size + this.ship.size + 20) {
        this.currentTargetAngle = rand(0, 360);
        this.courseChangeTimer = COURSE_CHANGE_DELAY;
        break;
      }
    }
    const rot = steeringDir(this.ship.angle, this.currentTargetAngle);
    return [Math.random() < 0.1 && spd < 1.5 ? 1 : 0, rot];
  }
}

class DeliveryFocusedAI extends BaseShipAI {
  constructor(ship) {
    super(ship);
    this.approachPhase = 'direct';
    this.brakingStarted = false;
  }
  makeDecision(asteroids, otherShips, zones) {
    if (this.courseChangeTimer > 0) this.courseChangeTimer--;
    const [closestAst, dClosest] = findClosestAsteroid(this.ship, asteroids);
    const dangerous = findDangerousAsteroids(this.ship, asteroids);

    if (zones && !dangerous.length) {
      const tType = this.ship.hasCargo ? 'dropoff' : 'pickup';
      const suitable = zones.filter(z => z.zoneType === tType);
      if (!suitable.length) {
        if (this.ship.hasCargo) return this._cruiseDelivery(asteroids, zones);
      } else {
        const zone = suitable.reduce((a, b) => this.ship.distTo(a) < this.ship.distTo(b) ? a : b);
        this.currentMode = tType; this.targetZone = zone;
        return this._precisionApproach(zone);
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade'; this.targetZone = null;
      this.approachPhase = 'direct'; this.brakingStarted = false;
    } else if (closestAst && dClosest < REACTION_DISTANCE) {
      this.currentMode = 'avoid'; this.targetZone = null;
      this.approachPhase = 'direct'; this.brakingStarted = false;
    } else {
      if (this.courseChangeTimer === 0 && !['pickup','dropoff'].includes(this.currentMode)) {
        this.currentMode = 'cruise'; this.targetZone = null;
        this.approachPhase = 'direct'; this.brakingStarted = false;
        if (Math.random() < 0.01) { this.currentTargetAngle = rand(0, 360); this.courseChangeTimer = COURSE_CHANGE_DELAY; }
      }
    }

    if (this.currentMode === 'evade') return this._evadeAsteroids(dangerous);
    if (this.currentMode === 'avoid') return this._avoidAsteroid(closestAst);
    if (['pickup','dropoff'].includes(this.currentMode) && this.targetZone) return this._precisionApproach(this.targetZone);
    return this._cruiseDelivery(asteroids, zones);
  }

  _precisionApproach(zone) {
    const angToZone = angleTo(this.ship.x, this.ship.y, zone.x, zone.y);
    const d = this.ship.distTo(zone);
    const spd = this.ship.speed;
    const rot = steeringDir(this.ship.angle, angToZone);
    const diff = Math.abs(((angToZone - this.ship.angle + 180 + 360) % 360) - 180);

    if (d < zone.size * 0.8) {
      this.approachPhase = 'final';
      if (spd > MAX_PICKUP_VELOCITY * 0.8) {
        const mvAngle = (Math.atan2(this.ship.vy, this.ship.vx)*180/Math.PI + 360) % 360;
        const brakeAngle = (mvAngle + 180) % 360;
        const bDiff = Math.abs(((brakeAngle - this.ship.angle + 180 + 360) % 360) - 180);
        return bDiff < 30 ? [1, 0] : [0, steeringDir(this.ship.angle, brakeAngle)];
      }
      return [0, 0];
    }

    if (!this.brakingStarted) {
      const brakeDist = estimateBrakingDistance(spd, MAX_PICKUP_VELOCITY * 0.8);
      if (d < brakeDist * 1.5) {
        this.approachPhase = 'brake'; this.brakingStarted = true;
        return [0, rot];
      }
    }

    if (this.approachPhase === 'brake') {
      if (spd > MAX_PICKUP_VELOCITY) {
        const mvAngle = (Math.atan2(this.ship.vy, this.ship.vx)*180/Math.PI + 360) % 360;
        const brakeAngle = (mvAngle + 180) % 360;
        const bDiff = Math.abs(((brakeAngle - this.ship.angle + 180 + 360) % 360) - 180);
        return bDiff < 90 ? [1, steeringDir(this.ship.angle, brakeAngle)] : [0, steeringDir(this.ship.angle, brakeAngle)];
      }
      this.approachPhase = 'direct';
      return [0, rot];
    }

    return [diff < 20 && spd < 3 && d > zone.size * 2 ? 1 : 0, rot];
  }

  _cruiseDelivery(asteroids, zones) {
    const spd = this.ship.speed;
    if (zones) {
      const tType = this.ship.hasCargo ? 'dropoff' : 'pickup';
      const suitable = zones.filter(z => z.zoneType === tType);
      if (suitable.length) {
        const zone = suitable.reduce((a, b) => this.ship.distTo(a) < this.ship.distTo(b) ? a : b);
        const ang = angleTo(this.ship.x, this.ship.y, zone.x, zone.y);
        const rot = steeringDir(this.ship.angle, ang);
        const diff = Math.abs(((ang - this.ship.angle + 180 + 360) % 360) - 180);
        return [diff < 30 && spd < 3 ? 1 : 0, rot];
      }
    }
    const diff = ((this.currentTargetAngle - this.ship.angle + 180 + 360) % 360) - 180;
    return [Math.random() < 0.2 && spd < 2 ? 1 : 0, Math.abs(diff) < 5 ? 0 : diff > 0 ? 1 : -1];
  }
}

function createRandomAI(ship) {
  const r = Math.random();
  if (r < 0.33) return new OriginalShipAI(ship);
  if (r < 0.66) return new CautiousShipAI(ship);
  return new DeliveryFocusedAI(ship);
}

// ============================================================
// F: VISUAL CLASSES
// ============================================================

// --- Starfield ---
class Starfield {
  constructor(scene) {
    this.layers = [];
    for (let l = 0; l < 2; l++) {
      const count = 300;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i*3]   = rand(-W/2, W/2);
        positions[i*3+1] = rand(-H/2, H/2);
        positions[i*3+2] = -10 - l * 5;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: COL_STAR, size: l === 0 ? 1.5 : 1.0, sizeAttenuation: false, transparent: true, opacity: l === 0 ? 0.9 : 0.5 });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      this.layers.push({ pts, speed: (l + 1) * 0.02 });
    }
  }
  update(dt) {
    for (const { pts, speed } of this.layers) {
      pts.position.x += speed;
      if (pts.position.x > W/2) pts.position.x -= W;
    }
  }
}

// --- Ship Mesh ---
class ShipMesh {
  constructor(scene, color) {
    this.scene = scene;
    this.color = color;
    this.group = new THREE.Group();

    // Main triangle
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      SHIP_SIZE, 0, 0,
      -SHIP_SIZE*0.7, SHIP_SIZE*0.7, 0,
      -SHIP_SIZE*0.7, -SHIP_SIZE*0.7, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex([0,1,2]);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.group.add(this.mesh);

    // Glow corona (larger, additive)
    const geoG = new THREE.BufferGeometry();
    const scale = 1.6;
    const vertsG = new Float32Array([
      SHIP_SIZE*scale, 0, 0,
      -SHIP_SIZE*0.7*scale, SHIP_SIZE*0.7*scale, 0,
      -SHIP_SIZE*0.7*scale, -SHIP_SIZE*0.7*scale, 0,
    ]);
    geoG.setAttribute('position', new THREE.BufferAttribute(vertsG, 3));
    geoG.setIndex([0,1,2]);
    const matG = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.03, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(geoG, matG);
    this.group.add(this.glow);

    // Cargo dot
    const dotGeo = new THREE.CircleGeometry(6, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: COL_CARGO });
    this.cargoDot = new THREE.Mesh(dotGeo, dotMat);
    this.cargoDot.visible = false;
    this.group.add(this.cargoDot);

    // Particle trail
    const TRAIL_POOL = 120;
    this.tp = TRAIL_POOL;
    this.tPos = new Float32Array(TRAIL_POOL * 3);
    this.tCol = new Float32Array(TRAIL_POOL * 3);
    this.tVx  = new Float32Array(TRAIL_POOL);
    this.tVy  = new Float32Array(TRAIL_POOL);
    this.tLife    = new Float32Array(TRAIL_POOL);
    this.tMaxLife = new Float32Array(TRAIL_POOL);
    this.tActive  = 0;
    const tc = new THREE.Color(color);
    this.tR = tc.r; this.tG = tc.g; this.tB = tc.b;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    this.trailGeo.setAttribute('color',    new THREE.BufferAttribute(this.tCol, 3));
    const trailMat = new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
    this.trailPts = new THREE.Points(this.trailGeo, trailMat);
    scene.add(this.trailPts);

    scene.add(this.group);
    this.visible = true;
  }

  update(ship) {
    this.group.visible = !ship.destroyed;
    if (ship.destroyed) { this.trailPts.visible = false; return; }
    const wx = ship.x - W/2, wy = -(ship.y - H/2);
    this.group.position.set(wx, wy, 0);
    this.group.rotation.z = -(ship.angle * Math.PI / 180);
    this.cargoDot.visible = ship.hasCargo;

    // Emit trail particles from exhaust point (thrust only)
    if (ship.thrust) {
      const rad = ship.angle * Math.PI / 180;
      const exhaust = rad + Math.PI;
      const ex = wx + Math.cos(exhaust) * SHIP_SIZE * 0.55;
      const ey = wy + Math.sin(-exhaust) * SHIP_SIZE * 0.55;
      for (let e = 0; e < 3 && this.tActive < this.tp; e++) {
        const idx = this.tActive++;
        this.tPos[idx*3]   = ex + (Math.random() - 0.5) * 5;
        this.tPos[idx*3+1] = ey + (Math.random() - 0.5) * 5;
        this.tPos[idx*3+2] = -1;
        const exhaustSpd = rand(1.5, 3.0);
        this.tVx[idx] = Math.cos(exhaust) * exhaustSpd + (Math.random() - 0.5) * 0.8;
        this.tVy[idx] = Math.sin(-exhaust) * exhaustSpd + (Math.random() - 0.5) * 0.8;
        const ml = rand(25, 45);
        this.tMaxLife[idx] = ml; this.tLife[idx] = ml;
        this.tCol[idx*3] = this.tR; this.tCol[idx*3+1] = this.tG; this.tCol[idx*3+2] = this.tB;
      }
    }

    // Update trail particles
    let alive = 0;
    for (let i = 0; i < this.tActive; i++) {
      this.tLife[i]--;
      if (this.tLife[i] <= 0) continue;
      this.tPos[i*3]   += this.tVx[i];
      this.tPos[i*3+1] += this.tVy[i];
      const t = this.tLife[i] / this.tMaxLife[i];
      this.tCol[i*3] = this.tR * t; this.tCol[i*3+1] = this.tG * t; this.tCol[i*3+2] = this.tB * t;
      if (alive < i) {
        this.tPos[alive*3] = this.tPos[i*3]; this.tPos[alive*3+1] = this.tPos[i*3+1]; this.tPos[alive*3+2] = this.tPos[i*3+2];
        this.tVx[alive] = this.tVx[i]; this.tVy[alive] = this.tVy[i];
        this.tLife[alive] = this.tLife[i]; this.tMaxLife[alive] = this.tMaxLife[i];
        this.tCol[alive*3] = this.tCol[i*3]; this.tCol[alive*3+1] = this.tCol[i*3+1]; this.tCol[alive*3+2] = this.tCol[i*3+2];
      }
      alive++;
    }
    this.tActive = alive;
    this.trailGeo.setDrawRange(0, alive);
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.trailPts);
  }
}

// --- Thrust Emitter ---
const THRUST_POOL = 200;
class ThrustEmitter {
  constructor(scene) {
    this.positions = new Float32Array(THRUST_POOL * 3);
    this.colors = new Float32Array(THRUST_POOL * 3);
    this.alphas = new Float32Array(THRUST_POOL);
    this.vx = new Float32Array(THRUST_POOL);
    this.vy = new Float32Array(THRUST_POOL);
    this.life = new Float32Array(THRUST_POOL);
    this.maxLife = new Float32Array(THRUST_POOL);
    this.activeCount = 0;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.PointsMaterial({ size: 4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
    this.pts = new THREE.Points(this.geo, mat);
    scene.add(this.pts);
  }

  emit(ship) {
    if (!ship.thrust || ship.destroyed) return;
    const count = randInt(2, 4);
    const rad = ship.angle * Math.PI / 180;
    const exhaust = rad + Math.PI;
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= THRUST_POOL) break;
      const idx = this.activeCount++;
      const ex = (ship.x - W/2) + Math.cos(exhaust) * SHIP_SIZE * 0.5;
      const ey = -(ship.y - H/2) + Math.sin(-exhaust) * SHIP_SIZE * 0.5;
      this.positions[idx*3]   = ex;
      this.positions[idx*3+1] = ey;
      this.positions[idx*3+2] = 0;
      this.vx[idx] = ship.vx * 0.3 + Math.cos(exhaust) * rand(0.5, 2) + rand(-0.3, 0.3);
      this.vy[idx] = -(ship.vy * 0.3 + Math.sin(exhaust) * rand(0.5, 2) + rand(-0.3, 0.3));
      const ml = rand(15, 30);
      this.maxLife[idx] = ml; this.life[idx] = ml;
      // orange -> yellow
      this.colors[idx*3] = 1; this.colors[idx*3+1] = rand(0.4, 0.8); this.colors[idx*3+2] = 0;
    }
  }

  update() {
    let alive = 0;
    for (let i = 0; i < this.activeCount; i++) {
      this.life[i]--;
      if (this.life[i] <= 0) continue;
      this.positions[i*3]   += this.vx[i];
      this.positions[i*3+1] += this.vy[i];
      const t = this.life[i] / this.maxLife[i];
      // fade to white
      this.colors[i*3+1] = Math.min(1, this.colors[i*3+1] + 0.02);
      this.colors[i*3+2] = Math.min(1, t > 0.3 ? (1-t)*2 : 0);
      // compact alive particles
      if (alive < i) {
        this.positions[alive*3]   = this.positions[i*3];
        this.positions[alive*3+1] = this.positions[i*3+1];
        this.positions[alive*3+2] = this.positions[i*3+2];
        this.vx[alive] = this.vx[i]; this.vy[alive] = this.vy[i];
        this.life[alive] = this.life[i]; this.maxLife[alive] = this.maxLife[i];
        this.colors[alive*3] = this.colors[i*3];
        this.colors[alive*3+1] = this.colors[i*3+1];
        this.colors[alive*3+2] = this.colors[i*3+2];
      }
      alive++;
    }
    this.activeCount = alive;
    this.geo.setDrawRange(0, alive);
    this.geo.attributes.position.needsUpdate = true;
  }
}

// --- Explosion Emitter ---
const EXPL_POOL = 150;
class ExplosionEmitter {
  constructor(scene) {
    this.positions = new Float32Array(EXPL_POOL * 3);
    this.colors = new Float32Array(EXPL_POOL * 3);
    this.vx = new Float32Array(EXPL_POOL);
    this.vy = new Float32Array(EXPL_POOL);
    this.life = new Float32Array(EXPL_POOL);
    this.maxLife = new Float32Array(EXPL_POOL);
    this.activeCount = 0;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
    this.pts = new THREE.Points(this.geo, mat);
    scene.add(this.pts);
  }

  explode(x, y, pvx, pvy, count = 100) {
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= EXPL_POOL) break;
      const idx = this.activeCount++;
      this.positions[idx*3]   = x - W/2;
      this.positions[idx*3+1] = -(y - H/2);
      this.positions[idx*3+2] = 0;
      const spd = rand(0.5, 4);
      const ang = rand(0, Math.PI * 2);
      this.vx[idx] = pvx * 0.3 + Math.cos(ang) * spd;
      this.vy[idx] = -(pvy * 0.3) + Math.sin(ang) * spd;
      const ml = rand(20, 50);
      this.maxLife[idx] = ml; this.life[idx] = ml;
      this.colors[idx*3]   = 1;
      this.colors[idx*3+1] = rand(0.3, 0.8);
      this.colors[idx*3+2] = 0;
    }
  }

  update() {
    let alive = 0;
    for (let i = 0; i < this.activeCount; i++) {
      this.life[i]--;
      if (this.life[i] <= 0) continue;
      this.positions[i*3]   += this.vx[i];
      this.positions[i*3+1] += this.vy[i];
      const t = this.life[i] / this.maxLife[i];
      this.colors[i*3+1] = t * 0.7;
      if (alive < i) {
        for (let k = 0; k < 3; k++) {
          this.positions[alive*3+k] = this.positions[i*3+k];
          this.colors[alive*3+k]    = this.colors[i*3+k];
        }
        this.vx[alive]=this.vx[i]; this.vy[alive]=this.vy[i];
        this.life[alive]=this.life[i]; this.maxLife[alive]=this.maxLife[i];
      }
      alive++;
    }
    this.activeCount = alive;
    this.geo.setDrawRange(0, alive);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// --- Asteroid Mesh ---
class AsteroidMesh {
  constructor(scene, asteroid) {
    this.scene = scene;
    const pts = asteroid.vertices.map(([x, y]) => new THREE.Vector3(x, -y, 0));
    pts.push(pts[0].clone());  // close loop

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: COL_ASTEROID, blending: THREE.AdditiveBlending });
    this.line = new THREE.Line(geo, mat);

    // Glow copy
    const matG = new THREE.LineBasicMaterial({ color: 0x6666aa, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const geoG = geo.clone();
    this.glow = new THREE.Line(geoG, matG);

    scene.add(this.glow);
    scene.add(this.line);
  }

  update(asteroid) {
    if (asteroid.destroyed) {
      this.line.visible = false; this.glow.visible = false; return;
    }
    const wx = asteroid.x - W/2, wy = -(asteroid.y - H/2);
    this.line.position.set(wx, wy, 0);
    this.glow.position.set(wx, wy, 0);
    const rot = -asteroid.rotAngle * Math.PI / 180;
    this.line.rotation.z = rot;
    this.glow.rotation.z = rot;
    this.glow.scale.setScalar(1.15);
  }

  dispose() {
    this.scene.remove(this.line);
    this.scene.remove(this.glow);
  }
}

// --- Delivery Zone Mesh ---
class DeliveryZoneMesh {
  constructor(scene, zone) {
    this.scene = scene;
    const color = zone.zoneType === 'pickup' ? COL_PICKUP : COL_DROPOFF;

    const ringGeo = new THREE.RingGeometry(zone.size - 4, zone.size + 4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(ringGeo, ringMat);

    // Inner fill
    const fillGeo = new THREE.CircleGeometry(zone.size - 4, 32);
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    this.fill = new THREE.Mesh(fillGeo, fillMat);

    this.group = new THREE.Group();
    this.group.add(this.fill);
    this.group.add(this.ring);

    // Orbiting particles
    const ORBS = 12;
    const orbGeo = new THREE.BufferGeometry();
    const orbPos = new Float32Array(ORBS * 3);
    for (let i = 0; i < ORBS; i++) {
      const a = (2 * Math.PI * i) / ORBS;
      orbPos[i*3]   = Math.cos(a) * zone.size;
      orbPos[i*3+1] = Math.sin(a) * zone.size;
      orbPos[i*3+2] = 0;
    }
    orbGeo.setAttribute('position', new THREE.BufferAttribute(orbPos, 3));
    const orbMat = new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.orbs = new THREE.Points(orbGeo, orbMat);
    this.group.add(this.orbs);

    scene.add(this.group);
    this.wx = zone.x - W/2;
    this.wy = -(zone.y - H/2);
    this.group.position.set(this.wx, this.wy, 0);
    this.time = 0;
  }

  update(zone, t) {
    // Keep visual position in sync — zone data can be replaced in-place when
    // both zones expire and new ones spawn in the same tick (every 20s).
    this.group.position.set(zone.x - W/2, -(zone.y - H/2), 0);
    this.time += 0.05;
    const pulse = 0.9 + 0.1 * Math.sin(t * 4);
    this.ring.scale.setScalar(pulse);
    this.orbs.rotation.z = this.time;
    // Fade based on remaining time
    const frac = zone.activeTime / ZONE_ACTIVE_FRAMES;
    this.group.visible = !zone.isExpired();
    this.ring.material.opacity = 0.8 * frac;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

// ============================================================
// G: GAME STATE
// ============================================================
class GameState {
  constructor() {
    this.ships = [];
    this.shipAIs = [];
    this.asteroids = [];
    this.zones = [];
    this.zoneTimer = 0;
    this.numPlayers = 0;
    this.gameOver = false;
    this.winner = null;
    this.survivingShips = [];
    this.playerControls = [
      { thrust: 0, rotation: 0 },
      { thrust: 0, rotation: 0 }
    ];
  }

  initialize(numPlayers) {
    this.numPlayers = numPlayers;
    this.ships = []; this.shipAIs = [];
    const positions = [
      [W/4, H/4], [W*3/4, H/4], [W/2, H*3/4]
    ];
    for (let i = 0; i < numPlayers; i++) {
      const s = new Ship(positions[i][0], positions[i][1], rand(0, 360), false);
      this.ships.push(s);
      this.shipAIs.push(null);
    }
    for (let i = numPlayers; i < 3; i++) {
      const s = new Ship(positions[i][0], positions[i][1], rand(0, 360), true);
      this.ships.push(s);
      this.shipAIs.push(createRandomAI(s));
    }
    this.asteroids = this._genAsteroids(10);
    this.zones = [];
    this.zoneTimer = randInt(3 * FPS, 6 * FPS);
    this.gameOver = false;
    this.winner = null;
    this.survivingShips = [...this.ships];
    for (const ctrl of this.playerControls) { ctrl.thrust = 0; ctrl.rotation = 0; }
  }

  _genAsteroids(n) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = this._randomPointAwayFrom(this.ships);
      const cat = Math.random() < 0.5 ? 'large' : Math.random() < 0.6 ? 'medium' : 'small';
      list.push(new Asteroid(x, y, cat));
    }
    return list;
  }

  _randomPointAwayFrom(entities, minDist = 100) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = rand(0, W), y = rand(0, H);
      let ok = true;
      for (const e of entities) {
        if (wrappedDist(x, y, e.x, e.y) < minDist) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
    return [rand(0, W), rand(0, H)];
  }

  tick(keys) {
    if (this.gameOver) return;

    // Player controls
    for (let i = 0; i < this.numPlayers; i++) {
      if (i < this.ships.length && !this.ships[i].destroyed) {
        this.ships[i].setControls(this.playerControls[i].thrust, this.playerControls[i].rotation);
      }
    }

    // AI controls
    for (let i = 0; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (!ship.aiControlled || ship.destroyed) continue;
      const others = this.ships.filter((s, j) => j !== i && !s.destroyed);
      const [t, r] = this.shipAIs[i].makeDecision(this.asteroids, others, this.zones);
      ship.setControls(t, r);
    }

    // Update entities
    for (const s of this.ships) if (!s.destroyed) s.update();
    for (const a of this.asteroids) a.update();

    // Collisions: ship vs asteroid
    const newFrags = [];
    for (const ship of this.ships) {
      if (ship.destroyed) continue;
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
        const ast = this.asteroids[i];
        if (ship.collidesWith(ast)) {
          ship.destroyed = true;
          newFrags.push(...ast.breakApart());
          this.asteroids.splice(i, 1);
          break;
        }
      }
    }
    this.asteroids.push(...newFrags);

    // Spawn asteroids occasionally
    if (this.asteroids.length < MAX_ASTEROIDS && Math.random() < 0.01) {
      const [x, y] = this._randomPointAwayFrom(this.ships);
      this.asteroids.push(new Asteroid(x, y, 'large'));
    }

    // Update zones
    for (let i = this.zones.length - 1; i >= 0; i--) {
      this.zones[i].update();
      if (this.zones[i].isExpired()) { this.zones.splice(i, 1); continue; }
      for (const ship of this.ships) {
        if (!ship.destroyed) this.zones[i].checkShipInteraction(ship);
      }
    }

    // Spawn zones
    this.zoneTimer--;
    if (this.zoneTimer <= 0 && this.zones.length === 0) {
      const all = [...this.ships, ...this.asteroids, ...this.zones];
      const [px, py] = this._randomPointAwayFrom(all);
      this.zones.push(new DeliveryZone(px, py, 'pickup'));
      const all2 = [...all, this.zones[this.zones.length-1]];
      const [dx, dy] = this._randomPointAwayFrom(all2, 300);
      this.zones.push(new DeliveryZone(dx, dy, 'dropoff'));
      this.zoneTimer = ZONE_SPAWN_INTERVAL;
    } else if (this.zoneTimer <= 0) {
      this.zoneTimer = ZONE_SPAWN_INTERVAL;
    }

    // Win conditions
    this.survivingShips = this.ships.filter(s => !s.destroyed);
    for (const ship of this.ships) {
      if (ship.credits >= CREDIT_GOAL) {
        this.winner = ship; this.gameOver = true; return;
      }
    }
    if (this.survivingShips.length <= 1) {
      this.winner = this.survivingShips[0] || null;
      this.gameOver = true;
    }
  }

  getWinnerText() {
    if (!this.winner) return this.survivingShips.length === 0 ? 'ALL SHIPS DESTROYED' : 'GAME OVER';
    const idx = this.ships.indexOf(this.winner);
    if (!this.winner.aiControlled) return `PLAYER ${idx + 1} WINS! Credits: ${this.winner.credits}`;
    return `AI WINS! Credits: ${this.winner.credits}`;
  }
}

// ============================================================
// H: RENDERER / SCENE SETUP
// ============================================================
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const aspect = window.innerWidth / window.innerHeight;
const camH = H;
const camW = camH * aspect;
const camera = new THREE.OrthographicCamera(-camW/2, camW/2, camH/2, -camH/2, -100, 100);
camera.position.z = 10;

const scene = new THREE.Scene();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.3, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Handle resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  const a = window.innerWidth / window.innerHeight;
  const cw = camH * a;
  camera.left = -cw/2; camera.right = cw/2;
  camera.updateProjectionMatrix();
});

// ============================================================
// I: GAME CONTROLLER
// ============================================================
const state = new GameState();
const starfield = new Starfield(scene);

let shipMeshes = [];
let astMeshes = [];
let zoneMeshes = [];
let thrustEmitter = new ThrustEmitter(scene);
let explosionEmitter = new ExplosionEmitter(scene);

// Screen shake
let shakeIntensity = 0;

// Keys
const keys = new Set();
document.addEventListener('keydown', e => keys.add(e.code));
document.addEventListener('keyup',   e => keys.delete(e.code));

// --- UI elements ---
const menuEl      = document.getElementById('menu');
const hudEl       = document.getElementById('hud');
const gameoverEl  = document.getElementById('gameover');
const hudLeft     = document.getElementById('hud-left');
const hudCenter   = document.getElementById('hud-center');
const hudRight    = document.getElementById('hud-right');
const goTitle     = document.getElementById('gameover-title');
const goSub       = document.getElementById('gameover-sub');
const debugEl     = document.getElementById('debug');

let gamePhase = 'menu';  // 'menu', 'playing', 'gameover'
let debugMode = false;
let selectedOption = 0;

// Menu option elements
const menuOptions = document.querySelectorAll('.menu-option');
menuOptions.forEach((el) => {
  el.addEventListener('click', () => {
    selectedOption = parseInt(el.dataset.idx);
    updateMenuSelection();
    startGame(selectedOption);
  });
});

function updateMenuSelection() {
  menuOptions.forEach((el, i) => {
    el.classList.toggle('selected', i === selectedOption);
  });
}

// Track previous asteroid count to detect new asteroids (added during gameplay)
let prevAsteroidCount = 0;
let prevAsteroidIds = new Set();

function initVisuals() {
  // Remove old meshes
  for (const m of shipMeshes) m.dispose();
  for (const m of astMeshes) m.dispose();
  for (const m of zoneMeshes) m.dispose();
  shipMeshes = [];
  astMeshes = [];
  zoneMeshes = [];

  const colors = [COL_PLAYER1, COL_PLAYER2, COL_AI, COL_AI];
  for (let i = 0; i < state.ships.length; i++) {
    const col = state.ships[i].aiControlled ? COL_AI : colors[i];
    shipMeshes.push(new ShipMesh(scene, col));
  }
  for (const ast of state.asteroids) {
    astMeshes.push(new AsteroidMesh(scene, ast));
  }
  for (const zone of state.zones) {
    zoneMeshes.push(new DeliveryZoneMesh(scene, zone));
  }
}

function syncVisuals(t) {
  // Sync ship meshes
  for (let i = 0; i < state.ships.length; i++) {
    shipMeshes[i].update(state.ships[i]);
    thrustEmitter.emit(state.ships[i]);
  }

  // Detect newly spawned or destroyed asteroids
  // Add meshes for new asteroids
  while (astMeshes.length < state.asteroids.length) {
    astMeshes.push(new AsteroidMesh(scene, state.asteroids[astMeshes.length]));
  }
  // Remove excess meshes
  while (astMeshes.length > state.asteroids.length) {
    const m = astMeshes.pop();
    m.dispose();
  }
  for (let i = 0; i < state.asteroids.length; i++) {
    astMeshes[i].update(state.asteroids[i]);
  }

  // Zones
  while (zoneMeshes.length < state.zones.length) {
    zoneMeshes.push(new DeliveryZoneMesh(scene, state.zones[zoneMeshes.length]));
  }
  while (zoneMeshes.length > state.zones.length) {
    const m = zoneMeshes.pop();
    m.dispose();
  }
  for (let i = 0; i < state.zones.length; i++) {
    zoneMeshes[i].update(state.zones[i], t);
  }

  thrustEmitter.update();
  explosionEmitter.update();
}

// Track destroyed ships for explosion effects
const prevDestroyedState = [];

function checkExplosions() {
  for (let i = 0; i < state.ships.length; i++) {
    if (state.ships[i].destroyed && !prevDestroyedState[i]) {
      explosionEmitter.explode(state.ships[i].x, state.ships[i].y, state.ships[i].vx, state.ships[i].vy, 100);
      shakeIntensity = 15;
    }
    prevDestroyedState[i] = state.ships[i].destroyed;
  }
}

function updateHUD() {
  if (gamePhase !== 'playing') return;
  const labels = ['P1', 'P2', 'AI1', 'AI2', 'AI3'];
  const colorCls = ['neon-cyan', 'neon-magenta', 'neon-white'];
  let html = '';
  for (let i = 0; i < state.ships.length; i++) {
    const ship = state.ships[i];
    const name = ship.aiControlled ? `AI${i - state.numPlayers + 1}` : `P${i+1}`;
    const col = colorCls[Math.min(i, 2)];
    const cargo = ship.hasCargo ? ' 📦' : '';
    const dead = ship.destroyed ? ' 💀' : '';
    html += `<div class="ship-hud ${col}">${name}: $${ship.credits}${cargo}${dead}</div>`;
  }
  hudLeft.innerHTML = html;

  const zoneInfo = state.zones.length
    ? `<span class="neon-orange">PICKUP</span> + <span class="neon-magenta">DROPOFF</span> active`
    : `<span style="color:#444">Next zone spawning...</span>`;
  hudCenter.innerHTML = zoneInfo;
  hudRight.innerHTML = `<span class="neon-white">Goal: $${CREDIT_GOAL}</span>`;
}

// ============================================================
// TEXT POP FEEDBACK
// ============================================================
function spawnTextPop(gameX, gameY, text, color) {
  const sx = (gameX / W) * window.innerWidth;
  const sy = (gameY / H) * window.innerHeight;
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'absolute',
    left: `${sx}px`,
    top: `${sy}px`,
    transform: 'translate(-50%, -50%)',
    color,
    fontFamily: "'Courier New', monospace",
    fontSize: '1.1rem',
    fontWeight: 'bold',
    pointerEvents: 'none',
    textShadow: `0 0 8px ${color}`,
    zIndex: '100',
    transition: 'opacity 0.75s ease-out, top 0.75s ease-out',
    opacity: '1',
  });
  container.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '0';
    el.style.top = `${sy - 65}px`;
  });
  setTimeout(() => el.remove(), 800);
}

const prevCredits = [];
const prevCargo   = [];

function initFeedback() {
  prevCredits.length = 0;
  prevCargo.length   = 0;
}

function checkFeedback() {
  for (let i = 0; i < state.ships.length; i++) {
    const ship = state.ships[i];
    const col  = SHIP_COLORS_HEX[Math.min(i, 2)];
    if (prevCredits[i] !== undefined && ship.credits > prevCredits[i]) {
      spawnTextPop(ship.x, ship.y, `+${ship.credits - prevCredits[i]} CREDIT!`, col);
    }
    if (prevCargo[i] === false && ship.hasCargo) {
      spawnTextPop(ship.x, ship.y, 'CARGO!', '#ff8800');
    }
    prevCredits[i] = ship.credits;
    prevCargo[i]   = ship.hasCargo;
  }
}

function ok(val, label)  { return `<span class="ok">✓</span> ${label}: ${val}`; }
function bad(val, label) { return `<span class="bad">✗</span> ${label}: ${val}`; }
function chk(pass, val, label) { return pass ? ok(val, label) : bad(val, label); }

function updateDebugHUD() {
  if (!debugMode || gamePhase === 'menu') { debugEl.classList.add('hidden'); return; }
  debugEl.classList.remove('hidden');

  const lines = [];
  for (let pi = 0; pi < state.numPlayers; pi++) {
    const ship = state.ships[pi];
    if (!ship) continue;
    const label = `P${pi + 1}`;
    lines.push(`<b style="color:#ff0">=== ${label} ===</b>`);
    lines.push(chk(!ship.destroyed,    ship.destroyed,          'destroyed'));
    lines.push(chk(!ship.hasCargo,     ship.hasCargo,           'hasCargo'));
    lines.push(chk(ship.interactionCooldown === 0, ship.interactionCooldown, 'cooldown'));
    lines.push(chk(ship.speed <= MAX_PICKUP_VELOCITY,
                   ship.speed.toFixed(3) + ' / ' + MAX_PICKUP_VELOCITY, 'speed'));

    const pickups  = state.zones.filter(z => z.zoneType === 'pickup');
    const dropoffs = state.zones.filter(z => z.zoneType === 'dropoff');

    if (pickups.length === 0) {
      lines.push('<span class="bad">no pickup zone active</span>');
    } else {
      for (const z of pickups) {
        const dist = ship.distTo(z);
        const inRange = dist < z.size + ship.size;
        lines.push(chk(inRange, dist.toFixed(1) + ' (need <' + (z.size + ship.size) + ')', 'pickup dist'));
        lines.push(chk(z.activeTime > 0, (z.activeTime / FPS).toFixed(1) + 's', 'zone time left'));
      }
    }
    if (dropoffs.length === 0) {
      lines.push('<span style="color:#888">no dropoff zone active</span>');
    } else {
      for (const z of dropoffs) {
        const dist = ship.distTo(z);
        const inRange = dist < z.size + ship.size;
        lines.push(`  dropoff dist: ${dist.toFixed(1)} ${inRange ? '<span class="ok">(in range)</span>' : ''}`);
      }
    }
    lines.push('');
  }
  lines.push('<span style="color:#888">D = toggle debug</span>');
  debugEl.innerHTML = lines.join('\n');
}

function startGame(numPlayers) {
  state.initialize(numPlayers);
  initVisuals();
  initFeedback();
  for (let i = 0; i < state.ships.length; i++) prevDestroyedState[i] = false;

  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  gameoverEl.classList.add('hidden');
  gamePhase = 'playing';
}

function showGameOver() {
  goTitle.textContent = state.getWinnerText();
  goTitle.className = state.winner && !state.winner.aiControlled ? 'neon-green' : 'neon-cyan';
  goSub.textContent = '';
  gameoverEl.classList.remove('hidden');
}

function returnToMenu() {
  gamePhase = 'menu';
  hudEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
}

// Input handling
document.addEventListener('keydown', (e) => {
  if (gamePhase === 'menu') {
    if (e.code === 'ArrowUp') {
      selectedOption = (selectedOption - 1 + 3) % 3;
      updateMenuSelection();
    } else if (e.code === 'ArrowDown') {
      selectedOption = (selectedOption + 1) % 3;
      updateMenuSelection();
    } else if (e.code === 'Enter') {
      startGame(selectedOption);
    } else if (e.code === 'Escape') {
      window.close();
    }
  } else if (gamePhase === 'playing' || gamePhase === 'gameover') {
    if (e.code === 'KeyR') {
      startGame(state.numPlayers);
    } else if (e.code === 'Escape') {
      returnToMenu();
    } else if (e.code === 'Backquote') {
      debugMode = !debugMode;
    }
    // Player 1 controls
    if (e.code === 'ArrowUp')    state.playerControls[0].thrust = 1;
    if (e.code === 'ArrowLeft')  state.playerControls[0].rotation = -1;
    if (e.code === 'ArrowRight') state.playerControls[0].rotation = 1;
    // Player 2 controls
    if (e.code === 'KeyW') state.playerControls[1].thrust = 1;
    if (e.code === 'KeyA') state.playerControls[1].rotation = -1;
    if (e.code === 'KeyD') state.playerControls[1].rotation = 1;
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowUp')    state.playerControls[0].thrust = 0;
  if (e.code === 'ArrowLeft' && state.playerControls[0].rotation === -1) state.playerControls[0].rotation = 0;
  if (e.code === 'ArrowRight' && state.playerControls[0].rotation === 1) state.playerControls[0].rotation = 0;
  if (e.code === 'KeyW') state.playerControls[1].thrust = 0;
  if (e.code === 'KeyA' && state.playerControls[1].rotation === -1) state.playerControls[1].rotation = 0;
  if (e.code === 'KeyD' && state.playerControls[1].rotation === 1)  state.playerControls[1].rotation = 0;
});

// ============================================================
// J: MAIN LOOP
// ============================================================
let accumulator = 0;
let lastTime = 0;
let gameTime = 0;

function mainLoop(timestamp) {
  requestAnimationFrame(mainLoop);
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  starfield.update(dt);

  if (gamePhase === 'playing') {
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      const prevAstCount = state.asteroids.length;
      checkExplosions();
      state.tick(keys);
      checkFeedback();
      // Check for new asteroid count (breakApart spawned frags)
      accumulator -= FIXED_DT;
      gameTime += FIXED_DT;
    }

    if (state.gameOver && gamePhase === 'playing') {
      gamePhase = 'gameover';
      showGameOver();
    }

    syncVisuals(gameTime);
    updateHUD();
    updateDebugHUD();
  } else if (gamePhase === 'gameover') {
    syncVisuals(gameTime);
  }

  // Screen shake
  if (shakeIntensity > 0.1) {
    camera.position.x = (Math.random() - 0.5) * shakeIntensity;
    camera.position.y = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.85;
  } else {
    camera.position.x = 0; camera.position.y = 0;
    shakeIntensity = 0;
  }

  composer.render();
}

requestAnimationFrame(mainLoop);
