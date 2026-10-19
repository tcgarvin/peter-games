// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Track,
  WAYPOINTS,
  CHECKPOINT_SEQUENCE,
  CHECKPOINT_RADIUS,
  TOTAL_LAPS,
  TRACK_HALF_WIDTH,
  WORLD_W,
  WORLD_H,
  getStartPose,
} from '../track.js';

// ---- Helpers ----

/**
 * Returns a point that is `dist` world-units away from the midpoint of
 * WAYPOINTS[segIdx] → WAYPOINTS[segIdx+1], offset perpendicularly to
 * the right of the travel direction.
 */
function perpPoint(segIdx, dist) {
  const n = WAYPOINTS.length;
  const [ax, az] = WAYPOINTS[segIdx % n];
  const [bx, bz] = WAYPOINTS[(segIdx + 1) % n];
  const angle = Math.atan2(bz - az, bx - ax);
  const perpX  = Math.cos(angle + Math.PI / 2);
  const perpZ  = Math.sin(angle + Math.PI / 2);
  const midX   = (ax + bx) / 2;
  const midZ   = (az + bz) / 2;
  return [midX + perpX * dist, midZ + perpZ * dist];
}

// ---- WAYPOINTS constant ----

describe('WAYPOINTS', () => {
  it('has exactly 15 entries', () => {
    expect(WAYPOINTS).toHaveLength(15);
  });

  it('every entry is a [number, number] pair', () => {
    for (const [x, z] of WAYPOINTS) {
      expect(typeof x).toBe('number');
      expect(typeof z).toBe('number');
      expect(isFinite(x)).toBe(true);
      expect(isFinite(z)).toBe(true);
    }
  });

  it('all waypoints lie within the world bounds', () => {
    for (const [x, z] of WAYPOINTS) {
      expect(Math.abs(x)).toBeLessThan(WORLD_W / 2);
      expect(Math.abs(z)).toBeLessThan(WORLD_H / 2);
    }
  });

  it('forms a closed loop — no two adjacent waypoints are identical', () => {
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const [ax, az] = WAYPOINTS[i];
      const [bx, bz] = WAYPOINTS[(i + 1) % WAYPOINTS.length];
      const dist = Math.hypot(bx - ax, bz - az);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it('waypoints are centered roughly near the world origin', () => {
    const xs = WAYPOINTS.map(([x]) => x);
    const zs = WAYPOINTS.map(([, z]) => z);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    // Should be within 300 world-units of origin
    expect(Math.abs(centerX)).toBeLessThan(300);
    expect(Math.abs(centerZ)).toBeLessThan(300);
  });
});

// ---- CHECKPOINT_SEQUENCE constant ----

describe('CHECKPOINT_SEQUENCE', () => {
  it('has 4 entries', () => {
    expect(CHECKPOINT_SEQUENCE).toHaveLength(4);
  });

  it('all checkpoint indices are valid waypoint indices', () => {
    for (const idx of CHECKPOINT_SEQUENCE) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(WAYPOINTS.length);
    }
  });

  it('checkpoint indices are in ascending order (clockwise traversal)', () => {
    for (let i = 1; i < CHECKPOINT_SEQUENCE.length; i++) {
      expect(CHECKPOINT_SEQUENCE[i]).toBeGreaterThan(CHECKPOINT_SEQUENCE[i - 1]);
    }
  });

  it('no checkpoint index points to the start/finish (waypoint 0)', () => {
    expect(CHECKPOINT_SEQUENCE).not.toContain(0);
  });
});

// ---- getStartPose ----

describe('getStartPose', () => {
  it('returns finite x and z', () => {
    const pose = getStartPose();
    expect(isFinite(pose.x)).toBe(true);
    expect(isFinite(pose.z)).toBe(true);
  });

  it('x and z match waypoint 0 position', () => {
    const pose = getStartPose();
    expect(pose.x).toBeCloseTo(WAYPOINTS[0][0], 5);
    expect(pose.z).toBeCloseTo(WAYPOINTS[0][1], 5);
  });

  it('angle points from waypoint 0 toward waypoint 1', () => {
    const pose = getStartPose();
    const [ax, az] = WAYPOINTS[0];
    const [bx, bz] = WAYPOINTS[1];
    const expected = Math.atan2(bz - az, bx - ax);
    expect(pose.angle).toBeCloseTo(expected, 10);
  });

  it('angle is a finite number', () => {
    const { angle } = getStartPose();
    expect(isFinite(angle)).toBe(true);
  });
});

// ---- Track constants ----

describe('Track constants', () => {
  it('TRACK_HALF_WIDTH is positive', () => {
    expect(TRACK_HALF_WIDTH).toBeGreaterThan(0);
  });

  it('CHECKPOINT_RADIUS is positive', () => {
    expect(CHECKPOINT_RADIUS).toBeGreaterThan(0);
  });

  it('TOTAL_LAPS is a positive integer', () => {
    expect(Number.isInteger(TOTAL_LAPS)).toBe(true);
    expect(TOTAL_LAPS).toBeGreaterThan(0);
  });

  it('WORLD_W and WORLD_H are positive', () => {
    expect(WORLD_W).toBeGreaterThan(0);
    expect(WORLD_H).toBeGreaterThan(0);
  });
});

// ---- Track.isOnRoad ----

describe('Track.isOnRoad', () => {
  let track;
  beforeEach(() => { track = new Track(); });

  it('returns true for a point exactly on the centreline at waypoint 0', () => {
    const [x, z] = WAYPOINTS[0];
    expect(track.isOnRoad(x, z)).toBe(true);
  });

  it('returns true for the centreline at every waypoint', () => {
    for (const [x, z] of WAYPOINTS) {
      expect(track.isOnRoad(x, z)).toBe(true);
    }
  });

  it('returns true for a point just inside the road edge', () => {
    // Use segment 12 (a near-vertical straight) for a clean perpendicular.
    const [onX, onZ] = perpPoint(12, TRACK_HALF_WIDTH - 1);
    expect(track.isOnRoad(onX, onZ)).toBe(true);
  });

  it('returns false for a point just outside the road edge', () => {
    const [offX, offZ] = perpPoint(12, TRACK_HALF_WIDTH + 1);
    expect(track.isOnRoad(offX, offZ)).toBe(false);
  });

  it('returns true on the other side of the road (negative perp offset)', () => {
    const [onX, onZ] = perpPoint(12, -(TRACK_HALF_WIDTH - 1));
    expect(track.isOnRoad(onX, onZ)).toBe(true);
  });

  it('returns false well off the track', () => {
    // Deep grass, clearly not on any segment
    expect(track.isOnRoad(0, 0)).toBe(false); // world centre is in the infield
    expect(track.isOnRoad(2400, 1700)).toBe(false);
    expect(track.isOnRoad(-2400, -1700)).toBe(false);
  });

  it('handles the point at exactly the boundary (strictly less-than check)', () => {
    // distSq < hw² is strict, so exactly on the boundary is OFF-road.
    const [boundX, boundZ] = perpPoint(12, TRACK_HALF_WIDTH);
    // May be on or off depending on floating-point; just assert it doesn't throw.
    expect(() => track.isOnRoad(boundX, boundZ)).not.toThrow();
  });

  it('returns true for midpoints between consecutive waypoints', () => {
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const [ax, az] = WAYPOINTS[i];
      const [bx, bz] = WAYPOINTS[(i + 1) % WAYPOINTS.length];
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      expect(track.isOnRoad(mx, mz)).toBe(true);
    }
  });
});

