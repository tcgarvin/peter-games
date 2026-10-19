// Orcs Must Die - 2D, ported from omd/ (main.py, config.py, entities.py, game_state.py,
// maze_generator.py, rendering.py). Co-op: two heroes defend the central objective from waves of
// orcs. One original frame runs per fixed 60 Hz tick; the original's millisecond timers
// (cooldowns, wave timer, enemy unstick logic) read a clock derived from the tick count.
//
// Changes from the original:
// - A corridor from a gate could end short of the cleared centre, sealing that gate's orcs in a
//   pocket (the wave then never ends). Each corridor is now joined to the centre.
// - The maze grid (30 px cells) covers 990x780 of the 1000x800 screen, which left an open strip
//   along the right and bottom edges that small orcs could walk down. Walls touching the grid's
//   right/bottom edge now extend to the screen edge.
// - Players never take damage in the original (only the objective does), so the game ends only
//   when the objective falls. That is kept; the unused player health bars are not drawn.
// - A swing that hits nothing shows a faint ring so a press always gives feedback; a "NEXT WAVE"
//   countdown is shown between waves. Player 1's blue is lightened to read on a CRT.

const W = 1000;
const H = 800;
const FRAME_MS = 1000 / 60;

const PLAYER_RADIUS = 20;
const PLAYER_SPEED = 5;
const PLAYER_ATTACK_RADIUS = 50;
const PLAYER_ATTACK_COOLDOWN = 500; // ms
const PLAYER_ATTACK_DAMAGE = 20;
const PLAYER_RGB = [[50, 100, 255], [0, 255, 0]];

const ENEMY_TYPES = {
  basic: { color: [255, 0, 0], radius: 15, speed: 2.0, health: 50, damage: 10, value: 10 },
  fast: { color: [255, 255, 0], radius: 10, speed: 3.0, health: 30, damage: 5, value: 15 },
  tank: { color: [128, 0, 128], radius: 25, speed: 1.0, health: 150, damage: 20, value: 25 },
};

const KNOCKBACK_FORCE = 8.0;
const WALL_RGB = [80, 70, 60];
const OBJECTIVE_RGB = [255, 165, 0];
const OBJECTIVE_RADIUS = 40;
const OBJECTIVE_HEALTH = 500;
const WAVE_COOLDOWN = 10000; // ms
const FIRST_WAVE_DELAY = 3000; // ms
const MAX_ENEMIES = 20;
const EFFECT_MS = 200;

const BASE_UNIT = ENEMY_TYPES.basic.radius * 2; // maze grid cell: one orc wide
const CORRIDOR_WIDTH = BASE_UNIT * 3;

const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'omd',
  title: 'ORCS MUST DIE - 2D',
  width: W,
  height: H,
  keyboard: {
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['Space'] },
    p2: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['ControlRight', 'Enter'],
    },
  },
  keyHints: { p1: { stick: 'WASD', fire: 'SPACE' }, p2: { stick: 'ARROWS', fire: 'R-CTRL' } },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const choice = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rgb = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

/** True if a circle at (x, y) comes within `radius` of any wall rectangle. */
function hitsWall(x, y, radius, obstacles) {
  for (const [ox, oy, ow, oh] of obstacles) {
    const nx = Math.max(ox, Math.min(x, ox + ow));
    const ny = Math.max(oy, Math.min(y, oy + oh));
    if (Math.hypot(nx - x, ny - y) < radius) return true;
  }
  return false;
}

const inBounds = (x, y, r) => r <= x && x <= W - r && r <= y && y <= H - r;

// --- maze ------------------------------------------------------------------------------------

/** Procedural maze: four gates, drunk-walk corridors to a clear centre (maze_generator.py). */
class MazeGenerator {
  constructor() {
    this.gridWidth = Math.floor(W / BASE_UNIT);
    this.gridHeight = Math.floor(H / BASE_UNIT);
    this.centerClearRadius = OBJECTIVE_RADIUS + CORRIDOR_WIDTH;
  }

