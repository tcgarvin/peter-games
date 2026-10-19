// Flappy Bird (2 players), ported from flappy2/flappy_2player.py ("two_player" mode).
// Physics run once per fixed 60 Hz tick with the original per-frame constants.
//
// Changes from the original:
// - Scoring bug fixed: the original marked a pipe "passed" as soon as the right-hand bird (P2)
//   passed it, so the left-hand bird (P1) could never score. Each bird now scores its own pipes.
// - The 3-2-1 countdown is kept (in ticks, not time.sleep); the menus, mode select, pause and
//   restart keys are the shell's job now.
// - The end rule is the original's: the game ends as soon as anyone crashes. The survivor wins;
//   if both crash on the same tick, the higher score wins. After the crash the world freezes so
//   only the explosion plays out (the original kept running for the explosion, then cut away).

const W = 800;
const H = 600;
const GRAVITY = 0.25;
const FLAP_STRENGTH = -7;
const PIPE_SPEED = 2;
const PIPE_INTERVAL = 132; // the original's 2200 ms at 60 frames per second
const PIPE_GAP = 200;
const PIPE_WIDTH = 50;
const BIRD_RADIUS = 15;
const COUNTDOWN = 180; // the original's "3, 2, 1" (one second each)
const SHAKE_DECAY = 0.9;

const GREEN = '#00ff00';
const PIPE_EDGE = '#00a000';
const PLAYER_RGB = [
  [255, 0, 0],
  [0, 0, 255],
];
// The original's pure blue is nearly invisible on black through the CRT; the HUD uses a lighter one.
const HUD_COLORS = ['#ff5a5a', '#7aa2ff'];
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'flappy',
  title: 'FLAPPY',
  width: W,
  height: H,
  players: 2,
  // Simultaneous play: the original's W (P1) and Up (P2), plus Space for P1. (Enter is left out
  // because the shell uses it for START, which would quit from the pause screen.)
  keyboard: {
    p1: { fire: ['KeyW', 'Space'] },
    p2: { fire: ['ArrowUp'] },
  },
  keyHints: { p1: { fire: 'W' }, p2: { fire: 'UP' } },
};

const randint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const uniform = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

class Particle {
  constructor(props) {
    Object.assign(this, props);
    this.originalSize = this.size;
    this.maxLifetime = props.maxLifetime ?? this.lifetime;
    this.trailCount = 0;
  }
}

