"""
Main entry point for the game.
"""
import pygame
import sys
import math
from config import *
from entities import Player
from game_state import GameState
from rendering import Renderer

def handle_player_input(player1, player2, keys, current_time, game_state, renderer):
    # Player 1 movement (WASD)
    p1_dx, p1_dy = 0, 0
    if keys[pygame.K_w]:
        p1_dy -= 1
    if keys[pygame.K_s]:
        p1_dy += 1
    if keys[pygame.K_a]:
        p1_dx -= 1
    if keys[pygame.K_d]:
        p1_dx += 1
        
    # Normalize diagonal movement
    if p1_dx != 0 and p1_dy != 0:
        p1_dx /= math.sqrt(2)
        p1_dy /= math.sqrt(2)
        
    player1.move(p1_dx, p1_dy, renderer.obstacles)
    
    # Player 1 attack (SPACE)
    if keys[pygame.K_SPACE]:
        hit_enemies = player1.attack(game_state.enemies, current_time)
        if hit_enemies:
            renderer.add_attack_effect(player1.x, player1.y, PLAYER_ATTACK_RADIUS, PLAYER_COLORS[0])
    
    # Player 2 movement (Arrow keys)
    p2_dx, p2_dy = 0, 0
    if keys[pygame.K_UP]:
        p2_dy -= 1
    if keys[pygame.K_DOWN]:
        p2_dy += 1
    if keys[pygame.K_LEFT]:
        p2_dx -= 1
    if keys[pygame.K_RIGHT]:
        p2_dx += 1
        
    # Normalize diagonal movement
    if p2_dx != 0 and p2_dy != 0:
        p2_dx /= math.sqrt(2)
        p2_dy /= math.sqrt(2)
        
    player2.move(p2_dx, p2_dy, renderer.obstacles)
    
    # Player 2 attack (Right CTRL)
    if keys[pygame.K_RCTRL]:
        hit_enemies = player2.attack(game_state.enemies, current_time)
        if hit_enemies:
            renderer.add_attack_effect(player2.x, player2.y, PLAYER_ATTACK_RADIUS, PLAYER_COLORS[1])

def main():
    # Initialize Pygame
    pygame.init()
    clock = pygame.time.Clock()
    
    # Create renderer first to initialize obstacles
    renderer = Renderer()
    renderer.init_screen()
    
    # Game state
    game_state = GameState()
    
    # Create players with safe starting positions
    def find_safe_position(radius, obstacles, x_pref, y_pref):
        # Try preferred position first
        if not check_position_in_obstacle(x_pref, y_pref, radius, obstacles):
            return x_pref, y_pref
            
        # Otherwise, search for a clear spot
        for attempts in range(100):  # Limit attempts to avoid infinite loop
            x = random.randint(radius + 50, SCREEN_WIDTH - radius - 50)
            y = random.randint(radius + 50, SCREEN_HEIGHT - radius - 50)
            if not check_position_in_obstacle(x, y, radius, obstacles):
                return x, y
                
        # Fallback - center of screen
        return SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2
        
    def check_position_in_obstacle(x, y, radius, obstacles):
        # Check screen borders
        if x - radius < 0 or x + radius > SCREEN_WIDTH or y - radius < 0 or y + radius > SCREEN_HEIGHT:
            return True
            
        # Check obstacles
        for ox, oy, width, height in obstacles:
            # Find nearest point on rectangle to circle center
            nearest_x = max(ox, min(x, ox + width))
            nearest_y = max(oy, min(y, oy + height))
            
            # Calculate distance
            distance = math.sqrt((nearest_x - x)**2 + (nearest_y - y)**2)
            
            # Check collision
            if distance < radius + 5:  # Add small buffer
                return True
                
        return False
    
    p1_x, p1_y = find_safe_position(PLAYER_RADIUS, renderer.obstacles, SCREEN_WIDTH // 4, SCREEN_HEIGHT // 2)
    p2_x, p2_y = find_safe_position(PLAYER_RADIUS, renderer.obstacles, 3 * SCREEN_WIDTH // 4, SCREEN_HEIGHT // 2)
    
    player1 = Player(p1_x, p1_y, 1)
    player2 = Player(p2_x, p2_y, 2)
    
    game_state.add_player(player1)
    game_state.add_player(player2)
    
    # Start game state
    game_state.wave_timer = pygame.time.get_ticks() + 3000  # 3 seconds before first wave
    
    # Game states
    MENU = 0
    PLAYING = 1
    PAUSED = 2
    
    current_state = MENU
    
    running = True
    while running:
        current_time = pygame.time.get_ticks()
        
        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
                
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                    
                if event.key == pygame.K_RETURN and current_state == MENU:
                    current_state = PLAYING
                    game_state.reset()
                    
                if event.key == pygame.K_p and current_state == PLAYING:
                    current_state = PAUSED
                elif event.key == pygame.K_p and current_state == PAUSED:
                    current_state = PLAYING
                    
                if event.key == pygame.K_r and game_state.game_over:
                    game_state.reset()
        
        # Get key states
        keys = pygame.key.get_pressed()
        
        # Menu state
        if current_state == MENU:
            renderer.draw_start_screen()
            
        # Playing state
        elif current_state == PLAYING:
            # Update game state
            game_state.update(current_time, renderer.obstacles)
            
            # Handle player input
            handle_player_input(player1, player2, keys, current_time, game_state, renderer)
            
            # Check for collisions
            game_state.check_collisions(renderer.obstacles)
            
            # Render the game
            renderer.clear_screen()
            renderer.draw_map()
            renderer.draw_game_state(game_state)
            renderer.update_display()
            
        # Paused state
        elif current_state == PAUSED:
            renderer.draw_pause_screen()
        
        # Cap the frame rate
        clock.tick(FPS)
    
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()