  generate() {
    const grid = this.initializeGrid();
    const entrances = this.createEntrances(grid);
    this.createPathsToCenter(grid, entrances);
    this.addRandomConnections(grid);
    return { obstacles: this.gridToObstacles(grid), entrances, grid };
  }

  initializeGrid() {
    const grid = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(1));
    const cx = Math.floor(this.gridWidth / 2);
    const cy = Math.floor(this.gridHeight / 2);
    const r = Math.floor(this.centerClearRadius / BASE_UNIT);
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        if (Math.hypot(x - cx, y - cy) < r) grid[y][x] = 0;
      }
    }
    return grid;
  }

  createEntrances(grid) {
    const gw = this.gridWidth;
    const gh = this.gridHeight;
    const northX = randint(5, gw - 6);
    for (let i = 0; i < 3; i++) grid[0][northX + i] = 0;
    const eastY = randint(5, gh - 6);
    for (let i = 0; i < 3; i++) grid[eastY + i][gw - 1] = 0;
    const southX = randint(5, gw - 6);
    for (let i = 0; i < 3; i++) grid[gh - 1][southX + i] = 0;
    const westY = randint(5, gh - 6);
    for (let i = 0; i < 3; i++) grid[westY + i][0] = 0;
    return [
      [northX * BASE_UNIT + BASE_UNIT, 0],
      [W, eastY * BASE_UNIT + BASE_UNIT],
      [southX * BASE_UNIT + BASE_UNIT, H],
      [0, westY * BASE_UNIT + BASE_UNIT],
    ];
  }

  createPathsToCenter(grid, entrances) {
    const gw = this.gridWidth;
    const gh = this.gridHeight;
    const cx = Math.floor(gw / 2);
    const cy = Math.floor(gh / 2);
    const near = (x, y) => Math.abs(x - cx) < 5 && Math.abs(y - cy) < 5;
    for (const [ex, ey] of entrances) {
      let x = Math.min(gw - 1, Math.max(0, Math.floor(ex / BASE_UNIT)));
      let y = Math.min(gh - 1, Math.max(0, Math.floor(ey / BASE_UNIT)));
      let toX = cx - x;
      let toY = cy - y;
      while (!near(x, y)) {
        let stepX;
        let stepY;
        if (Math.abs(toX) > Math.abs(toY)) {
          stepX = toX > 0 ? 1 : -1;
          stepY = 0;
        } else {
          stepX = 0;
          stepY = toY > 0 ? 1 : -1;
        }
        if (Math.random() < 0.3 && Math.random() < 0.5) {
          stepX = stepX !== 0 ? 0 : choice([-1, 1]);
          stepY = stepY !== 0 ? 0 : choice([-1, 1]);
        }
        const steps = randint(3, 6);
        for (let s = 0; s < steps; s++) {
          const nx = Math.max(0, Math.min(gw - 1, x + stepX));
          const ny = Math.max(0, Math.min(gh - 1, y + stepY));
          this.carveCorridor(grid, x, y, nx, ny);
          x = nx;
          y = ny;
          toX = cx - x;
          toY = cy - y;
          if (near(x, y)) break;
        }
      }
      // Bug fix: the walk stops within 5 cells of the centre but the cleared circle has radius
      // 4, so a corridor could end in a sealed pocket and trap its orcs forever. Join it up.
      this.carveCorridor(grid, x, y, cx, y);
      this.carveCorridor(grid, cx, y, cx, cy);
    }
  }

  carveCorridor(grid, x1, y1, x2, y2) {
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    const distance = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= distance; i++) this.clear3x3(grid, x1 + i * dx, y1 + i * dy);
  }

  clear3x3(grid, x, y) {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cx = -1; cx <= 1; cx++) {
        const nx = x + cx;
        const ny = y + cy;
        if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) grid[ny][nx] = 0;
      }
    }
  }

  addRandomConnections(grid) {
    for (let i = 0; i < 10; i++) {
      const x = randint(5, this.gridWidth - 6);
      const y = randint(5, this.gridHeight - 6);
      if (grid[y][x] !== 1) continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (grid[y + dy]?.[x + dx] === 0) open++;
      }
      if (open >= 2) this.clear3x3(grid, x, y);
    }
  }

  /** Greedy rectangles of wall cells, in pixels; edge rectangles reach the screen edge. */
  gridToObstacles(grid) {
    const gw = this.gridWidth;
    const gh = this.gridHeight;
    const visited = new Set();
    const obstacles = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y][x] !== 1 || visited.has(y * gw + x)) continue;
        let width = 1;
        while (x + width < gw && grid[y][x + width] === 1) width++;
        let height = 1;
        while (y + height < gh && grid[y + height].slice(x, x + width).every((c) => c === 1)) height++;
        for (let ny = y; ny < y + height; ny++) {
          for (let nx = x; nx < x + width; nx++) visited.add(ny * gw + nx);
        }
        const px = x * BASE_UNIT;
        const py = y * BASE_UNIT;
        const pw = x + width === gw ? W - px : width * BASE_UNIT;
        const ph = y + height === gh ? H - py : height * BASE_UNIT;
        obstacles.push([px, py, pw, ph]);
      }
    }
    return obstacles;
  }
}

