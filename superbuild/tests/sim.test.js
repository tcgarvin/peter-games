// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { Track, WAYPOINTS, CHECKPOINT_SEQUENCE, TOTAL_LAPS, CHECKPOINT_RADIUS } from '../track.js';
import { Car, GameSim } from '../sim.js';

// ---- Helpers ----

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };
const THROTTLE = { throttle: 1, brake: 0, steer: 0 };
const BRAKE    = { throttle: 0, brake: 1, steer: 0 };
const LEFT     = { throttle: 0, brake: 0, steer: -1 };
const RIGHT    = { throttle: 0, brake: 0, steer: 1 };

/** Skip the countdown so physics ticks can be tested immediately. */
function skipCountdown(sim) {
  sim._started        = true;
  sim._countdownTicks = 0;
}

/** Run N physics ticks with the given inputs. */
function runTicks(sim, n, inputs = NEUTRAL) {
  for (let i = 0; i < n; i++) sim.tick(inputs);
}

/** Teleport a car to a waypoint position and clear its checkpoint cooldown. */
function teleportToCar(car, wpIdx) {
  car.x             = WAYPOINTS[wpIdx][0];
  car.z             = WAYPOINTS[wpIdx][1];
  car.checkpointCool = 0;
}

// ---- Car constructor ----

describe('Car', () => {
  it('initialises with zero speed, angle, position', () => {
    const car = new Car('test', true);
    expect(car.x).toBe(0);
    expect(car.z).toBe(0);
    expect(car.angle).toBe(0);
    expect(car.speed).toBe(0);
  });

  it('initialises lap counters to zero', () => {
    const car = new Car('test', true);
    expect(car.lapCount).toBe(0);
    expect(car.checkpointSeqIdx).toBe(0);
    expect(car.checkpointCool).toBe(0);
  });

  it('isLocal is stored correctly', () => {
    expect(new Car('a', true).isLocal).toBe(true);
    expect(new Car('b', false).isLocal).toBe(false);
  });

  it('finished flag starts false', () => {
    expect(new Car('test', true).finished).toBe(false);
  });
});

// ---- GameSim.addCar ----

describe('GameSim.addCar', () => {
  let sim;
  beforeEach(() => { sim = new GameSim(new Track()); });

  it('returns a Car instance', () => {
    const car = sim.addCar('local', true);
    expect(car).toBeInstanceOf(Car);
  });

  it('car is placed at the start/finish waypoint', () => {
    const car = sim.addCar('local', true);
    const [wx, wz] = WAYPOINTS[0];
    // First car has zero offset, so should be exactly at wp[0].
    expect(car.x).toBeCloseTo(wx, 5);
    expect(car.z).toBeCloseTo(wz, 5);
  });

  it('car angle points from wp[0] toward wp[1]', () => {
    const car = sim.addCar('local', true);
    const [ax, az] = WAYPOINTS[0];
    const [bx, bz] = WAYPOINTS[1];
    const expected = Math.atan2(bz - az, bx - ax);
    expect(car.angle).toBeCloseTo(expected, 10);
  });

  it('subsequent cars are staggered behind the first', () => {
    const car1 = sim.addCar('a', true);
    const car2 = sim.addCar('b', false);
    const dist = Math.hypot(car2.x - car1.x, car2.z - car1.z);
    expect(dist).toBeGreaterThan(0);
  });

  it('car appears in sim.cars', () => {
    sim.addCar('p1', true);
    expect(sim.cars).toHaveLength(1);
    sim.addCar('p2', false);
    expect(sim.cars).toHaveLength(2);
  });

  it('car has a spawn grace period (checkpointCool > 0)', () => {
    const car = sim.addCar('local', true);
    expect(car.checkpointCool).toBeGreaterThan(0);
  });
});

// ---- GameSim.removeCar ----

