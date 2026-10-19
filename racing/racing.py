#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "pygame"
# ]
# ///

import pygame
import math
import random

# --- Constants ---
SCREEN_WIDTH = 1728
SCREEN_HEIGHT = 1080
FPS = 60
TOTAL_LAPS = 3

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
TRACK_COLOR = (75, 75, 75)
TRACK_BORDER = (220, 220, 220)
GRASS_COLOR = (45, 110, 45)
BLUE = (0, 114, 178)
ORANGE = (230, 159, 0)
YELLOW = (255, 215, 0)
GREEN_PU = (0, 200, 100)
RED = (210, 50, 50)
DARK_RED = (140, 0, 0)
LIGHT_GRAY = (180, 180, 180)
DARK_OVERLAY = (0, 0, 0, 170)

# Track center-line waypoints (closed loop, clockwise).
# Includes a hairpin at the bottom-right (WP 4-8).
TRACK_WAYPOINTS = [
    (864, 85),    # 0  start/finish — top center
    (1380, 110),  # 1  top-right approach
    (1620, 295),  # 2  right upper
    (1620, 545),  # 3  right straight   ← required checkpoint
    (1560, 715),  # 4  hairpin entry
    (1450, 845),  # 5  hairpin right arm
    (1310, 895),  # 6  hairpin apex     ← required checkpoint
    (1170, 845),  # 7  hairpin left arm
    (1060, 715),  # 8  hairpin exit
    (830,  820),  # 9  bottom centre-right
    (570,  950),  # 10 bottom left      ← required checkpoint
    (270,  835),  # 11 left lower
    (110,  610),  # 12 left straight    ← required checkpoint
    (110,  370),  # 13 left upper
    (310,  130),  # 14 top left
]
TRACK_WIDTH = 140
CHECKPOINT_RADIUS = 85
CHECKPOINT_COOLDOWN = FPS * 3
REQUIRED_CHECKPOINTS = {3, 6, 10, 12}

# Car physics
MAX_SPEED = 3.5
ACCELERATION = 0.10
BRAKING = 0.18
FRICTION = 0.04
WALL_SPEED_LOSS = 0.45
TURN_SPEED = 3.0  # degrees/frame at max speed

# Power-up settings
SPEED_BOOST_MULT = 1.8
SPEED_BOOST_FRAMES = 5 * FPS
ARMOR_MAX = 3
MAX_AMMO = 5
BULLET_SPEED = 12
BULLET_RADIUS = 5
BULLET_LIFETIME = FPS * 2
MAX_HEALTH = 3
POWERUP_RESPAWN_FRAMES = 9 * FPS
POWERUP_RADIUS = 18
POWERUP_FLOAT_SPEED = 0.05

CAR_W = 42
CAR_H = 24
CAR_HEIGHT_PX = 10  # pseudo-3D height of car body above ground

POWERUP_POSITIONS = [
    (864,  380),  # top-centre island
    (1250, 115),  # top straight
    (1620, 420),  # right straight
    (1310, 895),  # hairpin apex
    (700,  885),  # bottom section
    (110,  490),  # left straight
]


def _track_direction_at(wp_idx: int) -> tuple[float, float]:
    """Unit vector of clockwise track direction at a waypoint."""
    n = len(TRACK_WAYPOINTS)
    prev = TRACK_WAYPOINTS[(wp_idx - 1) % n]
    nxt  = TRACK_WAYPOINTS[(wp_idx + 1) % n]
    dx = nxt[0] - prev[0]
    dy = nxt[1] - prev[1]
    length = math.hypot(dx, dy)
    return (dx / length, dy / length)


# ---------------------------------------------------------------------------
# Track
# ---------------------------------------------------------------------------

