// ============================================================
// DREADNOUGHTS — Capital Ship Combat (Three.js)
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================
// A: CONSTANTS
// ============================================================
const W = 2200, H = 1600;   // large arena for slow capital ships
const FPS = 60;
const FIXED_DT = 1 / FPS;

const SHIP_SIZE       = 88;    // collision radius (ships are large)
const SHIP_SPEED      = 0.022; // thrust acceleration per frame — slow and heavy
const SHIP_ROTATION   = 0.22;  // degrees per frame — very sluggish turn rate
const SHIP_DRAG       = 0.016; // Star Wars style drag; ships coast to a stop
const MAX_VELOCITY    = 1.1;   // top speed: slow crawl
const HULL_MAX_HP     = 2000;
const GUN_MAX_HP      = 80;
const SYSTEM_MAX_HP   = 500;
const WALL_MARGIN     = 100;

// Camera tracking
const CAM_LERP_POS  = 0.04;
const CAM_LERP_ZOOM = 0.025;
const CAM_PAD       = 320;   // padding around ships in world units
const CAM_ZOOM_MIN  = 0.32;
const CAM_ZOOM_MAX  = 1.6;

const AI_OPTIMAL_RANGE = 560;
const AI_STRAFE_PERIOD = 280;

const DEG2RAD = Math.PI / 180;

// Weapon archetypes — guns on a ship all share one archetype.
// pivotRange is very small; guns are essentially fixed broadside.
const WEAPON_ARCHETYPES = {
  blaster: {
    label: 'BLASTER BATTERY',
    fireRate:   [28, 42],
    speed:      [12, 16],
    damage:     [32, 48],
    projSize:   [5, 8],
    projLength: [22, 36],
    pivotRange: [8, 14],
    accuracy:   [0.4, 0.9],
    colors:     [0x88ff99, 0xffff55, 0xffaa44],
  },
  phaser: {
    label: 'PHASER ARRAY',
    fireRate:   [8, 14],
    speed:      [20, 28],
    damage:     [14, 22],
    projSize:   [3, 5],
    projLength: [40, 68],
    pivotRange: [10, 16],
    accuracy:   [0.3, 0.7],
    colors:     [0xff88ff, 0x55eeff, 0xcc88ff],
  },
  heavyCannon: {
    label: 'HEAVY CANNON',
    fireRate:   [110, 180],
    speed:      [6, 10],
    damage:     [140, 200],
    projSize:   [14, 20],
    projLength: [28, 44],
    pivotRange: [5, 10],
    accuracy:   [0.6, 1.2],
    colors:     [0xff9922, 0xffcc33, 0xffee77],
  },
  rapidFire: {
    label: 'RAPID CANNON',
    fireRate:   [5, 9],
    speed:      [16, 22],
    damage:     [8, 14],
    projSize:   [2, 4],
    projLength: [10, 18],
    pivotRange: [10, 18],
    accuracy:   [0.8, 1.4],
    colors:     [0xffffff, 0xbbddff, 0xffbbee],
  },
};

// Ship systems — targetable subsystems with line-of-sight constraints.
// arcCenter/arcHalf in local-space degrees: 0=bow, 180=stern, -90=port, +90=stbd
const SYSTEM_DEFS = [
  { id: 'bridge',   name: 'BRIDGE',       lx:  80, ly:   0, arcCenter:   0, arcHalf:  60 },
  { id: 'engines',  name: 'ENGINES',      lx: -100, ly:  0, arcCenter: 180, arcHalf:  70 },
  { id: 'portBatt', name: 'PORT BATTERY', lx:   0, ly:  70, arcCenter: -90, arcHalf:  90 },
  { id: 'stbdBatt', name: 'STBD BATTERY', lx:   0, ly: -70, arcCenter:  90, arcHalf:  90 },
];

// ============================================================
// B: MATH UTILITIES
// ============================================================
function rand(lo, hi)    { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) { const dx=ax-bx, dy=ay-by; return Math.sqrt(dx*dx+dy*dy); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function angleTo(x1, y1, x2, y2) {
  return (Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 360) % 360;
}
function angularDiff(a, b) {
  return ((b - a + 180 + 360) % 360) - 180;
}
function steeringDir(cur, tgt) {
  const diff = angularDiff(cur, tgt);
  if (Math.abs(diff) < 2) return 0;
  return diff > 0 ? 1 : -1;
}

// Transform a point in ship-local space to game-world coords.
// Local: +X forward, +Y port (left/up on screen when ship faces right, y-down world).
function localToWorld(lx, ly, shipX, shipY, shipAngle) {
  const rad = shipAngle * DEG2RAD;
  const c = Math.cos(rad), s = Math.sin(rad);
  return [shipX + c*lx + s*ly, shipY + s*lx - c*ly];
}

function outOfBounds(x, y) {
  return x < -120 || x > W+120 || y < -120 || y > H+120;
}

// Convert game-world position to Three.js world position
function toThree(gx, gy) {
  return [gx - W/2, -(gy - H/2)];
}

// ============================================================
// C: WEAPON DEFINITION
// ============================================================
class WeaponDef {
  constructor(archetypeKey) {
    const a = WEAPON_ARCHETYPES[archetypeKey];
    this.archetypeKey = archetypeKey;
    this.label      = a.label;
    this.fireRate   = randInt(a.fireRate[0],   a.fireRate[1]);
    this.projSpeed  = rand(a.speed[0],         a.speed[1]);
    this.damage     = rand(a.damage[0],        a.damage[1]);
    this.projSize   = rand(a.projSize[0],      a.projSize[1]);
    this.projLength = rand(a.projLength[0],    a.projLength[1]);
    this.pivotRange = rand(a.pivotRange[0],    a.pivotRange[1]);
    this.accuracy   = rand(a.accuracy[0],      a.accuracy[1]);
    this.color      = pick(a.colors);
  }
  rateLabel() {
    if (this.fireRate <= 9)  return 'rapid';
    if (this.fireRate <= 20) return 'fast';
    if (this.fireRate <= 55) return 'medium';
    return 'slow';
  }
}

function generateRandomWeapon() {
  const keys = Object.keys(WEAPON_ARCHETYPES);
  return new WeaponDef(keys[randInt(0, keys.length - 1)]);
}

// ============================================================
// D: SHIP SYSTEMS
// ============================================================
class ShipSystem {
  constructor(def) {
    this.id        = def.id;
    this.name      = def.name;
    this.lx        = def.lx;
    this.ly        = def.ly;
    this.arcCenter = def.arcCenter;
    this.arcHalf   = def.arcHalf;
    this.hp        = SYSTEM_MAX_HP;
    this.destroyed = false;
  }
  get integrity() { return this.hp / SYSTEM_MAX_HP; }
  worldPos(ship) { return localToWorld(this.lx, this.ly, ship.x, ship.y, ship.angle); }
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.destroyed = true;
  }
}