describe('GameSim.removeCar', () => {
  let sim;
  beforeEach(() => { sim = new GameSim(new Track()); });

  it('removes the car with the matching id', () => {
    sim.addCar('a', true);
    sim.addCar('b', false);
    sim.removeCar('a');
    expect(sim.cars.map(c => c.id)).not.toContain('a');
    expect(sim.cars).toHaveLength(1);
  });

  it('is a no-op for an unknown id', () => {
    sim.addCar('a', true);
    expect(() => sim.removeCar('unknown')).not.toThrow();
    expect(sim.cars).toHaveLength(1);
  });

  it('removing all cars leaves an empty array', () => {
    sim.addCar('a', true);
    sim.removeCar('a');
    expect(sim.cars).toHaveLength(0);
  });
});

// ---- Countdown behaviour ----

describe('GameSim countdown', () => {
  let sim;
  beforeEach(() => { sim = new GameSim(new Track()); });

  it('starts with raceStarted = false', () => {
    expect(sim.raceStarted).toBe(false);
  });

  it('countdown begins at 3', () => {
    expect(sim.countdown).toBe(3);
  });

  it('countdown decrements toward 0 as ticks advance', () => {
    const initial = sim.countdown;
    runTicks(sim, 10, NEUTRAL);
    // After a few ticks countdown may still be 3 (within the first third).
    expect(sim.countdown).toBeGreaterThanOrEqual(0);
    expect(sim.countdown).toBeLessThanOrEqual(initial);
  });

  it('car does not move during countdown', () => {
    sim.addCar('local', true);
    const car = sim.localCar;
    const x0 = car.x, z0 = car.z;
    runTicks(sim, 10, THROTTLE);
    expect(car.x).toBe(x0);
    expect(car.z).toBe(z0);
  });

  it('raceStarted becomes true after countdown ticks elapse', () => {
    // Needs 180 ticks total to exhaust countdown.
    runTicks(sim, 182, NEUTRAL);
    expect(sim.raceStarted).toBe(true);
    expect(sim.countdown).toBe(0);
  });

  it('countdown returns 0 once race has started', () => {
    skipCountdown(sim);
    expect(sim.countdown).toBe(0);
  });
});

// ---- Physics: throttle / brake ----

describe('GameSim physics — throttle and brake', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    car = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0;
  });

  it('throttle increases speed from rest', () => {
    runTicks(sim, 5, THROTTLE);
    expect(car.speed).toBeGreaterThan(0);
  });

  it('neutral input reduces speed via friction', () => {
    car.speed = 5;
    runTicks(sim, 10, NEUTRAL);
    expect(car.speed).toBeLessThan(5);
  });

  it('speed does not exceed MAX_SPEED (9.0)', () => {
    runTicks(sim, 300, THROTTLE);
    expect(car.speed).toBeLessThanOrEqual(9.0 + 1e-9);
  });

  it('braking from forward speed reduces speed', () => {
    car.speed = 4;
    const before = car.speed;
    runTicks(sim, 3, BRAKE);
    expect(car.speed).toBeLessThan(before);
  });

  it('braking can produce reverse speed (negative)', () => {
    car.speed = 0;
    runTicks(sim, 30, BRAKE);
    expect(car.speed).toBeLessThan(0);
  });

  it('reverse speed does not exceed MAX_SPEED_REV (3.5) in magnitude', () => {
    runTicks(sim, 300, BRAKE);
    expect(car.speed).toBeGreaterThanOrEqual(-3.5 - 1e-9);
  });
});

// ---- Physics: steering ----

describe('GameSim physics — steering', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    car = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0;
    car.speed = 5; // need some speed for steering to have effect
  });

  it('steering right (steer=1) increases angle', () => {
    const before = car.angle;
    runTicks(sim, 5, RIGHT);
    expect(car.angle).toBeGreaterThan(before);
  });

  it('steering left (steer=-1) decreases angle', () => {
    const before = car.angle;
    runTicks(sim, 5, LEFT);
    expect(car.angle).toBeLessThan(before);
  });

  it('neutral steer does not change angle (with zero speed)', () => {
    car.speed = 0;
    const before = car.angle;
    runTicks(sim, 5, NEUTRAL);
    expect(car.angle).toBeCloseTo(before, 10);
  });
});

// ---- Physics: movement ----

