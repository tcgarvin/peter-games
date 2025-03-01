"""
Entity classes for the game (players, enemies).
"""
import pygame
import math
import random
from config import *

class Player:
    def __init__(self, x, y, player_id):
        self.x = x
        self.y = y
        self.radius = PLAYER_RADIUS
        self.speed = PLAYER_SPEED
        self.health = PLAYER_HEALTH
        self.player_id = player_id
        self.color = PLAYER_COLORS[player_id - 1]  # Player ID is 1 or 2
        self.direction = 0  # Angle in degrees
        self.attack_cooldown = 0
        self.score = 0
        
    def move(self, dx, dy, obstacles):
        # Update direction if moving
        if dx != 0 or dy != 0:
            self.direction = math.degrees(math.atan2(dy, dx))
            
        # Move player
        new_x = self.x + dx * self.speed
        new_y = self.y + dy * self.speed
        
        # Simple boundary checking
        if 0 + self.radius <= new_x <= SCREEN_WIDTH - self.radius:
            # Check obstacle collisions for X movement
            if not self._check_obstacle_collision(new_x, self.y, obstacles):
                self.x = new_x
                
        if 0 + self.radius <= new_y <= SCREEN_HEIGHT - self.radius:
            # Check obstacle collisions for Y movement
            if not self._check_obstacle_collision(self.x, new_y, obstacles):
                self.y = new_y
    
    def _check_obstacle_collision(self, x, y, obstacles):
        # Check if position collides with any obstacle
        for ox, oy, width, height in obstacles:
            # Check if the player's circle intersects with the rectangle
            # Find the nearest point on the rectangle to the circle center
            nearest_x = max(ox, min(x, ox + width))
            nearest_y = max(oy, min(y, oy + height))
            
            # Find distance between nearest point and circle center
            distance = math.sqrt((nearest_x - x)**2 + (nearest_y - y)**2)
            
            # If distance is less than radius, collision occurred
            if distance < self.radius + 2:  # Add small buffer for smoother movement
                return True
        return False
            
    def attack(self, enemies, current_time):
        # Check if attack is on cooldown
        if self.attack_cooldown > current_time:
            return []
            
        # Set cooldown for next attack
        self.attack_cooldown = current_time + PLAYER_ATTACK_COOLDOWN
        
        # List of enemies hit
        hit_enemies = []
        
        # Check if any enemies are within attack radius
        for enemy in enemies:
            distance = math.sqrt((enemy.x - self.x)**2 + (enemy.y - self.y)**2)
            if distance <= PLAYER_ATTACK_RADIUS:
                enemy.health -= PLAYER_ATTACK_DAMAGE
                hit_enemies.append(enemy)
                
                if enemy.health <= 0:
                    self.score += enemy.value
                    
        return hit_enemies
        
    def draw(self, screen):
        # Draw player circle
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.radius)
        
        # Draw direction indicator
        direction_rad = math.radians(self.direction)
        end_x = self.x + math.cos(direction_rad) * self.radius
        end_y = self.y + math.sin(direction_rad) * self.radius
        pygame.draw.line(screen, WHITE, (self.x, self.y), (end_x, end_y), 3)
        
        # Draw health bar above player
        health_bar_width = self.radius * 2
        health_bar_height = 5
        health_percent = self.health / PLAYER_HEALTH
        health_width = health_bar_width * health_percent
        
        health_bar_x = self.x - self.radius
        health_bar_y = self.y - self.radius - 10
        
        pygame.draw.rect(screen, RED, (health_bar_x, health_bar_y, health_bar_width, health_bar_height))
        pygame.draw.rect(screen, GREEN, (health_bar_x, health_bar_y, health_width, health_bar_height))
        
    def is_alive(self):
        return self.health > 0