// Can attacker gun see target system? Uses bearing from system to gun in target ship's local frame.
function canSeeSystem(attackerGun, attackerShip, targetSystem, targetShip) {
  const [gx, gy] = attackerGun.worldPos(attackerShip);
  const [sx, sy] = targetSystem.worldPos(targetShip);
  const bearing = angleTo(sx, sy, gx, gy);
  const localBearing = angularDiff(targetShip.angle, bearing);
  return Math.abs(angularDiff(targetSystem.arcCenter, localBearing)) <= targetSystem.arcHalf;
}

// ============================================================
// E: GUN MOUNTS & GUN CLASS
// ============================================================

// Gun positions in ship-local space (+X forward, +Y port = left/up on screen).
// Positioned along the hull edges. mountOffset: -90 = port, +90 = starboard.
const GUN_MOUNTS = [
  { lx:  30, ly:  68, mountOffset: -90, side: 'port' },
  { lx: -15, ly:  76, mountOffset: -90, side: 'port' },
  { lx: -60, ly:  62, mountOffset: -90, side: 'port' },
  { lx:  30, ly: -68, mountOffset:  90, side: 'starboard' },
  { lx: -15, ly: -76, mountOffset:  90, side: 'starboard' },
  { lx: -60, ly: -62, mountOffset:  90, side: 'starboard' },
];

class Gun {
  constructor(mount, weaponDef, shipId) {
    this.lx            = mount.lx;
    this.ly            = mount.ly;
    this.mountOffset   = mount.mountOffset;
    this.side          = mount.side;
    this.pivotRange    = weaponDef.pivotRange;
    this.accuracy      = weaponDef.accuracy;
    this.weaponDef     = weaponDef;
    this.shipId        = shipId;
    this.hp            = GUN_MAX_HP;
    this.destroyed     = false;
    this.cooldown      = Math.floor(Math.random() * weaponDef.fireRate);
    this.aimOffset     = 0;
    this._targetSysId  = null;
    this._targetTimer  = 0;
  }

  get loadFraction() { return this.cooldown / this.weaponDef.fireRate; } // 0=ready, 1=just fired

  tick() { if (this.cooldown > 0) this.cooldown--; }

  worldPos(ship) {
    return localToWorld(this.lx, this.ly, ship.x, ship.y, ship.angle);
  }

  _pickTarget(ship, enemyShip) {
    const visible = enemyShip.systems.filter(
      s => !s.destroyed && canSeeSystem(this, ship, s, enemyShip)
    );
    return visible.length ? pick(visible).id : null;
  }

  // Aim toward enemy (or its chosen system). Returns true if target is in pivot arc.
  updateAim(ship, enemyShip) {
    if (this.destroyed) return false;

    // Validate / repick target
    if (this._targetSysId) {
      const sys = enemyShip.systems.find(s => s.id === this._targetSysId);
      if (!sys || sys.destroyed || !canSeeSystem(this, ship, sys, enemyShip)) {
        this._targetSysId = null;
        this._targetTimer = 0;
      }
    }
    if (--this._targetTimer <= 0) {
      this._targetSysId = this._pickTarget(ship, enemyShip);
      this._targetTimer = randInt(60, 180);
    }

    let aimX = enemyShip.x, aimY = enemyShip.y;
    if (this._targetSysId) {
      const sys = enemyShip.systems.find(s => s.id === this._targetSysId);
      const [sx, sy] = sys.worldPos(enemyShip);
      aimX = sx; aimY = sy;
    }

    const [gx, gy] = this.worldPos(ship);
    const worldBearing = angleTo(gx, gy, aimX, aimY);
    const restAngle = ship.angle + this.mountOffset;
    const diff = angularDiff(restAngle, worldBearing);
    this.aimOffset = clamp(diff, -this.pivotRange, this.pivotRange);
    return Math.abs(diff) <= this.pivotRange;
  }

  tryFire(ship) {
    if (this.destroyed || this.cooldown > 0) return null;
    // Battery damage slows fire rate
    let fr = this.weaponDef.fireRate;
    const battId = this.side === 'port' ? 'portBatt' : 'stbdBatt';
    const batt = ship.systems && ship.systems.find(s => s.id === battId);
    if (batt) fr = Math.round(fr * (1 + (1 - batt.integrity)));
    this.cooldown = fr;
    const [wx, wy] = this.worldPos(ship);
    const worldAim = ship.angle + this.mountOffset + this.aimOffset;
    const spread = (Math.random() - 0.5) * 2 * this.accuracy;
    return new Projectile(wx, wy, worldAim + spread, this.weaponDef, this.shipId, this._targetSysId);
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.destroyed = true;
  }
}

// ============================================================
// F: PROJECTILE CLASS
// ============================================================
class Projectile {
  constructor(x, y, angle, weaponDef, ownerId, targetSysId = null) {
    this.x           = x;
    this.y           = y;
    const rad        = angle * DEG2RAD;
    this.vx          = Math.cos(rad) * weaponDef.projSpeed;
    this.vy          = Math.sin(rad) * weaponDef.projSpeed;
    this.angle       = angle;
    this.size        = weaponDef.projSize;
    this.length      = weaponDef.projLength;
    this.color       = weaponDef.color;
    this.damage      = weaponDef.damage;
    this.ownerId     = ownerId;
    this.targetSysId = targetSysId;
    this.life        = 220;
    this.destroyed   = false;
  }
  update() {
    this.x += this.vx; this.y += this.vy; this.life--;
    if (this.life <= 0 || outOfBounds(this.x, this.y)) this.destroyed = true;
  }
  collidesWith(ship) {
    return dist(this.x, this.y, ship.x, ship.y) < this.size + ship.size;
  }
}

// ============================================================
// G: SHIP CLASS
// ============================================================
function buildGuns(weaponDef, shipId) {
  return GUN_MOUNTS.map(m => new Gun(m, weaponDef, shipId));
}

class Ship {
  constructor(x, y, angle, id) {
    this.id        = id;
    this.x         = x;
    this.y         = y;
    this.angle     = angle;
    this.vx        = 0;
    this.vy        = 0;
    this.size      = SHIP_SIZE;
    this.hullHp    = HULL_MAX_HP;
    this.destroyed = false;
    this.weapon    = generateRandomWeapon();
    this.guns      = buildGuns(this.weapon, id);
    this.systems   = SYSTEM_DEFS.map(d => new ShipSystem(d));
    this.shapeIdx  = randInt(0, 3);
    this.thrust    = 0;
    this.rotation  = 0;
  }

