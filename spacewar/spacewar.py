import pygame
import sys
import random

from entities import (
    Ship, DeliveryZone,
    SCREEN_WIDTH, SCREEN_HEIGHT, FPS, 
    BLACK, WHITE, RED, GREEN, BLUE, YELLOW,
    generate_random_asteroids, generate_random_point_away_from_entities,
    MAX_ASTEROIDS, ZONE_SPAWN_INTERVAL
)
from ai import create_random_ai

def draw_menu(screen, font, large_font, selected_option):
    # Clear screen
    screen.fill(BLACK)
    
    # Draw title
    title = large_font.render("SPACEWAR", True, WHITE)
    title_rect = title.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 4))
    screen.blit(title, title_rect)
    
    # Draw menu options
    options = ["0 Players (AI Only)", "1 Player", "2 Players"]
    
    for i, option in enumerate(options):
        # Highlight selected option
        if i == selected_option:
            color = YELLOW
            # Draw selection indicator
            pygame.draw.polygon(screen, YELLOW, [
                (SCREEN_WIDTH // 2 - 160, SCREEN_HEIGHT // 2 + i * 50),
                (SCREEN_WIDTH // 2 - 140, SCREEN_HEIGHT // 2 + i * 50 - 10),
                (SCREEN_WIDTH // 2 - 140, SCREEN_HEIGHT // 2 + i * 50 + 10)
            ])
        else:
            color = WHITE
            
        option_text = font.render(option, True, color)
        option_rect = option_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + i * 50))
        screen.blit(option_text, option_rect)
    
    # Draw instructions
    instructions = font.render("Use UP/DOWN to select, ENTER to start", True, GREEN)
    instructions_rect = instructions.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT * 3 // 4))
    screen.blit(instructions, instructions_rect)
    
    # Draw game rules
    small_font = pygame.font.SysFont(None, 24)
    rules = [
        "DELIVERY GAME: Collect cargo from orange PICKUP zones",
        "Slow down inside the zone to collect or deliver!",
        "Deliver to purple DROPOFF zones to earn credits",
        "Avoid asteroids and compete with other ships"
    ]
    
    for i, rule in enumerate(rules):
        rule_text = small_font.render(rule, True, WHITE)
        screen.blit(rule_text, (SCREEN_WIDTH // 2 - 250, SCREEN_HEIGHT * 3 // 4 + 40 + i * 25))
    
    # Draw version
    version = font.render("v1.2", True, WHITE)
    screen.blit(version, (20, SCREEN_HEIGHT - 30))
    
    pygame.display.flip()

def initialize_game(num_players):
    # Create ships and AIs based on number of players
    ships = []
    ship_ais = []
    
    ship_positions = [
        (SCREEN_WIDTH // 4, SCREEN_HEIGHT // 4),
        (SCREEN_WIDTH * 3 // 4, SCREEN_HEIGHT // 4),
        (SCREEN_WIDTH // 2, SCREEN_HEIGHT * 3 // 4)
    ]
    
    # Add player ships
    for i in range(min(num_players, 3)):
        # Create player ship
        ships.append(Ship(ship_positions[i][0], ship_positions[i][1], random.uniform(0, 360), False))
        ship_ais.append(None)  # No AI for player ships
    
    # Fill remaining slots with AI ships (up to 3 total ships)
    for i in range(num_players, 3):
        ships.append(Ship(ship_positions[i][0], ship_positions[i][1], random.uniform(0, 360), True))
        ship_ais.append(create_random_ai(ships[-1]))
    
    # Ensure all ships start with no cargo and zero credits
    for ship in ships:
        ship.has_cargo = False
        ship.credits = 0
    
    # Generate asteroids
    asteroids = generate_random_asteroids(10, ships)
    
    return ships, ship_ais, asteroids

def handle_menu_input(event, selected_option):
    """Process keyboard input in the menu screen."""
    new_option = selected_option
    start_game = False
    exit_game = False
    
    if event.type == pygame.QUIT:
        exit_game = True
    elif event.type == pygame.KEYDOWN:
        if event.key == pygame.K_UP:
            new_option = (selected_option - 1) % 3
        elif event.key == pygame.K_DOWN:
            new_option = (selected_option + 1) % 3
        elif event.key == pygame.K_RETURN:
            start_game = True
        elif event.key == pygame.K_ESCAPE:
            exit_game = True
    
    return new_option, start_game, exit_game


def handle_gameplay_input(event, player_controls, running, in_menu):
    """Process keyboard input during gameplay."""
    restart_game = False
    
    if event.type == pygame.QUIT:
        running = False
    
    elif event.type == pygame.KEYDOWN:
        if event.key == pygame.K_ESCAPE:
            # Return to main menu
            in_menu = True
            running = False
        elif event.key == pygame.K_r:
            restart_game = True
            
        # Player 1 controls (arrows)
        elif event.key == pygame.K_UP:
            player_controls[0]['thrust'] = 1
        elif event.key == pygame.K_LEFT:
            player_controls[0]['rotation'] = -1
        elif event.key == pygame.K_RIGHT:
            player_controls[0]['rotation'] = 1
            
        # Player 2 controls (WASD)
        elif event.key == pygame.K_w:
            player_controls[1]['thrust'] = 1
        elif event.key == pygame.K_a:
            player_controls[1]['rotation'] = -1
        elif event.key == pygame.K_d:
            player_controls[1]['rotation'] = 1
    
    elif event.type == pygame.KEYUP:
        # Player 1 controls (arrows)
        if event.key == pygame.K_UP:
            player_controls[0]['thrust'] = 0
        elif event.key == pygame.K_LEFT and player_controls[0]['rotation'] == -1:
            player_controls[0]['rotation'] = 0
        elif event.key == pygame.K_RIGHT and player_controls[0]['rotation'] == 1:
            player_controls[0]['rotation'] = 0
        
        # Player 2 controls (WASD)
        elif event.key == pygame.K_w:
            player_controls[1]['thrust'] = 0
        elif event.key == pygame.K_a and player_controls[1]['rotation'] == -1:
            player_controls[1]['rotation'] = 0
        elif event.key == pygame.K_d and player_controls[1]['rotation'] == 1:
            player_controls[1]['rotation'] = 0
    
    return player_controls, running, in_menu, restart_game


def draw_starfield(screen):
    """Draw the starfield background."""
    for i in range(100):
        x = random.randint(0, SCREEN_WIDTH - 1)
        y = random.randint(0, SCREEN_HEIGHT - 1)
        brightness = random.randint(50, 200)
        screen.set_at((x, y), (brightness, brightness, brightness))


def update_ship_controls(ships, ship_ais, player_controls, asteroids, delivery_zones):
    """Update ship controls based on AI or player input."""
    for i, ship in enumerate(ships):
        if ship.destroyed:
            continue
        
        if not ship.ai_controlled:  # Player ship
            # Find which player is controlling this ship
            player_idx = next((idx for idx, s in enumerate(ships) 
                              if s == ship and not s.ai_controlled), 0)
            if player_idx < len(player_controls):
                ship.set_controls(player_controls[player_idx]['thrust'], 
                                 player_controls[player_idx]['rotation'])
        else:  # AI ships
            # Get other ships for AI decision making
            other_ships = [s for s in ships if s != ship and not s.destroyed]
            
            # Get AI decision for this ship
            thrust, rotation = ship_ais[i].make_decision(asteroids, other_ships, delivery_zones)
            ship.set_controls(thrust, rotation)


def update_entities(ships, asteroids):
    """Update positions of all game entities."""
    # Update all ships
    for ship in ships:
        if not ship.destroyed:
            ship.update()
    
    # Update all asteroids
    for asteroid in asteroids:
        asteroid.update()


def check_collisions(ships, asteroids):
    """Check for collisions between ships and asteroids."""
    new_asteroids = []
    
    for ship in ships:
        if ship.destroyed:
            continue
            
        for asteroid in list(asteroids):  # Create a copy to safely modify during iteration
            if ship.is_colliding(asteroid):
                ship.destroyed = True
                # Break asteroid into smaller pieces
                fragments = asteroid.break_apart()
                new_asteroids.extend(fragments)
                asteroids.remove(asteroid)
                break
    
    asteroids.extend(new_asteroids)
    return asteroids


def update_delivery_zones(delivery_zones, ships):
    """Update delivery zones and check for ship interactions."""
    # Update existing zones
    for zone in list(delivery_zones):  # Create a copy to safely modify during iteration
        zone.update()
        if zone.is_expired():
            delivery_zones.remove(zone)
        
        # Check for ship interactions with zones
        for ship in ships:
            if not ship.destroyed and zone.check_ship_interaction(ship):
                # Success sound/effect would go here
                pass
    
    return delivery_zones


def spawn_delivery_zones(delivery_zones, ships, asteroids, zone_spawn_timer):
    """Spawn new delivery zones if timer expired."""
    zone_spawn_timer -= 1
    
    if zone_spawn_timer <= 0:
        # Don't spawn if there are already active zones
        if len(delivery_zones) == 0:
            # Get all entities to avoid spawning too close
            all_entities = ships + asteroids + delivery_zones
            
            # Create pickup zone
            pickup_x, pickup_y = generate_random_point_away_from_entities(all_entities)
            pickup_zone = DeliveryZone(pickup_x, pickup_y, "pickup")
            delivery_zones.append(pickup_zone)
            
            # Create dropoff zone away from pickup and other entities
            all_entities.append(pickup_zone)
            dropoff_x, dropoff_y = generate_random_point_away_from_entities(all_entities, 300)
            dropoff_zone = DeliveryZone(dropoff_x, dropoff_y, "dropoff")
            delivery_zones.append(dropoff_zone)
        
        # Reset zone spawn timer
        zone_spawn_timer = ZONE_SPAWN_INTERVAL
    
    return delivery_zones, zone_spawn_timer


def check_win_conditions(ships):
    """Check if any win conditions are met."""
    game_over = False
    winning_ship = None
    credit_goal = 5
    
    # Check if any ship reached credit goal
    for ship in ships:
        if ship.credits >= credit_goal:
            winning_ship = ship
            game_over = True
            break
    
    # Check if only one ship left or all destroyed
    surviving_ships = [ship for ship in ships if not ship.destroyed]
    if len(surviving_ships) <= 1 or all(ship.destroyed for ship in ships):
        game_over = True
        if len(surviving_ships) == 1:
            winning_ship = surviving_ships[0]
    
    return game_over, winning_ship, surviving_ships


def draw_entities(screen, delivery_zones, asteroids, ships, ship_ais, font):
    """Draw all game entities to the screen."""
    # Draw delivery zones first (so they appear behind other entities)
    for zone in delivery_zones:
        zone.draw(screen)
    
    # Draw asteroids
    for asteroid in asteroids:
        asteroid.draw(screen)
    
    # Draw ships
    for ship in ships:
        if not ship.destroyed:
            ship.draw(screen)
            
            # Draw AI mode for debugging
            if ship.ai_controlled:
                i = ships.index(ship)
                mode_text = font.render(ship_ais[i].current_mode, True, WHITE)
                screen.blit(mode_text, (ship.x - 20, ship.y - 30))
                
            # Draw credit count above ship
            credit_text = font.render(f"${ship.credits}", True, YELLOW)
            screen.blit(credit_text, (ship.x - 10, ship.y - 40))


def draw_ui(screen, font, ships, asteroids, delivery_zones):
    """Draw UI elements like score, controls, etc."""
    # Draw score and game info
    score_text = font.render(
        f"Ships: {sum(1 for ship in ships if not ship.destroyed)} / {len(ships)}   "
        f"Asteroids: {len(asteroids)}   Goal: 5 Credits", 
        True, WHITE
    )
    screen.blit(score_text, (10, 10))
    
    # Show delivery zone info if active
    if delivery_zones:
        pickup_count = len([z for z in delivery_zones if z.zone_type == "pickup"])
        dropoff_count = len([z for z in delivery_zones if z.zone_type == "dropoff"])
        zone_info = f"Active zones: {pickup_count} pickup, {dropoff_count} dropoff"
        zone_text = font.render(zone_info, True, YELLOW)
        screen.blit(zone_text, (SCREEN_WIDTH // 2 - 150, 10))
    
    # Draw controls help
    num_players = sum(1 for ship in ships if not ship.ai_controlled)
    if num_players == 1:
        controls_text = font.render("Player 1: Arrow Keys (↑ = thrust, ← → = rotate)", True, GREEN)
        screen.blit(controls_text, (10, 40))
    elif num_players == 2:
        controls_text1 = font.render("Player 1: Arrow Keys (↑ = thrust, ← → = rotate)", True, GREEN)
        controls_text2 = font.render("Player 2: WASD (W = thrust, A/D = rotate)", True, BLUE)
        screen.blit(controls_text1, (10, 40))
        screen.blit(controls_text2, (10, 70))


def draw_game_over(screen, font, game_over, winning_ship, surviving_ships, ships):
    """Draw game over message if applicable."""
    if not game_over:
        return
        
    if winning_ship is not None:
        # Show winner
        if not winning_ship.ai_controlled:
            # Find which player won
            player_idx = next((idx for idx, s in enumerate(ships) 
                              if s == winning_ship and not s.ai_controlled), 0)
            player_num = player_idx + 1
            game_over_text = font.render(
                f"PLAYER {player_num} WINS! Credits: ${winning_ship.credits} - Press R to restart", 
                True, GREEN
            )
        else:
            game_over_text = font.render(
                f"AI WINS! Credits: ${winning_ship.credits} - Press R to restart", 
                True, BLUE
            )
    elif len(surviving_ships) == 0:
        # All ships destroyed
        game_over_text = font.render(
            "GAME OVER - All ships destroyed - Press R to restart", 
            True, RED
        )
    else:
        # Backup message if no clear winner
        game_over_text = font.render("GAME OVER - Press R to restart", True, RED)
        
    screen.blit(game_over_text, (SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2))


def main():
    # Initialize Pygame
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Spacewar")
    
    # Set up clock for controlling frame rate
    clock = pygame.time.Clock()
    
    # Create fonts for UI
    font = pygame.font.SysFont(None, 36)
    large_font = pygame.font.SysFont(None, 72)
    
    # Menu state
    in_menu = True
    selected_option = 1  # Default to 1 player
    
    # Player control variables
    player_controls = [
        {'thrust': 0, 'rotation': 0},  # Player 1
        {'thrust': 0, 'rotation': 0}   # Player 2
    ]
    
    # Initialize game state variables
    ships = []
    ship_ais = []
    asteroids = []
    delivery_zones = []
    zone_spawn_timer = 0
    game_over = False
    ship_collision_cooldown = 0
    
    # Main game loop - will return to menu when done
    while True:
        # Reset game state for new round
        running = True
        game_over = False
        ship_collision_cooldown = 0
        delivery_zones.clear()  # Clear any existing zones
        zone_spawn_timer = random.randint(3*FPS, 6*FPS)  # Random initial spawn time (3-6 seconds)
        
        # ===== MENU LOOP =====
        while in_menu:
            for event in pygame.event.get():
                selected_option, start_game, exit_game = handle_menu_input(event, selected_option)
                
                if exit_game:
                    pygame.quit()
                    sys.exit()
                
                if start_game:
                    # Start game with selected number of players
                    ships, ship_ais, asteroids = initialize_game(selected_option)
                    in_menu = False
            
            # Draw menu
            draw_menu(screen, font, large_font, selected_option)
            clock.tick(FPS)
        
        # ===== GAMEPLAY LOOP =====
        while running:
            # Process events
            for event in pygame.event.get():
                player_controls, running, in_menu, restart_game = handle_gameplay_input(
                    event, player_controls, running, in_menu
                )
                
                if restart_game:
                    # Restart the game with the same number of players
                    num_players = sum(1 for ship in ships if not ship.ai_controlled)
                    ships, ship_ais, asteroids = initialize_game(num_players)
                    game_over = False
                    delivery_zones.clear()
                    zone_spawn_timer = random.randint(3*FPS, 6*FPS)
                    for control in player_controls:
                        control['thrust'] = 0
                        control['rotation'] = 0
            
            # Clear the screen
            screen.fill(BLACK)
            
            # Draw starfield background
            draw_starfield(screen)
            
            # Update game state if not game over
            if not game_over:
                # Decrement ship collision cooldown
                if ship_collision_cooldown > 0:
                    ship_collision_cooldown -= 1
                
                # Update controls and positions
                update_ship_controls(ships, ship_ais, player_controls, asteroids, delivery_zones)
                update_entities(ships, asteroids)
                
                # Check for collisions
                asteroids = check_collisions(ships, asteroids)
                
                # Add more asteroids occasionally
                if len(asteroids) < MAX_ASTEROIDS and random.random() < 0.01:
                    asteroids.extend(generate_random_asteroids(1, ships))
                
                # Update delivery zones
                delivery_zones = update_delivery_zones(delivery_zones, ships)
                delivery_zones, zone_spawn_timer = spawn_delivery_zones(
                    delivery_zones, ships, asteroids, zone_spawn_timer
                )
                
                # Check win conditions
                game_over, winning_ship, surviving_ships = check_win_conditions(ships)
            
            # Draw everything
            draw_entities(screen, delivery_zones, asteroids, ships, ship_ais, font)
            draw_ui(screen, font, ships, asteroids, delivery_zones)
            draw_game_over(screen, font, game_over, winning_ship, surviving_ships, ships)
            
            # Update the display
            pygame.display.flip()
            
            # Cap the frame rate
            clock.tick(FPS)
    
    # This should never be reached, but just in case
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()