// --- entities --------------------------------------------------------------------------------

class Player {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.radius = PLAYER_RADIUS;
    this.color = PLAYER_RGB[index];
    this.direction = 0; // degrees
    this.attackCooldown = 0; // ms timestamp
    this.score = 0;
  }

  collides(x, y, obstacles) {
    return hitsWall(x, y, this.radius + 2, obstacles);
  }

  move(dx, dy, obstacles) {
    if (dx !== 0 || dy !== 0) this.direction = (Math.atan2(dy, dx) * 180) / Math.PI;
    const nx = this.x + dx * PLAYER_SPEED;
    const ny = this.y + dy * PLAYER_SPEED;
    if (this.radius <= nx && nx <= W - this.radius && !this.collides(nx, this.y, obstacles)) this.x = nx;
    if (this.radius <= ny && ny <= H - this.radius && !this.collides(this.x, ny, obstacles)) this.y = ny;
  }

  /** Swings if off cooldown. Returns null on cooldown, else the list of enemies hit. */
  attack(enemies, now) {
    if (this.attackCooldown > now) return null;
    this.attackCooldown = now + PLAYER_ATTACK_COOLDOWN;
    const hit = [];
    for (const enemy of enemies) {
      if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > PLAYER_ATTACK_RADIUS) continue;
      enemy.health -= PLAYER_ATTACK_DAMAGE;
      hit.push(enemy);
      if (enemy.health <= 0) this.score += enemy.value;
    }
    return hit;
  }

  draw(ctx) {
    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    const a = (this.direction * Math.PI) / 180;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}

class Enemy {
  constructor(x, y, type) {
    const spec = ENEMY_TYPES[type];
    this.x = x;
    this.y = y;
    this.type = type;
    this.color = spec.color;
    this.radius = spec.radius;
    this.speed = spec.speed;
    this.health = spec.health;
    this.maxHealth = spec.health;
    this.damage = spec.damage;
    this.value = spec.value;
    this.attackCooldown = 0;
    this.lastDirectionChange = 0;
  }

  get alive() {
    return this.health > 0;
  }

  free(x, y, obstacles) {
    return inBounds(x, y, this.radius) && !hitsWall(x, y, this.radius, obstacles);
  }