  get speed() { return Math.sqrt(this.vx*this.vx + this.vy*this.vy); }

  // Fraction of rotation / speed remaining after system damage
  get rotationMultiplier() {
    const b = this.systems.find(s => s.id === 'bridge');
    return b ? 0.5 + 0.5 * b.integrity : 1;
  }
  get speedMultiplier() {
    const e = this.systems.find(s => s.id === 'engines');
    return e ? 0.6 + 0.4 * e.integrity : 1;
  }

  update() {
    this.angle = (this.angle + this.rotation * SHIP_ROTATION * this.rotationMultiplier + 360) % 360;
    if (this.thrust) {
      const rad = this.angle * DEG2RAD;
      this.vx += Math.cos(rad) * SHIP_SPEED;
      this.vy += Math.sin(rad) * SHIP_SPEED;
      const maxVel = MAX_VELOCITY * this.speedMultiplier;
      const spd = this.speed;
      if (spd > maxVel) { this.vx = (this.vx / spd) * maxVel; this.vy = (this.vy / spd) * maxVel; }
    }
    this.vx *= (1 - SHIP_DRAG);
    this.vy *= (1 - SHIP_DRAG);
    this.x  += this.vx;
    this.y  += this.vy;
    if (this.x < WALL_MARGIN)     { this.x = WALL_MARGIN;     this.vx =  Math.abs(this.vx) * 0.35; }
    if (this.x > W - WALL_MARGIN) { this.x = W - WALL_MARGIN; this.vx = -Math.abs(this.vx) * 0.35; }
    if (this.y < WALL_MARGIN)     { this.y = WALL_MARGIN;     this.vy =  Math.abs(this.vy) * 0.35; }
    if (this.y > H - WALL_MARGIN) { this.y = H - WALL_MARGIN; this.vy = -Math.abs(this.vy) * 0.35; }
    for (const gun of this.guns) gun.tick();
  }

  takeDamage(proj) {
    this.hullHp = Math.max(0, this.hullHp - proj.damage);
    if (this.hullHp <= 0) this.destroyed = true;

    if (proj.targetSysId) {
      // Damage the targeted system
      const sys = this.systems.find(s => s.id === proj.targetSysId);
      if (sys && !sys.destroyed) sys.takeDamage(proj.damage * 0.3);
    } else {
      // Damage a gun on the hit side (50% chance)
      const incomingAngle = Math.atan2(proj.vy, proj.vx) * 180 / Math.PI;
      const localHit = angularDiff(this.angle, incomingAngle);
      const sideIndices = localHit > 0 ? [0, 1, 2] : [3, 4, 5];
      const candidates = sideIndices.map(i => this.guns[i]).filter(g => !g.destroyed);
      if (candidates.length && Math.random() < 0.50) {
        pick(candidates).takeDamage(proj.damage * 0.45);
      }
    }
  }
}

// ============================================================
// H: AI CLASS
// ============================================================
class DreadnoughtAI {
  constructor(ship) {
    this.ship      = ship;
    this.side      = Math.random() < 0.5 ? 1 : -1;
    this.sideTimer = randInt(180, AI_STRAFE_PERIOD);
  }

  makeDecision(enemy) {
    const s = this.ship;
    const d = dist(s.x, s.y, enemy.x, enemy.y);
    const bearingToEnemy = angleTo(s.x, s.y, enemy.x, enemy.y);

    if (--this.sideTimer <= 0) {
      this.side = -this.side;
      this.sideTimer = randInt(140, AI_STRAFE_PERIOD);
    }

    // Desired heading: present chosen side to enemy.
    // side=+1: present port (guns face -90° from forward) → enemy 90° to port
    const sideOffset = 90 * this.side;
    let desiredAngle = (bearingToEnemy + sideOffset + 360) % 360;

    // Range bias: angle slightly toward/away to manage distance
    if (d < AI_OPTIMAL_RANGE * 0.6) {
      desiredAngle = (desiredAngle + 30 * this.side + 360) % 360;
    } else if (d > AI_OPTIMAL_RANGE * 1.4) {
      desiredAngle = (desiredAngle - 30 * this.side + 360) % 360;
    }

    const rotation  = steeringDir(s.angle, desiredAngle);
    const alignDiff = Math.abs(angularDiff(s.angle, desiredAngle));
    const thrust    = alignDiff < 70 ? 1 : 0;
    return { thrust, rotation };
  }
}

// ============================================================
// H: SHIP SHAPE VARIANTS
// ============================================================

// Design 0: Imperial Dreadnought — pointed wedge with twin engine nacelles
function makeShipShape0() {
  const s = new THREE.Shape();
  s.moveTo(115, 0);
  s.bezierCurveTo(108, 12, 70, 38, 30, 55);
  s.bezierCurveTo(0,   68, -40, 72, -72, 66);
  s.lineTo(-88, 52);
  s.bezierCurveTo(-100, 52, -112, 44, -116, 30);
  s.lineTo(-122, 0);
  s.lineTo(-116, -30);
  s.bezierCurveTo(-112, -44, -100, -52, -88, -52);
  s.lineTo(-72, -66);
  s.bezierCurveTo(-40, -72, 0, -68, 30, -55);
  s.bezierCurveTo(70, -38, 108, -12, 115, 0);
  s.closePath();
  return s;
}

// Design 1: Mon Calamari Heavy Cruiser — asymmetric lumpy hull with command dome and drive pods
function makeShipShape1() {
  const s = new THREE.Shape();
  // Forward sensor dome
  s.moveTo(108, 0);
  s.bezierCurveTo(106, 20, 88, 44, 60, 60);
  // Port forward blister (command pod bump)
  s.lineTo(44, 68);
  s.bezierCurveTo(26, 82, 2, 92, -18, 86);
  // Mid port hull — indent then secondary blister
  s.bezierCurveTo(-38, 82, -55, 70, -60, 60);
  s.lineTo(-68, 68);
  s.lineTo(-84, 64);
  // Port aft drive pod
  s.bezierCurveTo(-98, 58, -112, 48, -114, 32);
  s.lineTo(-120, 16);
  s.lineTo(-122, 0);
  s.lineTo(-120, -16);
  s.lineTo(-114, -32);
  // Starboard aft drive pod
  s.bezierCurveTo(-112, -48, -98, -58, -84, -64);
  s.lineTo(-68, -68);
  s.lineTo(-60, -60);
  s.bezierCurveTo(-55, -70, -38, -82, -18, -86);
  s.bezierCurveTo(2, -92, 26, -82, 44, -68);
  s.lineTo(60, -60);
  s.bezierCurveTo(88, -44, 106, -20, 108, 0);
  s.closePath();
  return s;
}

