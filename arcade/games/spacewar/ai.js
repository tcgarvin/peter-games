// Ship AIs, ported from spacewar/ai/ (original.py, cautious.py, delivery.py and utils/).
// Each AI's decide() returns [thrust, rotation] exactly like the Python make_decision().
//
// One fix applied to all three: the Python AIs kept chasing their target zone after it expired
// (it was never cleared while the ship stayed in "pickup"/"dropoff" mode), so a ship would park
// on an empty patch of space. Here an expired target is dropped and the ship goes back to cruise.

import {
  WORLD_W,
  WORLD_H,
  SHIP_DRAG,
  MAX_PICKUP_VELOCITY,
  uniform,
  choice,
  pymod,
  degrees,
  radians,
} from './entities.js';

// --- utils/navigation.py, utils/prediction.py, utils/decision.py -------------------------------

const angleDiff = (target, current) => pymod(target - current + 180, 360) - 180;

function angleToTarget(ship, tx, ty) {
  return pymod(degrees(Math.atan2(ty - ship.y, tx - ship.x)), 360);
}

/** -1 counter-clockwise, 0 on target (within 5 degrees), 1 clockwise. */
function steeringDirection(current, target) {
  const diff = angleDiff(target, current);
  if (Math.abs(diff) < 5) return 0;
  return diff > 0 ? 1 : -1;
}

function estimateBrakingDistance(ship, desiredSpeed = 0) {
  const speed = ship.speed;
  if (speed <= desiredSpeed) return 0;
  if (desiredSpeed <= 0.01) return speed / SHIP_DRAG;
  const frames = Math.log(desiredSpeed / speed) / Math.log(1 - SHIP_DRAG);
  return (speed * (1 - (1 - SHIP_DRAG) ** frames)) / SHIP_DRAG;
}

const wrapX = (x) => (x < 0 ? x + WORLD_W : x > WORLD_W ? x - WORLD_W : x);
const wrapY = (y) => (y < 0 ? y + WORLD_H : y > WORLD_H ? y - WORLD_H : y);

/** Distance between ship and asteroid after both coast for `frames` (one wrap, as in the original). */
function futureDistance(ship, asteroid, frames) {
  const sx = wrapX(ship.x + ship.velocityX * frames);
  const sy = wrapY(ship.y + ship.velocityY * frames);
  const ax = wrapX(asteroid.x + asteroid.velocityX * frames);
  const ay = wrapY(asteroid.y + asteroid.velocityY * frames);
  const dx = Math.min(Math.abs(sx - ax), WORLD_W - Math.abs(sx - ax));
  const dy = Math.min(Math.abs(sy - ay), WORLD_H - Math.abs(sy - ay));
  return Math.sqrt(dx * dx + dy * dy);
}

/** utils.predict_collision: [willCollide, timeToCollision]. */
function predictCollision(ship, asteroid, predictionTime = 60) {
  const future = futureDistance(ship, asteroid, predictionTime);
  if (!(future < ship.size + asteroid.size + 10)) return [false, Infinity];
  const relV = Math.hypot(asteroid.velocityX - ship.velocityX, asteroid.velocityY - ship.velocityY);
  if (relV < 0.01) return [true, predictionTime];
  const current = ship.getDistance(asteroid);
  const gap = current - (ship.size + asteroid.size);
  // The Python divides by `gap` unguarded; a zero gap means contact, i.e. no time left.
  return [true, gap === 0 ? 0 : predictionTime * ((current - future) / gap)];
}

function closestAsteroid(ship, asteroids) {
  let closest = null;
  let best = Infinity;
  for (const a of asteroids) {
    const d = ship.getDistance(a);
    if (d < best) {
      best = d;
      closest = a;
    }
  }
  return [closest, closest ? best : Infinity];
}

/** Original/Delivery _find_dangerous_asteroids: [[asteroid, distance]] sorted by distance. */
function dangerousByDistance(ship, asteroids, reaction, predictionTime) {
  const dangerous = [];
  for (const a of asteroids) {
    const distance = ship.getDistance(a);
    if (distance > reaction) continue;
    if (futureDistance(ship, a, predictionTime) < ship.size + a.size + 10) dangerous.push([a, distance]);
  }
  return dangerous.sort((p, q) => p[1] - q[1]);
}

