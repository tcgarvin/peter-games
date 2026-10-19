#!/usr/bin/env python
import pygame
import random
import math
import sys
import time

# Initialize pygame
pygame.init()

# Game constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
GRAVITY = 0.5
TERRAIN_POINTS = 100
MAX_POWER = 100
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 0, 255)
BROWN = (139, 69, 19)
SKY_BLUE = (135, 206, 235)
YELLOW = (255, 255, 0)
ORANGE = (255, 165, 0)
BRIGHT_RED = (255, 50, 50)

class Terrain:
    def __init__(self, screen_width, screen_height):
        self.screen_width = screen_width
        self.screen_height = screen_height
        self.points = []
        self.generate()
        
    def generate(self):
        self.points = []
        # Generate a list of x coordinates
        x_coords = [i * (self.screen_width / TERRAIN_POINTS) for i in range(TERRAIN_POINTS + 1)]
        
        # Generate random heights for the terrain with smooth transitions
        heights = []
        current_height = random.randint(int(self.screen_height * 0.5), int(self.screen_height * 0.8))
        heights.append(current_height)
        
        for i in range(1, TERRAIN_POINTS + 1):
            change = random.randint(-10, 10)
            current_height += change
            # Keep height within reasonable bounds
            current_height = max(self.screen_height * 0.3, min(current_height, self.screen_height * 0.8))
            heights.append(current_height)
        
        # Create points list
        self.points = [(x_coords[i], heights[i]) for i in range(TERRAIN_POINTS + 1)]
    
    def draw(self, screen):
        # Draw terrain
        pygame.draw.polygon(screen, BROWN, self.points + [(self.screen_width, self.screen_height), (0, self.screen_height)])
        
    def get_height_at(self, x):
        # Find the terrain height at a given x coordinate
        if x < 0 or x > self.screen_width:
            return self.screen_height
        
        # Find the two points that surround the x coordinate
        for i in range(len(self.points) - 1):
            if self.points[i][0] <= x < self.points[i+1][0]:
                # Linear interpolation to find height
                x1, y1 = self.points[i]
                x2, y2 = self.points[i+1]
                ratio = (x - x1) / (x2 - x1) if x2 != x1 else 0
                return y1 + ratio * (y2 - y1)
        
        return self.points[-1][1]  # Return last point's height if x is at the end

class Cannon:
    def __init__(self, x, y, player_num):
        self.x = x
        self.y = y
        self.angle = 45 if player_num == 1 else 135  # Degrees
        self.power = 50  # 0-100
        self.size = 20
        self.player_num = player_num
        self.color = RED if player_num == 1 else BLUE
        self.is_alive = True
    
    def draw(self, screen):
        if not self.is_alive:
            return
            
        # Draw cannon base (circle)
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.size)
        
        # Draw cannon barrel
        barrel_length = self.size * 1.5
        end_x = self.x + barrel_length * math.cos(math.radians(self.angle))
        end_y = self.y - barrel_length * math.sin(math.radians(self.angle))
        pygame.draw.line(screen, BLACK, (self.x, self.y), (end_x, end_y), 5)
        
        # Draw power indicator
        power_text = f"Power: {self.power}"
        angle_text = f"Angle: {int(self.angle)}°"
        font = pygame.font.SysFont(None, 24)
        power_surf = font.render(power_text, True, BLACK)
        angle_surf = font.render(angle_text, True, BLACK)
        
        if self.player_num == 1:
            screen.blit(power_surf, (self.x - 40, self.y - 60))
            screen.blit(angle_surf, (self.x - 40, self.y - 40))
        else:
            screen.blit(power_surf, (self.x - 40, self.y - 60))
            screen.blit(angle_surf, (self.x - 40, self.y - 40))
    
    def adjust_angle(self, change):
        # Adjust angle, keeping it between 0 and 180
        self.angle += change
        if self.player_num == 1:
            self.angle = max(0, min(self.angle, 90))
        else:
            self.angle = max(90, min(self.angle, 180))
    
    def adjust_power(self, change):
        # Adjust power, keeping it between 0 and MAX_POWER
        self.power += change
        self.power = max(10, min(self.power, MAX_POWER))
    
    def fire(self):
        # Calculate initial velocity components based on angle and power
        velocity_x = self.power / 5 * math.cos(math.radians(self.angle))
        velocity_y = -self.power / 5 * math.sin(math.radians(self.angle))
        
        # Return projectile starting at the end of the barrel
        barrel_length = self.size * 1.5
        start_x = self.x + barrel_length * math.cos(math.radians(self.angle))
        start_y = self.y - barrel_length * math.sin(math.radians(self.angle))
        
        return Projectile(start_x, start_y, velocity_x, velocity_y, self.color)

