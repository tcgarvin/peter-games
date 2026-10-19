// Quarterback Simulator, ported from quarterback/game.py. A guest game: one of the Bullock
// brothers made it with Tim in about one prompt, the first time he had used AI.
// Physics run once per fixed 60 Hz tick with the original per-frame constants.
//
// Changes from the original:
// - "Press R" between plays is gone: the result of each play shows for a moment, then the next
//   down lines up by itself. A turnover on downs ends the game.
// - The ball now lands on the turf (y = 500, where the throw arc already ended) instead of 50 px
//   inside it.
// - Two defenders tackling at once cost two downs, and a tackle in the end zone counted as both a
//   tackle and a touchdown. A tackle now ends the play once.
// - The yard lines were drawn underneath the turf and never seen; they're drawn on it now.
// - Stick figures and HUD are drawn thicker and larger, to read through the CRT at phone size.

const W = 1200;
const H = 600;
const GRAVITY = 0.8;
const JUMP_STRENGTH = -15;
const PLAYER_SPEED = 5;
const DEFENDER_SPEED = 2;
const ENDZONE_START = W - 150;
const TURF_Y = H - 100;
const PLAYER_W = 30;
const PLAYER_H = 50;
const BALL_RADIUS = 8;
const MIN_THROW_POWER = 40;
const MAX_THROW_POWER = 150;
const THROW_ANGLE = Math.PI / 4;
const ROUTE_LENGTH = 300;
const PLAY_PAUSE = 100; // ticks the result of a play stays up before the next down

const WHITE = '#fff';
const BLACK = '#000';
const GREEN = 'rgb(50, 150, 50)';
const DARK_GREEN = 'rgb(30, 100, 30)';
const BLUE = 'rgb(50, 100, 255)';
const RED = 'rgb(255, 50, 50)';
const YELLOW = 'rgb(255, 255, 100)';
const ENDZONE = 'rgb(100, 100, 255)';
const HUD_FONT = '"Press Start 2P", monospace';

export const meta = {
  id: 'quarterback',
  title: 'QUARTERBACK',
  width: W,
  height: H,
  players: 1,
  keyboard: {
    p1: {
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      fire: ['Space'],
      fire2: ['KeyF'],
    },
  },
  keyHints: { stick: 'ARROWS', fire: 'SPACE', fire2: 'F' },
};

const rectOf = (p) => ({ x: Math.trunc(p.x), y: Math.trunc(p.y), w: PLAYER_W, h: PLAYER_H });
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function newPlayer(x, label) {
  return { x, y: H - 200, vx: 0, vy: 0, onGround: false, walkFrame: 0, animation: 0, label };
}

/** The original Player.update: gravity, the turf, the screen edges, the walking animation. */
function updatePlayer(p) {
  p.vy += GRAVITY;
  p.x += p.vx;
  p.y += p.vy;
  const ground = TURF_Y - PLAYER_H;
  if (p.y >= ground) {
    p.y = ground;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }
  p.x = Math.max(0, Math.min(W - PLAYER_W, p.x));
  if (Math.abs(p.vx) > 0.5 && p.onGround) {
    p.animation++;
    if (p.animation >= 8) {
      p.walkFrame = 1 - p.walkFrame;
      p.animation = 0;
    }
  } else {
    p.walkFrame = 0;
    p.animation = 0;
  }
}

function jump(p) {
  if (p.onGround) p.vy = JUMP_STRENGTH;
}

