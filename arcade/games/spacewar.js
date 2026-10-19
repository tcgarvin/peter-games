// Spacewar (the delivery game), ported from spacewar/spacewar.py, entities.py and ai/.
// One original frame per fixed 60 Hz tick. The world keeps the original 1600x1200 coordinates
// and constants; it is drawn at half size on an 800x600 screen.
//
// Three ships always fly, as in the original: player 1, player 2 and a CPU freighter. Player
// slots without a human are flown by the original AIs (a random one of its three per ship), so
// 1-player is you against two CPU ships, exactly like the original's 1-player mode.
//
// Changes from the original:
// - The original has no action key. FIRE is a second THRUST control (the stick's UP also
//   thrusts), so on a phone one thumb can steer while the other holds THRUST.
// - With humans playing, the game also ends once every human ship has crashed, instead of
//   leaving them to watch the CPUs finish.
// - Crashed ships leave a short burst of debris (the original just removed them), so a crash
//   reads at phone size.
// - The debug overlay (AI mode names over CPU ships) and the menu/restart keys are gone.

import { createRandomAI } from './spacewar/ai.js';
import {
  WORLD_W,
  WORLD_H,
  FPS,
  WHITE,
  RED,
  GREEN,
  YELLOW,
  MAX_ASTEROIDS,
  ZONE_SPAWN_INTERVAL,
  HUD_FONT,
  Ship,
  DeliveryZone,
  generateRandomAsteroids,
  randomPointAwayFrom,
  randint,
  uniform,
  rgb,
} from './spacewar/entities.js';

const W = 800;
const H = 600;
const SCALE = W / WORLD_W;
const CREDIT_GOAL = 5;
const STAR_COUNT = 100;
const AXIS_THRESHOLD = 0.5;

// P1 keeps the original's player green; P2 gets its own colour so two ships can be told apart;
// the CPU freighter keeps the original's AI blue, lifted so it shows on the CRT.
const SHIP_COLORS = [GREEN, [255, 70, 230], [70, 120, 255]];
const SHIP_POSITIONS = [
  [WORLD_W / 4, WORLD_H / 4],
  [(WORLD_W * 3) / 4, WORLD_H / 4],
  [WORLD_W / 2, (WORLD_H * 3) / 4],
];

export const meta = {
  id: 'spacewar',
  title: 'SPACEWAR',
  width: W,
  height: H,
  players: 2,
  // The original's bindings: P1 arrows, P2 WASD (no action key; FIRE is an extra THRUST).
  keyboard: {
    p1: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['Space'],
    },
    p2: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['ShiftLeft', 'KeyF'] },
  },
  keyHints: { p1: { stick: 'ARROWS', fire: 'SPACE' }, p2: { stick: 'WASD', fire: 'F' } },
};

