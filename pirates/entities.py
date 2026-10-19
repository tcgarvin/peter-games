import math
import random
import json
import os
import pygame
from typing import List, Optional

# Load configuration
config_path = os.path.join(os.path.dirname(__file__), 'config.json')
with open(config_path, 'r') as f:
    config = json.load(f)

# Screen constants
SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 900
FPS = 60

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 50, 50)
BLUE = (50, 50, 255)
BROWN = (139, 69, 19)
DARK_BLUE = (0, 50, 100)
LIGHT_BLUE = (70, 130, 180)
YELLOW = (255, 255, 0)
GREEN = (0, 255, 0)
GRAY = (128, 128, 128)

# Ship physics constants
SHIP_SIZE = 40
SHIP_WIDTH = 25
SHIP_ROTATION_SPEED = config['ship']['rotation_speed']
SHIP_DRAG = config['ship']['drag']
MAX_VELOCITY = config['ship']['max_velocity']

# Sail level constants
SAIL_NONE = 0
SAIL_MID = 1
SAIL_FULL = 2

SAIL_ACCELERATION = {
    SAIL_NONE: config['sail_acceleration']['none'],
    SAIL_MID: config['sail_acceleration']['mid'],
    SAIL_FULL: config['sail_acceleration']['full']
}

# Combat constants
SHIP_MAX_HP = 5
CANNON_COOLDOWN = config['cannon']['cooldown']
CANNONBALL_SPEED = config['cannon']['speed']
CANNONBALL_LIFETIME = config['cannon']['lifetime']
CANNONBALL_RADIUS = 6
BROADSIDE_COUNT = config['cannon']['broadside_count']

# Port constants
PORT_RADIUS = 50
PORT_COLOR = BROWN


class Entity:
    def __init__(self, x: float, y: float, size: float):
        self.x = x
        self.y = y
        self.size = size

    def get_distance(self, other: 'Entity') -> float:
        dx = self.x - other.x
        dy = self.y - other.y
        return math.sqrt(dx**2 + dy**2)

    def is_colliding(self, other: 'Entity') -> bool:
        distance = self.get_distance(other)
        return distance < (self.size + other.size)