class Enemy:
    def __init__(self, x, y, enemy_type="basic"):
        self.x = x
        self.y = y
        self.type = enemy_type
        self.color = ENEMY_TYPES[enemy_type]["color"]
        self.radius = ENEMY_TYPES[enemy_type]["radius"]
        self.speed = ENEMY_TYPES[enemy_type]["speed"]
        self.health = ENEMY_TYPES[enemy_type]["health"]
        self.max_health = self.health
        self.damage = ENEMY_TYPES[enemy_type]["damage"]
        self.value = ENEMY_TYPES[enemy_type]["value"]
        self.target_x = 0
        self.target_y = 0
        self.attack_cooldown = 0
        self.last_direction_change = 0  # For smarter pathfinding
        self.preferred_direction = random.choice(["horizontal", "vertical"])  # Randomize initial preference
        
    def move(self, objective_x, objective_y, obstacles):
        # Direct pathfinding - try to move directly to objective
        dx = objective_x - self.x
        dy = objective_y - self.y
        distance = max(1, math.sqrt(dx*dx + dy*dy))  # Avoid division by zero
        
        # Try direct movement first - simplest and most natural looking
        move_x = (dx / distance) * self.speed
        move_y = (dy / distance) * self.speed
        
        new_x = self.x + move_x
        new_y = self.y + move_y
        
        # Check if direct movement is possible
        if (0 + self.radius <= new_x <= SCREEN_WIDTH - self.radius and
            0 + self.radius <= new_y <= SCREEN_HEIGHT - self.radius):
            if not self._check_obstacle_collision(new_x, new_y, obstacles):
                # Direct path is clear
                self.x = new_x
                self.y = new_y
                return  # Movement successful
        
        # Direct movement failed, try to find a way around obstacles
        
        # First check if we can move horizontally
        if 0 + self.radius <= self.x + move_x <= SCREEN_WIDTH - self.radius:
            if not self._check_obstacle_collision(self.x + move_x, self.y, obstacles):
                self.x += move_x
        
        # Then check if we can move vertically
        if 0 + self.radius <= self.y + move_y <= SCREEN_HEIGHT - self.radius:
            if not self._check_obstacle_collision(self.x, self.y + move_y, obstacles):
                self.y += move_y
                
        # If we couldn't move at all, try to find a way around the obstacle
        # by testing 8 directions around the enemy
        current_time = pygame.time.get_ticks()
        
        # Only try alternative paths if we haven't moved
        if self.x == new_x and self.y == new_y and current_time - self.last_direction_change > 500:
            directions = [
                (1, 0), (0.7, 0.7), (0, 1), (-0.7, 0.7),
                (-1, 0), (-0.7, -0.7), (0, -1), (0.7, -0.7)
            ]
            
            # Try each direction until we find one that works
            for dir_x, dir_y in directions:
                test_x = self.x + dir_x * self.speed
                test_y = self.y + dir_y * self.speed
                
                if (0 + self.radius <= test_x <= SCREEN_WIDTH - self.radius and
                    0 + self.radius <= test_y <= SCREEN_HEIGHT - self.radius):
                    if not self._check_obstacle_collision(test_x, test_y, obstacles):
                        self.x = test_x
                        self.y = test_y
                        self.last_direction_change = current_time
                        break
                            
    def _check_obstacle_collision(self, x, y, obstacles):
        # Check if position collides with any obstacle
        for ox, oy, width, height in obstacles:
            # Check if the enemy's circle intersects with the rectangle
            # Find the nearest point on the rectangle to the circle center
            nearest_x = max(ox, min(x, ox + width))
            nearest_y = max(oy, min(y, oy + height))
            
            # Find distance between nearest point and circle center
            distance = math.sqrt((nearest_x - x)**2 + (nearest_y - y)**2)
            
            # If distance is less than radius, collision occurred
            if distance < self.radius:
                return True
        return False
        
    def attack_objective(self, objective, current_time):
        # Check if we're close enough to the objective
        distance = math.sqrt((objective.x - self.x)**2 + (objective.y - self.y)**2)
        if distance <= self.radius + objective.radius:
            # Check if attack is off cooldown
            if self.attack_cooldown <= current_time:
                objective.health -= self.damage
                self.attack_cooldown = current_time + 1000  # 1 second cooldown
                return True
        return False
                
    def draw(self, screen):
        # Draw enemy
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), self.radius)
        
        # Draw health bar above enemy
        health_bar_width = self.radius * 2
        health_bar_height = 3
        health_percent = self.health / self.max_health
        health_width = health_bar_width * health_percent
        
        health_bar_x = self.x - self.radius
        health_bar_y = self.y - self.radius - 7
        
        pygame.draw.rect(screen, RED, (health_bar_x, health_bar_y, health_bar_width, health_bar_height))
        pygame.draw.rect(screen, GREEN, (health_bar_x, health_bar_y, health_width, health_bar_height))
        
    def is_alive(self):
        return self.health > 0


class Objective:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.radius = OBJECTIVE_RADIUS
        self.health = OBJECTIVE_HEALTH
        self.max_health = OBJECTIVE_HEALTH
        
    def draw(self, screen):
        # Draw objective
        pygame.draw.circle(screen, OBJECTIVE_COLOR, (int(self.x), int(self.y)), self.radius)
        
        # Draw health bar above objective
        health_bar_width = self.radius * 2
        health_bar_height = 8
        health_percent = self.health / self.max_health
        health_width = health_bar_width * health_percent
        
        health_bar_x = self.x - self.radius
        health_bar_y = self.y - self.radius - 15
        
        pygame.draw.rect(screen, RED, (health_bar_x, health_bar_y, health_bar_width, health_bar_height))
        pygame.draw.rect(screen, GREEN, (health_bar_x, health_bar_y, health_width, health_bar_height))
        
    def is_alive(self):
        return self.health > 0