function closestZoneOfType(ship, zones, type) {
  let closest = null;
  let best = Infinity;
  for (const z of zones) {
    if (z.zoneType !== type) continue;
    const d = ship.getDistance(z);
    if (d < best) {
      best = d;
      closest = z;
    }
  }
  return [closest, best];
}

/** Perpendicular escape heading from the original evade logic, in degrees. */
function perpendicularEscape(ship, asteroid) {
  const rvx = asteroid.velocityX - ship.velocityX;
  const rvy = asteroid.velocityY - ship.velocityY;
  let escape;
  if (Math.abs(rvx) < 0.01 && Math.abs(rvy) < 0.01) {
    escape = Math.atan2(ship.y - asteroid.y, ship.x - asteroid.x);
  } else {
    const approach = Math.atan2(rvy, rvx);
    const perp1 = approach + Math.PI / 2;
    const perp2 = approach - Math.PI / 2;
    const toAsteroid = Math.atan2(asteroid.y - ship.y, asteroid.x - ship.x);
    const diff1 = Math.abs(pymod(perp1 - toAsteroid + Math.PI, 2 * Math.PI) - Math.PI);
    const diff2 = Math.abs(pymod(perp2 - toAsteroid + Math.PI, 2 * Math.PI) - Math.PI);
    escape = diff1 > diff2 ? perp1 : perp2;
  }
  return pymod(degrees(escape), 360);
}

const turnToward = (diff, tolerance) => (Math.abs(diff) < tolerance ? 0 : diff > 0 ? 1 : -1);

/** Shared state and bookkeeping of the three Python AIs. */
class ShipAI {
  constructor(ship) {
    this.ship = ship;
    this.courseChangeTimer = 0;
    this.currentTargetAngle = uniform(0, 360);
    this.currentMode = 'cruise';
    this.targetZone = null;
  }

  /** See the note at the top of the file. */
  dropExpiredTarget(zones) {
    if (this.targetZone && !zones.includes(this.targetZone)) {
      this.targetZone = null;
      if (this.currentMode === 'pickup' || this.currentMode === 'dropoff') this.currentMode = 'cruise';
    }
  }

  tickCourseTimer() {
    if (this.courseChangeTimer > 0) this.courseChangeTimer--;
  }

  /** Mode bookkeeping when nothing threatens: maybe pick a new random heading. */
  maybeNewCruiseHeading() {
    if (Math.random() < 0.01) {
      this.currentTargetAngle = uniform(0, 360);
      this.courseChangeTimer = COURSE_CHANGE_DELAY;
    }
  }

  /** The original's _avoid_asteroid, parameterised for the cautious variant. */
  avoid(asteroid, scale, threshold, tolerance) {
    if (!asteroid) return [0, 0];
    const ship = this.ship;
    const away = pymod(Math.atan2(asteroid.y - ship.y, asteroid.x - ship.x) + Math.PI, 2 * Math.PI);
    const diff = angleDiff(degrees(away), pymod(ship.angle, 360));
    const distance = ship.getDistance(asteroid);
    const intensity = 1 - Math.min(1, (distance - ship.size - asteroid.size) / scale(asteroid));
    return [intensity > threshold ? 1 : 0, turnToward(diff, tolerance)];
  }
}

const COURSE_CHANGE_DELAY = 30;

// --- original.py -------------------------------------------------------------------------------

const ORIG_REACTION = 150;
const ORIG_PREDICTION = 60;

