import pygame
import sys
import random
import math
from enum import Enum
from typing import List, Tuple, Optional, Dict
import time

# Initialize pygame
pygame.init()

# Constants
SCREEN_WIDTH = 1000
SCREEN_HEIGHT = 700
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 50, 50)
BLUE = (50, 50, 255)
GREEN = (0, 255, 0)
YELLOW = (255, 255, 0)
BROWN = (139, 69, 19)
LIGHT_BROWN = (222, 184, 135)

# Regiment constants
REGIMENT_WIDTH = 30  # This is the shorter side (depth of formation)
REGIMENT_HEIGHT = 60  # This is the longer side (width of formation)
REGIMENT_SPEED = 1.0  # Increased movement speed
WHEEL_ANGLE = 2.0  # Increased turning speed
COOLDOWN_TICKS = 180  # Time between volleys (reduced)
BULLET_SPEED = 2.5  # Slow bullet speed
BULLET_LIFETIME = 400  # Longer bullet lifetime for greater range
BULLET_DAMAGE = 5  # Reduced per-bullet damage (more bullets per volley)
BULLET_RADIUS = 2
BULLETS_PER_VOLLEY = 10  # Number of bullets fired in a volley
REGIMENT_HEALTH = 100
MAX_BULLETS = 500  # Increased maximum bullets on screen

# Movement restrictions
SETUP_TIME = 30  # Frames regiment must be stationary before firing (reduced)
RECOVERY_TIME = 30  # Frames regiment cannot move after firing (reduced)

# Field constants
GRASS_COLOR = (100, 200, 100)
BATTLEFIELD_MARGIN = 50

# Game setup
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Army Battle Simulation")
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, 24)
large_font = pygame.font.SysFont(None, 48)

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
        
    def is_expired(self):
        return (self.lifetime <= 0 or 
                self.x < BATTLEFIELD_MARGIN or self.x > SCREEN_WIDTH - BATTLEFIELD_MARGIN or
                self.y < BATTLEFIELD_MARGIN or self.y > SCREEN_HEIGHT - BATTLEFIELD_MARGIN)
    
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
        
        # Keep regiment within battlefield
        margin = 30  # buffer to account for rectangle size when rotated
        self.x = max(BATTLEFIELD_MARGIN + margin, min(self.x, SCREEN_WIDTH - BATTLEFIELD_MARGIN - margin))
        self.y = max(BATTLEFIELD_MARGIN + margin, min(self.y, SCREEN_HEIGHT - BATTLEFIELD_MARGIN - margin))
        
        # Update cooldown
        if self.cooldown > 0:
            self.cooldown -= 1
            
        # Save this action for next comparison
        self.last_action = action
    
    def fire(self) -> List[Bullet]:
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
    
    def draw(self, screen):
        if self.destroyed:
            return
            
        color = RED if self.team == "red" else BLUE
        
        # Draw the regiment as a rotated rectangle
        rect_points = self.get_corners()
        pygame.draw.polygon(screen, color, rect_points)
        
        # Draw a directional indicator
        center_x = sum(x for x, y in rect_points) / 4
        center_y = sum(y for x, y in rect_points) / 4
        front_x = center_x + math.cos(self.angle_rad) * (self.width / 2)
        front_y = center_y + math.sin(self.angle_rad) * (self.width / 2)
        pygame.draw.line(screen, WHITE, (center_x, center_y), (front_x, front_y), 2)
        
        # Draw health bar
        health_width = 40
        health_height = 5
        health_x = int(center_x - health_width / 2)
        health_y = int(center_y - self.height - 10)
        health_fill = int((self.health / REGIMENT_HEALTH) * health_width)
        
        pygame.draw.rect(screen, BLACK, (health_x, health_y, health_width, health_height))
        health_color = GREEN
        if self.health < REGIMENT_HEALTH * 0.7:
            health_color = YELLOW
        if self.health < REGIMENT_HEALTH * 0.3:
            health_color = RED
        pygame.draw.rect(screen, health_color, (health_x, health_y, health_fill, health_height))
        
        # Show status indicators
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