describe('GameSim physics — movement', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    // Place car at a spot that's definitely on-road so off-track cap doesn't interfere.
    car = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0;
  });

  it('car moves in the direction of its angle', () => {
    car.speed = 5;
    car.angle = 0; // facing +X
    const x0 = car.x;
    sim.tick(NEUTRAL);
    expect(car.x).toBeGreaterThan(x0); // moved east
  });

  it('car moves in +Z when facing π/2 (south)', () => {
    car.speed = 5;
    car.angle = Math.PI / 2;
    const z0 = car.z;
    sim.tick(NEUTRAL);
    expect(car.z).toBeGreaterThan(z0);
  });
});

// ---- Physics: offtrack ----

describe('GameSim physics — offtrack', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    car = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0;
  });

  it('car is NOT offtrack when on centreline', () => {
    const [x, z] = WAYPOINTS[0];
    car.x = x; car.z = z;
    sim.tick(NEUTRAL);
    expect(car.offTrack).toBe(false);
  });

  it('car IS offtrack when placed in deep grass', () => {
    car.x = 2400; car.z = 1600; // well outside any track segment
    sim.tick(NEUTRAL);
    expect(car.offTrack).toBe(true);
  });

  it('speed is capped at OFFTRACK_MAX (4.5) when on grass', () => {
    car.x     = 2400;
    car.z     = 1600;
    car.speed = 9; // above the cap
    sim.tick(THROTTLE);
    // After one offtrack tick the cap (4.5) should apply.
    expect(car.speed).toBeLessThanOrEqual(4.5 + 1e-9);
  });
});

// ---- World bounds ----

describe('GameSim world bounds', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    car = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0;
  });

  it('car is bounced back when pushed past world edge in X', () => {
    car.x     = 2449; // just inside the 2450 limit
    car.speed = 10;
    car.angle = 0;    // facing +X → will exceed bound
    sim.tick(NEUTRAL);
    // After the tick, car.x should be clamped.
    expect(Math.abs(car.x)).toBeLessThanOrEqual(2450 + 1e-6);
  });

  it('speed reverses on world-edge bounce', () => {
    car.x     = 2449;
    car.speed = 10;
    car.angle = 0;
    sim.tick(NEUTRAL);
    expect(car.speed).toBeLessThan(0); // bounced
  });
});

// ---- Checkpoint and lap logic ----

