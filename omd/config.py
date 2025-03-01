"""
Game configuration and constants.
"""
import pygame

# Screen settings
SCREEN_WIDTH = 1000
SCREEN_HEIGHT = 800
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
PURPLE = (128, 0, 128)
ORANGE = (255, 165, 0)

# Player settings
PLAYER_RADIUS = 20
PLAYER_SPEED = 5
PLAYER_HEALTH = 100
PLAYER_ATTACK_RADIUS = 50
PLAYER_ATTACK_COOLDOWN = 500  # milliseconds
PLAYER_ATTACK_DAMAGE = 20
PLAYER_COLORS = [BLUE, GREEN]  # Player 1, Player 2

# Enemy settings
ENEMY_TYPES = {
    "basic": {
        "color": RED,
        "radius": 15,
        "speed": 2.0,
        "health": 50,
        "damage": 10,
        "value": 10  # Score for killing
    },
    "fast": {
        "color": YELLOW,
        "radius": 10,
        "speed": 3.0,
        "health": 30,
        "damage": 5,
        "value": 15
    },
    "tank": {
        "color": PURPLE,
        "radius": 25,
        "speed": 1.0,
        "health": 150,
        "damage": 20,
        "value": 25
    }
}

# Collision settings
KNOCKBACK_FORCE = 8.0  # Higher value means stronger knockback

# Map settings
WALL_COLOR = (80, 70, 60)  # Brown-ish walls
OBJECTIVE_COLOR = ORANGE
OBJECTIVE_RADIUS = 40
OBJECTIVE_HEALTH = 500

# Wave settings
WAVE_COOLDOWN = 10000  # ms between waves
MAX_ENEMIES = 20  # max enemies on screen