// sim.js - Physics simulation and game state.
// Pure JavaScript, no Three.js dependency.

import {
  Track, WAYPOINTS, CHECKPOINT_SEQUENCE, TOTAL_LAPS,
  getStartPose, WORLD_W, WORLD_H,
} from './track.js';

// ---- Physics constants (tuned for 60fps, world scaled ~2.5x from racing.py) ----
const MAX_SPEED        = 9.0;   // world units per tick at max
const MAX_SPEED_REV    = 3.5;   // max reverse speed
const OFFTRACK_MAX     = 4.5;   // speed cap on grass
const ACCELERATION     = 0.18;  // throttle gain per tick
const BRAKING          = 0.30;  // brake deceleration per tick
const ROAD_FRICTION    = 0.015; // speed decay per tick on road
const OFFTRACK_FRICTION= 0.08;  // extra friction on grass
const STEER_RATE       = 0.048; // max angle change per tick (rad), at full speed
const STEER_SPEED_BIAS = 0.6;   // 0 = constant steer, 1 = fully speed-proportional

// Countdown duration in ticks (60fps): 60 ticks per number → 3-2-1-GO
const COUNTDOWN_TICKS = 60 * 3; // 3 seconds (ceil(ticks/60) = 3,2,1 → then started)

export class Car {
  /**
   * @param {string} id - 'local' or a PeerJS peer ID
   * @param {boolean} isLocal
   */
  constructor(id, isLocal) {
    this.id       = id;
    this.isLocal  = isLocal;

    // Position and heading
    this.x     = 0;
    this.z     = 0;
    this.angle = 0; // 0 = +X (east), increases clockwise

    // Motion
    this.speed = 0; // longitudinal speed (positive = forward)

    // State flags
    this.offTrack = false;
    this.finished = false;

    // Lap tracking
    this.lapCount         = 0;
    this.checkpointSeqIdx = 0; // next required checkpoint index in CHECKPOINT_SEQUENCE
    this.checkpointCool   = 0; // cooldown ticks after triggering a checkpoint
    this.lapStartTick     = 0;
    this.bestLapTicks     = Infinity;
    this.lastLapTicks     = 0;

    // Net interpolation target (for remote cars)
    this._targetX     = 0;
    this._targetZ     = 0;
    this._targetAngle = 0;
    this._targetSpeed = 0;
  }
}

export class GameSim {
  /**
   * @param {Track} track
   */
  constructor(track) {
    this._track    = track;
    this._cars     = [];
    this._tick     = 0;
    this._countdownTicks = COUNTDOWN_TICKS;
    this._started  = false;
    this._finished = false;
  }

  /** Add a car to the simulation. Returns the Car instance. */
  addCar(id, isLocal) {
    const car = new Car(id, isLocal);
    const pose = getStartPose();
    // Stagger start positions slightly along the track direction
    const offset = this._cars.length * 250;
    car.x     = pose.x - Math.cos(pose.angle) * offset;
    car.z     = pose.z - Math.sin(pose.angle) * offset;
    car.angle = pose.angle;
    car._targetX     = car.x;
    car._targetZ     = car.z;
    car._targetAngle = car.angle;
    car.checkpointCool = 120; // grace period at spawn
    this._cars.push(car);
    return car;
  }

  /** Remove a car (used when a remote peer disconnects). */
  removeCar(id) {
    this._cars = this._cars.filter(c => c.id !== id);
  }

  /**
   * Advance one fixed tick.
   * @param {{ throttle:number, brake:number, steer:number }} localInputs
   *   throttle/brake: 0|1, steer: -1|0|1
   */
  tick(localInputs) {
    this._tick++;

    // Count down before race starts
    if (!this._started) {
      this._countdownTicks--;
      if (this._countdownTicks <= 0) this._started = true;
      return;
    }

    for (const car of this._cars) {
      if (car.finished) continue;

      const inputs = car.isLocal
        ? localInputs
        : null; // remote cars are driven by applyRemoteState

      if (car.isLocal) {
        this._physTick(car, inputs);
      } else {
        this._interpolateRemote(car);
      }

      this._checkLap(car);
    }

    // Race done when all local cars finish
    if (this._started && !this._finished) {
      const localCars = this._cars.filter(c => c.isLocal);
      if (localCars.length > 0 && localCars.every(c => c.finished)) {
        this._finished = true;
      }
    }
  }