  /** Straight at the objective, else the original's wall-following fallbacks (entities.py). */
  move(ox, oy, obstacles, now) {
    const dx = ox - this.x;
    const dy = oy - this.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = this.x + (dx / distance) * this.speed;
    const ny = this.y + (dy / distance) * this.speed;
    if (this.free(nx, ny, obstacles)) {
      this.x = nx;
      this.y = ny;
      return;
    }

    const perpendicular = Math.abs(dx) > Math.abs(dy) ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    const diagonals = [[0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]];
    const directions = [...perpendicular, ...diagonals, [1, 0], [0, 1], [-1, 0], [0, -1]];

    if (now - this.lastDirectionChange > 1000) {
      for (const [ddx, ddy] of diagonals) {
        const tx = this.x + ddx * this.speed * 2;
        const ty = this.y + ddy * this.speed * 2;
        if (this.free(tx, ty, obstacles) && Math.hypot(tx - ox, ty - oy) < distance) {
          this.x += ddx * this.speed;
          this.y += ddy * this.speed;
          this.lastDirectionChange = now;
          return;
        }
      }
    }

    for (const [ddx, ddy] of directions) {
      const step = ddx !== 0 && ddy !== 0 ? this.speed * 0.7 : this.speed;
      const tx = this.x + ddx * step;
      const ty = this.y + ddy * step;
      if (!this.free(tx, ty, obstacles)) continue;
      const newDist = Math.hypot(tx - ox, ty - oy);
      if (newDist <= distance || now - this.lastDirectionChange > 500) {
        this.x = tx;
        this.y = ty;
        if (newDist > distance) this.lastDirectionChange = now;
        return;
      }
    }

    if (now - this.lastDirectionChange > 1500) {
      const angle = Math.random() * Math.PI * 2;
      const tx = this.x + Math.cos(angle) * this.speed;
      const ty = this.y + Math.sin(angle) * this.speed;
      if (this.free(tx, ty, obstacles)) {
        this.x = tx;
        this.y = ty;
        this.lastDirectionChange = now;
      }
    }
  }

  attackObjective(objective, now) {
    if (Math.hypot(objective.x - this.x, objective.y - this.y) > this.radius + objective.radius) return;
    if (this.attackCooldown > now) return;
    objective.health -= this.damage;
    this.attackCooldown = now + 1000;
  }

  draw(ctx) {
    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    drawHealthBar(ctx, this.x - this.radius, this.y - this.radius - 9, this.radius * 2, 5, this.health / this.maxHealth);
  }
}

class Objective {
  constructor() {
    this.x = W / 2;
    this.y = H / 2;
    this.radius = OBJECTIVE_RADIUS;
    this.health = OBJECTIVE_HEALTH;
  }

  get alive() {
    return this.health > 0;
  }

  draw(ctx) {
    ctx.fillStyle = rgb(OBJECTIVE_RGB);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    const fraction = Math.max(0, this.health) / OBJECTIVE_HEALTH;
    drawHealthBar(ctx, this.x - this.radius, this.y - this.radius - 18, this.radius * 2, 10, fraction);
  }
}

function drawHealthBar(ctx, x, y, w, h, fraction) {
  ctx.fillStyle = '#f00';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#0f0';
  ctx.fillRect(x, y, w * clamp(fraction, 0, 1), h);
}