class Track:
    """Builds the race track surface and on-track collision mask."""

    def __init__(self):
        self.surface      = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
        self.mask_surface = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT))
        self._build()
        self.on_track_mask = pygame.mask.from_threshold(
            self.mask_surface, TRACK_COLOR, (30, 30, 30, 255)
        )

    # ------------------------------------------------------------------
    def _draw_segment(self, surface: pygame.Surface, color: tuple,
                      p1: tuple, p2: tuple, width: int):
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < 1:
            return
        px = -dy / length * width / 2
        py =  dx / length * width / 2
        pts = [
            (p1[0] + px, p1[1] + py),
            (p2[0] + px, p2[1] + py),
            (p2[0] - px, p2[1] - py),
            (p1[0] - px, p1[1] - py),
        ]
        pygame.draw.polygon(surface, color, pts)
        pygame.draw.circle(surface, color, (int(p1[0]), int(p1[1])), width // 2)
        pygame.draw.circle(surface, color, (int(p2[0]), int(p2[1])), width // 2)

    def _build(self):
        self.surface.fill(GRASS_COLOR)
        self.mask_surface.fill(BLACK)

        wps = TRACK_WAYPOINTS
        n   = len(wps)

        for i in range(n):
            self._draw_segment(self.surface,      TRACK_BORDER, wps[i], wps[(i+1)%n], TRACK_WIDTH + 14)
            self._draw_segment(self.mask_surface, TRACK_BORDER, wps[i], wps[(i+1)%n], TRACK_WIDTH + 14)

        for i in range(n):
            self._draw_segment(self.surface,      TRACK_COLOR, wps[i], wps[(i+1)%n], TRACK_WIDTH)
            self._draw_segment(self.mask_surface, TRACK_COLOR, wps[i], wps[(i+1)%n], TRACK_WIDTH)

        # Dashed centre line
        for i in range(n):
            p1 = wps[i]; p2 = wps[(i+1)%n]
            dx = p2[0]-p1[0]; dy = p2[1]-p1[1]
            steps = max(1, int(math.hypot(dx, dy) / 30))
            for s in range(steps):
                if s % 2 == 0:
                    t1, t2 = s/steps, (s+0.5)/steps
                    pygame.draw.line(
                        self.surface, LIGHT_GRAY,
                        (int(p1[0]+dx*t1), int(p1[1]+dy*t1)),
                        (int(p1[0]+dx*t2), int(p1[1]+dy*t2)), 3)

        # Checkerboard start/finish line at WP[0]
        p0 = wps[0]
        fwd_dx, fwd_dy = _track_direction_at(0)
        perp_x, perp_y = -fwd_dy, fwd_dx
        half = TRACK_WIDTH // 2 + 7
        sx1, sy1 = int(p0[0]+perp_x*half), int(p0[1]+perp_y*half)
        sx2, sy2 = int(p0[0]-perp_x*half), int(p0[1]-perp_y*half)
        for k in range(10):
            t1, t2 = k/10, (k+1)/10
            color = WHITE if k%2==0 else BLACK
            pygame.draw.line(
                self.surface, color,
                (int(sx1+(sx2-sx1)*t1), int(sy1+(sy2-sy1)*t1)),
                (int(sx1+(sx2-sx1)*t2), int(sy1+(sy2-sy1)*t2)), 8)

    def is_on_track(self, x: float, y: float) -> bool:
        xi, yi = int(x), int(y)
        if xi < 0 or xi >= SCREEN_WIDTH or yi < 0 or yi >= SCREEN_HEIGHT:
            return False
        return bool(self.on_track_mask.get_at((xi, yi)))


# ---------------------------------------------------------------------------
# Bullet
# ---------------------------------------------------------------------------

class Bullet:
    def __init__(self, x: float, y: float, angle: float, owner: "Car"):
        self.x, self.y = x, y
        rad = math.radians(angle)
        self.vx =  BULLET_SPEED * math.cos(rad)
        self.vy = -BULLET_SPEED * math.sin(rad)
        self.owner    = owner
        self.lifetime = BULLET_LIFETIME
        self.active   = True

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.lifetime -= 1
        if (self.lifetime <= 0
                or self.x < 0 or self.x > SCREEN_WIDTH
                or self.y < 0 or self.y > SCREEN_HEIGHT):
            self.active = False

    def draw(self, surface: pygame.Surface):
        if self.active:
            pygame.draw.circle(surface, DARK_RED, (int(self.x), int(self.y)), BULLET_RADIUS)
            pygame.draw.circle(surface, YELLOW,   (int(self.x), int(self.y)), BULLET_RADIUS - 2)


# ---------------------------------------------------------------------------
# PowerUp
# ---------------------------------------------------------------------------

class PowerUp:
    _COLORS = {"speed": YELLOW, "armor": GREEN_PU, "gun": RED}
    _ICONS  = {"speed": "S",    "armor": "A",       "gun": "G"}

    def __init__(self, x: float, y: float, kind: str):
        self.x, self.y = x, y
        self.kind          = kind
        self.active        = True
        self.respawn_timer = 0
        self.float_phase   = random.uniform(0, math.pi * 2)

    def collect(self):
        self.active        = False
        self.respawn_timer = POWERUP_RESPAWN_FRAMES

    def update(self):
        if not self.active:
            self.respawn_timer -= 1
            if self.respawn_timer <= 0:
                self.active = True
                self.kind   = random.choice(["speed", "armor", "gun"])
        self.float_phase += POWERUP_FLOAT_SPEED

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        if not self.active:
            return
        bob = math.sin(self.float_phase) * 3
        color = self._COLORS[self.kind]
        cx, cy = int(self.x), int(self.y + bob)
        pygame.draw.circle(surface, color, (cx, cy), POWERUP_RADIUS + 4)
        pygame.draw.circle(surface, WHITE, (cx, cy), POWERUP_RADIUS + 2, 2)
        pygame.draw.circle(surface, color, (cx, cy), POWERUP_RADIUS)
        text = font.render(self._ICONS[self.kind], True, BLACK)
        surface.blit(text, text.get_rect(center=(cx, cy)))


# ---------------------------------------------------------------------------
# Car
# ---------------------------------------------------------------------------

class Car:
    def __init__(self, x: float, y: float, angle: float, color: tuple,
                 controls: dict, name: str):
        self.x, self.y = x, y
        self.angle  = angle   # degrees; 0=right, CCW positive
        self.speed  = 0.0
        self.color  = color
        self.controls = controls
        self.name   = name

        self.health = MAX_HEALTH
        self.armor  = 0
        self.ammo   = 0
        self.speed_boost_timer = 0

        self.lap             = 0
        self.checkpoints_hit: set[int]  = set()
        self.checkpoint_cooldowns: dict[int, int] = {0: CHECKPOINT_COOLDOWN}
        self.finished = False

        self.shoot_cooldown = 0
        self.hit_flash      = 0
        self.alive          = True

        # Small scratch surface for the alpha-blended drop shadow
        _sdim = (CAR_W + CAR_H) * 3
        self._shadow_surf = pygame.Surface((_sdim, _sdim), pygame.SRCALPHA)
        self._shadow_half = _sdim // 2

    @property
    def effective_max_speed(self) -> float:
        return MAX_SPEED * SPEED_BOOST_MULT if self.speed_boost_timer > 0 else MAX_SPEED

    def update(self, keys_pressed, track: Track):
        if not self.alive:
            return

        accel = keys_pressed[self.controls["accel"]]
        brake = keys_pressed[self.controls["brake"]]
        left  = keys_pressed[self.controls["left"]]
        right = keys_pressed[self.controls["right"]]

        if abs(self.speed) > 0.1:
            turn_factor = min(abs(self.speed) / MAX_SPEED, 1.0)
            direction   = 1 if self.speed > 0 else -1
            if left:  self.angle += TURN_SPEED * turn_factor * direction
            if right: self.angle -= TURN_SPEED * turn_factor * direction

        top = self.effective_max_speed
        if accel:
            self.speed = min(self.speed + ACCELERATION, top)
        elif brake:
            self.speed = max(self.speed - BRAKING, -top * 0.5)
        else:
            if self.speed > 0:
                self.speed = max(0.0, self.speed - FRICTION)
            elif self.speed < 0:
                self.speed = min(0.0, self.speed + FRICTION)

        # Wall collision — try to slide along walls
        prev_x, prev_y = self.x, self.y
        rad   = math.radians(self.angle)
        new_x = max(CAR_W, min(SCREEN_WIDTH  - CAR_W, self.x + self.speed * math.cos(rad)))
        new_y = max(CAR_H, min(SCREEN_HEIGHT - CAR_H, self.y - self.speed * math.sin(rad)))

        if track.is_on_track(new_x, new_y):
            self.x, self.y = new_x, new_y
        elif track.is_on_track(prev_x, new_y):
            self.y     = new_y
            self.speed *= WALL_SPEED_LOSS
        elif track.is_on_track(new_x, prev_y):
            self.x     = new_x
            self.speed *= WALL_SPEED_LOSS
        else:
            self.speed *= 0.2

        # Timers
        if self.speed_boost_timer > 0: self.speed_boost_timer -= 1
        if self.shoot_cooldown    > 0: self.shoot_cooldown    -= 1
        if self.hit_flash         > 0: self.hit_flash         -= 1

        for k in list(self.checkpoint_cooldowns):
            self.checkpoint_cooldowns[k] -= 1
            if self.checkpoint_cooldowns[k] <= 0:
                del self.checkpoint_cooldowns[k]

        for idx, (wx, wy) in enumerate(TRACK_WAYPOINTS):
            if idx in self.checkpoint_cooldowns:
                continue
            if math.hypot(self.x - wx, self.y - wy) < CHECKPOINT_RADIUS:
                self.checkpoint_cooldowns[idx] = CHECKPOINT_COOLDOWN
                if idx == 0:
                    if REQUIRED_CHECKPOINTS.issubset(self.checkpoints_hit) and not self.finished:
                        self.lap += 1
                        self.checkpoints_hit = set()
                        if self.lap >= TOTAL_LAPS:
                            self.finished = True
                else:
                    self.checkpoints_hit.add(idx)

    def shoot(self) -> "Bullet | None":
        if self.ammo > 0 and self.shoot_cooldown == 0:
            self.ammo -= 1
            self.shoot_cooldown = 15
            rad = math.radians(self.angle)
            return Bullet(
                self.x + math.cos(rad) * (CAR_W * 0.7),
                self.y - math.sin(rad) * (CAR_W * 0.7),
                self.angle, self,
            )
        return None

    def take_hit(self) -> bool:
        self.hit_flash = 20
        if self.armor > 0:
            self.armor -= 1
            return False
        self.health -= 1
        if self.health <= 0:
            self.alive = False
            return True
        return False

    def collect_powerup(self, kind: str):
        if kind == "speed":
            self.speed_boost_timer = SPEED_BOOST_FRAMES
        elif kind == "armor":
            self.armor = min(self.armor + 1, ARMOR_MAX)
        elif kind == "gun":
            self.ammo = min(self.ammo + MAX_AMMO, MAX_AMMO * 2)

    def draw(self, surface: pygame.Surface):
        flashing = self.hit_flash > 0 and (self.hit_flash // 3) % 2 == 0
        color = (255, 255, 255) if flashing else self.color
        self._draw_3d(surface, color)

        if self.speed_boost_timer > 0:
            rad = math.radians(self.angle)
            tx = int(self.x - math.cos(rad) * CAR_W * 0.8)
            ty = int(self.y + math.sin(rad) * CAR_W * 0.8)
            pygame.draw.circle(surface, YELLOW, (tx, ty), 7)

        if self.armor > 0:
            pygame.draw.circle(surface, GREEN_PU,
                               (int(self.x), int(self.y)), max(CAR_W, CAR_H)//2 + 9, 3)

    def _draw_3d(self, surface: pygame.Surface, color: tuple):
        """Render the car as a pseudo-3D box viewed from above with visible side faces."""
        H = CAR_HEIGHT_PX
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)

        L = CAR_W * 0.55  # half-length (front–rear)
        W = CAR_H * 0.55  # half-width  (left–right)

        # Screen-space basis: angle=0 → car faces right (+x); pygame y increases downward
        fwd = (cos_a, -sin_a)
        rgt = (sin_a,  cos_a)

        cx, cy = self.x, self.y

        def pt(fl: float, rw: float, elev: float = 0.0) -> tuple[float, float]:
            """World point: fl along forward, rw along right, elev above ground."""
            return (
                cx + fwd[0]*fl*L + rgt[0]*rw*W,
                cy + fwd[1]*fl*L + rgt[1]*rw*W - elev,
            )

        def ipoly(pts: list, col: tuple):
            pygame.draw.polygon(surface, col, [(int(x), int(y)) for x, y in pts])

        def shaded(factor: float) -> tuple:
            return tuple(max(0, min(255, int(c * factor))) for c in color)

        # ── Drop shadow ─────────────────────────────────────────────────────────
        sh = self._shadow_half
        spts = [
            (int(pt(fl, rw)[0] - cx + sh + 1), int(pt(fl, rw)[1] - cy + sh + 6))
            for fl, rw in [(1.1, 1.2), (1.1, -1.2), (-1.1, -1.2), (-1.1, 1.2)]
        ]
        self._shadow_surf.fill((0, 0, 0, 0))
        pygame.draw.polygon(self._shadow_surf, (0, 0, 0, 65), spts)
        surface.blit(self._shadow_surf, (int(cx - sh), int(cy - sh)))

        # ── Body side faces ──────────────────────────────────────────────────────
        # A face is visible when its outward normal has a positive screen-y component
        # (i.e. the face points "southward" / toward the bottom of the screen).
        # Normal y-components:  right=cos_a, left=-cos_a, front=-sin_a, rear=sin_a

        if rgt[1] > 0:   # right side
            ipoly([pt(1, 1, 0), pt(-1, 1, 0), pt(-1, 1, H), pt(1, 1, H)],
                  shaded(0.35 + 0.45 * rgt[1]))

        if -rgt[1] > 0:  # left side
            ipoly([pt(1, -1, 0), pt(-1, -1, 0), pt(-1, -1, H), pt(1, -1, H)],
                  shaded(0.35 + 0.45 * (-rgt[1])))

        if fwd[1] > 0:   # front side (car faces down-screen at this angle)
            ipoly([pt(1, 1, 0), pt(1, -1, 0), pt(1, -1, H), pt(1, 1, H)],
                  shaded(0.35 + 0.45 * fwd[1]))

        if -fwd[1] > 0:  # rear side
            ipoly([pt(-1, 1, 0), pt(-1, -1, 0), pt(-1, -1, H), pt(-1, 1, H)],
                  shaded(0.35 + 0.45 * (-fwd[1])))

        # ── Body top face ────────────────────────────────────────────────────────
        top_corners = [(1, 1), (1, -1), (-1, -1), (-1, 1)]
        ipoly([pt(fl, rw, H) for fl, rw in top_corners], shaded(1.0))
        # Thin highlight edge
        pygame.draw.polygon(surface, shaded(1.35),
                            [(int(pt(fl, rw, H)[0]), int(pt(fl, rw, H)[1]))
                             for fl, rw in top_corners], 1)

        # ── Cabin (raised roof section) ──────────────────────────────────────────
        CABIN_H = H + 5
        cabin_corners = [(0.58, 0.62), (0.58, -0.62), (-0.22, -0.62), (-0.22, 0.62)]

        # Cabin side walls — same visibility test as body sides
        if rgt[1] > 0:
            ipoly([pt(0.58, 0.62, H), pt(-0.22, 0.62, H),
                   pt(-0.22, 0.62, CABIN_H), pt(0.58, 0.62, CABIN_H)],
                  shaded(0.45 + 0.35 * rgt[1]))
        if -rgt[1] > 0:
            ipoly([pt(0.58, -0.62, H), pt(-0.22, -0.62, H),
                   pt(-0.22, -0.62, CABIN_H), pt(0.58, -0.62, CABIN_H)],
                  shaded(0.45 + 0.35 * (-rgt[1])))
        if fwd[1] > 0:
            ipoly([pt(0.58, 0.62, H), pt(0.58, -0.62, H),
                   pt(0.58, -0.62, CABIN_H), pt(0.58, 0.62, CABIN_H)],
                  (160, 205, 255))  # windshield glass on front cabin wall
        if -fwd[1] > 0:
            ipoly([pt(-0.22, 0.62, H), pt(-0.22, -0.62, H),
                   pt(-0.22, -0.62, CABIN_H), pt(-0.22, 0.62, CABIN_H)],
                  (140, 185, 235))  # rear window

        # Cabin roof
        ipoly([pt(fl, rw, CABIN_H) for fl, rw in cabin_corners], shaded(1.2))

        # ── Windshield stripe on body top face (visible from directly above) ─────
        ipoly([pt(0.58, 0.57, H), pt(0.58, -0.57, H),
               pt(0.42, -0.57, H), pt(0.42, 0.57, H)],
              (160, 205, 255))
        # Rear window stripe
        ipoly([pt(-0.22, 0.57, H), pt(-0.22, -0.57, H),
               pt(-0.35, -0.57, H), pt(-0.35, 0.57, H)],
              (140, 185, 235))

        # ── Wheels ───────────────────────────────────────────────────────────────
        for wf, wr in [(0.78, 1.1), (0.78, -1.1), (-0.65, 1.1), (-0.65, -1.1)]:
            wx, wy = pt(wf, wr, 0)
            pygame.draw.circle(surface, (20, 20, 20),   (int(wx), int(wy)), 6)
            pygame.draw.circle(surface, (155, 155, 165), (int(wx), int(wy)), 3)

        # ── Headlights ───────────────────────────────────────────────────────────
        for wr in (0.65, -0.65):
            hx, hy = pt(1.12, wr, H * 0.45)
            pygame.draw.circle(surface, (255, 250, 180), (int(hx), int(hy)), 3)

        # ── Taillights ───────────────────────────────────────────────────────────
        for wr in (0.65, -0.65):
            tx, ty = pt(-1.12, wr, H * 0.45)
            pygame.draw.circle(surface, (210, 30, 30), (int(tx), int(ty)), 3)

    def draw_hud(self, surface: pygame.Surface, font: pygame.font.Font,
                 big_font: pygame.font.Font, x: int, y: int):
        surface.blit(big_font.render(self.name, True, self.color), (x, y))
        surface.blit(font.render(f"Lap {self.lap}/{TOTAL_LAPS}", True, WHITE), (x, y+36))
        for i in range(MAX_HEALTH):
            pygame.draw.rect(surface, RED if i < self.health else LIGHT_GRAY,
                             (x + i*24, y+66, 20, 20), border_radius=4)
        for i in range(ARMOR_MAX):
            pygame.draw.rect(surface, GREEN_PU if i < self.armor else LIGHT_GRAY,
                             (x + i*20, y+92, 16, 16), border_radius=3)
        surface.blit(font.render(f"Ammo: {self.ammo}", True,
                                 RED if self.ammo > 0 else LIGHT_GRAY), (x, y+114))
        if self.speed_boost_timer > 0:
            surface.blit(font.render(f"BOOST {self.speed_boost_timer/FPS:.1f}s", True, YELLOW),
                         (x, y+136))


# ---------------------------------------------------------------------------
# Game
# ---------------------------------------------------------------------------

class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Top-Down Racing")
        self.clock = pygame.time.Clock()

        self.font       = pygame.font.SysFont("monospace", 20, bold=True)
        self.big_font   = pygame.font.SysFont("monospace", 30, bold=True)
        self.title_font = pygame.font.SysFont("monospace", 72, bold=True)

        self.track = Track()
        self._setup()

    # ------------------------------------------------------------------
    def _setup(self):
        p1_controls = dict(accel=pygame.K_w, brake=pygame.K_s,
                           left=pygame.K_a,  right=pygame.K_d,
                           shoot=pygame.K_SPACE)
        p2_controls = dict(accel=pygame.K_UP, brake=pygame.K_DOWN,
                           left=pygame.K_LEFT, right=pygame.K_RIGHT,
                           shoot=pygame.K_RETURN)

        wp0 = TRACK_WAYPOINTS[0]
        fwd_dx, fwd_dy = _track_direction_at(0)
        start_angle = math.degrees(math.atan2(-fwd_dy, fwd_dx))
        perp_x, perp_y = -fwd_dy, fwd_dx

        back, side = 60, 26
        p1_x = wp0[0] - fwd_dx*back + perp_x*side
        p1_y = wp0[1] - fwd_dy*back + perp_y*side
        p2_x = wp0[0] - fwd_dx*back - perp_x*side
        p2_y = wp0[1] - fwd_dy*back - perp_y*side

        self.cars = [
            Car(p1_x, p1_y, start_angle, BLUE,   p1_controls, "P1"),
            Car(p2_x, p2_y, start_angle, ORANGE, p2_controls, "P2"),
        ]
        self.bullets: list[Bullet] = []
        self._init_powerups()
        self.winner: "Car | None" = None
        self.state            = "splash"   # splash → countdown → racing → finished
        self.countdown_timer  = FPS * 3

    def _init_powerups(self):
        kinds = ["speed", "armor", "gun", "speed", "armor", "gun"]
        self.powerups = [
            PowerUp(px, py, kinds[i % len(kinds)])
            for i, (px, py) in enumerate(POWERUP_POSITIONS)
        ]

    # ------------------------------------------------------------------
    def handle_events(self) -> bool:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    return False
                if self.state == "splash":
                    self.state = "countdown"
                elif self.state == "finished" and event.key == pygame.K_r:
                    self._setup()
                elif self.state == "racing":
                    for car in self.cars:
                        if event.key == car.controls["shoot"]:
                            bullet = car.shoot()
                            if bullet:
                                self.bullets.append(bullet)
        return True

    def update(self):
        if self.state == "splash":
            return
        if self.state == "countdown":
            self.countdown_timer -= 1
            if self.countdown_timer <= 0:
                self.state = "racing"
            return
        if self.state == "finished":
            return

        keys = pygame.key.get_pressed()

        for car in self.cars:
            car.update(keys, self.track)

        for pu in self.powerups:
            pu.update()
            if pu.active:
                for car in self.cars:
                    if car.alive and math.hypot(car.x - pu.x, car.y - pu.y) < POWERUP_RADIUS + 20:
                        car.collect_powerup(pu.kind)
                        pu.collect()

        for bullet in self.bullets:
            bullet.update()
            if not bullet.active:
                continue
            for car in self.cars:
                if car is bullet.owner or not car.alive:
                    continue
                if math.hypot(car.x - bullet.x, car.y - bullet.y) < max(CAR_W, CAR_H)//2 + BULLET_RADIUS:
                    bullet.active = False
                    car.take_hit()

        self.bullets = [b for b in self.bullets if b.active]

        for car in self.cars:
            if car.finished and self.winner is None:
                self.winner = car
                self.state  = "finished"
            if not car.alive and self.winner is None:
                self.winner = next(c for c in self.cars if c is not car)
                self.state  = "finished"

    # ------------------------------------------------------------------
    def draw(self):
        self.screen.blit(self.track.surface, (0, 0))

        for pu in self.powerups:
            pu.draw(self.screen, self.font)
        for car in self.cars:
            car.draw(self.screen)
        for bullet in self.bullets:
            bullet.draw(self.screen)

        self._draw_hud()

        if self.state == "splash":
            self._draw_splash()
        elif self.state == "countdown":
            self._draw_countdown()
        elif self.state == "finished":
            self._draw_winner()

        pygame.display.flip()

    # ------------------------------------------------------------------
    def _overlay(self, alpha: int = 170):
        surf = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        surf.fill((0, 0, 0, alpha))
        self.screen.blit(surf, (0, 0))

    def _draw_splash(self):
        self._overlay(180)

        title = self.title_font.render("TOP-DOWN RACING", True, YELLOW)
        self.screen.blit(title, title.get_rect(centerx=SCREEN_WIDTH//2, y=80))

        cx = SCREEN_WIDTH // 2
        panel_y = 220

        def row(label, value, color, y):
            lbl = self.big_font.render(label, True, LIGHT_GRAY)
            val = self.big_font.render(value,  True, color)
            self.screen.blit(lbl, lbl.get_rect(right=cx - 30, centery=y))
            self.screen.blit(val, val.get_rect(left =cx + 30, centery=y))

        # Divider line
        pygame.draw.line(self.screen, LIGHT_GRAY, (cx, panel_y - 10), (cx, panel_y + 430), 2)

        # Column headers
        p1h = self.big_font.render("PLAYER 1", True, BLUE)
        p2h = self.big_font.render("PLAYER 2", True, ORANGE)
        self.screen.blit(p1h, p1h.get_rect(centerx=cx//2,         y=panel_y))
        self.screen.blit(p2h, p2h.get_rect(centerx=cx + cx//2,    y=panel_y))

        panel_y += 55
        actions = [
            ("Accelerate",    "W",          "↑"),
            ("Brake/Reverse", "S",          "↓"),
            ("Turn Left",     "A",          "←"),
            ("Turn Right",    "D",          "→"),
            ("Shoot",         "SPACE",      "ENTER"),
        ]
        for i, (action, k1, k2) in enumerate(actions):
            y = panel_y + i * 68
            act_surf = self.font.render(action, True, WHITE)
            self.screen.blit(act_surf, act_surf.get_rect(centerx=cx, centery=y))

            k1_surf = self.big_font.render(f"[ {k1} ]", True, BLUE)
            k2_surf = self.big_font.render(f"[ {k2} ]", True, ORANGE)
            self.screen.blit(k1_surf, k1_surf.get_rect(centerx=cx//2,       centery=y))
            self.screen.blit(k2_surf, k2_surf.get_rect(centerx=cx + cx//2,  centery=y))

        # Power-up legend
        pu_y = panel_y + len(actions) * 68 + 40
        legend_label = self.big_font.render("Power-ups:", True, WHITE)
        self.screen.blit(legend_label, legend_label.get_rect(centerx=cx, y=pu_y))
        pu_y += 40
        powerups_info = [
            (YELLOW,   "S = Speed boost (1.8× for 5 s)"),
            (GREEN_PU, "A = Armor  (absorbs bullet hits)"),
            (RED,      "G = Gun    (adds 5 shots)"),
        ]
        for color, text in powerups_info:
            surf = self.font.render(text, True, color)
            self.screen.blit(surf, surf.get_rect(centerx=cx, y=pu_y))
            pu_y += 34

        prompt = self.big_font.render("Press any key to start!", True, YELLOW)
        self.screen.blit(prompt, prompt.get_rect(centerx=cx, bottom=SCREEN_HEIGHT - 40))

    def _draw_countdown(self):
        self._overlay(90)
        secs_left = math.ceil(self.countdown_timer / FPS)
        text  = str(secs_left) if secs_left > 0 else "GO!"
        color = (255, 80, 80) if secs_left == 1 else (YELLOW if secs_left == 0 else WHITE)
        surf  = self.title_font.render(text, True, color)
        self.screen.blit(surf, surf.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2)))

    def _draw_winner(self):
        self._overlay(160)
        msg   = f"{self.winner.name} WINS!" if self.winner else "DRAW!"
        color = self.winner.color if self.winner else WHITE
        win_surf = self.title_font.render(msg, True, color)
        self.screen.blit(win_surf, win_surf.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 - 50)))
        sub = self.big_font.render("Press R to restart  |  ESC to quit", True, WHITE)
        self.screen.blit(sub, sub.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 + 50)))

    def _draw_hud(self):
        hud = pygame.Surface((300, 180), pygame.SRCALPHA)
        hud.fill((0, 0, 0, 140))
        self.screen.blit(hud, (8, 8))
        self.cars[0].draw_hud(self.screen, self.font, self.big_font, 16, 14)

        self.screen.blit(hud, (SCREEN_WIDTH - 310, 8))
        self.cars[1].draw_hud(self.screen, self.font, self.big_font, SCREEN_WIDTH - 302, 14)

    # ------------------------------------------------------------------
    def run(self):
        running = True
        while running:
            self.clock.tick(FPS)
            running = self.handle_events()
            self.update()
            self.draw()
        pygame.quit()


def main():
    game = Game()
    game.run()


if __name__ == "__main__":
    main()