export class OriginalShipAI extends ShipAI {
  decide(asteroids, zones) {
    const ship = this.ship;
    this.dropExpiredTarget(zones);
    this.tickCourseTimer();
    const [closest, closestDistance] = closestAsteroid(ship, asteroids);
    const dangerous = dangerousByDistance(ship, asteroids, ORIG_REACTION, ORIG_PREDICTION);

    if (zones.length && !dangerous.length) {
      const type = ship.hasCargo ? 'dropoff' : 'pickup';
      const [zone, distance] = closestZoneOfType(ship, zones, type);
      if (zone && distance < ORIG_REACTION * 3) {
        this.currentMode = type;
        this.targetZone = zone;
        return this.approachZone(zone);
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade';
      this.targetZone = null;
    } else if (closest && closestDistance < ORIG_REACTION) {
      this.currentMode = 'avoid';
      this.targetZone = null;
    } else if (this.courseChangeTimer === 0 && this.currentMode !== 'pickup' && this.currentMode !== 'dropoff') {
      this.currentMode = 'cruise';
      this.targetZone = null;
      this.maybeNewCruiseHeading();
    }

    if (this.currentMode === 'evade') return this.evade(dangerous);
    if (this.currentMode === 'avoid') return this.avoidAsteroid(closest);
    if ((this.currentMode === 'pickup' || this.currentMode === 'dropoff') && this.targetZone) {
      return this.approachZone(this.targetZone);
    }
    return this.cruise();
  }

  evade(dangerous) {
    if (!dangerous.length) return [0, 0];
    const escape = perpendicularEscape(this.ship, dangerous[0][0]);
    return [1, turnToward(angleDiff(escape, pymod(this.ship.angle, 360)), 10)];
  }

  avoidAsteroid(asteroid) {
    const ship = this.ship;
    return this.avoid(asteroid, (a) => ORIG_REACTION - ship.size - a.size, 0.3, 15);
  }

  approachZone(zone) {
    const ship = this.ship;
    const toZone = pymod(degrees(Math.atan2(zone.y - ship.y, zone.x - ship.x)), 360);
    const shipAngle = pymod(ship.angle, 360);
    const diff = angleDiff(toZone, shipAngle);
    const distance = ship.getDistance(zone);
    const speed = ship.speed;
    let thrust;
    if (distance < zone.size) {
      if (speed > MAX_PICKUP_VELOCITY * 0.8) {
        // As in the original: "braking" thrust only when the ship's tail points at the zone.
        const thrustAngle = pymod(shipAngle + 180, 360);
        thrust = Math.abs(angleDiff(thrustAngle, toZone)) < 30 ? 1 : 0;
      } else {
        thrust = 0;
      }
    } else if (distance < zone.size * 2 && speed > MAX_PICKUP_VELOCITY) {
      thrust = 0;
    } else {
      thrust = Math.abs(diff) < 45 ? 1 : 0;
    }
    return [thrust, turnToward(diff, 5)];
  }

  cruise() {
    const ship = this.ship;
    const diff = angleDiff(this.currentTargetAngle, pymod(ship.angle, 360));
    const thrust = Math.random() < 0.1 && ship.speed < 2 ? 1 : 0;
    return [thrust, turnToward(diff, 5)];
  }
}

// --- cautious.py -------------------------------------------------------------------------------

const CAUT_DANGER = 150;
const CAUT_REACTION = 200;
const CAUT_PREDICTION = 90;

export class CautiousShipAI extends ShipAI {
  constructor(ship) {
    super(ship);
    this.safeSpot = null; // [x, y] while fleeing to a quiet patch of space
  }

