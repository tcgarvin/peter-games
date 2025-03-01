"""
Rendering functions for the game.
"""
import pygame
import random
from config import *

class Renderer:
    def __init__(self):
        self.screen = None
        self.attack_effects = []  # [(x, y, radius, time_remaining), ...]
        # Fixed obstacles for consistency
        self.obstacles = []
        for _ in range(3):
            x = random.randint(100, SCREEN_WIDTH - 100)
            y = random.randint(100, SCREEN_HEIGHT - 100)
            width = random.randint(50, 150)
            height = random.randint(50, 150)
            self.obstacles.append((x, y, width, height))
        
    def init_screen(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Orcs Must Die - 2D")
        
    def clear_screen(self):
        self.screen.fill(BLACK)
        
    def draw_game_state(self, game_state):
        # Draw game elements
        game_state.draw(self.screen)
        
        # Draw attack effects
        self.draw_effects()
        
    def draw_effects(self):
        effects_to_remove = []
        
        for i, (x, y, radius, color, time_remaining) in enumerate(self.attack_effects):
            # Draw attack effect (circle that fades over time)
            alpha = int(255 * (time_remaining / 200))  # Fade based on time remaining
            
            # Create a surface with per-pixel alpha
            effect_surface = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
            
            # Draw the circle with alpha on the surface
            pygame.draw.circle(effect_surface, (*color, alpha), (radius, radius), radius)
            
            # Blit the surface onto the screen
            self.screen.blit(effect_surface, (x - radius, y - radius))
            
            # Decrease time remaining
            self.attack_effects[i] = (x, y, radius, color, time_remaining - 16.67)  # Assuming ~60fps
            
            if time_remaining <= 0:
                effects_to_remove.append(i)
                
        # Remove expired effects (in reverse order to avoid index issues)
        for i in sorted(effects_to_remove, reverse=True):
            self.attack_effects.pop(i)
            
    def add_attack_effect(self, x, y, radius, color=WHITE):
        # Add a new attack effect
        self.attack_effects.append((x, y, radius, color, 200))  # 200ms duration
        
    def draw_map(self):
        # Draw fixed obstacles only (no border to avoid trapping enemies)
        for x, y, width, height in self.obstacles:
            pygame.draw.rect(self.screen, WALL_COLOR, (x, y, width, height))
            
    def update_display(self):
        pygame.display.flip()
        
    def draw_start_screen(self):
        self.screen.fill(BLACK)
        
        # Draw title
        font_title = pygame.font.SysFont(None, 72)
        title_text = font_title.render("Orcs Must Die - 2D", True, WHITE)
        title_rect = title_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//3))
        self.screen.blit(title_text, title_rect)
        
        # Draw instructions
        font_inst = pygame.font.SysFont(None, 36)
        
        instructions = [
            "Player 1: WASD to move, SPACE to attack",
            "Player 2: Arrow keys to move, RIGHT CTRL to attack",
            "Defend the central objective from enemies!",
            "",
            "Press ENTER to start"
        ]
        
        for i, line in enumerate(instructions):
            inst_text = font_inst.render(line, True, WHITE)
            inst_rect = inst_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 + i * 40))
            self.screen.blit(inst_text, inst_rect)
            
        pygame.display.flip()
        
    def draw_pause_screen(self):
        # Create a semi-transparent overlay
        overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 128))  # Black with 50% opacity
        self.screen.blit(overlay, (0, 0))
        
        # Draw pause text
        font = pygame.font.SysFont(None, 72)
        pause_text = font.render("PAUSED", True, WHITE)
        text_rect = pause_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2))
        self.screen.blit(pause_text, text_rect)
        
        # Draw resume instructions
        font_small = pygame.font.SysFont(None, 36)
        resume_text = font_small.render("Press P to resume", True, WHITE)
        resume_rect = resume_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2 + 50))
        self.screen.blit(resume_text, resume_rect)
        
        pygame.display.flip()