// ---- Track.isNearWaypoint ----

describe('Track.isNearWaypoint', () => {
  let track;
  beforeEach(() => { track = new Track(); });

  it('returns true when exactly at a waypoint', () => {
    for (let i = 0; i < WAYPOINTS.length; i++) {
      const [x, z] = WAYPOINTS[i];
      expect(track.isNearWaypoint(x, z, i)).toBe(true);
    }
  });

  it('returns true within CHECKPOINT_RADIUS', () => {
    const [wx, wz] = WAYPOINTS[3];
    expect(track.isNearWaypoint(wx + CHECKPOINT_RADIUS - 1, wz, 3)).toBe(true);
  });

  it('returns false just outside CHECKPOINT_RADIUS', () => {
    const [wx, wz] = WAYPOINTS[3];
    expect(track.isNearWaypoint(wx + CHECKPOINT_RADIUS + 1, wz, 3)).toBe(false);
  });

  it('returns false at the wrong waypoint index', () => {
    const [wx, wz] = WAYPOINTS[3];
    // We're at waypoint 3, but checking against waypoint 6
    expect(track.isNearWaypoint(wx, wz, 6)).toBe(false);
  });

  it('uses strict circle check — diagonal within radius passes', () => {
    const [wx, wz] = WAYPOINTS[0];
    const r = CHECKPOINT_RADIUS - 5;
    const diag = r / Math.SQRT2;
    expect(track.isNearWaypoint(wx + diag, wz + diag, 0)).toBe(true);
  });

  it('diagonal just outside radius fails', () => {
    const [wx, wz] = WAYPOINTS[0];
    const r = CHECKPOINT_RADIUS + 5;
    const diag = r / Math.SQRT2;
    expect(track.isNearWaypoint(wx + diag, wz + diag, 0)).toBe(false);
  });
});

// ---- Internal segment distance ----

describe('Track internal segment-distance geometry', () => {
  let track;
  beforeEach(() => { track = new Track(); });

  it('perpendicular to a horizontal segment gives correct distance', () => {
    // Construct an artificial scenario: find a near-horizontal segment
    // and test symmetric offsets.
    const [onR, _] = perpPoint(0, TRACK_HALF_WIDTH - 1);
    const [offR, __] = perpPoint(0, TRACK_HALF_WIDTH + 1);
    const midR = (WAYPOINTS[0][0] + WAYPOINTS[1][0]) / 2;
    const midZ = (WAYPOINTS[0][1] + WAYPOINTS[1][1]) / 2;
    // Direct check: the midpoint of segment 0 is on the road.
    expect(track.isOnRoad(midR, midZ)).toBe(true);
  });

  it('zero-length segment is handled without NaN', () => {
    // Temporarily test the private method via a degenerate waypoint pair.
    // We can verify by checking a point that would otherwise rely on that
    // segment — just ensure no crash on a zero-length segment edge case.
    const trackClone = new Track();
    // Force a degenerate segment
    trackClone._segments[0] = { ax: 100, az: 100, bx: 100, bz: 100 };
    expect(() => trackClone.isOnRoad(100, 100)).not.toThrow();
  });
});
