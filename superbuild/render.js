// render.js - Three.js Mode-7 style renderer.
// Manages scene, camera, track plane, and car meshes.

import * as THREE from 'three';
import {
  WAYPOINTS, CHECKPOINT_SEQUENCE, TOTAL_LAPS,
  TRACK_HALF_WIDTH, WORLD_W, WORLD_H,
} from './track.js';

// Camera rig constants
const CAM_HEIGHT    = 95;   // above ground
const CAM_BEHIND    = 195;  // behind car
const CAM_LOOKAHEAD = 65;   // look-at point ahead of car
const CAM_FOV       = 62;   // vertical FOV degrees

// Car visual dimensions (world units)
const CAR_LEN = 155;
const CAR_WID = 95;

// Car colors by slot index
const CAR_COLORS = ['#e83030', '#2060e8', '#e8a020', '#20c840'];

export class Renderer {
  /**
   * @param {HTMLElement} container  - element to inject the canvas into
   * @param {Track} track            - Track instance (unused at render time but kept for API symmetry)
   */
  constructor(container, _track) {
    this._container = container;

    // ---- WebGL renderer ----
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(container.clientWidth, container.clientHeight);
    container.insertBefore(this._renderer.domElement, container.firstChild);

    // ---- Scene ----
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x6aacda); // sky blue
    this._scene.fog = new THREE.Fog(0x6aacda, 700, 2600);