class AttackEffect {
  constructor(x, y, color, hit) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.hit = hit;
    this.remaining = EFFECT_MS;
  }

  update() {
    this.remaining -= FRAME_MS;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.remaining / EFFECT_MS);
    ctx.beginPath();
    ctx.arc(this.x, this.y, PLAYER_ATTACK_RADIUS, 0, Math.PI * 2);
    if (this.hit) {
      ctx.fillStyle = rgb(this.color, alpha);
      ctx.fill();
    } else {
      ctx.strokeStyle = rgb(this.color, alpha * 0.6);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

// --- CPU defender ----------------------------------------------------------------------------

const NAV_CELL = 10;
const NAV_W = W / NAV_CELL;
const NAV_H = H / NAV_CELL;
// A hero anywhere in an open cell (up to ~7 px off its centre) still clears the walls.
const NAV_CLEARANCE = PLAYER_RADIUS + 2 + 8;
const NAV_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Walkable 10 px cells for a hero, so the CPU can route through the maze. */
function buildNavGrid(obstacles) {
  const open = new Uint8Array(NAV_W * NAV_H);
  for (let cy = 0; cy < NAV_H; cy++) {
    for (let cx = 0; cx < NAV_W; cx++) {
      const x = cx * NAV_CELL + NAV_CELL / 2;
      const y = cy * NAV_CELL + NAV_CELL / 2;
      open[cy * NAV_W + cx] = inBounds(x, y, PLAYER_RADIUS) && !hitsWall(x, y, NAV_CLEARANCE, obstacles) ? 1 : 0;
    }
  }
  return open;
}

const NEUTRAL = Object.freeze({ x: 0, y: 0, buttons: {} });

/**
 * A CPU hero. It routes through the maze (breadth-first over the nav grid) to the orc that is
 * closest to the objective, weighting by how far it would have to run, and holds ATTACK when an
 * orc is in reach. It re-plans only every few ticks and dawdles a little, so it can be beaten.
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.target = null;
    this.replanIn = 0;
    this.path = [];
    this.hesitate = 0;
  }

  input() {
    const game = this.game;
    if (game.over) return NEUTRAL;
    const me = game.players[this.index];
    const reach = game.enemies.some((e) => Math.hypot(e.x - me.x, e.y - me.y) <= PLAYER_ATTACK_RADIUS - 4);

    if (this.hesitate > 0) {
      this.hesitate--;
      return { x: 0, y: 0, buttons: { fire: reach } };
    }
    if (--this.replanIn <= 0 || (this.target && !this.target.alive)) this.plan(me);

    const goal = this.nextWaypoint(me);
    if (!goal) return { x: 0, y: 0, buttons: { fire: reach } };
    const dx = goal[0] - me.x;
    const dy = goal[1] - me.y;
    const len = Math.hypot(dx, dy);
    // Stand still once the target is comfortably in reach.
    const close = this.target && Math.hypot(this.target.x - me.x, this.target.y - me.y) < PLAYER_ATTACK_RADIUS * 0.6;
    if (len < 3 || close) return { x: 0, y: 0, buttons: { fire: reach } };
    return { x: dx / len, y: dy / len, buttons: { fire: reach } };
  }

  plan(me) {
    const game = this.game;
    this.replanIn = 12;
    if (Math.random() < 0.04) this.hesitate = 20 + Math.floor(Math.random() * 30);
    const dist = this.distancesFrom(me.x, me.y);
    const partner = game.players[1 - this.index];
    const partnerTarget = game.bots[1 - this.index]?.target;
    let best = null;
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const cell = this.nearestOpen(enemy.x, enemy.y, dist, 7);
      if (cell < 0) continue;
      const run = dist[cell] * NAV_CELL;
      const threat = Math.hypot(enemy.x - game.objective.x, enemy.y - game.objective.y);
      let score = threat + run * 0.6;
      // Leave the partner's orc to the partner when there's anything else to do.
      if (enemy === partnerTarget || Math.hypot(enemy.x - partner.x, enemy.y - partner.y) < 40) score += 250;
      if (!best || score < best.score) best = { enemy, cell, score };
    }
    if (best) {
      this.target = best.enemy;
      this.path = this.pathTo(best.cell, dist);
    } else {
      // Between waves: guard a spot beside the objective.
      this.target = null;
      const gx = game.objective.x + (this.index === 0 ? -80 : 80);
      const cell = this.nearestOpen(gx, game.objective.y, dist, 8);
      this.path = cell >= 0 ? this.pathTo(cell, dist) : [];
    }
  }

  /** Breadth-first step counts over the nav grid from (x, y). */
  distancesFrom(x, y) {
    const open = this.game.nav;
    const dist = new Int32Array(NAV_W * NAV_H).fill(-1);
    const start = clamp(Math.floor(y / NAV_CELL), 0, NAV_H - 1) * NAV_W + clamp(Math.floor(x / NAV_CELL), 0, NAV_W - 1);
    const queue = new Int32Array(NAV_W * NAV_H);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % NAV_W;
      const cy = (c - cx) / NAV_W;
      for (const [sx, sy] of NAV_STEPS) {
        const nx = cx + sx;
        const ny = cy + sy;
        if (nx < 0 || ny < 0 || nx >= NAV_W || ny >= NAV_H) continue;
        const n = ny * NAV_W + nx;
        if (dist[n] >= 0 || !open[n]) continue;
        // No corner cutting: both orthogonal neighbours must be open for a diagonal step.
        if (sx && sy && (!open[cy * NAV_W + nx] || !open[ny * NAV_W + cx])) continue;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
    return dist;
  }

  /** The reachable cell closest to (x, y), searching `range` cells around it; -1 if none. */
  nearestOpen(x, y, dist, range) {
    const cx = Math.floor(x / NAV_CELL);
    const cy = Math.floor(y / NAV_CELL);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= range && best < 0; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= NAV_W || ny >= NAV_H) continue;
          const n = ny * NAV_W + nx;
          if (dist[n] < 0) continue;
          const d = ox * ox + oy * oy;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    return best;
  }

  /** Cell centres from the start towards `cell`, following decreasing distance. */
  pathTo(cell, dist) {
    const path = [];
    let c = cell;
    while (dist[c] > 0) {
      const cx = c % NAV_W;
      const cy = (c - cx) / NAV_W;
      path.push([cx * NAV_CELL + NAV_CELL / 2, cy * NAV_CELL + NAV_CELL / 2]);
      let next = c;
      for (const [sx, sy] of NAV_STEPS) {
        const nx = cx + sx;
        const ny = cy + sy;
        if (nx < 0 || ny < 0 || nx >= NAV_W || ny >= NAV_H) continue;
        const n = ny * NAV_W + nx;
        if (dist[n] >= 0 && dist[n] === dist[c] - 1) {
          next = n;
          break;
        }
      }
      if (next === c) break;
      c = next;
    }
    return path.reverse();
  }

  nextWaypoint(me) {
    // Drop waypoints already reached, then aim a few cells ahead for smoother steering.
    while (this.path.length && Math.hypot(this.path[0][0] - me.x, this.path[0][1] - me.y) < NAV_CELL * 1.5) {
      this.path.shift();
    }
    if (this.target && this.path.length <= 2) return [this.target.x, this.target.y];
    return this.path[Math.min(2, this.path.length - 1)] ?? null;
  }
}