class Debris {
  constructor(x, y, color) {
    this.age = 0;
    this.duration = 60;
    this.particles = Array.from({ length: 24 }, () => {
      const angle = uniform(0, Math.PI * 2);
      const speed = uniform(1, 5);
      return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: Math.random() < 0.5 ? color : YELLOW };
    });
  }

  update() {
    this.age++;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  get finished() {
    return this.age >= this.duration;
  }

  draw(ctx) {
    const alpha = 1 - this.age / this.duration;
    for (const p of this.particles) {
      ctx.fillStyle = rgb(p.color, alpha);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
  }
}

const NEUTRAL_BOT = Object.freeze({ x: 0, y: 0, buttons: { fire: false } });

class SpacewarGame {
  constructor(bots) {
    this.humans = bots.map((isBot) => !isBot);
    this.ships = SHIP_POSITIONS.map(([x, y], i) => {
      const label = i < 2 && this.humans[i] ? `P${i + 1}` : 'CPU';
      return new Ship(x, y, uniform(0, 360), SHIP_COLORS[i], label);
    });
    // Every ship that no human flies has an AI: CPU player slots and the third ship.
    this.ais = this.ships.map((ship, i) => (i < 2 && this.humans[i] ? null : createRandomAI(ship)));
    this.asteroids = generateRandomAsteroids(10, this.ships);
    this.zones = [];
    this.zoneSpawnTimer = randint(3 * FPS, 6 * FPS);
    this.debris = [];
    this.tick = 0;
    this.over = false;
    this.winner = null; // the winning Ship, if there is one
    this.botCache = new Map(); // player index -> [tick, input], so a re-ask in one tick is stable
  }

  get resultText() {
    if (!this.over) return '';
    if (this.winner) return this.winner.label === 'CPU' ? 'CPU WINS' : `PLAYER ${this.winner.label[1]} WINS`;
    if (this.ships.every((s) => s.destroyed)) return 'ALL SHIPS DESTROYED';
    return 'SHIP DESTROYED';
  }

  /** The CPU's stick and THRUST button for player slot i, from the original AI's decision. */
  botInput(index) {
    const ai = this.ais[index];
    if (index > 1 || !ai) throw new Error(`Player ${index + 1} is not a CPU player`);
    const cached = this.botCache.get(index);
    if (cached && cached[0] === this.tick) return cached[1];
    const ship = this.ships[index];
    let input = NEUTRAL_BOT;
    if (!ship.destroyed && !this.over) {
      const [thrust, rotation] = ai.decide(this.asteroids, this.zones);
      input = { x: rotation, y: 0, buttons: { fire: Boolean(thrust) } };
    }
    this.botCache.set(index, [this.tick, input]);
    return input;
  }

  update(input) {
    for (const d of this.debris) d.update();
    this.debris = this.debris.filter((d) => !d.finished);
    this.tick++;
    if (this.over) return;

    this.updateControls(input);
    for (const ship of this.ships) if (!ship.destroyed) ship.update();
    for (const asteroid of this.asteroids) asteroid.update();
    this.checkCollisions();
    if (this.asteroids.length < MAX_ASTEROIDS && Math.random() < 0.01) {
      this.asteroids.push(...generateRandomAsteroids(1, this.ships));
    }
    this.updateZones();
    this.spawnZones();
    this.checkWin();
  }

  updateControls(input) {
    this.ships.forEach((ship, i) => {
      if (ship.destroyed) return;
      if (i < 2) {
        // Player slots, human or CPU, both arrive through the virtual controls.
        const p = input.player(i);
        const rotation = p.x > AXIS_THRESHOLD ? 1 : p.x < -AXIS_THRESHOLD ? -1 : 0;
        const thrust = p.y < -AXIS_THRESHOLD || p.down('fire') ? 1 : 0;
        ship.setControls(thrust, rotation);
      } else {
        const [thrust, rotation] = this.ais[i].decide(this.asteroids, this.zones);
        ship.setControls(thrust, rotation);
      }
    });
  }

  checkCollisions() {
    const fragments = [];
    for (const ship of this.ships) {
      if (ship.destroyed) continue;
      const rock = this.asteroids.find((a) => ship.isColliding(a));
      if (!rock) continue;
      ship.destroyed = true;
      this.debris.push(new Debris(ship.x, ship.y, ship.color));
      fragments.push(...rock.breakApart());
      this.asteroids.splice(this.asteroids.indexOf(rock), 1);
    }
    this.asteroids.push(...fragments);
  }

  updateZones() {
    for (const zone of [...this.zones]) {
      zone.update();
      if (zone.isExpired()) this.zones.splice(this.zones.indexOf(zone), 1);
      for (const ship of this.ships) if (!ship.destroyed) zone.checkShipInteraction(ship);
    }
  }

  spawnZones() {
    this.zoneSpawnTimer--;
    if (this.zoneSpawnTimer > 0) return;
    if (this.zones.length === 0) {
      const entities = [...this.ships, ...this.asteroids];
      const pickup = new DeliveryZone(...randomPointAwayFrom(entities), 'pickup');
      this.zones.push(pickup);
      entities.push(pickup);
      this.zones.push(new DeliveryZone(...randomPointAwayFrom(entities, 300), 'dropoff'));
    }
    this.zoneSpawnTimer = ZONE_SPAWN_INTERVAL;
  }

  checkWin() {
    const rich = this.ships.find((s) => s.credits >= CREDIT_GOAL);
    const survivors = this.ships.filter((s) => !s.destroyed);
    if (rich) {
      this.over = true;
      this.winner = rich;
    } else if (survivors.length <= 1) {
      this.over = true;
      this.winner = survivors[0] ?? null;
    } else if (this.humans.some(Boolean) && this.ships.every((s, i) => !(i < 2 && this.humans[i]) || s.destroyed)) {
      this.over = true;
    }
  }

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // The original scatters 100 fresh random stars every frame (a twinkling field).
    for (let i = 0; i < STAR_COUNT; i++) {
      const b = randint(50, 200);
      ctx.fillStyle = `rgb(${b},${b},${b})`;
      ctx.fillRect(randint(0, W - 1), randint(0, H - 1), 2, 2);
    }

    ctx.save();
    ctx.scale(SCALE, SCALE);
    for (const zone of this.zones) zone.draw(ctx, this.tick);
    for (const asteroid of this.asteroids) asteroid.draw(ctx);
    for (const d of this.debris) d.draw(ctx);
    for (const ship of this.ships) if (!ship.destroyed) ship.draw(ctx);
    ctx.restore();

    this.drawHud(ctx);
  }

  drawHud(ctx) {
    ctx.font = `18px ${HUD_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let x = 12;
    for (const ship of this.ships) {
      const text = `${ship.label} $${ship.credits}${ship.hasCargo ? '*' : ''}`;
      ctx.fillStyle = ship.destroyed ? 'rgba(140,140,140,0.8)' : rgb(ship.color);
      ctx.fillText(text, x, 12);
      if (ship.destroyed) {
        ctx.fillStyle = rgb(RED);
        ctx.fillRect(x - 2, 20, ctx.measureText(text).width + 4, 3);
      }
      x += ctx.measureText(text).width + 24;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = rgb(WHITE);
    ctx.fillText(`GOAL $${CREDIT_GOAL}`, W - 12, 12);
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two player slots the CPU flies
 */
export function createGame({ bots }) {
  return new SpacewarGame(bots);
}