describe('GameSim lap and checkpoint logic', () => {
  let sim, car, track;
  beforeEach(() => {
    track = new Track();
    sim   = new GameSim(track);
    car   = sim.addCar('local', true);
    skipCountdown(sim);
    car.checkpointCool = 0; // clear spawn grace
  });

  it('checkpointSeqIdx starts at 0', () => {
    expect(car.checkpointSeqIdx).toBe(0);
  });

  it('passing checkpoint A (wp 3) advances checkpointSeqIdx to 1', () => {
    teleportToCar(car, CHECKPOINT_SEQUENCE[0]);
    sim.tick(NEUTRAL);
    expect(car.checkpointSeqIdx).toBe(1);
  });

  it('a cooldown is set after passing a checkpoint', () => {
    teleportToCar(car, CHECKPOINT_SEQUENCE[0]);
    sim.tick(NEUTRAL);
    expect(car.checkpointCool).toBeGreaterThan(0);
  });

  it('cannot advance checkpointSeqIdx again until cooldown expires', () => {
    teleportToCar(car, CHECKPOINT_SEQUENCE[0]);
    sim.tick(NEUTRAL); // triggers checkpoint A
    const seqAfter = car.checkpointSeqIdx;
    // Still near checkpoint A — should NOT double-count.
    sim.tick(NEUTRAL);
    expect(car.checkpointSeqIdx).toBe(seqAfter);
  });

  it('skipping a checkpoint does not advance the sequence', () => {
    // Jump to checkpoint B without passing A first.
    teleportToCar(car, CHECKPOINT_SEQUENCE[1]);
    sim.tick(NEUTRAL);
    // Still waiting for A (index 0).
    expect(car.checkpointSeqIdx).toBe(0);
  });

  it('must pass all 4 checkpoints before start/finish counts', () => {
    // Pass A, B, C, D.
    for (const idx of CHECKPOINT_SEQUENCE) {
      car.checkpointCool = 0;
      teleportToCar(car, idx);
      sim.tick(NEUTRAL);
    }
    expect(car.checkpointSeqIdx).toBe(CHECKPOINT_SEQUENCE.length);
    // Now teleport to start/finish.
    car.checkpointCool = 0;
    teleportToCar(car, 0);
    sim.tick(NEUTRAL);
    expect(car.lapCount).toBe(1);
  });

  it('crossing start/finish before all checkpoints does NOT count the lap', () => {
    teleportToCar(car, 0); // start/finish, but no checkpoints passed yet
    sim.tick(NEUTRAL);
    expect(car.lapCount).toBe(0);
  });

  it('lapCount stays at 0 after passing only 3 of 4 checkpoints then start', () => {
    // Pass A, B, C (not D).
    for (const idx of CHECKPOINT_SEQUENCE.slice(0, 3)) {
      car.checkpointCool = 0;
      teleportToCar(car, idx);
      sim.tick(NEUTRAL);
    }
    car.checkpointCool = 0;
    teleportToCar(car, 0);
    sim.tick(NEUTRAL);
    expect(car.lapCount).toBe(0);
  });

  it('finishing TOTAL_LAPS laps marks the car as finished', () => {
    for (let lap = 0; lap < TOTAL_LAPS; lap++) {
      for (const idx of CHECKPOINT_SEQUENCE) {
        car.checkpointCool = 0;
        teleportToCar(car, idx);
        sim.tick(NEUTRAL);
      }
      car.checkpointCool = 0;
      teleportToCar(car, 0);
      sim.tick(NEUTRAL);
    }
    expect(car.lapCount).toBe(TOTAL_LAPS);
    expect(car.finished).toBe(true);
  });

  it('raceFinished becomes true once all local cars finish', () => {
    for (let lap = 0; lap < TOTAL_LAPS; lap++) {
      for (const idx of CHECKPOINT_SEQUENCE) {
        car.checkpointCool = 0;
        teleportToCar(car, idx);
        sim.tick(NEUTRAL);
      }
      car.checkpointCool = 0;
      teleportToCar(car, 0);
      sim.tick(NEUTRAL);
    }
    expect(sim.raceFinished).toBe(true);
  });

  it('a finished car is not processed in subsequent ticks', () => {
    car.finished = true;
    const x0 = car.x, z0 = car.z;
    runTicks(sim, 5, THROTTLE);
    expect(car.x).toBe(x0);
    expect(car.z).toBe(z0);
  });

  it('lap timing: lastLapTicks is set after completing a lap', () => {
    for (const idx of CHECKPOINT_SEQUENCE) {
      car.checkpointCool = 0;
      teleportToCar(car, idx);
      sim.tick(NEUTRAL);
    }
    car.checkpointCool = 0;
    teleportToCar(car, 0);
    sim.tick(NEUTRAL);
    expect(car.lastLapTicks).toBeGreaterThan(0);
  });

  it('bestLapTicks is updated when a faster lap is recorded', () => {
    // Complete one lap.
    for (const idx of CHECKPOINT_SEQUENCE) {
      car.checkpointCool = 0;
      teleportToCar(car, idx);
      sim.tick(NEUTRAL);
    }
    car.checkpointCool = 0;
    teleportToCar(car, 0);
    sim.tick(NEUTRAL);
    const firstBest = car.bestLapTicks;

    // Complete a second lap more quickly (fewer ticks between start ticks).
    for (const idx of CHECKPOINT_SEQUENCE) {
      car.checkpointCool = 0;
      teleportToCar(car, idx);
      sim.tick(NEUTRAL);
    }
    car.checkpointCool = 0;
    teleportToCar(car, 0);
    sim.tick(NEUTRAL);
    // Second lap might be faster (fewer accumulated ticks) or equal.
    expect(car.bestLapTicks).toBeLessThanOrEqual(firstBest);
  });
});

// ---- Remote state ----

