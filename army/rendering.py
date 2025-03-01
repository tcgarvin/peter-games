import pygame
from typing import List, Dict

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
RED = (255, 50, 50)
BLUE = (50, 50, 255)
GREEN = (0, 255, 0)
YELLOW = (255, 255, 0)
BROWN = (139, 69, 19)
GRASS_COLOR = (100, 200, 100)

# Game debug mode
DEBUG_MODE = False

def draw_battlefield(screen, screen_width, screen_height, battlefield_margin):
    """Draw the battlefield background and border"""
    # Draw grass background
    screen.fill(GRASS_COLOR)
    
    # Draw battlefield border
    pygame.draw.rect(screen, BROWN, (battlefield_margin, battlefield_margin, 
                                     screen_width - 2 * battlefield_margin, 
                                     screen_height - 2 * battlefield_margin), 5)

def count_alive_regiments(regiments):
    """Count non-destroyed regiments
    
    Args:
        regiments: List of regiments to count
        
    Returns:
        Number of non-destroyed regiments
    """
    return sum(1 for r in regiments if not r.destroyed)

def draw_team_status(screen, red_regiments, blue_regiments, font):
    """Draw team status information
    
    Args:
        screen: Pygame screen to draw on
        red_regiments: List of red regiments
        blue_regiments: List of blue regiments
        font: Pygame font to use for text
    """
    red_alive = count_alive_regiments(red_regiments)
    blue_alive = count_alive_regiments(blue_regiments)
    
    # Determine panel height based on debug mode
    panel_height = 110
    if DEBUG_MODE:
        panel_height = 270  # Bigger to show AI types
    
    # Draw team status
    pygame.draw.rect(screen, BLACK, (20, 20, 400, panel_height))
    
    # Team information headers
    pygame.draw.rect(screen, RED, (30, 30, 40, 40))
    red_text = font.render(f"Red Team: {red_alive}/3 alive", True, WHITE)
    screen.blit(red_text, (80, 35))
    
    pygame.draw.rect(screen, BLUE, (30, 80, 40, 40))
    blue_text = font.render(f"Blue Team: {blue_alive}/3 alive", True, WHITE)
    screen.blit(blue_text, (80, 85))
    
    # Show AI information in debug mode
    if DEBUG_MODE:
        title_text = font.render("Regiment AI Types:", True, YELLOW)
        screen.blit(title_text, (30, 130))
        
        y_pos = 170
        for i, regiment in enumerate(red_regiments):
            if not regiment.destroyed:
                reg_text = font.render(f"Red {i+1}: {regiment.ai_type}", True, RED)
                screen.blit(reg_text, (40, y_pos))
                y_pos += 30
                
        y_pos = 170
        for i, regiment in enumerate(blue_regiments):
            if not regiment.destroyed:
                reg_text = font.render(f"Blue {i+1}: {regiment.ai_type}", True, BLUE)
                screen.blit(reg_text, (220, y_pos))
                y_pos += 30

def draw_controls(screen, font, screen_height):
    """Draw control information
    
    Args:
        screen: Pygame screen to draw on
        font: Pygame font to use for text
        screen_height: Height of the screen
    """
    controls_y = screen_height - 140
    pygame.draw.rect(screen, BLACK, (20, controls_y, 440, 120))
    
    controls_title = font.render("Controls:", True, WHITE)
    screen.blit(controls_title, (30, controls_y + 10))
    
    controls_text1 = font.render("Q/ESC: Quit", True, WHITE)
    controls_text2 = font.render("D: Toggle Debug Info", True, WHITE)
    controls_text3 = font.render("1/2/3: Set Speed", True, WHITE)
    controls_text4 = font.render("SPACE: Restart (after game over)", True, WHITE)
    
    screen.blit(controls_text1, (30, controls_y + 40))
    screen.blit(controls_text2, (30, controls_y + 65))
    screen.blit(controls_text3, (30, controls_y + 90))
    screen.blit(controls_text4, (220, controls_y + 40))

def draw_stats(screen, bullets_fired, damage_dealt, fps_display, game_speed, screen_width):
    """Draw game statistics
    
    Args:
        screen: Pygame screen to draw on
        bullets_fired: Dictionary with bullets fired by each team
        damage_dealt: Dictionary with damage dealt by each team
        fps_display: Current FPS value
        game_speed: Current game speed multiplier
        screen_width: Width of the screen
    """
    stats_x = screen_width - 460
    pygame.draw.rect(screen, BLACK, (stats_x, 20, 440, 220))
    
    bullets_text = font.render(f"Bullets Fired: RED:{bullets_fired['red']} BLUE:{bullets_fired['blue']}", True, WHITE)
    damage_text = font.render(f"Damage Dealt: RED:{damage_dealt['red']} BLUE:{damage_dealt['blue']}", True, WHITE)
    fps_text = font.render(f"FPS: {fps_display:.1f} (Speed: {game_speed}x)", True, WHITE)
    debug_text = font.render(f"Debug Mode: {'ON' if DEBUG_MODE else 'OFF'}", True, GREEN if DEBUG_MODE else RED)
    ai_text = font.render("Individual Regiment AI enabled", True, YELLOW)
    
    screen.blit(bullets_text, (stats_x + 20, 30))
    screen.blit(damage_text, (stats_x + 20, 70))
    screen.blit(fps_text, (stats_x + 20, 110))
    screen.blit(debug_text, (stats_x + 20, 150))
    screen.blit(ai_text, (stats_x + 20, 190))

def draw_game_over(screen, winner, large_font, font, screen_width, screen_height):
    """Draw game over screen
    
    Args:
        screen: Pygame screen to draw on
        winner: Winner team color ("red" or "blue")
        large_font: Pygame font for large text
        font: Pygame font for small text
        screen_width: Width of the screen
        screen_height: Height of the screen
    """
    overlay = pygame.Surface((screen_width, screen_height), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 128))
    screen.blit(overlay, (0, 0))
    
    winner_color = RED if winner == "red" else BLUE
    winner_text = large_font.render(f"{winner.upper()} TEAM WINS!", True, winner_color)
    restart_text = font.render("Press SPACE to restart", True, WHITE)
    
    screen.blit(winner_text, (screen_width // 2 - winner_text.get_width() // 2, 
                             screen_height // 2 - winner_text.get_height() // 2))
    screen.blit(restart_text, (screen_width // 2 - restart_text.get_width() // 2, 
                              screen_height // 2 + 50))

# Set debug mode
def set_debug_mode(mode):
    global DEBUG_MODE
    DEBUG_MODE = mode

# Initialize fonts - will be properly initialized in game setup
font = None 
large_font = None

def init_fonts():
    """Initialize fonts for rendering"""
    global font, large_font
    font = pygame.font.SysFont(None, 28)  # Smaller UI font to prevent overflow
    large_font = pygame.font.SysFont(None, 72)  # Larger header font