    // ---- Camera ----
    const aspect = container.clientWidth / container.clientHeight;
    this._camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 1, 4000);

    // ---- Ground plane with track texture ----
    const trackTex = this._buildTrackTexture();
    const groundGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ map: trackTex });
    this._ground = new THREE.Mesh(groundGeo, groundMat);
    this._scene.add(this._ground);

    // ---- Car meshes (created on demand) ----
    this._carMeshes = new Map(); // car.id → THREE.Mesh

    // ---- Minimap canvas ----
    this._minimap = container.querySelector('#minimap');

    // Resize listener
    this._onResize = () => this.resize(container.clientWidth, container.clientHeight);
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Render one animation frame.
   * @param {GameSim} sim
   * @param {number} interpFrac  - fractional tick remainder [0,1] for smooth display
   */
  render(sim, interpFrac) {
    const localCar = sim.localCar;
    if (localCar) this._updateCamera(localCar);

    this._syncCarMeshes(sim);

    this._renderer.render(this._scene, this._camera);
    if (this._minimap) this._drawMinimap(sim);
  }

  resize(w, h) {
    this._renderer.setSize(w, h);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._renderer.dispose();
  }

  // ---- Camera ----

  _updateCamera(car) {
    const cx = Math.cos(car.angle);
    const cz = Math.sin(car.angle);

    this._camera.position.set(
      car.x - cx * CAM_BEHIND,
      CAM_HEIGHT,
      car.z - cz * CAM_BEHIND,
    );
    this._camera.lookAt(
      car.x + cx * CAM_LOOKAHEAD,
      0,
      car.z + cz * CAM_LOOKAHEAD,
    );
  }

  // ---- Car meshes ----

  _syncCarMeshes(sim) {
    const seen = new Set();

    sim.cars.forEach((car, idx) => {
      seen.add(car.id);

      if (!this._carMeshes.has(car.id)) {
        this._carMeshes.set(car.id, this._makeCarMesh(idx));
        this._scene.add(this._carMeshes.get(car.id));
      }

      const mesh = this._carMeshes.get(car.id);
      mesh.position.set(car.x, 1, car.z);
      // mesh.rotation.y: front of car faces car.angle direction.
      // After geometry.rotateX(-π/2), baked front points in -Z local space.
      // To face world direction (cos(angle), 0, sin(angle)):
      //   mesh.rotation.y = -π/2 - car.angle  (see render.js design notes)
      mesh.rotation.y = -Math.PI / 2 - car.angle;
    });

    // Remove meshes for cars that left
    for (const [id, mesh] of this._carMeshes) {
      if (!seen.has(id)) {
        this._scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this._carMeshes.delete(id);
      }
    }
  }

  _makeCarMesh(slotIdx) {
    const geo = new THREE.PlaneGeometry(CAR_WID, CAR_LEN);
    geo.rotateX(-Math.PI / 2);

    const color = CAR_COLORS[slotIdx % CAR_COLORS.length];
    const tex   = this._buildCarTexture(color);
    const mat   = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
    });
    return new THREE.Mesh(geo, mat);
  }

  // ---- Texture builders ----

  /**
   * Generates the top-down track layout as a CanvasTexture.
   *
   * UV / canvas mapping with texture.flipY = false:
   *   canvas_x = (world_x + WORLD_W/2) / WORLD_W * SIZE
   *   canvas_y = (1 - (world_z + WORLD_H/2) / WORLD_H) * SIZE
   *
   * This ensures that the texture sample at UV (u, v) correctly shows
   * the track content for the corresponding world (x, z) position.
   */
  _buildTrackTexture() {
    const SIZE = 2048;
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');

    const tx = (wx) => (wx + WORLD_W / 2) / WORLD_W * SIZE;
    const tz = (wz) => (1 - (wz + WORLD_H / 2) / WORLD_H) * SIZE;

    // --- Background: green grass ---
    ctx.fillStyle = '#2e6b2e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Subtle grass variation
    ctx.fillStyle = '#336633';
    for (let i = 0; i < 300; i++) {
      ctx.fillRect(
        Math.random() * SIZE, Math.random() * SIZE,
        6 + Math.random() * 12, 6 + Math.random() * 12,
      );
    }

    // --- Wide outer kerb (white) ---
    const kerbPx = TRACK_HALF_WIDTH * 2.1 / WORLD_W * SIZE;
    this._strokePath(ctx, kerbPx, '#cccccc', tx, tz);

    // --- Asphalt body ---
    const roadPx = TRACK_HALF_WIDTH * 2 / WORLD_W * SIZE;
    this._strokePath(ctx, roadPx, '#4a4a4a', tx, tz);

    // --- Road surface detail (slight shade variation) ---
    this._strokePath(ctx, roadPx - 10, '#525252', tx, tz);

    // --- Yellow dashed centreline ---
    const dashLen = 40 / WORLD_W * SIZE;
    ctx.strokeStyle = '#e8c800';
    ctx.lineWidth   = 4;
    ctx.setLineDash([dashLen, dashLen * 0.8]);
    this._strokePath(ctx, 0, null, tx, tz, true); // only call linePath
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Checkpoint markers (translucent bands) ---
    const cpColors = ['#00ffaa88', '#00aaff88', '#ffaa0088', '#ff00ff88'];
    CHECKPOINT_SEQUENCE.forEach((wpIdx, i) => {
      const [wx, wz] = WAYPOINTS[wpIdx];
      const r = 22;
      ctx.beginPath();
      ctx.arc(tx(wx), tz(wz), r, 0, Math.PI * 2);
      ctx.fillStyle = cpColors[i];
      ctx.fill();
    });

    // --- Start/finish line ---
    this._drawStartFinish(ctx, tx, tz, SIZE);

    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; // must match UV analysis above
    tex.needsUpdate = true;
    return tex;
  }

  /** Helper: stroke the WAYPOINTS closed polyline at a given line width & color. */
  _strokePath(ctx, lineWidth, color, tx, tz, justPath = false) {
    ctx.beginPath();
    WAYPOINTS.forEach(([wx, wz], i) => {
      if (i === 0) ctx.moveTo(tx(wx), tz(wz));
      else         ctx.lineTo(tx(wx), tz(wz));
    });
    ctx.closePath();
    if (!justPath) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = lineWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }
  }

  /** Draw a checkerboard start/finish band perpendicular to the track at wp[0]. */
  _drawStartFinish(ctx, tx, tz, SIZE) {
    const [ax, az] = WAYPOINTS[0];
    const [bx, bz] = WAYPOINTS[1];

    // Direction in canvas space (accounts for z-axis flip in tz)
    const cdx = tx(bx) - tx(ax);
    const cdz = tz(bz) - tz(az);
    const len  = Math.hypot(cdx, cdz);
    const ndx  = cdx / len; // unit forward
    const ndz  = cdz / len;
    // Perpendicular (90° CW in canvas)
    const px = ndz;
    const pz = -ndx;

    const halfLen = TRACK_HALF_WIDTH / WORLD_W * SIZE;
    const cx = tx(ax);
    const cz = tz(az);
    const stripes = 8;
    const stripeW = halfLen * 2 / stripes;

    ctx.save();
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
      const sx = cx + px * (i * stripeW - halfLen);
      const sz = cz + pz * (i * stripeW - halfLen);
      ctx.beginPath();
      ctx.moveTo(sx,              sz);
      ctx.lineTo(sx + px * stripeW, sz + pz * stripeW);
      ctx.lineTo(sx + px * stripeW + ndx * 20, sz + pz * stripeW + ndz * 20);
      ctx.lineTo(sx + ndx * 20,   sz + ndz * 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Generates a top-down car texture.
   * Canvas y=0 (top) = FRONT of car in 3D (matches mesh UV + rotation convention).
   */
  _buildCarTexture(color) {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(S * 0.2, S * 0.04, S * 0.6, S * 0.92, S * 0.1);
    ctx.fill();

    // Windshield (front = top of canvas)
    ctx.fillStyle = 'rgba(180, 225, 255, 0.85)';
    ctx.fillRect(S * 0.27, S * 0.08, S * 0.46, S * 0.19);

    // Rear window
    ctx.fillStyle = 'rgba(140, 185, 220, 0.75)';
    ctx.fillRect(S * 0.27, S * 0.73, S * 0.46, S * 0.17);

    // Wheels (dark, one per corner)
    ctx.fillStyle = '#111';
    const ww = S * 0.13, wh = S * 0.21;
    ctx.beginPath(); ctx.roundRect(S * 0.02, S * 0.05, ww, wh, 3); ctx.fill(); // FL
    ctx.beginPath(); ctx.roundRect(S * 0.85, S * 0.05, ww, wh, 3); ctx.fill(); // FR
    ctx.beginPath(); ctx.roundRect(S * 0.02, S * 0.74, ww, wh, 3); ctx.fill(); // RL
    ctx.beginPath(); ctx.roundRect(S * 0.85, S * 0.74, ww, wh, 3); ctx.fill(); // RR

    // Central stripe
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(S * 0.46, S * 0.04, S * 0.08, S * 0.92);

    // Return texture with default flipY=true, which is correct:
    //   canvas y=0 (top) → UV v=1 → mesh local -Z → world forward direction ✓
    return new THREE.CanvasTexture(c);
  }

  // ---- Minimap ----

  _drawMinimap(sim) {
    const mc = this._minimap;
    const mw = mc.width;
    const mh = mc.height;
    const ctx = mc.getContext('2d');

    ctx.clearRect(0, 0, mw, mh);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, mw, mh);

    // World → minimap (x/z → pixel)
    const mx = (wx) => (wx + WORLD_W / 2) / WORLD_W * mw;
    const mz = (wz) => (wz + WORLD_H / 2) / WORLD_H * mh;

    // Track outline
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    WAYPOINTS.forEach(([wx, wz], i) => {
      if (i === 0) ctx.moveTo(mx(wx), mz(wz));
      else         ctx.lineTo(mx(wx), mz(wz));
    });
    ctx.closePath();
    ctx.stroke();

    // Cars
    const dotColors = ['#ff4444', '#4488ff', '#ffaa22', '#44cc66'];
    sim.cars.forEach((car, idx) => {
      ctx.fillStyle = dotColors[idx % dotColors.length];
      ctx.beginPath();
      ctx.arc(mx(car.x), mz(car.z), car.isLocal ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
