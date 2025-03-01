"""
Game state management, including wave generation and collision detection.
"""
import pygame
import random
import math
from config import *
from entities import Enemy, Objective

class GameState:
    def __init__(self):
        self.players = []
        self.enemies = []
        self.objective = Objective(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
        self.score = 0
        self.wave_number = 0
        self.wave_timer = 0
        self.game_over = False
        self.wave_in_progress = False
        self.spawn_points = [
            (0, 0),  # Top-left
            (SCREEN_WIDTH, 0),  # Top-right
            (0, SCREEN_HEIGHT),  # Bottom-left
            (SCREEN_WIDTH, SCREEN_HEIGHT)  # Bottom-right
        ]
        
    def add_player(self, player):
        self.players.append(player)
        
    def update(self, current_time, obstacles):
        if self.game_over:
            return
            
        # Check if objective is destroyed
        if not self.objective.is_alive():
            self.game_over = True
            return
            
        # Check if all players are dead
        all_players_dead = True
        for player in self.players:
            if player.is_alive():
                all_players_dead = False
                break
                
        if all_players_dead and len(self.players) > 0:
            self.game_over = True
            return
            
        # Update enemies
        enemies_to_remove = []
        for enemy in self.enemies:
            if not enemy.is_alive():
                enemies_to_remove.append(enemy)
                self.score += enemy.value
                continue
                
            enemy.move(self.objective.x, self.objective.y, obstacles)
            enemy.attack_objective(self.objective, current_time)
                
        # Remove dead enemies
        for enemy in enemies_to_remove:
            if enemy in self.enemies:
                self.enemies.remove(enemy)
                
        # Check if wave is complete
        if self.wave_in_progress and len(self.enemies) == 0:
            self.wave_in_progress = False
            self.wave_timer = current_time + WAVE_COOLDOWN
            
        # Start new wave if timer expired
        if not self.wave_in_progress and current_time >= self.wave_timer:
            self.start_new_wave()
            
    def start_new_wave(self):
        self.wave_number += 1
        self.wave_in_progress = True
        
        # Determine number of enemies based on wave number
        num_enemies = min(5 + self.wave_number * 2, MAX_ENEMIES)
        
        # Determine enemy types based on wave number
        enemy_types = ["basic"]
        if self.wave_number >= 3:
            enemy_types.append("fast")
        if self.wave_number >= 5:
            enemy_types.append("tank")
        
        # Define valid spawn areas (at maze entrances)
        valid_spawns = [
            (SCREEN_WIDTH // 3, 30),  # Top entrance
            (SCREEN_WIDTH - 30, 2 * SCREEN_HEIGHT // 3),  # Right entrance
            (2 * SCREEN_WIDTH // 3, SCREEN_HEIGHT - 30),  # Bottom entrance
            (30, SCREEN_HEIGHT // 3)  # Left entrance
        ]
            
        # Spawn enemies in valid areas
        for _ in range(num_enemies):
            spawn_point = random.choice(valid_spawns)
            enemy_type = random.choice(enemy_types)
            
            # Add some randomness to spawn position
            spawn_x = spawn_point[0] + random.randint(-30, 30)
            spawn_y = spawn_point[1] + random.randint(-30, 30)
            
            # Ensure spawn point is within screen bounds but away from borders
            spawn_x = max(30, min(SCREEN_WIDTH - 30, spawn_x))
            spawn_y = max(30, min(SCREEN_HEIGHT - 30, spawn_y))
            
            self.enemies.append(Enemy(spawn_x, spawn_y, enemy_type))
            
    def draw(self, screen):
        # Draw objective
        self.objective.draw(screen)
        
        # Draw enemies
        for enemy in self.enemies:
            enemy.draw(screen)
            
        # Draw players
        for player in self.players:
            if player.is_alive():
                player.draw(screen)
                
        # Draw UI
        self.draw_ui(screen)
        
    def draw_ui(self, screen):
        # Draw wave number
        font = pygame.font.SysFont(None, 36)
        wave_text = font.render(f"Wave: {self.wave_number}", True, WHITE)
        screen.blit(wave_text, (20, 20))
        
        # Draw score
        score_text = font.render(f"Score: {self.score}", True, WHITE)
        screen.blit(score_text, (20, 60))
        
        # Draw player scores
        for i, player in enumerate(self.players):
            player_text = font.render(f"P{i+1}: {player.score}", True, PLAYER_COLORS[i])
            screen.blit(player_text, (SCREEN_WIDTH - 150, 20 + i * 40))
            
        # Draw game over text if applicable
        if self.game_over:
            font_large = pygame.font.SysFont(None, 72)
            game_over_text = font_large.render("GAME OVER", True, RED)
            text_rect = game_over_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2))
            screen.blit(game_over_text, text_rect)
            
            font_small = pygame.font.SysFont(None, 36)
            restart_text = font_small.render("Press R to restart", True, WHITE)
            restart_rect = restart_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 + 50))
            screen.blit(restart_text, restart_rect)
            
    def check_collisions(self, obstacles):
        # Player-Enemy collisions (for future use, like knockback)
        for player in self.players:
            if not player.is_alive():
                continue
                
            for enemy in self.enemies:
                distance = math.sqrt((player.x - enemy.x)**2 + (player.y - enemy.y)**2)
                if distance < player.radius + enemy.radius:
                    # Calculate knockback direction
                    dx = player.x - enemy.x
                    dy = player.y - enemy.y
                    dist = max(1, math.sqrt(dx*dx + dy*dy))  # Avoid division by zero
                    
                    # Calculate proposed new position with configurable knockback force
                    new_x = player.x + (dx / dist) * KNOCKBACK_FORCE
                    new_y = player.y + (dy / dist) * KNOCKBACK_FORCE
                    
                    # Boundary check for new position
                    new_x = max(player.radius, min(SCREEN_WIDTH - player.radius, new_x))
                    new_y = max(player.radius, min(SCREEN_HEIGHT - player.radius, new_y))
                    
                    # Only apply knockback if new position doesn't collide with obstacles
                    if not player._check_obstacle_collision(new_x, new_y, obstacles):
                        player.x = new_x
                        player.y = new_y
                    
    def reset(self):
        self.enemies = []
        self.objective = Objective(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
        self.score = 0
        self.wave_number = 0
        self.wave_timer = pygame.time.get_ticks() + 3000  # 3 seconds before first wave
        self.game_over = False
        self.wave_in_progress = False
        
        # Reset players
        for player in self.players:
            player.health = PLAYER_HEALTH
            player.score = 0