// --- game ------------------------------------------------------------------------------------

class OmdGame {
  constructor(bots) {
    const maze = new MazeGenerator().generate();
    this.obstacles = maze.obstacles;
    this.entrances = maze.entrances;
    this.nav = buildNavGrid(this.obstacles);
    this.objective = new Objective();
    this.players = [
      new Player(...this.safePosition(W / 4, H / 2), 0),
      new Player(...this.safePosition((3 * W) / 4, H / 2), 1),
    ];
    this.enemies = [];
    this.effects = [];
    this.score = 0;
    this.waveNumber = 0;
    this.waveInProgress = false;
    this.waveTimer = FIRST_WAVE_DELAY;
    this.over = false;
    this.tick = 0;
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  /** Current time in ms, from the tick count (replaces pygame.time.get_ticks()). */
  get now() {
    return this.tick * FRAME_MS;
  }

  get resultText() {
    return this.over ? `WAVE ${this.waveNumber} REACHED` : '';
  }

  /** The preferred spot if it's clear, else a random clear one (main.py find_safe_position). */
  safePosition(x, y) {
    const blocked = (px, py) => !inBounds(px, py, PLAYER_RADIUS) || hitsWall(px, py, PLAYER_RADIUS + 5, this.obstacles);
    if (!blocked(x, y)) return [x, y];
    for (let i = 0; i < 100; i++) {
      const px = randint(PLAYER_RADIUS + 50, W - PLAYER_RADIUS - 50);
      const py = randint(PLAYER_RADIUS + 50, H - PLAYER_RADIUS - 50);
      if (!blocked(px, py)) return [px, py];
    }
    return [W / 2, H / 2];
  }

  botInput(index) {
    const bot = this.bots[index];
    if (!bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return bot.input();
  }

  update(input) {
    this.tick++;
    for (const e of this.effects) e.update();
    this.effects = this.effects.filter((e) => e.remaining > 0);
    if (this.over) return;
    this.updateWorld();
    if (this.over) return;
    this.players.forEach((player, i) => this.handlePlayer(player, input.player(i)));
    this.knockback();
  }

  updateWorld() {
    const now = this.now;
    if (!this.objective.alive) {
      this.over = true;
      return;
    }
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        this.score += enemy.value;
        continue;
      }
      enemy.move(this.objective.x, this.objective.y, this.obstacles, now);
      enemy.attackObjective(this.objective, now);
    }
    this.enemies = this.enemies.filter((e) => e.alive);
    if (this.waveInProgress && this.enemies.length === 0) {
      this.waveInProgress = false;
      this.waveTimer = now + WAVE_COOLDOWN;
    }
    if (!this.waveInProgress && now >= this.waveTimer) this.startWave();
  }