/** One play, from the snap until it ends. Plain data, so the CPU can try moves on a copy. */
class Play {
  constructor() {
    this.qb = { ...newPlayer(100, 'QB'), hasBall: true };
    this.wr = { ...newPlayer(150, 'WR'), hasBall: false, route: 0 };
    this.defenders = [newPlayer(600, 'D'), newPlayer(800, 'D')];
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, active: false, caught: false };
    this.controlled = 'qb';
    this.charging = false;
    this.power = 0;
    this.powerDir = 1;
    this.result = null; // 'tackled' | 'touchdown' | 'incomplete' once the play is over
  }

  clone() {
    return Object.assign(Object.create(Play.prototype), structuredClone({ ...this }));
  }

  get carrier() {
    if (this.qb.hasBall) return this.qb;
    if (this.wr.hasBall) return this.wr;
    return null;
  }

  get player() {
    return this.controlled === 'qb' ? this.qb : this.wr;
  }

  /**
   * One original frame: the key events, then Game.update.
   * @param {number} dir -1, 0 or 1
   * @param {boolean} jumpPressed JUMP went down this tick
   * @param {boolean} throwPressed THROW went down this tick
   * @param {boolean} throwHeld THROW is held
   */
  step(dir, jumpPressed, throwPressed, throwHeld) {
    if (this.result) return;
    if (jumpPressed) jump(this.player);
    if (throwPressed && this.controlled === 'qb' && this.qb.hasBall) {
      this.charging = true;
      this.power = MIN_THROW_POWER;
      this.powerDir = 1;
    } else if (this.charging && !throwHeld) {
      this.throwBall();
      this.charging = false;
      this.power = 0;
    }

    const player = this.player;
    player.vx = dir * PLAYER_SPEED;

    if (this.charging) {
      this.power += 2.5 * this.powerDir;
      if (this.power >= MAX_THROW_POWER) {
        this.power = MAX_THROW_POWER;
        this.powerDir = -1;
      } else if (this.power <= MIN_THROW_POWER) {
        this.power = MIN_THROW_POWER;
        this.powerDir = 1;
      }
    }

    updatePlayer(this.qb);
    updatePlayer(this.wr);
    // The receiver runs his route only while nobody steers him (the original set this after the
    // move, so it takes effect next frame).
    if (!this.wr.hasBall) {
      if (this.wr.route < ROUTE_LENGTH) {
        this.wr.vx = 3;
        this.wr.route += 3;
      } else {
        this.wr.vx = 0;
      }
    }
    this.updateBall();

    const carrier = this.carrier;
    for (const d of this.defenders) {
      if (carrier) d.vx = Math.abs(carrier.x - d.x) > 10 ? Math.sign(carrier.x - d.x) * DEFENDER_SPEED : 0;
      updatePlayer(d);
    }

    const ball = this.ball;
    if (ball.active && !ball.caught) {
      const r = BALL_RADIUS;
      const ballRect = { x: Math.trunc(ball.x - r), y: Math.trunc(ball.y - r), w: r * 2, h: r * 2 };
      if (overlaps(rectOf(this.wr), ballRect)) {
        ball.caught = true;
        ball.active = false;
        this.wr.hasBall = true;
        this.controlled = 'wr';
      }
    }

    if (!ball.active && !ball.caught && !this.qb.hasBall && !this.wr.hasBall) {
      this.result = 'incomplete';
      return;
    }
    if (carrier) {
      const carrierRect = rectOf(carrier);
      if (this.defenders.some((d) => overlaps(carrierRect, rectOf(d)))) {
        this.result = 'tackled';
        return;
      }
      if (carrier.x >= ENDZONE_START) this.result = 'touchdown';
    }
  }

  throwBall() {
    if (!this.qb.hasBall) return;
    const v = this.power / 5;
    Object.assign(this.ball, {
      x: this.qb.x + PLAYER_W / 2,
      y: this.qb.y + PLAYER_H / 2,
      vx: v * Math.cos(THROW_ANGLE),
      vy: -v * Math.sin(THROW_ANGLE),
      active: true,
      caught: false,
    });
    this.qb.hasBall = false;
  }

  updateBall() {
    const ball = this.ball;
    if (!ball.active || ball.caught) return;
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;
    if (ball.y >= TURF_Y) {
      ball.active = false;
      ball.y = TURF_Y;
    }
  }

  /** The original's dotted preview: a 45-degree throw at this power, until it reaches the turf. */
  arcPoints() {
    const v = this.power / 5;
    let x = this.qb.x + PLAYER_W / 2;
    let y = this.qb.y + PLAYER_H / 2;
    let vx = v * Math.cos(THROW_ANGLE);
    let vy = -v * Math.sin(THROW_ANGLE);
    const points = [];
    for (let i = 0; i < 60; i++) {
      points.push([x, y]);
      x += vx;
      y += vy;
      vy += GRAVITY;
      if (y >= TURF_Y) {
        points.push([x, TURF_Y]);
        break;
      }
    }
    return points;
  }
}

// --- CPU ---------------------------------------------------------------------------------------

const LOOKAHEAD = 150;
const JUMP_LOOKAHEAD = 70;
const JUMP_DELAYS = Array.from({ length: 25 }, (_, i) => i);
const JUMP_MISS = 0.06; // chance, each tick a jump is called for, that the CPU hesitates

/** Plays a copy of the play forward with the stick held in one direction and nothing pressed. */
function playOut(play, dir, ticks) {
  const sim = play.clone();
  for (let t = 0; t < ticks && !sim.result; t++) {
    if (sim.controlled === 'wr') return { sim, t, caught: true };
    sim.step(dir, false, false, false);
  }
  return { sim, t: ticks, caught: sim.controlled === 'wr' };
}