class Ship(Entity):
    def __init__(self, x: float, y: float, angle: float, color, player_num: int):
        super().__init__(x, y, SHIP_SIZE)
        self.angle = angle
        self.velocity_x = 0.0
        self.velocity_y = 0.0
        self.color = color
        self.player_num = player_num

        self.sail_level = SAIL_MID
        self.hp = SHIP_MAX_HP
        self.destroyed = False
        self.fled = False

        self.port_cannon_cooldown = 0
        self.starboard_cannon_cooldown = 0

    def update(self, rotation_input: int, sail_input: int):
        self.angle += rotation_input * SHIP_ROTATION_SPEED
        self.angle %= 360

        if sail_input > 0:
            self.sail_level = min(SAIL_FULL, self.sail_level + 1)
        elif sail_input < 0:
            self.sail_level = max(SAIL_NONE, self.sail_level - 1)

        angle_rad = math.radians(self.angle)
        acceleration = SAIL_ACCELERATION[self.sail_level]

        self.velocity_x += math.cos(angle_rad) * acceleration
        self.velocity_y += math.sin(angle_rad) * acceleration

        self.velocity_x *= SHIP_DRAG
        self.velocity_y *= SHIP_DRAG

        velocity = math.sqrt(self.velocity_x**2 + self.velocity_y**2)
        if velocity > MAX_VELOCITY:
            scale = MAX_VELOCITY / velocity
            self.velocity_x *= scale
            self.velocity_y *= scale

        self.x += self.velocity_x
        self.y += self.velocity_y

        self.check_boundary()

        if self.port_cannon_cooldown > 0:
            self.port_cannon_cooldown -= 1
        if self.starboard_cannon_cooldown > 0:
            self.starboard_cannon_cooldown -= 1

    def fire_broadside(self, side: str) -> List['Cannonball']:
        if side == "port" and self.port_cannon_cooldown > 0:
            return []
        if side == "starboard" and self.starboard_cannon_cooldown > 0:
            return []

        cannonballs = []
        angle_rad = math.radians(self.angle)

        if side == "port":
            fire_angle = self.angle - 90
            self.port_cannon_cooldown = CANNON_COOLDOWN
        else:
            fire_angle = self.angle + 90
            self.starboard_cannon_cooldown = CANNON_COOLDOWN

        for i in range(BROADSIDE_COUNT):
            perpendicular_angle = angle_rad + (math.pi/2 if side == "port" else -math.pi/2)
            offset = (i - BROADSIDE_COUNT//2) * (SHIP_SIZE / BROADSIDE_COUNT)

            start_x = self.x + math.cos(angle_rad) * offset + math.cos(perpendicular_angle) * (SHIP_WIDTH/2)
            start_y = self.y + math.sin(angle_rad) * offset + math.sin(perpendicular_angle) * (SHIP_WIDTH/2)

            spread = random.uniform(-5, 5)
            ball_angle = fire_angle + spread

            cannonballs.append(Cannonball(start_x, start_y, ball_angle, self.player_num))

        return cannonballs

    def draw(self, screen: pygame.Surface):
        if self.destroyed:
            return

        angle_rad = math.radians(self.angle)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)

        bow_x = self.x + cos_a * (SHIP_SIZE / 2)
        bow_y = self.y + sin_a * (SHIP_SIZE / 2)

        port_mid_offset = -math.pi/2
        port_mid_x = self.x + math.cos(angle_rad + port_mid_offset) * (SHIP_WIDTH / 2)
        port_mid_y = self.y + math.sin(angle_rad + port_mid_offset) * (SHIP_WIDTH / 2)

        starboard_mid_offset = math.pi/2
        starboard_mid_x = self.x + math.cos(angle_rad + starboard_mid_offset) * (SHIP_WIDTH / 2)
        starboard_mid_y = self.y + math.sin(angle_rad + starboard_mid_offset) * (SHIP_WIDTH / 2)

        aft_x = self.x - cos_a * (SHIP_SIZE / 2)
        aft_y = self.y - sin_a * (SHIP_SIZE / 2)

        port_aft_x = aft_x + math.cos(angle_rad + port_mid_offset) * (SHIP_WIDTH / 3)
        port_aft_y = aft_y + math.sin(angle_rad + port_mid_offset) * (SHIP_WIDTH / 3)

        starboard_aft_x = aft_x + math.cos(angle_rad + starboard_mid_offset) * (SHIP_WIDTH / 3)
        starboard_aft_y = aft_y + math.sin(angle_rad + starboard_mid_offset) * (SHIP_WIDTH / 3)

        hull_points = [
            (bow_x, bow_y),
            (starboard_mid_x, starboard_mid_y),
            (starboard_aft_x, starboard_aft_y),
            (aft_x, aft_y),
            (port_aft_x, port_aft_y),
            (port_mid_x, port_mid_y)
        ]
        pygame.draw.polygon(screen, BROWN, hull_points)
        pygame.draw.polygon(screen, self.color, hull_points, 2)

        if self.sail_level > SAIL_NONE:
            sail_width = SHIP_WIDTH * 0.6
            sail_height = SHIP_SIZE * 0.4 if self.sail_level == SAIL_MID else SHIP_SIZE * 0.6

            sail_center_x = self.x + cos_a * (SHIP_SIZE * 0.1)
            sail_center_y = self.y + sin_a * (SHIP_SIZE * 0.1)

            sail_surf = pygame.Surface((int(sail_width * 1.5), int(sail_height * 1.5)), pygame.SRCALPHA)
            pygame.draw.ellipse(sail_surf, WHITE, (0, 0, int(sail_width), int(sail_height)))
            rotated_sail = pygame.transform.rotate(sail_surf, -self.angle)
            sail_rect = rotated_sail.get_rect(center=(int(sail_center_x), int(sail_center_y)))
            screen.blit(rotated_sail, sail_rect)

        self.draw_hp_bar(screen)

    def draw_hp_bar(self, screen: pygame.Surface):
        bar_width = 50
        bar_height = 6
        bar_x = int(self.x - bar_width / 2)
        bar_y = int(self.y - SHIP_SIZE - 15)

        pygame.draw.rect(screen, BLACK, (bar_x, bar_y, bar_width, bar_height))

        hp_ratio = self.hp / SHIP_MAX_HP
        fill_width = int(bar_width * hp_ratio)

        if hp_ratio > 0.6:
            color = GREEN
        elif hp_ratio > 0.3:
            color = YELLOW
        else:
            color = RED

        pygame.draw.rect(screen, color, (bar_x, bar_y, fill_width, bar_height))

    def take_damage(self, amount: int):
        self.hp -= amount
        if self.hp <= 0:
            self.hp = 0
            self.destroyed = True

    def check_boundary(self) -> bool:
        """Check if ship has fled the battlefield. Returns True if ship left the map."""
        if self.x < 0 or self.x > SCREEN_WIDTH or self.y < 0 or self.y > SCREEN_HEIGHT:
            self.fled = True
            self.destroyed = True
            return True
        return False


class Cannonball(Entity):
    def __init__(self, x: float, y: float, angle: float, owner_player: int):
        super().__init__(x, y, CANNONBALL_RADIUS)
        self.angle = angle
        self.owner_player = owner_player
        self.lifetime = CANNONBALL_LIFETIME

        angle_rad = math.radians(angle)
        self.velocity_x = math.cos(angle_rad) * CANNONBALL_SPEED
        self.velocity_y = math.sin(angle_rad) * CANNONBALL_SPEED

    def update(self):
        self.x += self.velocity_x
        self.y += self.velocity_y
        self.lifetime -= 1

    def is_expired(self) -> bool:
        return (self.lifetime <= 0 or
                self.x < 0 or self.x > SCREEN_WIDTH or
                self.y < 0 or self.y > SCREEN_HEIGHT)

    def draw(self, screen: pygame.Surface):
        pygame.draw.circle(screen, BLACK, (int(self.x), int(self.y)), self.size)
        pygame.draw.circle(screen, (50, 50, 50), (int(self.x - 2), int(self.y - 2)), self.size // 2)

    def is_colliding_with_ship(self, ship: Ship) -> bool:
        if self.owner_player == ship.player_num:
            return False

        distance = math.sqrt((self.x - ship.x)**2 + (self.y - ship.y)**2)
        return distance < (self.size + ship.size)


class Port:
    def __init__(self, x: float, y: float, name: str):
        self.x = x
        self.y = y
        self.name = name
        self.radius = PORT_RADIUS

    def draw(self, screen: pygame.Surface):
        pygame.draw.circle(screen, PORT_COLOR, (int(self.x), int(self.y)), self.radius)
        pygame.draw.circle(screen, BLACK, (int(self.x), int(self.y)), self.radius, 3)

        for i in range(3):
            offset = (i - 1) * 15
            pygame.draw.line(screen, BROWN,
                           (self.x - self.radius, self.y + offset),
                           (self.x + self.radius, self.y + offset), 2)