/** The original's three-phase explosion: expanding rings, a hot centre, and particles with trails. */
class Explosion {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.radius = BIRD_RADIUS;
    this.maxRadius = 80;
    this.speed = 1.5;
    this.phase = 0;
    this.particles = [];
    this.done = false;
    this.addParticles(50, false);
  }

  addParticles(count, secondary) {
    const vary = (c, d) => clamp(c + randint(-d, d), 0, 255);
    for (let i = 0; i < count; i++) {
      const angle = uniform(0, Math.PI * 2);
      let speed, size, lifetime, color;
      if (secondary) {
        speed = uniform(2, 8);
        size = randint(1, 6);
        lifetime = randint(30, 60);
        color = Math.random() < 0.3 ? [255, 255, randint(0, 100)] : this.color.map((c) => vary(c, 30));
      } else {
        speed = uniform(1, 6);
        size = randint(3, 10);
        lifetime = randint(40, 80);
        color = Math.random() < 0.6 ? [randint(200, 255), randint(50, 150), 0] : this.color.map((c) => vary(c, 20));
      }
      this.particles.push(
        new Particle({
          x: this.x + (secondary ? uniform(-5, 5) : 0),
          y: this.y + (secondary ? uniform(-5, 5) : 0),
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
          gravity: Math.random() < 0.7 ? uniform(0, 0.1) : 0,
          size,
          lifetime,
          color,
          trail: Math.random() < 0.3,
        }),
      );
    }
  }

  update() {
    if (this.done) return;
    if (this.phase === 0 && this.radius > this.maxRadius * 0.3) {
      this.phase = 1;
      this.addParticles(30, true);
    } else if (this.phase === 1 && this.radius > this.maxRadius * 0.6) {
      this.phase = 2;
      this.addParticles(40, true);
    }
    this.radius += this.speed;
    if (this.radius > this.maxRadius) {
      this.radius = this.maxRadius;
      if (this.particles.length === 0) this.done = true;
    }

    const survivors = [];
    const trails = [];
    for (const p of this.particles) {
      p.x += p.dx;
      p.y += p.dy;
      p.dy += p.gravity;
      p.lifetime--;
      p.size = p.originalSize * Math.max(0.5, p.lifetime / p.maxLifetime);
      if (p.lifetime <= 0) continue;
      survivors.push(p);
      if (p.trail && Math.random() < 0.3) {
        p.trailCount++;
        if (p.trailCount % 2 === 0) {
          trails.push(
            new Particle({
              x: p.x,
              y: p.y,
              dx: 0,
              dy: 0,
              gravity: 0,
              size: p.size * 0.6,
              lifetime: randint(5, 10),
              maxLifetime: 10,
              color: p.color.map((c) => Math.min(255, c + 50)),
              trail: false,
            }),
          );
        }
      }
    }
    this.particles = survivors.concat(trails);
  }

  draw(ctx) {
    if (this.done) return;
    const bright = this.color.map((c) => Math.min(255, c + 50));
    ctx.strokeStyle = rgb(this.color);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgb(bright);
    ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      const r = this.radius * (0.8 - i * 0.15);
      if (r <= 0) continue;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.radius < this.maxRadius * 0.7) {
      const r = Math.max(5, BIRD_RADIUS * (1 - this.radius / this.maxRadius));
      ctx.fillStyle = 'rgb(255,255,200)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.particles) {
      ctx.fillStyle = rgb(p.color);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Bird {
  constructor(x, index) {
    this.x = x;
    this.y = H / 2;
    this.vel = 0;
    this.index = index;
    this.color = PLAYER_RGB[index];
    this.radius = BIRD_RADIUS;
    this.alive = true;
    this.score = 0;
    this.explosion = null;
  }

  flap() {
    if (this.alive) this.vel = FLAP_STRENGTH;
  }

  update() {
    if (!this.alive) {
      this.explosion?.update();
      return;
    }
    this.vel += GRAVITY;
    this.y += this.vel;
    if (this.y <= this.radius) {
      this.y = this.radius;
      this.vel = 0;
    } else if (this.y >= H - this.radius) {
      this.y = H - this.radius;
      this.crash();
    }
  }

  overlapsX(pipe) {
    return this.x + this.radius > pipe.x && this.x - this.radius < pipe.x + pipe.width;
  }

  checkCollision(pipes) {
    if (!this.alive) return;
    for (const pipe of pipes) {
      if (!this.overlapsX(pipe)) continue;
      if (this.y - this.radius < pipe.height || this.y + this.radius > pipe.height + PIPE_GAP) {
        this.crash();
        return;
      }
    }
  }

  crash() {
    this.alive = false;
    this.explosion = new Explosion(this.x, this.y, this.color);
  }

  draw(ctx, bob) {
    if (!this.alive) {
      this.explosion?.draw(ctx);
      return;
    }
    ctx.fillStyle = rgb(this.color);
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // A light rim so the dark blue bird still reads on black through the CRT.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

class Pipe {
  constructor() {
    this.x = W;
    this.width = PIPE_WIDTH;
    this.height = randint(100, H - PIPE_GAP - 100); // bottom of the top pipe
    this.passedBy = [false, false];
  }

  get gapCenter() {
    return this.height + PIPE_GAP / 2;
  }

  /** False once the pipe has left the screen. */
  update() {
    this.x -= PIPE_SPEED;
    return this.x > -this.width;
  }

  draw(ctx) {
    ctx.fillStyle = GREEN;
    ctx.fillRect(this.x, 0, this.width, this.height);
    ctx.fillRect(this.x, this.height + PIPE_GAP, this.width, H - this.height - PIPE_GAP);
    ctx.strokeStyle = PIPE_EDGE;
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x + 1.5, -2, this.width - 3, this.height + 0.5);
    ctx.strokeRect(this.x + 1.5, this.height + PIPE_GAP + 1.5, this.width - 3, H);
  }
}

const IDLE = Object.freeze({ x: 0, y: 0, buttons: {} });
const HOLD_TICKS = 4; // how long the CPU keeps FLAP down, so the panel shows the press

/**
 * CPU flapper. It flies a little below the centre of the next gap (a flap climbs ~100 px, so
 * flapping from below the centre peaks safely under the top pipe) and presses FLAP like a
 * person would. Each pipe it may misjudge the gap height or react late; the chance grows with
 * its score so attract-mode demos always end.
 */
class Bot {
  constructor(game, index) {
    this.game = game;
    this.index = index;
    this.hold = 0;
    this.released = true;
    this.plannedPipe = null;
    this.error = 0;
    this.lag = 0;
  }

  input() {
    if (this.hold > 0) {
      this.hold--;
      return { x: 0, y: 0, buttons: { fire: true } };
    }
    if (!this.released) {
      this.released = true;
      return IDLE;
    }
    const game = this.game;
    const bird = game.birds[this.index];
    if (game.over || game.countdown > 0 || !bird.alive) return IDLE;

    const pipe = game.nextPipe(bird);
    if (pipe && pipe !== this.plannedPipe) this.planFor(pipe, bird.score);
    const aimY = (pipe ? pipe.gapCenter : H / 2) + 35 + this.error;
    const wantsFlap = bird.y >= aimY && bird.vel >= 0;
    if (!wantsFlap) return IDLE;
    if (this.lag > 0) {
      this.lag--;
      return IDLE;
    }
    this.hold = HOLD_TICKS - 1;
    this.released = false;
    return { x: 0, y: 0, buttons: { fire: true } };
  }

  planFor(pipe, score) {
    this.plannedPipe = pipe;
    this.error = uniform(-8, 8);
    this.lag = 0;
    const misjudge = Math.min(0.5, 0.05 + score * 0.012);
    if (Math.random() < misjudge) {
      if (Math.random() < 0.5) this.error = (Math.random() < 0.5 ? -1 : 1) * uniform(55, 95);
      else this.lag = randint(10, 22);
    }
  }
}

class FlappyGame {
  constructor(bots) {
    this.birds = [new Bird(W / 4, 0), new Bird((3 * W) / 4, 1)];
    this.pipes = [];
    this.sincePipe = PIPE_INTERVAL; // the original's first pipe appears as play begins
    // Attract mode (all CPUs) skips the countdown so it doesn't fight the shell's title card.
    this.countdown = bots.every(Boolean) ? 0 : COUNTDOWN;
    this.over = false;
    this.winner = -1;
    this.tick = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.bots = bots.map((isBot, i) => (isBot ? new Bot(this, i) : null));
  }

  get resultText() {
    if (!this.over) return '';
    return this.winner < 0 ? 'TIE GAME' : `PLAYER ${this.winner + 1} WINS`;
  }

  botInput(index) {
    const bot = this.bots[index];
    if (!bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return bot.input();
  }

  /** The first pipe the bird has not yet cleared, or null. */
  nextPipe(bird) {
    return this.pipes.find((p) => p.x + p.width > bird.x - bird.radius) ?? null;
  }

  update(input) {
    this.tick++;
    this.updateShake();
    if (this.over) {
      for (const bird of this.birds) if (!bird.alive) bird.update();
      return;
    }
    if (this.countdown > 0) {
      this.countdown--;
      return;
    }

    this.birds.forEach((bird, i) => {
      if (input.player(i).pressed('fire')) bird.flap();
    });

    this.sincePipe++;
    if (this.sincePipe > PIPE_INTERVAL) {
      this.pipes.push(new Pipe());
      this.sincePipe = 0;
    }
    for (const bird of this.birds) bird.update();
    this.pipes = this.pipes.filter((p) => p.update());
    for (const bird of this.birds) bird.checkCollision(this.pipes);
    this.score();

    const crashed = this.birds.filter((b) => !b.alive);
    if (crashed.length > 0) {
      this.shake = 20;
      this.over = true;
      this.winner = this.pickWinner();
    }
  }

  score() {
    for (const pipe of this.pipes) {
      this.birds.forEach((bird, i) => {
        if (!pipe.passedBy[i] && pipe.x < bird.x) {
          pipe.passedBy[i] = true;
          if (bird.alive) bird.score++;
        }
      });
    }
  }

  pickWinner() {
    const [a, b] = this.birds;
    if (a.alive !== b.alive) return a.alive ? 0 : 1;
    if (a.score !== b.score) return a.score > b.score ? 0 : 1;
    return -1;
  }

  updateShake() {
    if (this.shake > 0.5) {
      this.shakeX = uniform(-this.shake, this.shake);
      this.shakeY = uniform(-this.shake, this.shake);
      this.shake *= SHAKE_DECAY;
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    for (const pipe of this.pipes) pipe.draw(ctx);
    ctx.fillStyle = '#fff';
    ctx.fillRect(W / 2 - 1.5, -30, 3, H + 60);
    // Birds idle with a gentle bob while waiting to start and after winning.
    const bob = this.countdown > 0 || this.over ? Math.sin(this.tick * 0.12) * 5 : 0;
    for (const bird of this.birds) bird.draw(ctx, bob);
    ctx.restore();

    this.drawHud(ctx);
    if (this.countdown > 0 && this.countdown < COUNTDOWN) {
      ctx.font = `72px ${HUD_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#000';
      const text = String(Math.ceil(this.countdown / 60));
      ctx.strokeText(text, W / 2, H / 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, W / 2, H / 2);
    }
  }

  drawHud(ctx) {
    ctx.font = `26px ${HUD_FONT}`;
    ctx.textBaseline = 'top';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    this.birds.forEach((bird, i) => {
      const who = this.bots[i] && this.bots.some((b) => !b) ? 'CPU' : `P${i + 1}`;
      const text = `${who} ${bird.score}`;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const x = i === 0 ? 16 : W - 16;
      ctx.strokeText(text, x, 16);
      ctx.fillStyle = HUD_COLORS[i];
      ctx.fillText(text, x, 16);
    });
  }
}

/**
 * @param {{bots: boolean[]}} options which of the two players the CPU controls
 */
export function createGame({ bots }) {
  return new FlappyGame(bots);
}