/**
 * Tries one plan for the ball carrier on a copy of the play: hold the stick one way for `delay`
 * ticks, then jump and run for the end zone. Scores how long he stays on his feet and how far he
 * gets; a touchdown beats everything.
 */
function tryPlan(play, dir, delay) {
  const sim = play.clone();
  for (let t = 0; t < JUMP_LOOKAHEAD; t++) {
    sim.step(t < delay ? dir : 1, t === delay, false, false);
    if (sim.result === 'touchdown') return 1e6;
    if (sim.result === 'tackled') return t * 100;
  }
  return JUMP_LOOKAHEAD * 100 + sim.wr.x;
}

class Bot {
  constructor(game) {
    this.game = game;
    this.play = null;
  }

  reset() {
    this.snapDelay = 20 + Math.floor(Math.random() * 40);
    // Now and then the CPU lets go a few ticks off, or misses a jump, so it is beatable.
    this.throwSlop = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 6) : 0;
    this.lateRelease = -1;
    this.jumpBlind = 0;
  }

  input() {
    const game = this.game;
    const play = game.play;
    if (play !== this.play) {
      this.play = play;
      this.reset();
    }
    if (game.over || game.pause > 0 || play.result) return { x: 0, y: 0, buttons: {} };
    if (play.controlled === 'qb') return this.quarterback(play);
    return this.receiver(play);
  }

  quarterback(play) {
    if (!play.qb.hasBall) return { x: 0, y: 0, buttons: {} };
    if (this.snapDelay > 0) {
      this.snapDelay--;
      return { x: 0, y: 0, buttons: {} };
    }
    if (!play.charging) return { x: 0, y: 0, buttons: { fire2: true } };
    if (this.lateRelease >= 0) {
      return this.lateRelease-- > 0 ? { x: 0, y: 0, buttons: { fire2: true } } : { x: 0, y: 0, buttons: {} };
    }
    const release = play.clone();
    release.step(0, false, false, false);
    const caught = playOut(release, 0, LOOKAHEAD).caught;
    const rushed = play.defenders.some((d) => Math.abs(d.x - play.qb.x) < 60);
    if (caught || rushed) {
      if (this.throwSlop > 0 && !rushed) {
        this.lateRelease = this.throwSlop;
        return { x: 0, y: 0, buttons: { fire2: true } };
      }
      return { x: 0, y: 0, buttons: {} };
    }
    return { x: 0, y: 0, buttons: { fire2: true } };
  }

  receiver(play) {
    if (this.jumpBlind > 0) {
      this.jumpBlind--;
      return { x: 1, y: 0, buttons: {} };
    }
    // Only think when a defender is close; otherwise just run for the end zone.
    if (!play.defenders.some((d) => Math.abs(d.x - play.wr.x) < 260)) return { x: 1, y: 0, buttons: {} };
    let best = null;
    for (const dir of [1, 0, -1]) {
      for (const delay of [...JUMP_DELAYS, Infinity]) {
        const score = tryPlan(play, dir, delay);
        if (!best || score > best.score) best = { score, dir, delay };
      }
    }
    if (best.delay === 0) {
      if (Math.random() < JUMP_MISS) {
        this.jumpBlind = 10;
        return { x: 1, y: 0, buttons: {} };
      }
      return { x: 1, y: 0, buttons: { fire: true } };
    }
    return { x: best.dir, y: 0, buttons: {} };
    return { x: 1, y: 0, buttons: {} };
  }
}

// --- game --------------------------------------------------------------------------------------

class QuarterbackGame {
  constructor(bots) {
    this.score = 0;
    this.tackles = 0;
    this.down = 1;
    this.play = new Play();
    this.pause = 0;
    this.over = false;
    this.bot = bots[0] ? new Bot(this) : null;
  }

  get resultText() {
    return this.over ? `SCORE ${this.score}` : '';
  }

  botInput(index) {
    if (index !== 0 || !this.bot) throw new Error(`Player ${index + 1} is not a CPU player`);
    return this.bot.input();
  }

  update(input) {
    if (this.over) return;
    if (this.pause > 0) {
      this.pause--;
      if (this.pause === 0) this.play = new Play();
      return;
    }
    const p = input.player(0);
    const dir = p.x > 0.5 ? 1 : p.x < -0.5 ? -1 : 0;
    this.play.step(dir, p.pressed('fire'), p.pressed('fire2'), p.down('fire2'));
    const result = this.play.result;
    if (!result) return;
    if (result === 'touchdown') {
      this.score += 6;
      this.down = 1;
    } else {
      if (result === 'tackled') this.tackles++;
      this.down++;
    }
    if (this.down > 4) this.over = true;
    else this.pause = PLAY_PAUSE;
  }