  decide(asteroids, zones) {
    const ship = this.ship;
    this.dropExpiredTarget(zones);
    this.tickCourseTimer();
    const dangerous = this.findDangerous(asteroids);
    const [closest, closestDistance] = closestAsteroid(ship, asteroids);

    if (zones.length && dangerous.length <= 1) {
      const type = ship.hasCargo ? 'dropoff' : 'pickup';
      const [zone, distance] = closestZoneOfType(ship, zones, type);
      if (zone && distance < CAUT_REACTION * 2 && !this.zonePathHasThreats(zone, asteroids)) {
        this.currentMode = type;
        this.targetZone = zone;
        return this.approachZoneSafely(zone);
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade';
      this.targetZone = null;
      if (dangerous.length > 1 && Math.random() < 0.1) this.findSafeSpot(asteroids);
    } else if (closest && closestDistance < CAUT_REACTION) {
      this.currentMode = 'avoid';
      this.targetZone = null;
    } else if (this.courseChangeTimer === 0 && this.currentMode !== 'pickup' && this.currentMode !== 'dropoff') {
      this.currentMode = 'cruise';
      this.targetZone = null;
      this.safeSpot = null;
      this.maybeNewCruiseHeading();
    }

    if (this.currentMode === 'evade') {
      return this.safeSpot ? this.moveToSafeSpot() : this.evadeEnhanced(dangerous);
    }
    if (this.currentMode === 'avoid') {
      return this.avoid(closest, () => CAUT_REACTION * 0.7, 0.2, 10);
    }
    if ((this.currentMode === 'pickup' || this.currentMode === 'dropoff') && this.targetZone) {
      return this.approachZoneSafely(this.targetZone);
    }
    return this.cruiseSafely(asteroids);
  }

  /** [[asteroid, distance, timeToCollision]] sorted by urgency. */
  findDangerous(asteroids) {
    const dangerous = [];
    for (const a of asteroids) {
      const distance = this.ship.getDistance(a);
      if (distance > CAUT_REACTION) continue;
      const [hit, time] = predictCollision(this.ship, a, CAUT_PREDICTION);
      if (hit) dangerous.push([a, distance, time]);
    }
    return dangerous.sort((p, q) => p[2] - q[2]);
  }

  /** Whether any rock sits near the straight line to the zone (unwrapped, as in the original). */
  zonePathHasThreats(zone, asteroids) {
    const ship = this.ship;
    let dx = zone.x - ship.x;
    let dy = zone.y - ship.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1) return false;
    dx /= distance;
    dy /= distance;
    for (const a of asteroids) {
      const proj = (a.x - ship.x) * dx + (a.y - ship.y) * dy;
      if (proj < 0 || proj > distance) continue;
      const cx = ship.x + dx * proj - a.x;
      const cy = ship.y + dy * proj - a.y;
      if (Math.sqrt(cx * cx + cy * cy) < a.size + ship.size + 20) return true;
    }
    return false;
  }

  findSafeSpot(asteroids) {
    let bestMin = -1;
    let best = null;
    for (let i = 0; i < 20; i++) {
      const x = uniform(0, WORLD_W);
      const y = uniform(0, WORLD_H);
      let min = Infinity;
      for (const a of asteroids) {
        const dx = Math.min(Math.abs(x - a.x), WORLD_W - Math.abs(x - a.x));
        const dy = Math.min(Math.abs(y - a.y), WORLD_H - Math.abs(y - a.y));
        min = Math.min(min, Math.sqrt(dx * dx + dy * dy));
      }
      if (min > bestMin) {
        bestMin = min;
        best = [x, y];
      }
    }
    if (bestMin > CAUT_DANGER) this.safeSpot = best;
  }

  moveToSafeSpot() {
    const ship = this.ship;
    const [sx, sy] = this.safeSpot;
    const target = angleToTarget(ship, sx, sy);
    const shipAngle = pymod(ship.angle, 360);
    const rotation = steeringDirection(shipAngle, target);
    const dx = Math.min(Math.abs(ship.x - sx), WORLD_W - Math.abs(ship.x - sx));
    const dy = Math.min(Math.abs(ship.y - sy), WORLD_H - Math.abs(ship.y - sy));
    const thrust = Math.abs(angleDiff(target, shipAngle)) < 45 ? 1 : 0;
    if (Math.sqrt(dx * dx + dy * dy) < 50) this.safeSpot = null;
    return [thrust, rotation];
  }

  evadeEnhanced(dangerous) {
    if (!dangerous.length) return [0, 0];
    const ship = this.ship;
    const shipAngle = pymod(ship.angle, 360);
    if (dangerous.length > 1) {
      let ax = 0;
      let ay = 0;
      let total = 0;
      for (const [a, , time] of dangerous.slice(0, 3)) {
        const weight = 1 / Math.max(time, 1);
        let dx = a.x - ship.x;
        let dy = a.y - ship.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
        dx /= d;
        dy /= d;
        ax += dx * weight;
        ay += dy * weight;
        total += weight;
      }
      if (total > 0) {
        ax /= total;
        ay /= total;
        const escape = pymod(degrees(Math.atan2(-ay, -ax)), 360);
        return [1, turnToward(angleDiff(escape, shipAngle), 10)];
      }
    }
    const escape = perpendicularEscape(ship, dangerous[0][0]);
    return [1, turnToward(angleDiff(escape, shipAngle), 5)];
  }