class Projectile:
    def __init__(self, x, y, velocity_x, velocity_y, color):
        self.x = x
        self.y = y
        self.velocity_x = velocity_x
        self.velocity_y = velocity_y
        self.radius = 5
        self.color = color
        self.active = True
    
    def update(self):
        # Update position based on velocity
        self.x += self.velocity_x
        self.y += self.velocity_y
        
        # Apply gravity
        self.velocity_y += GRAVITY
    
    def draw(self, screen):
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.radius)
    
    def check_terrain_collision(self, terrain):
        # Check if projectile hit terrain
        if not self.active:
            return False
            
        terrain_height = terrain.get_height_at(self.x)
        if self.y + self.radius >= terrain_height:
            self.active = False
            return True
        
        # Check if out of bounds
        if self.x < 0 or self.x > SCREEN_WIDTH or self.y > SCREEN_HEIGHT:
            self.active = False
            return False
            
        return False
    
    def check_cannon_collision(self, cannons):
        # Check if projectile hit any cannon
        if not self.active:
            return None
            
        for cannon in cannons:
            if not cannon.is_alive:
                continue
                
            distance = math.sqrt((self.x - cannon.x)**2 + (self.y - cannon.y)**2)
            if distance < self.radius + cannon.size:
                self.active = False
                cannon.is_alive = False
                return cannon
                
        return None

class Explosion:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.particles = []
        self.start_time = time.time()
        self.duration = 1.5  # seconds
        self.color = color
        self.generate_particles()
    
    def generate_particles(self):
        # Create explosion particles
        num_particles = random.randint(40, 60)
        for _ in range(num_particles):
            # Random velocity
            angle = random.uniform(0, 2 * math.pi)
            speed = random.uniform(2, 8)
            velocity_x = math.cos(angle) * speed
            velocity_y = math.sin(angle) * speed
            
            # Random size
            size = random.uniform(2, 6)
            
            # Random color variation (based on main color)
            r, g, b = self.color
            color_variation = random.randint(-30, 30)
            color = (
                max(0, min(255, r + color_variation)),
                max(0, min(255, g + color_variation)),
                max(0, min(255, b + color_variation))
            )
            
            # Random lifetime
            lifetime = random.uniform(0.5, self.duration)
            
            self.particles.append({
                'x': self.x,
                'y': self.y,
                'velocity_x': velocity_x,
                'velocity_y': velocity_y,
                'size': size,
                'color': color,
                'lifetime': lifetime
            })
    
    def update(self):
        current_time = time.time()
        elapsed = current_time - self.start_time
        
        # Update each particle
        for particle in self.particles:
            # Update position
            particle['x'] += particle['velocity_x']
            particle['y'] += particle['velocity_y']
            
            # Apply gravity
            particle['velocity_y'] += 0.1
            
            # Decrease size slightly
            particle['size'] *= 0.98
    
    def draw(self, screen):
        current_time = time.time()
        elapsed = current_time - self.start_time
        
        # Draw particles
        for particle in self.particles:
            # Calculate alpha based on lifetime
            particle_life_ratio = min(1.0, elapsed / particle['lifetime'])
            if particle_life_ratio < 1.0:  # Only draw if still alive
                alpha = int(255 * (1 - particle_life_ratio))
                r, g, b = particle['color']
                color = (r, g, b)
                
                pygame.draw.circle(
                    screen,
                    color,
                    (int(particle['x']), int(particle['y'])),
                    int(particle['size'])
                )
    
    def is_finished(self):
        current_time = time.time()
        return current_time - self.start_time > self.duration

