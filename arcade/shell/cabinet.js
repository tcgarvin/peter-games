// The cabinet: generated art drawn to a full-viewport canvas, with the CRT screen laid over the
// art's screen rectangle and the painted joysticks/buttons acting as touch controls.
//
// art/<game>/manifest.json describes each layout (portrait, landscape) in image pixels:
//   { image, size: [w, h], screen: {x, y, w, h},
//     controls: { <id>: { type: 'joystick'|'button', hit: {cx, cy, r},
//                          states: { <state>: {file, x, y} } } } }
// An optional `marquee: {x, y, w, h}` is kept on screen vertically too.
// Control ids are p<N>_stick, p<N>_aim (a twin-stick game's second stick), p<N>_<button>
// (e.g. p1_fire), start_1p and start_2p.

const DIAGONAL_FALLBACK = { up_left: 'up', up_right: 'up', down_left: 'down', down_right: 'down' };
const STICK_TRAVEL = 0.55; // fraction of the hit radius that counts as full tilt
const HIT_SLOP = 1.2;
const MAX_DPR = 2;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load cabinet art ${src}`));
    img.src = src;
  });
}

function readSafeArea() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;inset:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const insets = {
    top: parseFloat(s.paddingTop),
    right: parseFloat(s.paddingRight),
    bottom: parseFloat(s.paddingBottom),
    left: parseFloat(s.paddingLeft),
  };
  probe.remove();
  return insets;
}

/** Bounding box of everything a player must be able to see and touch, plus the marquee. */
function essentialBox(layout) {
  let { x: x0, y: y0 } = layout.screen;
  let x1 = x0 + layout.screen.w;
  let y1 = y0 + layout.screen.h;
  if (layout.marquee) {
    // Only its height: the title can lose its decorated ends on a narrow phone.
    y0 = Math.min(y0, layout.marquee.y);
    y1 = Math.max(y1, layout.marquee.y + layout.marquee.h);
  }
  for (const c of Object.values(layout.controls)) {
    x0 = Math.min(x0, c.hit.cx - c.hit.r);
    y0 = Math.min(y0, c.hit.cy - c.hit.r);
    x1 = Math.max(x1, c.hit.cx + c.hit.r);
    y1 = Math.max(y1, c.hit.cy + c.hit.r);
  }
  const pad = 0.02 * Math.max(...layout.size);
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/**
 * Scale the art to cover the viewport, but never so far that the screen or a control is cut off.
 * Returns the transform plus how large the game screen ends up, to compare layouts.
 */
function fit(layout, view) {
  const [iw, ih] = layout.size;
  const box = essentialBox(layout);
  const cover = Math.max(view.w / iw, view.h / ih);
  const scale = Math.min(cover, view.w / box.w, view.h / box.h);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const place = (viewStart, viewSize, imgSize, boxStart, boxSize) => {
    let offset;
    if (imgSize * scale >= viewSize) {
      offset = viewStart + viewSize / 2 - (boxStart + boxSize / 2) * scale;
      offset = clamp(offset, viewStart + viewSize - imgSize * scale, viewStart);
    } else {
      offset = viewStart + (viewSize - imgSize * scale) / 2;
    }
    // Keep the essential box fully inside the view (this wins over covering the view).
    return clamp(offset, viewStart - boxStart * scale, viewStart + viewSize - (boxStart + boxSize) * scale);
  };
  return {
    scale,
    ox: place(view.x, view.w, iw, box.x, box.w),
    oy: place(view.y, view.h, ih, box.y, box.h),
    screenArea: layout.screen.w * layout.screen.h * scale * scale,
  };
}

export class Cabinet {
  static async load(host, artBase, controls) {
    const manifest = await fetch(`${artBase}manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${artBase}manifest.json (${r.status})`);
      return r.json();
    });
    const files = new Set();
    for (const layout of Object.values(manifest.layouts)) {
      files.add(layout.image);
      for (const c of Object.values(layout.controls)) for (const s of Object.values(c.states)) files.add(s.file);
    }
    const images = new Map();
    await Promise.all([...files].map(async (f) => images.set(f, await loadImage(artBase + f))));
    return new Cabinet(host, manifest, images, controls);
  }

  constructor(host, manifest, images, controls) {
    this.host = host;
    this.layouts = manifest.layouts;
    this.images = images;
    this.controls = controls;
    this.onScreenTap = () => {};
    this.dirty = true;
    this.states = {};
    this.decor = { lamps: [], lampOn: false, keyHints: null };

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cabinet-art';
    this.screen = document.createElement('canvas');
    this.screen.className = 'cabinet-screen';
    host.append(this.canvas, this.screen);

    this.pointers = new Map(); // pointerId -> control id or 'screen'
    this.canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.canvas.addEventListener(type, (e) => this.pointerUp(e));
    }
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    new ResizeObserver(() => this.layout()).observe(host);
    this.layout();
  }

  get controlIds() {
    return Object.keys(this.current.controls);
  }

  layout() {
    const rect = this.host.getBoundingClientRect();
    const safe = readSafeArea();
    const view = {
      x: safe.left,
      y: safe.top,
      w: rect.width - safe.left - safe.right,
      h: rect.height - safe.top - safe.bottom,
    };
    // Upright phones always get the upright cabinet; otherwise use whichever shows the game larger.
    const candidates = view.h > view.w ? ['portrait'] : Object.keys(this.layouts);
    let best = null;
    for (const name of candidates) {
      if (!this.layouts[name]) continue;
      const f = fit(this.layouts[name], view);
      if (!best || f.screenArea > best.fit.screenArea) best = { name, fit: f };
    }
    if (!best) throw new Error('Cabinet manifest has no usable layout');
    this.layoutName = best.name;
    this.current = this.layouts[best.name];
    this.transform = best.fit;

    this.dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    const { scale, ox, oy } = this.transform;
    const s = this.current.screen;
    Object.assign(this.screen.style, {
      left: `${ox + s.x * scale}px`,
      top: `${oy + s.y * scale}px`,
      width: `${s.w * scale}px`,
      height: `${s.h * scale}px`,
    });
    this.screenPixels = { w: s.w * scale * this.dpr, h: s.h * scale * this.dpr };
    this.onResize?.(this.screenPixels);
    this.backdrop = null;
    this.dirty = true;
  }

  /** Blurred, darkened copy of the art for any viewport area the cabinet doesn't reach. */
  makeBackdrop() {
    const img = this.images.get(this.current.image);
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, c.width, c.height);
    const cover = Math.max(c.width / img.width, c.height / img.height) * 1.1;
    ctx.filter = 'blur(24px) brightness(0.3) saturate(0.8)';
    ctx.drawImage(img, (c.width - img.width * cover) / 2, (c.height - img.height * cover) / 2, img.width * cover, img.height * cover);
    return c;
  }

  setStates(states, decor) {
    const next = JSON.stringify([states, decor]);
    if (next !== this.lastState) {
      this.lastState = next;
      this.states = states;
      this.decor = decor;
      this.dirty = true;
    }
    if (this.dirty) this.draw();
  }

  draw() {
    this.dirty = false;
    const ctx = this.canvas.getContext('2d');
    if (!this.backdrop) this.backdrop = this.makeBackdrop();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);

    const { scale, ox, oy } = this.transform;
    const k = scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, ox * this.dpr, oy * this.dpr);
    const layout = this.current;
    ctx.drawImage(this.images.get(layout.image), 0, 0);

    for (const [id, control] of Object.entries(layout.controls)) {
      const want = this.states[id] ?? (control.type === 'joystick' ? 'neutral' : 'up');
      const sprite = control.states[want] ?? control.states[DIAGONAL_FALLBACK[want]] ?? control.states.neutral;
      if (sprite) ctx.drawImage(this.images.get(sprite.file), sprite.x, sprite.y);
    }

    if (this.decor.lampOn) {
      ctx.globalCompositeOperation = 'lighter';
      for (const id of this.decor.lamps) {
        const hit = layout.controls[id]?.hit;
        if (!hit) continue;
        const glow = ctx.createRadialGradient(hit.cx, hit.cy, hit.r * 0.2, hit.cx, hit.cy, hit.r * 1.5);
        glow.addColorStop(0, 'rgba(255,220,140,0.55)');
        glow.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(hit.cx - hit.r * 1.5, hit.cy - hit.r * 1.5, hit.r * 3, hit.r * 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.decor.keyHints) this.drawKeyHints(ctx);
  }

  /** Small keycap stickers beside each control, shown when someone is playing on a keyboard. */
  drawKeyHints(ctx) {
    const { scale } = this.transform;
    const fontPx = 9 / scale;
    ctx.font = `${fontPx}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [id, control] of Object.entries(this.current.controls)) {
      const text = this.decor.keyHints[id];
      if (!text) continue;
      const { cx, cy, r } = control.hit;
      const w = ctx.measureText(text).width + fontPx * 1.2;
      const h = fontPx * 2;
      // Lower right of the control, where cabinet art tends to have the least lettering; lower
      // left instead if that would run under the CRT screen, which is drawn over the art.
      const s = this.current.screen;
      const y = cy + r * 0.45;
      let x = cx + r * 0.7;
      const overlapsScreen = (left) => left < s.x + s.w && left + w > s.x && y < s.y + s.h && y + h > s.y;
      if (overlapsScreen(x)) x = cx - r * 0.7 - w;
      ctx.fillStyle = 'rgba(240,236,226,0.92)';
      ctx.strokeStyle = 'rgba(20,16,12,0.9)';
      ctx.lineWidth = fontPx * 0.18;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, fontPx * 0.35);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1b1712';
      ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.08);
    }
  }

  // --- touch -----------------------------------------------------------------------------------

  toImage(e) {
    const rect = this.canvas.getBoundingClientRect();
    const { scale, ox, oy } = this.transform;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
  }

  pointerDown(e) {
    const p = this.toImage(e);
    let hit = null;
    let bestDist = Infinity;
    for (const [id, control] of Object.entries(this.current.controls)) {
      const d = Math.hypot(p.x - control.hit.cx, p.y - control.hit.cy);
      if (d < control.hit.r * HIT_SLOP && d / control.hit.r < bestDist) {
        bestDist = d / control.hit.r;
        hit = id;
      }
    }
    if (!hit) {
      const s = this.current.screen;
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) this.onScreenTap();
      return;
    }
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, hit);
    if (this.current.controls[hit].type === 'joystick') this.moveStick(hit, p);
    else this.controls.touchButton(hit, true);
  }

  pointerMove(e) {
    const id = this.pointers.get(e.pointerId);
    if (id && this.current.controls[id].type === 'joystick') this.moveStick(id, this.toImage(e));
  }

  pointerUp(e) {
    const id = this.pointers.get(e.pointerId);
    if (!id) return;
    this.pointers.delete(e.pointerId);
    if (this.current.controls[id].type === 'joystick') this.controls.releaseStick(id);
    else this.controls.touchButton(id, false);
  }

  moveStick(id, p) {
    const { cx, cy, r } = this.current.controls[id].hit;
    let x = (p.x - cx) / (r * STICK_TRAVEL);
    let y = (p.y - cy) / (r * STICK_TRAVEL);
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.controls.touchStick(id, x, y);
  }
}