  startWave() {
    this.waveNumber++;
    this.waveInProgress = true;
    const count = Math.min(5 + this.waveNumber * 2, MAX_ENEMIES);
    const types = ['basic'];
    if (this.waveNumber >= 3) types.push('fast');
    if (this.waveNumber >= 5) types.push('tank');
    for (let i = 0; i < count; i++) {
      const [ex, ey] = choice(this.entrances);
      const x = clamp(ex + randint(-15, 15), 30, W - 30);
      const y = clamp(ey + randint(-15, 15), 30, H - 30);
      this.enemies.push(new Enemy(x, y, choice(types)));
    }
  }

  handlePlayer(player, controls) {
    let dx = Math.abs(controls.x) < 0.2 ? 0 : controls.x;
    let dy = Math.abs(controls.y) < 0.2 ? 0 : controls.y;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    player.move(dx, dy, this.obstacles);
    if (!controls.down('fire')) return;
    const hit = player.attack(this.enemies, this.now);
    if (hit) this.effects.push(new AttackEffect(player.x, player.y, player.color, hit.length > 0));
  }

  /** Orcs shove heroes they touch (game_state.py check_collisions). */
  knockback() {
    for (const player of this.players) {
      for (const enemy of this.enemies) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= player.radius + enemy.radius) continue;
        const d = Math.max(1, distance);
        const nx = clamp(player.x + (dx / d) * KNOCKBACK_FORCE, player.radius, W - player.radius);
        const ny = clamp(player.y + (dy / d) * KNOCKBACK_FORCE, player.radius, H - player.radius);
        if (!player.collides(nx, ny, this.obstacles)) {
          player.x = nx;
          player.y = ny;
        }
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgb(WALL_RGB);
    for (const [x, y, w, h] of this.obstacles) ctx.fillRect(x, y, w, h);
    this.objective.draw(ctx);
    for (const enemy of this.enemies) enemy.draw(ctx);
    for (const player of this.players) player.draw(ctx);
    for (const effect of this.effects) effect.draw(ctx);
    this.drawHud(ctx);
  }

  drawHud(ctx) {
    ctx.font = `22px ${HUD_FONT}`;
    ctx.textBaseline = 'top';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    const text = (s, x, y, color, align) => {
      ctx.textAlign = align;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    };
    text(`WAVE ${this.waveNumber}`, 20, 20, '#fff', 'left');
    text(`SCORE ${this.score}`, 20, 54, '#fff', 'left');
    this.players.forEach((p, i) => {
      const who = this.bots[i] ? 'CPU' : `P${i + 1}`;
      text(`${who} ${p.score}`, W - 20, 20 + i * 34, rgb(p.color), 'right');
    });
    if (!this.over && !this.waveInProgress) {
      const secs = Math.max(0, Math.ceil((this.waveTimer - this.now) / 1000));
      ctx.font = `20px ${HUD_FONT}`;
      text(`WAVE ${this.waveNumber + 1} IN ${secs}`, W / 2, H - 50, '#ffa500', 'center');
    }
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two heroes the CPU controls
 */
export function createGame({ bots }) {
  return new OmdGame(bots);
}
