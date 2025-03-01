import pygame
import sys
import random
import math
import time
from entities import Regiment, Bullet, set_debug_mode
from ai import AI, CautiousAI, AggressiveAI, FlankingAI
from rendering import (
    draw_battlefield, draw_team_status, draw_controls, draw_stats, 
    draw_game_over, set_debug_mode as render_set_debug_mode, init_fonts
)
from game_logic import (
    handle_events, update_regiments, update_bullets, 
    check_win_condition, calculate_fps, cap_framerate
)

# Initialize pygame
pygame.init()

# Constants
SCREEN_WIDTH = 1000
SCREEN_HEIGHT = 700
BATTLEFIELD_MARGIN = 50

# Game setup
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Army Battle Simulation")
clock = pygame.time.Clock()

# Initialize fonts for rendering
init_fonts()

# Debug settings
DEBUG_MODE = False  # Debug info off by default

def initialize_game():
    """Initialize regiments and AIs for both teams"""
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
    
    # AI types to choose from
    ai_types = [AggressiveAI, FlankingAI, CautiousAI]
    
    # Create regiment-specific AIs with random personalities
    red_regiment_ais = []
    blue_regiment_ais = []
    
    # Assign random AI types to each regiment
    for i in range(3):
        # Choose random AI types for this regiment
        red_ai_type = random.choice(ai_types)
        blue_ai_type = random.choice(ai_types)
        
        # Create the AIs with random parameter variations
        red_regiment_ais.append(red_ai_type("red", [red_regiments[i]], randomize=True))
        blue_regiment_ais.append(blue_ai_type("blue", [blue_regiments[i]], randomize=True))
    
    bullets = []
    
    # Print the AI assignments for this battle
    print("Red Team AI Types:")
    for i, ai in enumerate(red_regiment_ais):
        print(f"  Regiment {i+1}: {red_regiments[i].ai_type}")
        
    print("Blue Team AI Types:")
    for i, ai in enumerate(blue_regiment_ais):
        print(f"  Regiment {i+1}: {blue_regiments[i].ai_type}")
    
    return red_regiments, blue_regiments, red_regiment_ais, blue_regiment_ais, bullets


def main():
    """Main game function"""
    global DEBUG_MODE
    
    running = True
    game_over = False
    winner = None
    game_speed = 1  # 1 = normal speed, 2 = 2x speed, etc.
    
    # Initialize game elements
    red_regiments, blue_regiments, red_regiment_ais, blue_regiment_ais, bullets = initialize_game()
    
    # For FPS display
    fps_update_time = time.time()
    fps_count = 0
    fps_display = 0
    
    # Game stats
    bullets_fired = {"red": 0, "blue": 0}
    damage_dealt = {"red": 0, "blue": 0}
    
    # Random terrain seed
    random.seed(time.time())
    
    # Set debug mode for modules
    set_debug_mode(DEBUG_MODE)
    render_set_debug_mode(DEBUG_MODE)
    
    while running:
        frame_start_time = time.time()
        
        # Event handling
        quit_requested, toggle_debug, new_speed, restart_requested = handle_events(pygame.event.get())
        
        if quit_requested:
            running = False
            
        if toggle_debug:
            DEBUG_MODE = not DEBUG_MODE
            set_debug_mode(DEBUG_MODE)
            render_set_debug_mode(DEBUG_MODE)
            print(f"Debug mode: {'ON' if DEBUG_MODE else 'OFF'}")
            
        if new_speed is not None:
            game_speed = new_speed
            
        if restart_requested and game_over:
            red_regiments, blue_regiments, red_regiment_ais, blue_regiment_ais, bullets = initialize_game()
            game_over = False
            winner = None
            bullets_fired = {"red": 0, "blue": 0}
            damage_dealt = {"red": 0, "blue": 0}

        # Game logic (skip if game over)
        if not game_over:
            # Get independent AI decisions for each regiment
            red_actions = []
            for i, ai in enumerate(red_regiment_ais):
                regiment_actions = ai.make_decisions(blue_regiments, bullets)
                # Each AI returns actions for its regiment (just one action in this case)
                red_actions.append(regiment_actions[0])
                
            blue_actions = []
            for i, ai in enumerate(blue_regiment_ais):
                regiment_actions = ai.make_decisions(red_regiments, bullets)
                blue_actions.append(regiment_actions[0])
            
            # Update regiments and handle firing
            bullets, red_bullets = update_regiments(red_regiments, red_actions, blue_regiments, bullets, "red")
            bullets, blue_bullets = update_regiments(blue_regiments, blue_actions, red_regiments, bullets, "blue")
            
            bullets_fired["red"] += red_bullets
            bullets_fired["blue"] += blue_bullets
            
            # Update bullets and handle collisions
            bullets, red_damage, blue_damage = update_bullets(
                bullets, red_regiments, blue_regiments, 
                BATTLEFIELD_MARGIN, SCREEN_WIDTH, SCREEN_HEIGHT
            )
            
            damage_dealt["red"] += red_damage
            damage_dealt["blue"] += blue_damage
            
            # Check win condition
            game_over, winner = check_win_condition(red_regiments, blue_regiments)

        # Rendering
        from rendering import font, large_font
        draw_battlefield(screen, SCREEN_WIDTH, SCREEN_HEIGHT, BATTLEFIELD_MARGIN)
        
        # Draw bullets
        for bullet in bullets:
            bullet.draw(screen)
        
        # Draw regiments
        for regiment in red_regiments + blue_regiments:
            regiment.draw(screen, font)
        
        # Draw HUD elements
        draw_team_status(screen, red_regiments, blue_regiments, font)
        draw_controls(screen, font, SCREEN_HEIGHT)
        draw_stats(screen, bullets_fired, damage_dealt, fps_display, game_speed, SCREEN_WIDTH)
        
        # Draw game over screen if needed
        if game_over:
            draw_game_over(screen, winner, large_font, font, SCREEN_WIDTH, SCREEN_HEIGHT)
        
        # FPS calculation
        new_fps, fps_count, fps_update_time = calculate_fps(fps_count, fps_update_time)
        if new_fps is not None:
            fps_display = new_fps
        
        # Update display
        pygame.display.flip()
        
        # Cap the frame rate
        cap_framerate(frame_start_time, game_speed)

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()