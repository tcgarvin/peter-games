import math
import random
import pygame

# Regiment constants
REGIMENT_WIDTH = 30  # This is the shorter side (depth of formation)
REGIMENT_HEIGHT = 60  # This is the longer side (width of formation)
REGIMENT_SPEED = 0.25  # Extremely slow movement speed
WHEEL_ANGLE = 0.4  # Very slow turning speed
COOLDOWN_TICKS = 180  # Time between volleys
BULLET_SPEED = 5.0  # Faster bullet speed
BULLET_LIFETIME = 250  # Adjusted lifetime for faster bullets
BULLET_DAMAGE = 5  # Damage per bullet
BULLET_RADIUS = 2
BULLETS_PER_VOLLEY = 10  # Number of bullets fired in a volley
REGIMENT_HEALTH = 100
MAX_BULLETS = 500  # Maximum bullets on screen

# Movement restrictions
SETUP_TIME = 45  # Frames regiment must be stationary before firing (increased)
RECOVERY_TIME = 60  # Frames regiment cannot move after firing (increased)

# Colors
WHITE = (255, 255, 255)
RED = (255, 50, 50)
BLUE = (50, 50, 255)
GREEN = (0, 255, 0)
YELLOW = (255, 255, 0)

# For global debug mode
DEBUG_MODE = False

class Bullet:
    def __init__(self, x, y, angle, team, delay=0):
        self.x = x
        self.y = y
        self.angle = angle  # in radians
        self.team = team
        self.speed = BULLET_SPEED
        self.radius = BULLET_RADIUS
        self.lifetime = BULLET_LIFETIME  # frames before bullet disappears
        self.delay = delay  # Delay before bullet starts moving (for volley effect)
        
    def update(self):
        if self.delay > 0:
            self.delay -= 1
            return
            
        self.x += math.cos(self.angle) * self.speed
        self.y += math.sin(self.angle) * self.speed
        self.lifetime -= 1
        
    def draw(self, screen):
        if self.delay > 0:
            return  # Don't draw bullets that haven't been "fired" yet
            
        color = RED if self.team == "red" else BLUE
        pygame.draw.circle(screen, color, (int(self.x), int(self.y)), self.radius)
        
    def is_expired(self, battlefield_margin, screen_width, screen_height):
        return (self.lifetime <= 0 or 
                self.x < battlefield_margin or self.x > screen_width - battlefield_margin or
                self.y < battlefield_margin or self.y > screen_height - battlefield_margin)
    
    def get_rect(self):
        return pygame.Rect(self.x - self.radius, self.y - self.radius, 
                          self.radius * 2, self.radius * 2)
                          
