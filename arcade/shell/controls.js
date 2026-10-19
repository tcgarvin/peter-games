// Virtual arcade controls. Keyboard, touch (on the cabinet's painted panel), gamepads and CPU
// players all write into the same per-player joystick + buttons, which games read and the
// cabinet draws. A game never sees where an input came from.

const AXIS_THRESHOLD = 0.5;
const REPEAT_DELAY = 18; // ticks before a held stick starts repeating
const REPEAT_EVERY = 4;

const SYSTEM_KEYS = {
  start_1p: ['Digit1', 'Numpad1', 'Enter'],
  start_2p: ['Digit2', 'Numpad2'],
  pause: ['Escape', 'KeyP'],
};

const STICK_KEYS = new Set(['up', 'down', 'left', 'right', 'aimUp', 'aimDown', 'aimLeft', 'aimRight']);
const DIRECTIONS = ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'];

const sign = (v) => (v > AXIS_THRESHOLD ? 1 : v < -AXIS_THRESHOLD ? -1 : 0);
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

class Edge {
  constructor() {
    this.down = false;
    this.prev = false;
  }

  set(down) {
    this.prev = this.down;
    this.down = down;
  }

  get pressed() {
    return this.down && !this.prev;
  }
}

class Axis {
  constructor() {
    this.value = 0;
    this.held = 0;
    this.heldFor = 0;
    this.pulse = 0;
  }

  /** Emits a one-tick pulse on a new direction, then repeats while the stick is held. */
  set(value) {
    this.value = value;
    const dir = sign(value);
    this.pulse = 0;
    if (dir !== this.held) {
      this.held = dir;
      this.heldFor = 0;
      this.pulse = dir;
    } else if (dir !== 0) {
      this.heldFor++;
      if (this.heldFor >= REPEAT_DELAY && (this.heldFor - REPEAT_DELAY) % REPEAT_EVERY === 0) this.pulse = dir;
    }
  }
}

const directionOf = (x, y) => {
  if (Math.hypot(x, y) < AXIS_THRESHOLD) return 'neutral';
  const octant = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return DIRECTIONS[(octant + 8) % 8];
};

export class PlayerInput {
  constructor() {
    this.ax = new Axis();
    this.ay = new Axis();
    this.aimX = new Axis();
    this.aimY = new Axis();
    this.buttons = new Map();
  }

  /** The second (right-hand) stick of a twin-stick panel: {x, y, pulseX, pulseY, direction}. */
  get aim() {
    const x = this.aimX.value;
    const y = this.aimY.value;
    return { x, y, pulseX: this.aimX.pulse, pulseY: this.aimY.pulse, direction: directionOf(x, y) };
  }

  get x() {
    return this.ax.value;
  }

  get y() {
    return this.ay.value;
  }

  get pulseX() {
    return this.ax.pulse;
  }

  get pulseY() {
    return this.ay.pulse;
  }

  /** Eight-way stick position name, as used for the cabinet's sprite states. */
  get direction() {
    return directionOf(this.x, this.y);
  }

  down(name) {
    return this.buttons.get(name)?.down ?? false;
  }

  pressed(name) {
    return this.buttons.get(name)?.pressed ?? false;
  }

  /** @param {{x: number, y: number}} [aim] the second stick, for twin-stick games */
  apply(x, y, held, aim = { x: 0, y: 0 }) {
    this.ax.set(clamp1(x));
    this.ay.set(clamp1(y));
    this.aimX.set(clamp1(aim.x));
    this.aimY.set(clamp1(aim.y));
    for (const name of new Set([...this.buttons.keys(), ...Object.keys(held)])) {
      if (!this.buttons.has(name)) this.buttons.set(name, new Edge());
      this.buttons.get(name).set(Boolean(held[name]));
    }
  }
}