// Design 2: Battlestar Colonial — long central hull with prominent outboard flight pods
function makeShipShape2() {
  const s = new THREE.Shape();
  s.moveTo(118, 0);
  s.lineTo(88,  18);
  s.lineTo(28,  28);
  s.bezierCurveTo(16, 28, 10, 38, 0,  62);
  s.lineTo(-44, 76);
  s.lineTo(-62, 58);
  s.lineTo(-40, 38);
  s.bezierCurveTo(-68, 38, -102, 28, -120, 14);
  s.lineTo(-130, 0);
  s.lineTo(-120, -14);
  s.bezierCurveTo(-102, -28, -68, -38, -40, -38);
  s.lineTo(-62, -58);
  s.lineTo(-44, -76);
  s.lineTo(0,  -62);
  s.bezierCurveTo(10, -38, 16, -28, 28, -28);
  s.lineTo(88,  -18);
  s.closePath();
  return s;
}

// Design 3: Klingon-inspired — swept-back aggressive profile with forward wings
function makeShipShape3() {
  const s = new THREE.Shape();
  s.moveTo(125, 0);
  s.bezierCurveTo(110, 8, 60, 16, 25, 26);
  s.bezierCurveTo(0, 33, -20, 44, -52, 68);
  s.lineTo(-80, 82);
  s.bezierCurveTo(-96, 82, -108, 68, -106, 54);
  s.lineTo(-88, 38);
  s.bezierCurveTo(-75, 28, -62, 18, -88, 8);
  s.lineTo(-125, 0);
  s.lineTo(-88,  -8);
  s.bezierCurveTo(-62, -18, -75, -28, -88, -38);
  s.lineTo(-106, -54);
  s.bezierCurveTo(-108, -68, -96, -82, -80, -82);
  s.lineTo(-52, -68);
  s.bezierCurveTo(-20, -44, 0, -33, 25, -26);
  s.bezierCurveTo(60, -16, 110, -8, 125, 0);
  s.closePath();
  return s;
}

const SHIP_SHAPE_MAKERS = [makeShipShape0, makeShipShape1, makeShipShape2, makeShipShape3];

// ============================================================
// I: VISUAL CLASSES
// ============================================================

// --- Starfield (world-space fixed stars for motion cues; parallax layer via offset) ---
class Starfield {
  constructor(scene) {
    this.scene  = scene;
    this.groups = [];
    // Cover a larger area than the arena to stay filled as camera tracks
    const rx = W * 1.6, ry = H * 1.6;
    const configs = [
      { count: 700, size: 1.6, opacity: 0.85, parallax: 0.0  }, // near, fixed in world
      { count: 450, size: 1.1, opacity: 0.50, parallax: 0.22 }, // far, slight drift
      { count: 200, size: 0.8, opacity: 0.30, parallax: 0.45 }, // very far, more drift
    ];
    for (const cfg of configs) {
      const positions = new Float32Array(cfg.count * 3);
      for (let i = 0; i < cfg.count; i++) {
        positions[i*3]   = rand(-rx, rx);
        positions[i*3+1] = rand(-ry, ry);
        positions[i*3+2] = -12;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: cfg.size, sizeAttenuation: false,
        transparent: true, opacity: cfg.opacity,
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      this.groups.push({ pts, parallax: cfg.parallax });
    }
  }

  // camX/camY in Three.js coords; parallax layers drift relative to camera.
  update(camX, camY) {
    for (const { pts, parallax } of this.groups) {
      pts.position.x = camX * parallax;
      pts.position.y = camY * parallax;
    }
  }
}

// --- Gun turret mesh (child of ship group) ---
class GunMesh {
  constructor(gun, baseColor) {
    this.gun = gun;
    this.baseColor = new THREE.Color(baseColor);
    this.group = new THREE.Group();
    this.group.position.set(gun.lx, gun.ly, 0.5);

    // Turret body
    const bodyGeo = new THREE.CircleGeometry(5.5, 8);
    this.bodyMat = new THREE.MeshBasicMaterial({ color: baseColor });
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.group.add(this.body);

    // Barrel — two parallel lines for thickness
    const bLen = 20;
    const barrelGeo = new THREE.BufferGeometry();
    const bPos = new Float32Array([
      0, 1.5, 0,  bLen, 1.5, 0,
      0,-1.5, 0,  bLen,-1.5, 0,
    ]);
    barrelGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    barrelGeo.setIndex([0,1, 2,3]);
    this.barrel = new THREE.LineSegments(
      barrelGeo,
      new THREE.LineBasicMaterial({ color: baseColor }),
    );
    this.group.add(this.barrel);
  }