class AI:
    def __init__(self, team, regiments):
        self.team = team
        self.regiments = regiments
        self.enemy_team = "blue" if team == "red" else "red"
        
    def make_decisions(self, enemy_regiments, bullets):
        actions = []
        for regiment in self.regiments:
            if regiment.destroyed:
                actions.append(None)
                continue
            
            # If in recovery time after firing, must hold position
            if regiment.recovery_time > 0:
                actions.append("hold")
                continue
                
            # Find closest non-destroyed enemy
            closest_enemy = None
            min_distance = float('inf')
            for enemy in enemy_regiments:
                if not enemy.destroyed:
                    dist = math.hypot(regiment.x - enemy.x, regiment.y - enemy.y)
                    if dist < min_distance:
                        min_distance = dist
                        closest_enemy = enemy
            
            if closest_enemy is None:
                # No enemies left, just move forward
                actions.append("move_forward")
                continue
                
            # Calculate angle to enemy
            dx = closest_enemy.x - regiment.x
            dy = closest_enemy.y - regiment.y
            angle_to_enemy = math.atan2(dy, dx)
            
            # Convert current angle to radians for comparison
            current_angle_rad = regiment.angle_rad
            
            # Normalize angles for comparison
            while angle_to_enemy < 0:
                angle_to_enemy += 2 * math.pi
            while current_angle_rad < 0:
                current_angle_rad += 2 * math.pi
                
            # Calculate the difference between angles
            angle_diff = angle_to_enemy - current_angle_rad
            
            # Normalize the difference to be between -pi and pi
            while angle_diff > math.pi:
                angle_diff -= 2 * math.pi
            while angle_diff < -math.pi:
                angle_diff += 2 * math.pi
            
            # Check if regiment is in a good firing position and ready to fire
            in_range = 200 <= min_distance <= 350
            well_aligned = abs(angle_diff) < math.radians(15)
            can_fire = regiment.can_fire()
            
            # First priority: fire if possible in a good position
            if can_fire and well_aligned and in_range:
                action = "fire"
                
            # Second priority: if already started aiming and close to ready, hold position
            elif well_aligned and in_range and regiment.stationary_time > 0:
                action = "hold"  # Continue aiming
                
            # Third priority: get into position
            elif min_distance > 350:
                # Too far away - need to get closer
                if abs(angle_diff) < math.radians(30):
                    action = "move_forward"
                elif angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                
            elif min_distance < 200:
                # Too close - need to back up
                if abs(angle_diff) < math.radians(30):
                    action = "move_backward"
                elif angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                    
            # Fourth priority: align with enemy
            elif abs(angle_diff) > math.radians(5):
                # Need to rotate to face enemy
                if angle_diff > 0:
                    action = "wheel_right"
                else:
                    action = "wheel_left"
                    
            # Default: if in good range and more or less aligned, hold position to aim
            else:
                action = "hold"
            
            # Add a bit of randomness to make behavior less predictable
            if random.random() < 0.05:  # 5% chance of random action
                action = random.choice(["move_forward", "move_backward", "wheel_left", "wheel_right", "hold"])
                
            actions.append(action)
            
        return actions


def draw_battlefield(screen):
    # Draw grass background
    screen.fill(GRASS_COLOR)
    
    # Draw battlefield border
    pygame.draw.rect(screen, BROWN, (BATTLEFIELD_MARGIN, BATTLEFIELD_MARGIN, 
                                     SCREEN_WIDTH - 2 * BATTLEFIELD_MARGIN, 
                                     SCREEN_HEIGHT - 2 * BATTLEFIELD_MARGIN), 5)
    
    # Remove the random trees/rocks that were appearing as green blips


def initialize_game():
    # Create regiments for each team
    red_regiments = []
    blue_regiments = []
    
    # Red team on left - formations facing right (0 degrees)
    for i in range(3):
        x = BATTLEFIELD_MARGIN + 150
        y = BATTLEFIELD_MARGIN + 150 + i * 180
        red_regiments.append(Regiment(x, y, 0, "red"))
    
    # Blue team on right - formations facing left (180 degrees)
    for i in range(3):
        x = SCREEN_WIDTH - BATTLEFIELD_MARGIN - 150
        y = BATTLEFIELD_MARGIN + 150 + i * 180
        blue_regiments.append(Regiment(x, y, 180, "blue"))
    
    # Create AIs
    red_ai = AI("red", red_regiments)
    blue_ai = AI("blue", blue_regiments)
    
    bullets = []
    
    return red_regiments, blue_regiments, red_ai, blue_ai, bullets