  approachZoneSafely(zone) {
    const ship = this.ship;
    const toZone = pymod(degrees(Math.atan2(zone.y - ship.y, zone.x - ship.x)), 360);
    const shipAngle = pymod(ship.angle, 360);
    const diff = angleDiff(toZone, shipAngle);
    const distance = ship.getDistance(zone);
    const speed = ship.speed;
    if (distance < zone.size) {
      if (speed > MAX_PICKUP_VELOCITY * 0.7) {
        const braking = pymod(degrees(Math.atan2(ship.velocityY, ship.velocityX)) + 180, 360);
        const steer = steeringDirection(shipAngle, braking);
        return [Math.abs(angleDiff(braking, shipAngle)) < 60 ? 1 : 0, steer];
      }
      return [0, 0];
    }
    const steer = steeringDirection(shipAngle, toZone);
    if (distance < speed * 10 && speed > MAX_PICKUP_VELOCITY * 1.5) return [0, steer];
    return [Math.abs(diff) < 30 ? 1 : 0, steer];
  }

  cruiseSafely(asteroids) {
    const ship = this.ship;
    const speed = ship.speed;
    const lookAhead = speed * 10;
    const a = radians(ship.angle);
    const aheadX = ship.x + Math.cos(a) * lookAhead;
    const aheadY = ship.y + Math.sin(a) * lookAhead;
    for (const rock of asteroids) {
      const dx = Math.min(Math.abs(aheadX - rock.x), WORLD_W - Math.abs(aheadX - rock.x));
      const dy = Math.min(Math.abs(aheadY - rock.y), WORLD_H - Math.abs(aheadY - rock.y));
      if (Math.sqrt(dx * dx + dy * dy) < rock.size + ship.size + 20) {
        this.currentTargetAngle = uniform(0, 360);
        this.courseChangeTimer = COURSE_CHANGE_DELAY;
        break;
      }
    }
    const rotation = steeringDirection(pymod(ship.angle, 360), this.currentTargetAngle);
    const thrust = Math.random() < 0.1 && speed < 1.5 ? 1 : 0;
    return [thrust, rotation];
  }
}

// --- delivery.py -------------------------------------------------------------------------------

const DELIV_REACTION = 150;
const DELIV_PREDICTION = 60;

export class DeliveryFocusedAI extends ShipAI {
  constructor(ship) {
    super(ship);
    this.approachPhase = 'direct'; // direct, brake, final
    this.brakingStarted = false;
  }

  resetApproach() {
    this.approachPhase = 'direct';
    this.brakingStarted = false;
  }

  decide(asteroids, zones) {
    const ship = this.ship;
    this.dropExpiredTarget(zones);
    this.tickCourseTimer();
    const [closest, closestDistance] = closestAsteroid(ship, asteroids);
    const dangerous = dangerousByDistance(ship, asteroids, DELIV_REACTION, DELIV_PREDICTION);

    if (zones.length && !dangerous.length) {
      const type = ship.hasCargo ? 'dropoff' : 'pickup';
      if (!zones.some((z) => z.zoneType === type)) {
        if (ship.hasCargo) {
          this.currentMode = 'wait_for_dropoff';
          return this.cruiseSafely(asteroids);
        }
      } else {
        const [zone] = closestZoneOfType(ship, zones, type);
        if (zone) {
          this.currentMode = type;
          this.targetZone = zone;
          return this.precisionApproach(zone);
        }
      }
    }

    if (dangerous.length) {
      this.currentMode = 'evade';
      this.targetZone = null;
      this.resetApproach();
    } else if (closest && closestDistance < DELIV_REACTION) {
      this.currentMode = 'avoid';
      this.targetZone = null;
      this.resetApproach();
    } else if (this.courseChangeTimer === 0 && this.currentMode !== 'pickup' && this.currentMode !== 'dropoff') {
      this.currentMode = 'cruise';
      this.targetZone = null;
      this.resetApproach();
      this.maybeNewCruiseHeading();
    }

    if (this.currentMode === 'evade') {
      if (!dangerous.length) return [0, 0];
      const escape = perpendicularEscape(ship, dangerous[0][0]);
      return [1, turnToward(angleDiff(escape, pymod(ship.angle, 360)), 10)];
    }
    if (this.currentMode === 'avoid') {
      if (!closest) return [0, 0];
      // Delivery AI steers with get_steering_direction (5 degree tolerance).
      const [thrust] = this.avoid(closest, (a) => DELIV_REACTION - ship.size - a.size, 0.3, 5);
      const away = degrees(pymod(Math.atan2(closest.y - ship.y, closest.x - ship.x) + Math.PI, 2 * Math.PI));
      return [thrust, steeringDirection(pymod(ship.angle, 360), away)];
    }
    if ((this.currentMode === 'pickup' || this.currentMode === 'dropoff') && this.targetZone) {
      return this.precisionApproach(this.targetZone);
    }
    return this.cruiseDeliveryFocused(zones);
  }

