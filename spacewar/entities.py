import math
import random
import pygame
from typing import List, Tuple, Optional

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)

# Game constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60

# Ship constants
SHIP_SIZE = 20
SHIP_SPEED = 0.2
SHIP_ROTATION_SPEED = 3
SHIP_DRAG = 0.005  # Small amount of drag for better control
MAX_VELOCITY = 5

# Asteroid constants
ASTEROID_SIZES = {
    "large": 40,
    "medium": 20,
    "small": 10
}
ASTEROID_SPEED_RANGE = (0.5, 2.0)
MAX_ASTEROIDS = 15

class Entity:
    """Base class for all game entities"""
    
    def __init__(self, x: float, y: float, size: int):
        self.x = x
        self.y = y
        self.size = size
        self.destroyed = False
    
    def update(self):
        """Update entity state - to be implemented by subclasses"""
        pass
    
    def draw(self, screen: pygame.Surface):
        """Draw entity - to be implemented by subclasses"""
        pass
    
    def check_boundary(self):
        """Wrap around screen edges"""
        if self.x < 0:
            self.x += SCREEN_WIDTH
        elif self.x > SCREEN_WIDTH:
            self.x -= SCREEN_WIDTH
            
        if self.y < 0:
            self.y += SCREEN_HEIGHT
        elif self.y > SCREEN_HEIGHT:
            self.y -= SCREEN_HEIGHT
    
    def get_distance(self, other: 'Entity') -> float:
        """Calculate distance to another entity"""
        dx = min(abs(self.x - other.x), SCREEN_WIDTH - abs(self.x - other.x))
        dy = min(abs(self.y - other.y), SCREEN_HEIGHT - abs(self.y - other.y))
        return math.sqrt(dx**2 + dy**2)
    
    def is_colliding(self, other: 'Entity') -> bool:
        """Check collision with another entity"""
        distance = self.get_distance(other)
        return distance < (self.size + other.size)


class Ship(Entity):
    """Spaceship entity controlled by player or AI"""
    
    def __init__(self, x: float, y: float, angle: float = 0, ai_controlled: bool = True):
        super().__init__(x, y, SHIP_SIZE)
        self.angle = angle  # in degrees
        self.velocity_x = 0.0
        self.velocity_y = 0.0
        self.rotation = 0  # Current rotation direction: -1 (left), 0 (none), 1 (right)
        self.thrust = 0  # Current thrust: 0 (none) or 1 (thrusting)
        self.ai_controlled = ai_controlled
        self.color = BLUE if ai_controlled else GREEN
    
    def update(self):
        """Update ship position and velocity"""
        # Apply rotation
        self.angle += self.rotation * SHIP_ROTATION_SPEED
        self.angle %= 360  # Keep angle between 0-359
        
        # Apply thrust
        if self.thrust:
            # Convert angle to radians for calculation
            angle_rad = math.radians(self.angle)
            
            # Apply acceleration in the direction of the ship
            self.velocity_x += math.cos(angle_rad) * SHIP_SPEED * self.thrust
            self.velocity_y += math.sin(angle_rad) * SHIP_SPEED * self.thrust
            
            # Limit maximum velocity
            velocity = math.sqrt(self.velocity_x**2 + self.velocity_y**2)
            if velocity > MAX_VELOCITY:
                scale = MAX_VELOCITY / velocity
                self.velocity_x *= scale
                self.velocity_y *= scale
        
        # Apply minimal drag (can be set to 0 for true frictionless space)
        self.velocity_x *= (1 - SHIP_DRAG)
        self.velocity_y *= (1 - SHIP_DRAG)
        
        # Update position
        self.x += self.velocity_x
        self.y += self.velocity_y
        
        # Check boundaries
        self.check_boundary()
    
    def draw(self, screen: pygame.Surface):
        """Draw the ship as a triangle pointing in its direction"""
        # Calculate vertices of the triangle
        angle_rad = math.radians(self.angle)
        
        # Front point
        front_x = self.x + math.cos(angle_rad) * self.size
        front_y = self.y + math.sin(angle_rad) * self.size
        
        # Back points (left and right)
        back_angle_left = angle_rad + math.radians(140)
        back_angle_right = angle_rad - math.radians(140)
        
        back_left_x = self.x + math.cos(back_angle_left) * self.size * 0.7
        back_left_y = self.y + math.sin(back_angle_left) * self.size * 0.7
        
        back_right_x = self.x + math.cos(back_angle_right) * self.size * 0.7
        back_right_y = self.y + math.sin(back_angle_right) * self.size * 0.7
        
        # Draw the ship
        points = [(front_x, front_y), (back_left_x, back_left_y), (back_right_x, back_right_y)]
        pygame.draw.polygon(screen, self.color, points)
        
        # Draw thrust if active
        if self.thrust:
            # Calculate flame positions
            flame_angle = angle_rad + math.pi  # Opposite to ship direction
            flame_x = self.x + math.cos(flame_angle) * self.size * 0.5
            flame_y = self.y + math.sin(flame_angle) * self.size * 0.5
            
            # Draw flame
            flame_length = random.uniform(0.3, 0.7) * self.size  # Variable flame length
            flame_end_x = flame_x + math.cos(flame_angle) * flame_length
            flame_end_y = flame_y + math.sin(flame_angle) * flame_length
            
            pygame.draw.line(screen, YELLOW, (flame_x, flame_y), (flame_end_x, flame_end_y), 3)
    
    def set_controls(self, thrust: int, rotation: int):
        """Set ship controls - useful for both AI and player input"""
        self.thrust = thrust
        self.rotation = rotation