export class Controls {
  /**
   * @param {object} keyboard the game's keyboard map, e.g. {shared: {up: [...], fire: [...]}}
   *   or {p1: {...}, p2: {...}}. Besides up/down/left/right and button names, a map may bind
   *   aimUp/aimDown/aimLeft/aimRight for a twin-stick game's second stick.
   */
  constructor(keyboard, playerCount = 2) {
    this.keyboard = keyboard;
    this.players = Array.from({ length: playerCount }, () => new PlayerInput());
    this.system = { start_1p: new Edge(), start_2p: new Edge(), pause: new Edge() };
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since the last tick, so a quick tap isn't missed
    this.touchSticks = new Map(); // control id -> {x, y}
    this.touchButtons = new Set(); // control ids held by a finger
    this.lastSource = 'keyboard';

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.lastSource = 'keyboard';
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  player(index) {
    return this.players[index];
  }

  // --- touch, fed by the cabinet's pointer handling -------------------------------------------

  touchStick(id, x, y) {
    this.touchSticks.set(id, { x, y });
    this.lastSource = 'touch';
  }

  releaseStick(id) {
    this.touchSticks.delete(id);
  }

  touchButton(id, held) {
    if (held) this.touchButtons.add(id);
    else this.touchButtons.delete(id);
    this.lastSource = 'touch';
  }

  // --- per tick --------------------------------------------------------------------------------

  /** The keys player i reads: a shared map follows the turn, and a lone human gets every map. */
  keyMap(i, keyboardPlayer, bots) {
    if (this.keyboard.shared) return i === keyboardPlayer ? this.keyboard.shared : null;
    const humans = bots.map((b, j) => (b ? -1 : j)).filter((j) => j >= 0);
    if (humans.length === 1 && humans[0] === i) {
      const merged = {};
      for (const map of Object.values(this.keyboard)) {
        for (const [name, codes] of Object.entries(map)) merged[name] = [...(merged[name] ?? []), ...codes];
      }
      return merged;
    }
    return this.keyboard[`p${i + 1}`] ?? null;
  }

  /**
   * @param {{keyboardPlayer: number, bots: (object|null)[]}} routing keyboardPlayer is which
   *   player a shared keyboard map drives (-1 for none); bots[i] is a CPU's
   *   {x, y, buttons, aim?: {x, y}}, or null for a human.
   */
  sample({ keyboardPlayer, bots }) {
    const pads = this.readGamepads();
    const anyKey = (codes) => codes.some((c) => this.keys.has(c) || this.tapped.has(c));

    for (const [name, edge] of Object.entries(this.system)) {
      const padHeld = name === 'pause' ? pads.some((p) => p.select) : pads[name === 'start_1p' ? 0 : 1]?.start;
      edge.set(anyKey(SYSTEM_KEYS[name]) || this.touchButtons.has(name) || Boolean(padHeld));
    }

    this.players.forEach((player, i) => {
      if (bots[i]) {
        player.apply(bots[i].x, bots[i].y, bots[i].buttons, bots[i].aim);
        return;
      }
      const map = this.keyMap(i, keyboardPlayer, bots);
      let x = 0;
      let y = 0;
      const aim = { x: 0, y: 0 };
      const held = {};
      if (map) {
        const axis = (neg, pos) => (anyKey(map[pos] ?? []) ? 1 : 0) - (anyKey(map[neg] ?? []) ? 1 : 0);
        x += axis('left', 'right');
        y += axis('up', 'down');
        aim.x += axis('aimLeft', 'aimRight');
        aim.y += axis('aimUp', 'aimDown');
        for (const [name, codes] of Object.entries(map)) {
          if (!STICK_KEYS.has(name) && anyKey(codes)) held[name] = true;
        }
      }
      const stick = this.touchSticks.get(`p${i + 1}_stick`);
      if (stick) {
        x += stick.x;
        y += stick.y;
      }
      const aimStick = this.touchSticks.get(`p${i + 1}_aim`);
      if (aimStick) {
        aim.x += aimStick.x;
        aim.y += aimStick.y;
      }
      for (const id of this.touchButtons) {
        if (id.startsWith(`p${i + 1}_`)) held[id.slice(3)] = true;
      }
      const pad = pads[i];
      if (pad) {
        x += pad.x;
        y += pad.y;
        aim.x += pad.aimX;
        aim.y += pad.aimY;
        if (pad.a) held.fire = true;
        if (pad.b) held.fire2 = true;
      }
      player.apply(x, y, held, aim);
    });
    this.tapped.clear();
  }

  readGamepads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return pads.map((pad) => {
      const b = (i) => Boolean(pad.buttons[i]?.pressed);
      const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      const dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      const deadzone = (v) => (Math.abs(v) < 0.25 ? 0 : v);
      const x = dx || deadzone(pad.axes[0] ?? 0);
      const y = dy || deadzone(pad.axes[1] ?? 0);
      const aimX = deadzone(pad.axes[2] ?? 0);
      const aimY = deadzone(pad.axes[3] ?? 0);
      if (x || y || aimX || aimY || b(0) || b(1) || b(9)) this.lastSource = 'gamepad';
      return { x, y, aimX, aimY, a: b(0), b: b(1), start: b(9), select: b(8) };
    });
  }

  /** Sprite state per cabinet control id, e.g. {p1_stick: 'up_left', p1_aim: 'down', p1_fire: 'down'}. */
  panelStates(controlIds) {
    const states = {};
    for (const id of controlIds) {
      const match = /^p(\d)_(.+)$/.exec(id);
      if (match) {
        const player = this.players[Number(match[1]) - 1];
        if (match[2] === 'stick') states[id] = player.direction;
        else if (match[2] === 'aim') states[id] = player.aim.direction;
        else states[id] = player.down(match[2]) ? 'down' : 'up';
      } else if (this.system[id]) {
        states[id] = this.system[id].down ? 'down' : 'up';
      }
    }
    return states;
  }
}