  precisionApproach(zone) {
    const ship = this.ship;
    const toZone = angleToTarget(ship, zone.x, zone.y);
    const distance = ship.getDistance(zone);
    const velocity = ship.speed;
    const shipAngle = pymod(ship.angle, 360);
    const rotation = steeringDirection(shipAngle, toZone);
    const brakingAngle = () => pymod(degrees(Math.atan2(ship.velocityY, ship.velocityX)) + 180, 360);

    if (distance < zone.size * 0.8) {
      this.approachPhase = 'final';
      if (velocity > MAX_PICKUP_VELOCITY * 0.8) {
        const braking = brakingAngle();
        if (Math.abs(angleDiff(braking, shipAngle)) < 30) return [1, 0];
        return [0, steeringDirection(shipAngle, braking)];
      }
      return [0, 0];
    } else if (!this.brakingStarted) {
      const brakingDistance = estimateBrakingDistance(ship, MAX_PICKUP_VELOCITY * 0.8);
      if (distance < brakingDistance * 1.5) {
        this.approachPhase = 'brake';
        this.brakingStarted = true;
        return [0, rotation];
      }
    }

    if (this.approachPhase === 'brake') {
      if (velocity > MAX_PICKUP_VELOCITY) {
        const braking = brakingAngle();
        const steer = steeringDirection(shipAngle, braking);
        return [Math.abs(angleDiff(braking, shipAngle)) < 90 ? 1 : 0, steer];
      }
      this.approachPhase = 'direct';
      return [0, rotation];
    }

    const aligned = Math.abs(angleDiff(toZone, shipAngle)) < 20;
    return [aligned && velocity < 3 && distance > zone.size * 2 ? 1 : 0, rotation];
  }

  cruiseDeliveryFocused(zones) {
    const ship = this.ship;
    const speed = ship.speed;
    if (zones.length) {
      const type = ship.hasCargo ? 'dropoff' : 'pickup';
      const [zone] = closestZoneOfType(ship, zones, type);
      if (zone) {
        const toZone = angleToTarget(ship, zone.x, zone.y);
        const shipAngle = pymod(ship.angle, 360);
        const rotation = steeringDirection(shipAngle, toZone);
        return [Math.abs(angleDiff(toZone, shipAngle)) < 30 && speed < 3 ? 1 : 0, rotation];
      }
    }
    const diff = angleDiff(this.currentTargetAngle, pymod(ship.angle, 360));
    const thrust = Math.random() < 0.2 && speed < 2 ? 1 : 0;
    return [thrust, turnToward(diff, 5)];
  }

  cruiseSafely(asteroids) {
    const ship = this.ship;
    const a = radians(ship.angle);
    const aheadX = ship.x + Math.cos(a) * 100;
    const aheadY = ship.y + Math.sin(a) * 100;
    for (const rock of asteroids) {
      const dx = Math.min(Math.abs(aheadX - rock.x), WORLD_W - Math.abs(aheadX - rock.x));
      const dy = Math.min(Math.abs(aheadY - rock.y), WORLD_H - Math.abs(aheadY - rock.y));
      if (Math.sqrt(dx * dx + dy * dy) < rock.size + ship.size + 20) {
        this.currentTargetAngle = uniform(0, 360);
        this.courseChangeTimer = COURSE_CHANGE_DELAY;
        break;
      }
    }
    const rotation = steeringDirection(pymod(ship.angle, 360), this.currentTargetAngle);
    const thrust = Math.random() < 0.05 && ship.speed < 1 ? 1 : 0;
    return [thrust, rotation];
  }
}

const AI_TYPES = [OriginalShipAI, CautiousShipAI, DeliveryFocusedAI];

/** ai.create_random_ai: one of the three AIs, chosen at random. */
export function createRandomAI(ship) {
  const Kind = choice(AI_TYPES);
  return new Kind(ship);
}
