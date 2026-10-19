// track.js - Track definition, waypoints, and collision detection.
// Pure JavaScript, no external dependencies.

// ---- Coordinate system ----
// World uses Three.js convention: X = east/right, Z = south/down, Y = up.
// Track is derived from racing.py waypoints, scaled and centered at origin.

const SCALE = 2.5;
const RAW_CENTER_X = (110 + 1620) / 2 * SCALE; // 2162.5
const RAW_CENTER_Z = (85 + 950) / 2 * SCALE;   // 1293.75

function wp(rx, ry) {
  return [rx * SCALE - RAW_CENTER_X, ry * SCALE - RAW_CENTER_Z];
}

// Track centre-line waypoints, closed loop, driven clockwise.
// Ported from racing.py and centered at world origin.
export const WAYPOINTS = [
  wp(864,  85),   // 0  start/finish — top center
  wp(1380, 110),  // 1  top-right approach
  wp(1620, 295),  // 2  right upper
  wp(1620, 545),  // 3  right straight   ← checkpoint A
  wp(1560, 715),  // 4  hairpin entry
  wp(1450, 845),  // 5  hairpin right arm
  wp(1310, 895),  // 6  hairpin apex     ← checkpoint B
  wp(1170, 845),  // 7  hairpin left arm
  wp(1060, 715),  // 8  hairpin exit
  wp(830,  820),  // 9  bottom centre-right
  wp(570,  950),  // 10 bottom left      ← checkpoint C
  wp(270,  835),  // 11 left lower
  wp(110,  610),  // 12 left straight    ← checkpoint D
  wp(110,  370),  // 13 left upper
  wp(310,  130),  // 14 top left
];

// Checkpoints must be passed in this order each lap (waypoint indices).
export const CHECKPOINT_SEQUENCE = [3, 6, 10, 12];

// Proximity radius to register a checkpoint or start/finish passage.
export const CHECKPOINT_RADIUS = 210; // ~85px * 2.5

// Race config
export const TOTAL_LAPS = 3;

// Half of the drivable road width in world units.
export const TRACK_HALF_WIDTH = 175; // road is 350 wide

// Ground plane dimensions (always larger than track bounding box).
export const WORLD_W = 5000;
export const WORLD_H = 3500;

/** Starting position and heading (faces from wp[0] toward wp[1]). */
export function getStartPose() {
  const [x0, z0] = WAYPOINTS[0];
  const [x1, z1] = WAYPOINTS[1];
  return {
    x: x0,
    z: z0,
    angle: Math.atan2(z1 - z0, x1 - x0), // 0 = +X, increases clockwise
  };
}

export class Track {
  constructor() {
    // Pre-build polyline segments for fast collision queries.
    this._segments = [];
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const [ax, az] = WAYPOINTS[i];
      const [bx, bz] = WAYPOINTS[(i + 1) % WAYPOINTS.length];
      this._segments.push({ ax, az, bx, bz });
    }
  }

  /** Returns true if (x, z) is within TRACK_HALF_WIDTH of the centreline. */
  isOnRoad(x, z) {
    const hw2 = TRACK_HALF_WIDTH * TRACK_HALF_WIDTH;
    for (const seg of this._segments) {
      if (this._distSqToSeg(x, z, seg) < hw2) return true;
    }
    return false;
  }

  /** Returns true if (x, z) is within CHECKPOINT_RADIUS of WAYPOINTS[idx]. */
  isNearWaypoint(x, z, idx) {
    const [wx, wz] = WAYPOINTS[idx];
    const dx = x - wx, dz = z - wz;
    return dx * dx + dz * dz < CHECKPOINT_RADIUS * CHECKPOINT_RADIUS;
  }

  _distSqToSeg(px, pz, { ax, az, bx, bz }) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) {
      const ex = px - ax, ez = pz - az;
      return ex * ex + ez * ez;
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    const ex = px - (ax + t * dx);
    const ez = pz - (az + t * dz);
    return ex * ex + ez * ez;
  }
}