describe('GameSim.applyRemoteState', () => {
  let sim, remoteCar;
  beforeEach(() => {
    sim = new GameSim(new Track());
    sim.addCar('local', true);
    remoteCar = sim.addCar('peer1', false);
    skipCountdown(sim);
    remoteCar.checkpointCool = 0;
  });

  it('updates the interpolation targets on the remote car', () => {
    sim.applyRemoteState('peer1', { x: 500, z: 300, angle: 1.2, speed: 3, lapCount: 1 });
    expect(remoteCar._targetX).toBe(500);
    expect(remoteCar._targetZ).toBe(300);
    expect(remoteCar._targetAngle).toBe(1.2);
    expect(remoteCar._targetSpeed).toBe(3);
  });

  it('updates lapCount directly on the remote car', () => {
    sim.applyRemoteState('peer1', { x: 0, z: 0, angle: 0, speed: 0, lapCount: 2 });
    expect(remoteCar.lapCount).toBe(2);
  });

  it('is a no-op for an unknown peer id', () => {
    expect(() => {
      sim.applyRemoteState('nobody', { x: 0, z: 0, angle: 0, speed: 0, lapCount: 0 });
    }).not.toThrow();
  });

  it('remote car interpolates toward its target over ticks', () => {
    sim.applyRemoteState('peer1', { x: 1000, z: 800, angle: 0, speed: 0, lapCount: 0 });
    const x0 = remoteCar.x;
    sim.tick(NEUTRAL);
    // Should have moved toward target (1000).
    expect(Math.abs(remoteCar.x - 1000)).toBeLessThan(Math.abs(x0 - 1000));
  });
});

// ---- getLocalSnapshot ----

describe('GameSim.getLocalSnapshot', () => {
  let sim, car;
  beforeEach(() => {
    sim = new GameSim(new Track());
    car = sim.addCar('local', true);
    skipCountdown(sim);
  });

  it('returns an object with all required fields', () => {
    const snap = sim.getLocalSnapshot();
    expect(snap).not.toBeNull();
    expect(typeof snap.x).toBe('number');
    expect(typeof snap.z).toBe('number');
    expect(typeof snap.angle).toBe('number');
    expect(typeof snap.speed).toBe('number');
    expect(typeof snap.lapCount).toBe('number');
    expect(typeof snap.seq).toBe('number');
  });

  it('snapshot position matches the local car', () => {
    car.x = 123; car.z = 456;
    const snap = sim.getLocalSnapshot();
    expect(snap.x).toBe(123);
    expect(snap.z).toBe(456);
  });

  it('returns null when no local car exists', () => {
    const empty = new GameSim(new Track());
    expect(empty.getLocalSnapshot()).toBeNull();
  });

  it('seq increments with each tick', () => {
    sim.tick(NEUTRAL);
    const s1 = sim.getLocalSnapshot().seq;
    sim.tick(NEUTRAL);
    const s2 = sim.getLocalSnapshot().seq;
    expect(s2).toBeGreaterThan(s1);
  });
});

// ---- localCar / cars accessors ----

describe('GameSim accessors', () => {
  let sim;
  beforeEach(() => { sim = new GameSim(new Track()); });

  it('localCar returns null when no local car added', () => {
    expect(sim.localCar).toBeNull();
  });

  it('localCar returns the local car after addCar', () => {
    const car = sim.addCar('me', true);
    expect(sim.localCar).toBe(car);
  });

  it('localCar ignores remote cars', () => {
    sim.addCar('peer', false);
    expect(sim.localCar).toBeNull();
  });

  it('cars returns all cars regardless of isLocal', () => {
    sim.addCar('me', true);
    sim.addCar('peer', false);
    expect(sim.cars).toHaveLength(2);
  });
});

// ---- raceFinished with no local cars ----

describe('GameSim raceFinished edge cases', () => {
  it('does not finish when there are no cars', () => {
    const sim = new GameSim(new Track());
    skipCountdown(sim);
    sim.tick(NEUTRAL);
    expect(sim.raceFinished).toBe(false);
  });

  it('does not finish when only remote cars are present', () => {
    const sim = new GameSim(new Track());
    sim.addCar('peer', false);
    skipCountdown(sim);
    sim.tick(NEUTRAL);
    expect(sim.raceFinished).toBe(false);
  });
});