class Game:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Artillery Game")
        self.clock = pygame.time.Clock()
        self.reset_game()
    
    def reset_game(self):
        # Set up terrain
        self.terrain = Terrain(SCREEN_WIDTH, SCREEN_HEIGHT)
        
        # Set up players
        player1_x = SCREEN_WIDTH * 0.2
        player2_x = SCREEN_WIDTH * 0.8
        player1_y = self.terrain.get_height_at(player1_x)
        player2_y = self.terrain.get_height_at(player2_x)
        
        self.cannons = [
            Cannon(player1_x, player1_y, 1),
            Cannon(player2_x, player2_y, 2)
        ]
        
        self.projectile = None
        self.current_player = 0
        self.game_over = False
        self.winner = None
        self.explosions = []
    
    def handle_input(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            
            if event.type == pygame.KEYDOWN:
                # Allow ESC key to exit the game at any time
                if event.key == pygame.K_ESCAPE:
                    pygame.quit()
                    sys.exit()
                
                if self.game_over:
                    if event.key == pygame.K_r:
                        self.reset_game()
                    return
                
                # If projectile is active, no input allowed
                if self.projectile and self.projectile.active:
                    return
                
                current_cannon = self.cannons[self.current_player]
                
                if event.key == pygame.K_UP:
                    current_cannon.adjust_power(5)
                elif event.key == pygame.K_DOWN:
                    current_cannon.adjust_power(-5)
                elif event.key == pygame.K_LEFT:
                    current_cannon.adjust_angle(5)
                elif event.key == pygame.K_RIGHT:
                    current_cannon.adjust_angle(-5)
                elif event.key == pygame.K_SPACE:
                    self.projectile = current_cannon.fire()
    
    def update(self):
        if self.game_over:
            # Still update explosions even when game is over
            for explosion in self.explosions[:]:
                explosion.update()
                if explosion.is_finished():
                    self.explosions.remove(explosion)
            return
            
        # Update projectile if it exists
        if self.projectile and self.projectile.active:
            self.projectile.update()
            
            # Check for collisions
            terrain_hit = self.projectile.check_terrain_collision(self.terrain)
            cannon_hit = self.projectile.check_cannon_collision(self.cannons)
            
            if terrain_hit:
                # Add small explosion for terrain hit
                self.explosions.append(Explosion(self.projectile.x, self.projectile.y, BROWN))
                self.projectile = None
                self.current_player = (self.current_player + 1) % 2
            
            elif cannon_hit:
                # Add big explosion for cannon hit with cannon's color
                self.explosions.append(Explosion(cannon_hit.x, cannon_hit.y, BRIGHT_RED))
                self.explosions.append(Explosion(cannon_hit.x, cannon_hit.y, ORANGE))
                self.explosions.append(Explosion(cannon_hit.x, cannon_hit.y, YELLOW))
                
                # Projectile is done, switch to other player
                self.projectile = None
                self.current_player = (self.current_player + 1) % 2
                
                # Game is over when a cannon is hit
                self.game_over = True
                self.winner = "Player 1" if self.current_player == 1 else "Player 2"
            
            elif not self.projectile.active:
                # Projectile went off-screen
                self.projectile = None
                self.current_player = (self.current_player + 1) % 2
                
            # If current player's cannon is dead, switch player
            if not self.cannons[self.current_player].is_alive:
                self.current_player = (self.current_player + 1) % 2
                
                # Check if game is over
                alive_cannons = sum(1 for cannon in self.cannons if cannon.is_alive)
                if alive_cannons < 2:
                    self.game_over = True
                    if self.cannons[0].is_alive:
                        self.winner = "Player 1"
                    else:
                        self.winner = "Player 2"
        
        # Update all explosions
        for explosion in self.explosions[:]:
            explosion.update()
            if explosion.is_finished():
                self.explosions.remove(explosion)
    
    def draw(self):
        # Clear screen
        self.screen.fill(SKY_BLUE)
        
        # Draw terrain
        self.terrain.draw(self.screen)
        
        # Draw cannons
        for cannon in self.cannons:
            cannon.draw(self.screen)
        
        # Draw projectile if it exists
        if self.projectile and self.projectile.active:
            self.projectile.draw(self.screen)
        
        # Draw all active explosions
        for explosion in self.explosions:
            explosion.draw(self.screen)
        
        # Draw current player indicator
        current_player_text = f"Current Player: {self.current_player + 1}"
        font = pygame.font.SysFont(None, 30)
        text_surf = font.render(current_player_text, True, BLACK)
        self.screen.blit(text_surf, (20, 20))
        
        # Draw game over message if game is over
        if self.game_over:
            game_over_text = f"Game Over! {self.winner} wins!"
            restart_text = "Press R to restart"
            font = pygame.font.SysFont(None, 40)
            text_surf = font.render(game_over_text, True, BLACK)
            restart_surf = font.render(restart_text, True, BLACK)
            text_rect = text_surf.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 20))
            restart_rect = restart_surf.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 20))
            self.screen.blit(text_surf, text_rect)
            self.screen.blit(restart_surf, restart_rect)
        
        # Update display
        pygame.display.flip()
    
    def run(self):
        while True:
            self.handle_input()
            self.update()
            self.draw()
            self.clock.tick(FPS)

def main():
    game = Game()
    game.run()

if __name__ == "__main__":
    main()