class Asteroid(Entity):
    """Asteroid entity that moves and can be destroyed"""
    
    def __init__(self, x: float, y: float, size_category: str):
        self.size_category = size_category
        size = ASTEROID_SIZES[size_category]
        super().__init__(x, y, size)
        
        # Random velocity
        speed = random.uniform(*ASTEROID_SPEED_RANGE)
        angle = random.uniform(0, math.pi * 2)
        self.velocity_x = math.cos(angle) * speed
        self.velocity_y = math.sin(angle) * speed
        
        # Rotation
        self.rotation_angle = 0
        self.rotation_speed = random.uniform(-1, 1)
        
        # Create irregular shape
        self.vertices = []
        num_vertices = random.randint(8, 12)
        for i in range(num_vertices):
            angle = 2 * math.pi * i / num_vertices
            distance = random.uniform(0.8, 1.2) * self.size
            self.vertices.append((math.cos(angle) * distance, math.sin(angle) * distance))
    
    def update(self):
        """Update asteroid position"""
        self.x += self.velocity_x
        self.y += self.velocity_y
        self.rotation_angle += self.rotation_speed
        self.check_boundary()
    
    def draw(self, screen: pygame.Surface):
        """Draw the asteroid as an irregular polygon"""
        # Calculate rotated vertices
        rotated_vertices = []
        for vx, vy in self.vertices:
            # Rotate point
            cos_rot = math.cos(self.rotation_angle)
            sin_rot = math.sin(self.rotation_angle)
            rotated_x = vx * cos_rot - vy * sin_rot
            rotated_y = vx * sin_rot + vy * cos_rot
            
            # Translate to asteroid position
            rotated_vertices.append((rotated_x + self.x, rotated_y + self.y))
        
        # Draw the asteroid
        pygame.draw.polygon(screen, WHITE, rotated_vertices, 1)
    
    def break_apart(self) -> List['Asteroid']:
        """Break asteroid into smaller pieces when destroyed"""
        if self.size_category == "small":
            return []
        
        # Determine new size category
        new_size = "small" if self.size_category == "medium" else "medium"
        
        # Create 2-3 smaller asteroids
        num_pieces = random.randint(2, 3)
        new_asteroids = []
        
        for _ in range(num_pieces):
            # Random offset from original position
            offset_x = random.uniform(-self.size / 2, self.size / 2)
            offset_y = random.uniform(-self.size / 2, self.size / 2)
            
            new_asteroid = Asteroid(self.x + offset_x, self.y + offset_y, new_size)
            
            # Adjust velocity based on parent asteroid plus random component
            new_asteroid.velocity_x = self.velocity_x * 0.8 + random.uniform(-0.5, 0.5)
            new_asteroid.velocity_y = self.velocity_y * 0.8 + random.uniform(-0.5, 0.5)
            
            new_asteroids.append(new_asteroid)
            
        return new_asteroids


def generate_random_asteroids(num_asteroids: int, ships: List[Ship]) -> List[Asteroid]:
    """Generate random asteroids away from ships"""
    asteroids = []
    
    for _ in range(num_asteroids):
        # Keep trying positions until we find one that's not too close to ships
        while True:
            x = random.uniform(0, SCREEN_WIDTH)
            y = random.uniform(0, SCREEN_HEIGHT)
            
            # Check distance from all ships
            too_close = False
            for ship in ships:
                # Calculate distance considering screen wrap
                dx = min(abs(x - ship.x), SCREEN_WIDTH - abs(x - ship.x))
                dy = min(abs(y - ship.y), SCREEN_HEIGHT - abs(y - ship.y))
                distance = math.sqrt(dx**2 + dy**2)
                
                # Ensure asteroids don't spawn too close to ships
                if distance < 100:  # Safe distance
                    too_close = True
                    break
            
            if not too_close:
                break
        
        # Choose random size with weighted probability
        size_category = random.choices(
            ["large", "medium", "small"],
            weights=[0.5, 0.3, 0.2],
            k=1
        )[0]
        
        asteroids.append(Asteroid(x, y, size_category))
    
    return asteroids