def main():
    """Main game function"""
    running = True
    game_over = False
    winner = None
    game_speed = 1  # 1 = normal speed, 2 = 2x speed, etc.
    
    # Initialize game elements
    red_regiments, blue_regiments, red_ai, blue_ai, bullets = initialize_game()
    
    # For FPS display
    fps_update_time = time.time()
    fps_count = 0
    fps_display = 0
    
    # Game stats
    bullets_fired = {"red": 0, "blue": 0}
    damage_dealt = {"red": 0, "blue": 0}
    
    # Random terrain seed
    random.seed(time.time())
    
    while running:
        frame_start_time = time.time()
        
        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_SPACE:
                    # Reset game
                    if game_over:
                        red_regiments, blue_regiments, red_ai, blue_ai, bullets = initialize_game()
                        game_over = False
                        winner = None
                        bullets_fired = {"red": 0, "blue": 0}
                        damage_dealt = {"red": 0, "blue": 0}
                elif event.key == pygame.K_1:
                    game_speed = 1
                elif event.key == pygame.K_2:
                    game_speed = 2
                elif event.key == pygame.K_3:
                    game_speed = 3

        # Game logic (skip if game over)
        if not game_over:
            # Get AI decisions
            red_actions = red_ai.make_decisions(blue_regiments, bullets)
            blue_actions = blue_ai.make_decisions(red_regiments, bullets)
            
            # Update red regiments
            for i, regiment in enumerate(red_regiments):
                action = red_actions[i]
                regiment.update(action)
                if action == "fire" and len(bullets) < MAX_BULLETS:
                    new_bullets = regiment.fire()
                    if new_bullets:
                        bullets.extend(new_bullets)
                        bullets_fired["red"] += len(new_bullets)
            
            # Update blue regiments
            for i, regiment in enumerate(blue_regiments):
                action = blue_actions[i]
                regiment.update(action)
                if action == "fire" and len(bullets) < MAX_BULLETS:
                    new_bullets = regiment.fire()
                    if new_bullets:
                        bullets.extend(new_bullets)
                        bullets_fired["blue"] += len(new_bullets)
            
            # Update bullets
            i = 0
            while i < len(bullets):
                bullet = bullets[i]
                bullet.update()
                
                # Check for collisions with regiments
                hit = False
                
                if bullet.team == "red":
                    # Red bullet can hit blue regiments
                    for regiment in blue_regiments:
                        if not regiment.destroyed and regiment.is_colliding(bullet):
                            regiment.take_damage(BULLET_DAMAGE)
                            damage_dealt["red"] += BULLET_DAMAGE
                            hit = True
                            break
                else:
                    # Blue bullet can hit red regiments
                    for regiment in red_regiments:
                        if not regiment.destroyed and regiment.is_colliding(bullet):
                            regiment.take_damage(BULLET_DAMAGE)
                            damage_dealt["blue"] += BULLET_DAMAGE
                            hit = True
                            break
                
                # Remove the bullet if it hit something or expired
                if hit or bullet.is_expired():
                    bullets.pop(i)
                else:
                    i += 1
            
            # Check win condition
            red_alive = sum(1 for r in red_regiments if not r.destroyed)
            blue_alive = sum(1 for r in blue_regiments if not r.destroyed)
            
            if red_alive == 0:
                game_over = True
                winner = "blue"
            elif blue_alive == 0:
                game_over = True
                winner = "red"

        # Rendering
        draw_battlefield(screen)
        
        # Draw bullets
        for bullet in bullets:
            bullet.draw(screen)
        
        # Draw regiments
        for regiment in red_regiments + blue_regiments:
            regiment.draw(screen)
        
        # Draw HUD
        red_alive = sum(1 for r in red_regiments if not r.destroyed)
        blue_alive = sum(1 for r in blue_regiments if not r.destroyed)
        
        # Draw team status
        pygame.draw.rect(screen, BLACK, (10, 10, 220, 65))
        
        # Red team info
        pygame.draw.rect(screen, RED, (15, 15, 20, 20))
        red_text = font.render(f"Red Team: {red_alive}/3 alive", True, WHITE)
        screen.blit(red_text, (40, 15))
        
        # Blue team info
        pygame.draw.rect(screen, BLUE, (15, 40, 20, 20))
        blue_text = font.render(f"Blue Team: {blue_alive}/3 alive", True, WHITE)
        screen.blit(blue_text, (40, 40))
        
        # Stats box
        stats_x = SCREEN_WIDTH - 230
        pygame.draw.rect(screen, BLACK, (stats_x, 10, 220, 90))
        
        # Stats text
        bullets_text = font.render(f"Bullets Fired: R:{bullets_fired['red']} B:{bullets_fired['blue']}", True, WHITE)
        damage_text = font.render(f"Damage Dealt: R:{damage_dealt['red']} B:{damage_dealt['blue']}", True, WHITE)
        fps_text = font.render(f"FPS: {fps_display:.1f} (Speed: {game_speed}x)", True, WHITE)
        
        screen.blit(bullets_text, (stats_x + 10, 15))
        screen.blit(damage_text, (stats_x + 10, 40))
        screen.blit(fps_text, (stats_x + 10, 65))
        
        # Game over screen
        if game_over:
            overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 128))
            screen.blit(overlay, (0, 0))
            
            winner_color = RED if winner == "red" else BLUE
            winner_text = large_font.render(f"{winner.upper()} TEAM WINS!", True, winner_color)
            restart_text = font.render("Press SPACE to restart", True, WHITE)
            
            screen.blit(winner_text, (SCREEN_WIDTH // 2 - winner_text.get_width() // 2, 
                                     SCREEN_HEIGHT // 2 - winner_text.get_height() // 2))
            screen.blit(restart_text, (SCREEN_WIDTH // 2 - restart_text.get_width() // 2, 
                                      SCREEN_HEIGHT // 2 + 50))
        
        # FPS calculation
        fps_count += 1
        if time.time() - fps_update_time > 0.5:  # Update FPS every half second
            fps_display = fps_count / (time.time() - fps_update_time)
            fps_count = 0
            fps_update_time = time.time()
        
        # Update display
        pygame.display.flip()
        
        # Cap the frame rate based on game speed
        target_frame_time = 1.0 / (60 * game_speed)
        elapsed = time.time() - frame_start_time
        if elapsed < target_frame_time:
            delay = target_frame_time - elapsed
            time.sleep(delay)

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()