class Regiment:
    def __init__(self, x, y, angle, team):
        self.x = x
        self.y = y
        self.angle = angle  # in degrees
        self.angle_rad = math.radians(angle)
        self.team = team
        self.width = REGIMENT_WIDTH
        self.height = REGIMENT_HEIGHT
        self.health = REGIMENT_HEALTH
        self.cooldown = 0
        self.destroyed = False
        
        # Movement and firing timing
        self.stationary_time = 0  # How long the regiment has been stationary
        self.recovery_time = 0    # Time after firing before movement is possible
        self.last_action = None   # Track last action for stationary detection
        
        # AI type for regiment (will be shown in debug mode)
        self.ai_type = "Standard"  # Will be set by the AI classes
        
    def update(self, action):
        if self.destroyed:
            return
        
        # Update recovery time after firing
        if self.recovery_time > 0:
            self.recovery_time -= 1
            action = "hold"  # Force hold position during recovery
        
        # Track stationary time for setup before firing
        is_movement = action in ["move_forward", "move_backward", "wheel_left", "wheel_right"]
        
        if is_movement:
            self.stationary_time = 0  # Reset stationary time if moving
        else:
            self.stationary_time += 1  # Increment if stationary
        
        # Apply the action
        if action == "move_forward":
            self.x += math.cos(self.angle_rad) * REGIMENT_SPEED
            self.y += math.sin(self.angle_rad) * REGIMENT_SPEED
        elif action == "move_backward":
            self.x -= math.cos(self.angle_rad) * REGIMENT_SPEED
            self.y -= math.sin(self.angle_rad) * REGIMENT_SPEED
        elif action == "wheel_left":
            self.angle = (self.angle - WHEEL_ANGLE) % 360
            self.angle_rad = math.radians(self.angle)
        elif action == "wheel_right":
            self.angle = (self.angle + WHEEL_ANGLE) % 360
            self.angle_rad = math.radians(self.angle)
        # All other actions (like "hold" or "fire") just keep position
        
        # Keep regiment within battlefield (needs to be passed in from game)
        margin = 30  # buffer to account for rectangle size when rotated
        self.x = max(50 + margin, min(self.x, 1000 - 50 - margin))
        self.y = max(50 + margin, min(self.y, 700 - 50 - margin))
        
        # Update cooldown
        if self.cooldown > 0:
            self.cooldown -= 1
            
        # Save this action for next comparison
        self.last_action = action
    
    def fire(self) -> list:
        # Check if regiment can fire
        if (self.destroyed or 
            self.cooldown > 0 or 
            self.stationary_time < SETUP_TIME):  # Must be stationary for setup time
            return []
            
        # Create bullets for a volley
        bullets = []
        
        # Create a bullet from a random position within the regiment
        rect_points = self.get_corners()
        center_x = sum(x for x, y in rect_points) / 4
        center_y = sum(y for x, y in rect_points) / 4
        
        # Find a point in front of the regiment
        front_direction = self.angle_rad
        
        # Generate multiple bullets for the volley
        for i in range(BULLETS_PER_VOLLEY):
            # Randomize the angle slightly for each bullet
            bullet_spread = math.radians(15)  # allows 15 degree random spread
            bullet_angle = front_direction + random.uniform(-bullet_spread, bullet_spread)
            
            # Generate a position along the front edge (long side) of the regiment
            # First, find a point at the side of the regiment
            front_point_x = center_x + math.cos(front_direction) * (self.width / 2)
            front_point_y = center_y + math.sin(front_direction) * (self.width / 2)
            
            # Generate a position along the front line (perpendicular to direction)
            perpendicular = front_direction + math.pi/2
            offset = random.uniform(-self.height/2 + 5, self.height/2 - 5)  # Leave a small margin
            bullet_x = front_point_x + math.cos(perpendicular) * offset
            bullet_y = front_point_y + math.sin(perpendicular) * offset
            
            # Create a slight delay for each bullet to create a volley effect
            delay = random.randint(0, 15)  # Random delay of 0-15 frames
            
            # Create the bullet and add it to the volley
            bullet = Bullet(bullet_x, bullet_y, bullet_angle, self.team, delay)
            bullets.append(bullet)
        
        # Set cooldown and recovery time (can't move right after firing)
        self.cooldown = COOLDOWN_TICKS
        self.recovery_time = RECOVERY_TIME
        
        return bullets
        
    def can_fire(self):
        """Check if the regiment is ready to fire"""
        return (not self.destroyed and 
                self.cooldown <= 0 and 
                self.stationary_time >= SETUP_TIME)
    
    def draw(self, screen, font):
        if self.destroyed:
            return
            
        color = RED if self.team == "red" else BLUE
        
        # Draw the regiment as a rotated rectangle
        rect_points = self.get_corners()
        pygame.draw.polygon(screen, color, rect_points)
        
        # Calculate center for other UI elements
        center_x = sum(x for x, y in rect_points) / 4
        center_y = sum(y for x, y in rect_points) / 4
        
        # Draw a directional indicator only in debug mode
        if DEBUG_MODE:
            front_x = center_x + math.cos(self.angle_rad) * (self.width / 2)
            front_y = center_y + math.sin(self.angle_rad) * (self.width / 2)
            pygame.draw.line(screen, WHITE, (center_x, center_y), (front_x, front_y), 2)
        
        # Draw health bar
        health_width = 40
        health_height = 5
        health_x = int(center_x - health_width / 2)
        health_y = int(center_y - self.height - 10)
        health_fill = int((self.health / REGIMENT_HEALTH) * health_width)
        
        pygame.draw.rect(screen, (0, 0, 0), (health_x, health_y, health_width, health_height))
        health_color = GREEN
        if self.health < REGIMENT_HEALTH * 0.7:
            health_color = YELLOW
        if self.health < REGIMENT_HEALTH * 0.3:
            health_color = RED
        pygame.draw.rect(screen, health_color, (health_x, health_y, health_fill, health_height))
        
        # Show status indicators only in debug mode
        if DEBUG_MODE:
            status_y = int(center_y - self.height - 20)
            
            # Show "ready" indicator when regiment can fire
            if self.can_fire():
                ready_text = font.render("READY", True, GREEN)
                screen.blit(ready_text, (health_x, status_y))
            
            # Show "aiming" indicator when setting up to fire
            elif self.stationary_time > 0 and self.stationary_time < SETUP_TIME:
                aiming_progress = self.stationary_time / SETUP_TIME
                aim_text = font.render(f"AIMING {int(aiming_progress * 100)}%", True, YELLOW)
                screen.blit(aim_text, (health_x - 15, status_y))
            
            # Show "reloading" indicator during cooldown
            elif self.cooldown > 0:
                reload_text = font.render("RELOADING", True, YELLOW)
                screen.blit(reload_text, (health_x - 10, status_y))
    
    def get_corners(self):
        """Get the four corners of the rotated rectangle"""
        # Calculate the corners relative to the center
        half_width = self.width / 2
        half_height = self.height / 2
        cos_a = math.cos(self.angle_rad)
        sin_a = math.sin(self.angle_rad)
        
        corners = [
            (half_width * cos_a - half_height * sin_a + self.x,
             half_width * sin_a + half_height * cos_a + self.y),
            (half_width * cos_a + half_height * sin_a + self.x,
             half_width * sin_a - half_height * cos_a + self.y),
            (-half_width * cos_a + half_height * sin_a + self.x,
             -half_width * sin_a - half_height * cos_a + self.y),
            (-half_width * cos_a - half_height * sin_a + self.x,
             -half_width * sin_a + half_height * cos_a + self.y)
        ]
        return corners
    
    def get_rect(self):
        """Get the bounding rectangle for collision detection"""
        corners = self.get_corners()
        x_coords = [x for x, y in corners]
        y_coords = [y for x, y in corners]
        left = min(x_coords)
        top = min(y_coords)
        width = max(x_coords) - left
        height = max(y_coords) - top
        return pygame.Rect(left, top, width, height)
    
    def take_damage(self, amount):
        if self.destroyed:
            return
            
        self.health -= amount
        if self.health <= 0:
            self.health = 0
            self.destroyed = True
            
    def is_colliding(self, bullet):
        # Simple bounding box collision
        rect = self.get_rect()
        bullet_rect = bullet.get_rect()
        return rect.colliderect(bullet_rect)

# Function to set the global debug mode
def set_debug_mode(mode):
    global DEBUG_MODE
    DEBUG_MODE = mode