  draw(ctx) {
    const play = this.play;
    ctx.fillStyle = GREEN;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = DARK_GREEN;
    ctx.fillRect(0, TURF_Y, W, H - TURF_Y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 3;
    for (let x = 0; x < W; x += 100) line(ctx, x, TURF_Y, x, H);

    ctx.fillStyle = ENDZONE;
    ctx.fillRect(ENDZONE_START, 0, W - ENDZONE_START, TURF_Y);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 4;
    line(ctx, ENDZONE_START, 0, ENDZONE_START, TURF_Y);
    ctx.fillStyle = WHITE;
    ctx.font = `28px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('END', ENDZONE_START + 75, H / 2 - 30);
    ctx.fillText('ZONE', ENDZONE_START + 75, H / 2 + 14);

    drawPlayer(ctx, play.qb, BLUE);
    drawPlayer(ctx, play.wr, BLUE);
    if (play.ball.active) {
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.arc(play.ball.x, play.ball.y, BALL_RADIUS + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of play.defenders) drawPlayer(ctx, d, RED);

    const you = play.player;
    ctx.fillStyle = YELLOW;
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(you.x + PLAYER_W / 2, you.y + PLAYER_H + 24, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (play.charging && play.qb.hasBall) this.drawThrow(ctx, play);
    this.drawHud(ctx);
  }

  drawThrow(ctx, play) {
    const points = play.arcPoints();
    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 4;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.fillStyle = YELLOW;
    for (let i = 0; i < points.length; i += 5) {
      ctx.beginPath();
      ctx.arc(points[i][0], points[i][1], 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const share = play.power / MAX_THROW_POWER;
    const mw = 300;
    const mh = 28;
    const mx = W / 2 - mw / 2;
    const my = 64;
    ctx.fillStyle = BLACK;
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.fillStyle = share < 0.8 ? YELLOW : RED;
    ctx.fillRect(mx, my, mw * share, mh);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = WHITE;
    ctx.font = `16px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('THROW POWER', W / 2, my - 10);
  }

  drawHud(ctx) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `24px ${HUD_FONT}`;
    ctx.fillStyle = WHITE;
    ctx.fillText(`SCORE ${this.score}`, 16, 16);
    ctx.fillStyle = YELLOW;
    ctx.fillText(`${['1ST', '2ND', '3RD', '4TH'][Math.min(this.down, 4) - 1]} DOWN`, 16, 54);
    ctx.font = `16px ${HUD_FONT}`;
    ctx.fillStyle = WHITE;
    ctx.fillText(`TACKLES ${this.tackles}`, 16, 92);

    let message = null;
    if (this.over) message = ['TURNOVER ON DOWNS!', RED];
    else if (this.play.result === 'tackled') message = ['TACKLED!', RED];
    else if (this.play.result === 'touchdown') message = ['TOUCHDOWN! +6', YELLOW];
    else if (this.play.result === 'incomplete') message = ['INCOMPLETE PASS!', RED];
    if (!message) return;
    ctx.font = `32px ${HUD_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(message[0]).width;
    ctx.fillStyle = BLACK;
    // Above the middle, where the shell's attract and pause cards go.
    const y = 170;
    ctx.fillRect(W / 2 - w / 2 - 20, y - 36, w + 40, 72);
    ctx.fillStyle = message[1];
    ctx.fillText(message[0], W / 2, y);
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** The original stick figure, with its position label underneath. */
function drawPlayer(ctx, p, color) {
  const cx = Math.trunc(p.x + PLAYER_W / 2);
  const bottom = Math.trunc(p.y + PLAYER_H);
  const headR = 8;
  const headY = Math.trunc(p.y + headR + 2);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  const bodyTop = headY + headR;
  const bodyBottom = bodyTop + 20;
  line(ctx, cx, bodyTop, cx, bodyBottom);
  const armY = bodyTop + 5;
  line(ctx, cx, armY, cx - 12, armY + 8);
  line(ctx, cx, armY, cx + 12, armY + 8);
  const spread = p.walkFrame === 0 ? 6 : -6;
  line(ctx, cx, bodyBottom, cx - spread, bottom);
  line(ctx, cx, bodyBottom, cx + spread, bottom);
  ctx.lineCap = 'butt';

  ctx.fillStyle = WHITE;
  ctx.font = `12px ${HUD_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.label, cx, bottom + 10);
}

/**
 * @param {{bots: boolean[]}} options bots[0] is true when the CPU plays (attract mode)
 */
export function createGame({ bots }) {
  return new QuarterbackGame(bots);
}

export { Play, QuarterbackGame };