  update(gun) {
    if (gun.destroyed) {
      this.bodyMat.color.setHex(0x1a1a1a);
      this.barrel.visible = false;
    } else {
      // HP-based color: full=base color, damaged=orange, critical=dark orange
      const hpFrac = gun.hp / GUN_MAX_HP;
      if (hpFrac < 0.5) {
        this.bodyMat.color.setRGB(0.75, 0.25 + 0.25 * hpFrac * 2, 0);
      } else {
        this.bodyMat.color.copy(this.baseColor);
      }
      // Reload dimming: gun dims just after firing, brightens as cooldown expires
      const dimmed = 1 - gun.loadFraction * 0.72;
      this.bodyMat.color.multiplyScalar(dimmed);
      this.barrel.visible = true;
      this.barrel.material.color.copy(this.bodyMat.color);
    }
    this.group.rotation.z = -(gun.mountOffset + gun.aimOffset) * DEG2RAD;
  }
}

// --- Ship Mesh ---
class ShipMesh {
  constructor(scene, color, shapeIdx) {
    this.scene = scene;
    this.color = color;
    this.group = new THREE.Group();

    // Hull
    const shape  = SHIP_SHAPE_MAKERS[shapeIdx % SHIP_SHAPE_MAKERS.length]();
    const hullGeo = new THREE.ShapeGeometry(shape);
    const hullMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.hull = new THREE.Mesh(hullGeo, hullMat);
    this.group.add(this.hull);

    // Clean hull outline — follow the shape path
    const outlinePts = shape.getPoints(80).map(p => new THREE.Vector3(p.x, p.y, 0.1));
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
    const outlineMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.20,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.group.add(new THREE.LineLoop(outlineGeo, outlineMat));

    // Engine glow points — two nacelles at ship aft
    const exhaustPos = new Float32Array([-100, 22, 0,  -100, -22, 0]);
    const exhaustGeo = new THREE.BufferGeometry();
    exhaustGeo.setAttribute('position', new THREE.BufferAttribute(exhaustPos, 3));
    this.exhaustMat = new THREE.PointsMaterial({
      color: 0xff8833, size: 14, sizeAttenuation: false,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.exhaustPts = new THREE.Points(exhaustGeo, this.exhaustMat);
    this.group.add(this.exhaustPts);

    scene.add(this.group);

    // Thruster particle trail
    const TRAIL = 300;
    this.tp = TRAIL;
    this.tPos     = new Float32Array(TRAIL * 3);
    this.tCol     = new Float32Array(TRAIL * 3);
    this.tVx      = new Float32Array(TRAIL);
    this.tVy      = new Float32Array(TRAIL);
    this.tLife    = new Float32Array(TRAIL);
    this.tMaxLife = new Float32Array(TRAIL);
    this.tActive  = 0;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    this.trailGeo.setAttribute('color',    new THREE.BufferAttribute(this.tCol, 3));
    const trailMat = new THREE.PointsMaterial({
      size: 7, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
    });
    this.trailPts = new THREE.Points(this.trailGeo, trailMat);
    scene.add(this.trailPts);

    this.gunMeshes = [];
  }

  addGunMeshes(guns) {
    this.gunMeshes = guns.map(g => {
      const gm = new GunMesh(g, this.color);
      this.group.add(gm.group);
      return gm;
    });
  }

  update(ship, enemyX, enemyY) {
    this.group.visible = !ship.destroyed;
    if (ship.destroyed) { this.trailPts.visible = false; return; }

    const [wx, wy] = toThree(ship.x, ship.y);
    this.group.position.set(wx, wy, 0);
    this.group.rotation.z = -(ship.angle * DEG2RAD);

    for (let i = 0; i < ship.guns.length; i++) {
      this.gunMeshes[i].update(ship.guns[i]);
    }

    this.exhaustMat.opacity = ship.thrust ? 0.9 : 0.25;

    // Emit trail from both nacelle exhausts
    if (ship.thrust) {
      const nacelles = [[-100, 22], [-100, -22]];
      for (const [elx, ely] of nacelles) {
        const [egx, egy] = localToWorld(elx, ely, ship.x, ship.y, ship.angle);
        const [etx, ety] = toThree(egx, egy);
        const exhaustRad = (ship.angle + 180) * DEG2RAD;
        for (let e = 0; e < 3 && this.tActive < this.tp; e++) {
          const idx = this.tActive++;
          this.tPos[idx*3]   = etx + (Math.random()-0.5)*5;
          this.tPos[idx*3+1] = ety + (Math.random()-0.5)*5;
          this.tPos[idx*3+2] = -1;
          const spd = rand(1.0, 3.0);
          this.tVx[idx] = Math.cos(exhaustRad)*spd + (Math.random()-0.5)*0.6;
          this.tVy[idx] = Math.sin(-exhaustRad)*spd + (Math.random()-0.5)*0.6;
          const ml = rand(25, 55);
          this.tMaxLife[idx] = ml; this.tLife[idx] = ml;
          this.tCol[idx*3] = 1; this.tCol[idx*3+1] = rand(0.35,0.75); this.tCol[idx*3+2] = 0;
        }
      }
    }

    // Update trail
    let alive = 0;
    for (let i = 0; i < this.tActive; i++) {
      this.tLife[i]--;
      if (this.tLife[i] <= 0) continue;
      this.tPos[i*3]   += this.tVx[i];
      this.tPos[i*3+1] += this.tVy[i];
      const t = this.tLife[i] / this.tMaxLife[i];
      this.tCol[i*3+1] = Math.min(1, this.tCol[i*3+1] + 0.015);
      this.tCol[i*3+2] = t > 0.45 ? (1-t)*1.2 : 0;
      if (alive < i) {
        this.tPos[alive*3]  =this.tPos[i*3]; this.tPos[alive*3+1]=this.tPos[i*3+1]; this.tPos[alive*3+2]=this.tPos[i*3+2];
        this.tVx[alive]=this.tVx[i]; this.tVy[alive]=this.tVy[i];
        this.tLife[alive]=this.tLife[i]; this.tMaxLife[alive]=this.tMaxLife[i];
        this.tCol[alive*3]=this.tCol[i*3]; this.tCol[alive*3+1]=this.tCol[i*3+1]; this.tCol[alive*3+2]=this.tCol[i*3+2];
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

// --- Projectile Pool ---
const PROJ_POOL_SIZE = 180;

class ProjectilePool {
  constructor(scene) {
    // Tail lines (1px wide trail)
    this.lines = [];
    for (let i = 0; i < PROJ_POOL_SIZE; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      line.visible = false;
      scene.add(line);
      this.lines.push(line);
    }
    // Head dots — bright point at projectile tip for visibility
    this.headPos = new Float32Array(PROJ_POOL_SIZE * 3);
    this.headCol = new Float32Array(PROJ_POOL_SIZE * 3);
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3));
    headGeo.setAttribute('color',    new THREE.BufferAttribute(this.headCol, 3));
    this.headGeo = headGeo;
    this.headCount = 0;
    scene.add(new THREE.Points(headGeo, new THREE.PointsMaterial({
      size: 9, vertexColors: true, sizeAttenuation: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  }

  update(projectiles) {
    let slot = 0;
    for (const proj of projectiles) {
      if (slot >= PROJ_POOL_SIZE) break;
      const line = this.lines[slot];
      line.visible = true;
      line.material.color.setHex(proj.color);
      const [tx, ty] = toThree(proj.x, proj.y);
      const rad = proj.angle * DEG2RAD;
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, tx, ty, 0.1);
      pos.setXYZ(1, tx - Math.cos(rad)*proj.length, ty + Math.sin(rad)*proj.length, 0.1);
      pos.needsUpdate = true;
      // Head dot
      this.headPos[slot*3]   = tx;
      this.headPos[slot*3+1] = ty;
      this.headPos[slot*3+2] = 0.2;
      const c = new THREE.Color(proj.color);
      this.headCol[slot*3]   = c.r;
      this.headCol[slot*3+1] = c.g;
      this.headCol[slot*3+2] = c.b;
      slot++;
    }
    for (let i = slot; i < PROJ_POOL_SIZE; i++) this.lines[i].visible = false;
    this.headGeo.setDrawRange(0, slot);
    this.headGeo.attributes.position.needsUpdate = true;
    this.headGeo.attributes.color.needsUpdate    = true;
  }
}

// --- Explosion Emitter ---
const EXPL_POOL = 600;
class ExplosionEmitter {
  constructor(scene) {
    this.pos     = new Float32Array(EXPL_POOL * 3);
    this.col     = new Float32Array(EXPL_POOL * 3);
    this.colInit = new Float32Array(EXPL_POOL * 3);
    this.vx      = new Float32Array(EXPL_POOL);
    this.vy      = new Float32Array(EXPL_POOL);
    this.life    = new Float32Array(EXPL_POOL);
    this.maxLife = new Float32Array(EXPL_POOL);
    this.count   = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 6, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
    });
    this.pts = new THREE.Points(geo, mat);
    this.geo = geo;
    scene.add(this.pts);
  }

  explode(gx, gy, pvx, pvy, n, r, g, b) {
    const [tx, ty] = toThree(gx, gy);
    for (let i = 0; i < n; i++) {
      if (this.count >= EXPL_POOL) break;
      const idx = this.count++;
      this.pos[idx*3]   = tx + (Math.random()-0.5)*10;
      this.pos[idx*3+1] = ty + (Math.random()-0.5)*10;
      this.pos[idx*3+2] = 0;
      const spd = rand(0.4, 6);
      const ang = rand(0, Math.PI*2);
      this.vx[idx] = (pvx||0)*0.15 + Math.cos(ang)*spd;
      this.vy[idx] = -(pvy||0)*0.15 + Math.sin(ang)*spd;
      const ml = rand(20, 65);
      this.maxLife[idx] = ml; this.life[idx] = ml;
      this.col[idx*3]=r; this.col[idx*3+1]=g; this.col[idx*3+2]=b;
      this.colInit[idx*3]=r; this.colInit[idx*3+1]=g; this.colInit[idx*3+2]=b;
    }
  }

  update() {
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i]--;
      if (this.life[i] <= 0) continue;
      this.pos[i*3]   += this.vx[i];
      this.pos[i*3+1] += this.vy[i];
      const t = this.life[i] / this.maxLife[i];
      this.col[i*3]   = this.colInit[i*3]   * t;
      this.col[i*3+1] = this.colInit[i*3+1] * t;
      this.col[i*3+2] = this.colInit[i*3+2] * t;
      if (alive < i) {
        for (let k=0;k<3;k++){
          this.pos[alive*3+k]=this.pos[i*3+k];
          this.col[alive*3+k]=this.col[i*3+k];
          this.colInit[alive*3+k]=this.colInit[i*3+k];
        }
        this.vx[alive]=this.vx[i]; this.vy[alive]=this.vy[i];
        this.life[alive]=this.life[i]; this.maxLife[alive]=this.maxLife[i];
      }
      alive++;
    }
    this.count = alive;
    this.geo.setDrawRange(0, alive);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ============================================================
// J: GAME STATE
// ============================================================
class GameState {
  constructor() {
    this.ships       = [];
    this.projectiles = [];
    this.ai          = null;
    this.numPlayers  = 1;
    this.gameOver    = false;
    this.winner      = null;
    this.controls    = [{thrust:0,rotation:0},{thrust:0,rotation:0}];
  }

  initialize(numPlayers) {
    this.numPlayers  = numPlayers;
    this.ships       = [
      new Ship(W * 0.2, H / 2,   0, 0),
      new Ship(W * 0.8, H / 2, 180, 1),
    ];
    this.projectiles = [];
    this.ai          = numPlayers < 2 ? new DreadnoughtAI(this.ships[1]) : null;
    this.gameOver    = false;
    this.winner      = null;
    this.controls[0] = { thrust: 0, rotation: 0 };
    this.controls[1] = { thrust: 0, rotation: 0 };
  }

  tick() {
    if (this.gameOver) return;

    for (let i = 0; i < this.numPlayers; i++) {
      const s = this.ships[i];
      if (s.destroyed) continue;
      s.thrust   = this.controls[i].thrust;
      s.rotation = this.controls[i].rotation;
    }

    if (this.ai && !this.ships[1].destroyed) {
      const { thrust, rotation } = this.ai.makeDecision(this.ships[0]);
      this.ships[1].thrust   = thrust;
      this.ships[1].rotation = rotation;
    }

    for (const s of this.ships) if (!s.destroyed) s.update();

    for (let i = 0; i < 2; i++) {
      const shooter = this.ships[i];
      const target  = this.ships[1 - i];
      if (shooter.destroyed || target.destroyed) continue;
      for (const gun of shooter.guns) {
        const inArc = gun.updateAim(shooter, target);
        if (inArc) {
          const proj = gun.tryFire(shooter);
          if (proj) this.projectiles.push(proj);
        }
      }
    }

    for (const p of this.projectiles) p.update();

    for (const proj of this.projectiles) {
      if (proj.destroyed) continue;
      for (const ship of this.ships) {
        if (ship.id === proj.ownerId || ship.destroyed) continue;
        if (proj.collidesWith(ship)) {
          ship.takeDamage(proj);
          proj.destroyed = true;
          break;
        }
      }
    }

    this.projectiles = this.projectiles.filter(p => !p.destroyed);

    for (let i = 0; i < 2; i++) {
      if (this.ships[i].destroyed && !this.gameOver) {
        this.winner  = 1 - i;
        this.gameOver = true;
      }
    }
  }
}

// ============================================================
// K: RENDERER / SCENE SETUP
// ============================================================
const container = document.getElementById('canvas-container');
const renderer  = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const camH = H;
const camW = camH * (window.innerWidth / window.innerHeight);
const camera = new THREE.OrthographicCamera(-camW/2, camW/2, camH/2, -camH/2, -100, 100);
camera.position.z = 10;
camera.zoom = 0.7; // start zoomed out a bit
camera.updateProjectionMatrix();

const scene = new THREE.Scene();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Subtle bloom — just enough to make weapon fire pop
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.22,  // strength
  0.38,  // radius
  0.60,  // threshold — catch more projectile colors
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  const hw = camH * aspect / 2;
  camera.left = -hw; camera.right = hw;
  camera.updateProjectionMatrix();
});

// ============================================================
// L: CAMERA TRACKING
// ============================================================
const camState = { x: 0, y: 0, zoom: 0.7 };

function updateCamera(ships) {
  if (!ships || ships.length < 2) return;
  const [s0, s1] = ships;

  const mx = (s0.x + s1.x) / 2 - W / 2;
  const my = -((s0.y + s1.y) / 2 - H / 2);

  const d = Math.max(dist(s0.x, s0.y, s1.x, s1.y), 300);
  const displayRadius = d / 2 + CAM_PAD;
  // Base frustum half-extent (at zoom=1); zoom needed so displayRadius fills the narrow dimension
  const baseFrustumNarrow = Math.min(camW, camH) / 2;
  const targetZoom = clamp(baseFrustumNarrow / displayRadius, CAM_ZOOM_MIN, CAM_ZOOM_MAX);

  camState.x    += (mx - camState.x) * CAM_LERP_POS;
  camState.y    += (my - camState.y) * CAM_LERP_POS;
  camState.zoom += (targetZoom - camState.zoom) * CAM_LERP_ZOOM;

  camera.position.x = camState.x;
  camera.position.y = camState.y;
  camera.zoom = camState.zoom;
  camera.updateProjectionMatrix();
}

// ============================================================
// M: GAME CONTROLLER
// ============================================================
const state       = new GameState();
const starfield   = new Starfield(scene);
let   shipMeshes  = [];
let   projPool    = null;
let   explEmitter = null;
let   gamePhase   = 'menu';
let   shakeIntensity = 0;
let   prevHullHp   = [HULL_MAX_HP, HULL_MAX_HP];
let   prevGunHp    = [[], []];
let   prevSystemHp = [[], []];

function initVisuals() {
  for (const sm of shipMeshes) sm.dispose();
  shipMeshes = [];
  if (projPool)    { for (const l of projPool.lines) scene.remove(l); }
  if (explEmitter) { scene.remove(explEmitter.pts); }

  const colors = [0x3399cc, 0xcc4422]; // steel blue vs brick red — less neon
  for (let i = 0; i < 2; i++) {
    const sm = new ShipMesh(scene, colors[i], state.ships[i].shapeIdx);
    sm.addGunMeshes(state.ships[i].guns);
    shipMeshes.push(sm);
  }

  projPool    = new ProjectilePool(scene);
  explEmitter = new ExplosionEmitter(scene);
  prevHullHp   = [HULL_MAX_HP, HULL_MAX_HP];
  prevGunHp    = state.ships.map(s => s.guns.map(g => g.hp));
  prevSystemHp = state.ships.map(s => s.systems.map(sys => sys.hp));
}

function syncVisuals() {
  const [s0, s1] = state.ships;
  shipMeshes[0].update(s0, s1.x, s1.y);
  shipMeshes[1].update(s1, s0.x, s0.y);
  projPool.update(state.projectiles);
  explEmitter.update();
}

function checkHitEffects() {
  for (let i = 0; i < 2; i++) {
    const ship = state.ships[i];
    if (ship.hullHp < prevHullHp[i] && !ship.destroyed) {
      explEmitter.explode(ship.x, ship.y, ship.vx, ship.vy, 22, 1, 0.65, 0.1);
      shakeIntensity = Math.max(shakeIntensity, 6);
    }
    if (ship.destroyed && prevHullHp[i] > 0) {
      explEmitter.explode(ship.x, ship.y, ship.vx, ship.vy, 380, 1, 0.45, 0);
      shakeIntensity = 28;
    }
    prevHullHp[i] = ship.hullHp;

    for (let g = 0; g < ship.guns.length; g++) {
      const gun = ship.guns[g];
      if (gun.destroyed && prevGunHp[i][g] > 0) {
        const [gx, gy] = gun.worldPos(ship);
        explEmitter.explode(gx, gy, ship.vx, ship.vy, 30, 1, 0.38, 0);
        shakeIntensity = Math.max(shakeIntensity, 4);
      }
      prevGunHp[i][g] = gun.hp;
    }
    for (let s = 0; s < ship.systems.length; s++) {
      const sys = ship.systems[s];
      if (sys.hp < prevSystemHp[i][s]) {
        // System hit: small spark at system world position
        const [sx, sy] = sys.worldPos(ship);
        explEmitter.explode(sx, sy, ship.vx, ship.vy, sys.destroyed ? 45 : 10, 1, 0.7, 0.2);
        if (sys.destroyed) shakeIntensity = Math.max(shakeIntensity, 8);
      }
      prevSystemHp[i][s] = sys.hp;
    }
  }
}

function updateHUD() {
  for (let i = 0; i < 2; i++) {
    const ship = state.ships[i];
    const pct  = Math.max(0, ship.hullHp / HULL_MAX_HP * 100);
    document.getElementById(`hp-bar-${i}`).style.width = pct + '%';

    const w = ship.weapon;
    document.getElementById(`weapon-${i}`).textContent =
      `${w.label}  ·  ${Math.round(w.damage)} dmg  ·  ${w.rateLabel()}`;

    // Gun groups: port (0-2) and starboard (3-5)
    const groupsEl = document.getElementById(`gun-groups-${i}`);
    if (groupsEl.children.length === 0) {
      groupsEl.innerHTML = '';
      for (const sideLabel of ['P', 'S']) {
        const grp = document.createElement('div');
        grp.className = 'gun-group';
        const lbl = document.createElement('span');
        lbl.className = 'gun-group-label';
        lbl.textContent = sideLabel;
        grp.appendChild(lbl);
        for (let d = 0; d < 3; d++) {
          const dot = document.createElement('div');
          dot.className = 'gun-dot';
          grp.appendChild(dot);
        }
        groupsEl.appendChild(grp);
      }
    }
    for (let g = 0; g < 6; g++) {
      const gun = ship.guns[g];
      const grpIdx = g < 3 ? 0 : 1;
      const dotIdx = g < 3 ? g : g - 3;
      const dot = groupsEl.children[grpIdx].children[dotIdx + 1]; // +1 for label
      dot.className = 'gun-dot' + (gun.destroyed ? ' dead' : gun.hp < GUN_MAX_HP * 0.5 ? ' damaged' : '');
    }

    // System status row
    const sysEl = document.getElementById(`sys-row-${i}`);
    if (sysEl) {
      const sysDefs = [{id:'bridge',label:'BRG'},{id:'engines',label:'ENG'},{id:'portBatt',label:'PRT'},{id:'stbdBatt',label:'STB'}];
      let html = '';
      for (const {id, label} of sysDefs) {
        const sys = ship.systems.find(s => s.id === id);
        const c = sys.destroyed ? '#333' : sys.integrity > 0.6 ? '#44aa66' : sys.integrity > 0.3 ? '#aa7722' : '#aa3322';
        html += `<span style="color:${c}">${label}</span> `;
      }
      sysEl.innerHTML = html;
    }
  }
}

function showHUD(numPlayers) {
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('label-1').textContent = numPlayers < 2 ? 'AI' : 'PLAYER 2';
  document.getElementById('gun-groups-0').innerHTML = '';
  document.getElementById('gun-groups-1').innerHTML = '';
}

function showGameOver() {
  const title = document.getElementById('gameover-title');
  const sub   = document.getElementById('gameover-sub');
  if (state.winner === 0) {
    title.textContent = state.numPlayers < 2 ? 'VICTORY' : 'PLAYER 1 WINS';
    title.style.color = '#88ccff';
    sub.textContent = 'The enemy vessel has been destroyed.';
  } else {
    title.textContent = state.numPlayers < 2 ? 'DEFEATED' : 'PLAYER 2 WINS';
    title.style.color = '#dd7755';
    sub.textContent = state.numPlayers < 2 ? 'Your vessel has been destroyed.' : 'Their broadside proved superior.';
  }
  document.getElementById('gameover').classList.remove('hidden');
}

function startGame(numPlayers) {
  state.initialize(numPlayers);
  // Reset camera to midpoint of ships
  const [s0, s1] = state.ships;
  const mx = (s0.x + s1.x) / 2 - W / 2;
  const my = -((s0.y + s1.y) / 2 - H / 2);
  camState.x = mx; camState.y = my; camState.zoom = 0.7;
  camera.position.x = mx; camera.position.y = my;
  camera.zoom = 0.7; camera.updateProjectionMatrix();
  initVisuals();
  showHUD(numPlayers);
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  gamePhase = 'playing';
}

function goToMenu() {
  gamePhase = 'menu';
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('debug').classList.add('hidden');
  debugVisible = false;
}

let debugVisible = false;
let debugFps = 60;

function updateDebug(dt) {
  if (!state.ships.length) return;
  debugFps += (1 / Math.max(dt, 0.001) - debugFps) * 0.1;
  const lines = [
    `FPS:${Math.round(debugFps)}  ZOOM:${camState.zoom.toFixed(3)}  PROJS:${state.projectiles.length}`,
  ];
  for (let i = 0; i < 2; i++) {
    const ship = state.ships[i];
    const wpn  = ship.weapon;
    const col  = '#' + wpn.color.toString(16).padStart(6, '0');
    lines.push(`── SHIP${i} ${wpn.label} ${col} ──`);
    lines.push(`  HULL: ${Math.round(ship.hullHp)}/${HULL_MAX_HP}`);
    const sysTxt = ship.systems.map(s => `${s.id.slice(0,3)}:${Math.round(s.hp)}`).join(' ');
    lines.push(`  SYS: ${sysTxt}`);
    const gunTxt = ship.guns.map((g,gi) => (g.destroyed?'X':Math.round(g.hp))).join('/');
    lines.push(`  GUNS P:${ship.guns.slice(0,3).map(g=>g.destroyed?'X':Math.round(g.hp)).join('/')}  S:${ship.guns.slice(3).map(g=>g.destroyed?'X':Math.round(g.hp)).join('/')}`);
  }
  document.getElementById('debug').textContent = lines.join('\n');
}

// ============================================================
// N: INPUT HANDLING
// ============================================================
const keys = new Set();
window.addEventListener('keydown', e => { keys.add(e.code); handleMenuKeys(e); handleDebugKey(e); });
window.addEventListener('keyup',   e => { keys.delete(e.code); });

function handleDebugKey(e) {
  if (e.code === 'Backquote') {
    debugVisible = !debugVisible;
    document.getElementById('debug').classList.toggle('hidden', !debugVisible);
  }
}

function readPlayerControls() {
  state.controls[0].thrust   = keys.has('ArrowUp')    ? 1 : 0;
  state.controls[0].rotation = keys.has('ArrowLeft')  ? -1 :
                               keys.has('ArrowRight') ?  1 : 0;
  if (state.numPlayers >= 2) {
    state.controls[1].thrust   = keys.has('KeyW') ? 1 : 0;
    state.controls[1].rotation = keys.has('KeyA') ? -1 : keys.has('KeyD') ? 1 : 0;
  }
}

let menuIdx = 0;
const menuOptions = document.querySelectorAll('.menu-option');
function updateMenuSelection() {
  menuOptions.forEach((el, i) => el.classList.toggle('selected', i === menuIdx));
}
menuOptions.forEach((el, i) => {
  el.addEventListener('click', () => { menuIdx = i; startGame(menuIdx + 1); });
});

function handleMenuKeys(e) {
  if (gamePhase === 'menu') {
    if (e.code==='ArrowUp')  { menuIdx=(menuIdx-1+menuOptions.length)%menuOptions.length; updateMenuSelection(); }
    if (e.code==='ArrowDown'){ menuIdx=(menuIdx+1)%menuOptions.length; updateMenuSelection(); }
    if (e.code==='Enter')    { startGame(menuIdx + 1); }
  }
  if (gamePhase==='playing'||gamePhase==='gameover') {
    if (e.code==='KeyR')   { startGame(state.numPlayers); }
    if (e.code==='Escape') { goToMenu(); }
  }
}

// ============================================================
// O: MAIN LOOP
// ============================================================
let accumulator = 0;
let lastTime    = 0;
let frameDt     = 0.016;

function mainLoop(timestamp) {
  requestAnimationFrame(mainLoop);
  frameDt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  const dt = frameDt;

  if (gamePhase === 'playing') {
    readPlayerControls();
    accumulator += dt;
    while (accumulator >= FIXED_DT) {
      state.tick();
      checkHitEffects();
      accumulator -= FIXED_DT;
    }
    if (state.gameOver && gamePhase === 'playing') {
      gamePhase = 'gameover';
      showGameOver();
    }
    updateCamera(state.ships);
    syncVisuals();
    updateHUD();
    if (debugVisible) updateDebug(dt);
  } else if (gamePhase === 'gameover') {
    updateCamera(state.ships);
    syncVisuals();
    if (debugVisible) updateDebug(dt);
  }

  // Stars parallax relative to smoothed camera position
  starfield.update(camState.x, camState.y);

  // Screen shake layered on top of tracked position
  if (shakeIntensity > 0.2) {
    camera.position.x = camState.x + (Math.random()-0.5) * shakeIntensity;
    camera.position.y = camState.y + (Math.random()-0.5) * shakeIntensity;
    shakeIntensity *= 0.82;
  } else {
    camera.position.x = camState.x;
    camera.position.y = camState.y;
    shakeIntensity = 0;
  }

  composer.render();
}

requestAnimationFrame(mainLoop);