  _physTick(car, inputs) {
    const { throttle, brake, steer } = inputs;

    // Steering (slower at low speed for realism, but arcade-enough)
    const speedRatio = Math.abs(car.speed) / MAX_SPEED;
    const steerAmount = steer * STEER_RATE * (STEER_SPEED_BIAS * speedRatio + (1 - STEER_SPEED_BIAS));
    car.angle += steerAmount;

    // Offtrack detection at start of tick (so speed cap applies immediately)
    car.offTrack = !this._track.isOnRoad(car.x, car.z);

    // Throttle / brake
    if (throttle && !brake) {
      car.speed += ACCELERATION;
    } else if (brake && !throttle) {
      if (car.speed > 0) {
        car.speed -= BRAKING;
      } else {
        car.speed -= ACCELERATION * 0.5; // slow reverse
      }
    }

    // Friction
    const friction = car.offTrack ? ROAD_FRICTION + OFFTRACK_FRICTION : ROAD_FRICTION;
    car.speed *= (1 - friction);

    // Speed limits
    const maxFwd = car.offTrack ? OFFTRACK_MAX : MAX_SPEED;
    car.speed = Math.max(-MAX_SPEED_REV, Math.min(maxFwd, car.speed));

    // Move
    car.x += Math.cos(car.angle) * car.speed;
    car.z += Math.sin(car.angle) * car.speed;

    // World bounds (soft bounce)
    const halfW = WORLD_W / 2 - 50;
    const halfH = WORLD_H / 2 - 50;
    if (Math.abs(car.x) > halfW) {
      car.x = Math.sign(car.x) * halfW;
      car.speed *= -0.3;
    }
    if (Math.abs(car.z) > halfH) {
      car.z = Math.sign(car.z) * halfH;
      car.speed *= -0.3;
    }
  }

  _interpolateRemote(car) {
    // Smooth remote car toward its last received state snapshot.
    car.x     += (car._targetX - car.x) * 0.3;
    car.z     += (car._targetZ - car.z) * 0.3;
    car.speed += (car._targetSpeed - car.speed) * 0.3;
    car.angle  = lerpAngle(car.angle, car._targetAngle, 0.3);
    car.offTrack = !this._track.isOnRoad(car.x, car.z);
  }

  _checkLap(car) {
    if (car.checkpointCool > 0) {
      car.checkpointCool--;
      return;
    }

    if (car.checkpointSeqIdx < CHECKPOINT_SEQUENCE.length) {
      // Check next required checkpoint
      const wpIdx = CHECKPOINT_SEQUENCE[car.checkpointSeqIdx];
      if (this._track.isNearWaypoint(car.x, car.z, wpIdx)) {
        car.checkpointSeqIdx++;
        car.checkpointCool = 120;
      }
    } else {
      // All checkpoints passed — check start/finish line
      if (this._track.isNearWaypoint(car.x, car.z, 0)) {
        const lapTicks = this._tick - car.lapStartTick;
        car.lastLapTicks = lapTicks;
        if (lapTicks < car.bestLapTicks) car.bestLapTicks = lapTicks;

        car.lapCount++;
        car.lapStartTick = this._tick;
        car.checkpointSeqIdx = 0;
        car.checkpointCool = 180;

        if (car.lapCount >= TOTAL_LAPS) {
          car.finished = true;
        }
      }
    }
  }

  /**
   * Called by net.js when a state snapshot arrives from a remote peer.
   * Updates the remote car's interpolation target.
   */
  applyRemoteState(id, snap) {
    const car = this._cars.find(c => c.id === id);
    if (!car) return;
    car._targetX     = snap.x;
    car._targetZ     = snap.z;
    car._targetAngle = snap.angle;
    car._targetSpeed = snap.speed;
    car.lapCount     = snap.lapCount;
  }

  /** Returns a snapshot of the local car's state for networking. */
  getLocalSnapshot() {
    const car = this._cars.find(c => c.isLocal);
    if (!car) return null;
    return {
      x: car.x, z: car.z,
      angle: car.angle,
      speed: car.speed,
      lapCount: car.lapCount,
      seq: this._tick,
    };
  }

  // ---- Accessors ----

  get cars() { return this._cars; }

  get localCar() { return this._cars.find(c => c.isLocal) ?? null; }

  /** Countdown value: 3, 2, 1, 0 (0 = GO / racing). */
  get countdown() {
    if (this._started) return 0;
    // Divide into 3 equal stages so Math.ceil gives 3, 2, 1.
    const third = COUNTDOWN_TICKS / 3;
    return Math.ceil(this._countdownTicks / third);
  }

  get raceStarted() { return this._started; }

  get raceFinished() { return this._finished; }

  get tickCount() { return this._tick; }
}

// ---- Helpers ----

function lerpAngle(a, b, t) {
  let diff = b - a;
  // Normalize to [-π, π]
  while (diff > Math.PI)  diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
