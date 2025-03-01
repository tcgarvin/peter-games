import pygame
import sys
import random
from typing import List, Dict, Any

from entities import (
    Ship, Asteroid, Entity, DeliveryZone,
    SCREEN_WIDTH, SCREEN_HEIGHT, FPS, 
    BLACK, WHITE, RED, GREEN, BLUE, YELLOW, ORANGE, PURPLE,
    generate_random_asteroids, generate_random_point_away_from_entities,
    MAX_ASTEROIDS, ZONE_SPAWN_INTERVAL, ZONE_ACTIVE_TIME
)
from ai import ShipAI

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
        ship_ais.append(ShipAI(ships[-1]))
    
    # Ensure all ships start with no cargo and zero credits
    for ship in ships:
        ship.has_cargo = False
        ship.credits = 0
    
    # Generate asteroids
    asteroids = generate_random_asteroids(10, ships)
    
    return ships, ship_ais, asteroids

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
    
    # Initialize game state variables (these will be set properly once game starts)
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
        
        # If we're in the menu, show it and wait for selection
        while in_menu:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_UP:
                        selected_option = (selected_option - 1) % 3
                    elif event.key == pygame.K_DOWN:
                        selected_option = (selected_option + 1) % 3
                    elif event.key == pygame.K_RETURN:
                        # Start game with selected number of players
                        ships, ship_ais, asteroids = initialize_game(selected_option)
                        in_menu = False
                    elif event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()
            
            # Draw menu
            draw_menu(screen, font, large_font, selected_option)
            clock.tick(FPS)
            
        # Main gameplay loop
        while running:
            # Process events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        # Return to main menu
                        in_menu = True
                        running = False
                    if event.key == pygame.K_r:
                        # Restart the game with the same number of players
                        num_players = sum(1 for ship in ships if not ship.ai_controlled)
                        ships, ship_ais, asteroids = initialize_game(num_players)
                        game_over = False
                        # Clear delivery zones and reset spawn timer
                        delivery_zones.clear()
                        zone_spawn_timer = random.randint(3*FPS, 6*FPS)
                        # Reset player controls
                        for control in player_controls:
                            control['thrust'] = 0
                            control['rotation'] = 0
                    
                    # Player 1 controls (arrows)
                    if event.key == pygame.K_UP:
                        player_controls[0]['thrust'] = 1
                    if event.key == pygame.K_LEFT:
                        player_controls[0]['rotation'] = -1
                    if event.key == pygame.K_RIGHT:
                        player_controls[0]['rotation'] = 1
                        
                    # Player 2 controls (WASD)
                    if event.key == pygame.K_w:
                        player_controls[1]['thrust'] = 1
                    if event.key == pygame.K_a:
                        player_controls[1]['rotation'] = -1
                    if event.key == pygame.K_d:
                        player_controls[1]['rotation'] = 1
            
                if event.type == pygame.KEYUP:
                    # Player 1 controls (arrows)
                    if event.key == pygame.K_UP:
                        player_controls[0]['thrust'] = 0
                    if event.key == pygame.K_LEFT and player_controls[0]['rotation'] == -1:
                        player_controls[0]['rotation'] = 0
                    if event.key == pygame.K_RIGHT and player_controls[0]['rotation'] == 1:
                        player_controls[0]['rotation'] = 0
                    
                    # Player 2 controls (WASD)
                    if event.key == pygame.K_w:
                        player_controls[1]['thrust'] = 0
                    if event.key == pygame.K_a and player_controls[1]['rotation'] == -1:
                        player_controls[1]['rotation'] = 0
                    if event.key == pygame.K_d and player_controls[1]['rotation'] == 1:
                        player_controls[1]['rotation'] = 0
            
            # Clear the screen
            screen.fill(BLACK)
            
            # Draw starfield background (simple dots)
            for i in range(100):
                x = random.randint(0, SCREEN_WIDTH - 1)
                y = random.randint(0, SCREEN_HEIGHT - 1)
                brightness = random.randint(50, 200)
                screen.set_at((x, y), (brightness, brightness, brightness))
            
            # Update game state if not game over
            if not game_over:
                # Decrement ship collision cooldown
                if ship_collision_cooldown > 0:
                    ship_collision_cooldown -= 1
                
                # Update ship controls based on AI or player input
                for i, ship in enumerate(ships):
                    if ship.destroyed:
                        continue
                    
                    if not ship.ai_controlled:  # Player ship
                        # Find which player is controlling this ship
                        player_idx = next((idx for idx, s in enumerate(ships) if s == ship and not s.ai_controlled), 0)
                        if player_idx < len(player_controls):
                            ship.set_controls(player_controls[player_idx]['thrust'], 
                                             player_controls[player_idx]['rotation'])
                    else:  # AI ships
                        # Get other ships for AI decision making
                        other_ships = [s for s in ships if s != ship and not s.destroyed]
                        
                        # Get AI decision for this ship
                        thrust, rotation = ship_ais[i].make_decision(asteroids, other_ships, delivery_zones)
                        ship.set_controls(thrust, rotation)
                
                # Update all ships
                for ship in ships:
                    if not ship.destroyed:
                        ship.update()
                
                # Update all asteroids
                for asteroid in asteroids:
                    asteroid.update()
                
                # Check for collisions between ships and asteroids
                for ship in ships:
                    if ship.destroyed:
                        continue
                        
                    for asteroid in asteroids:
                        if ship.is_colliding(asteroid):
                            ship.destroyed = True
                            # Break asteroid into smaller pieces
                            new_asteroids = asteroid.break_apart()
                            asteroids.extend(new_asteroids)
                            asteroids.remove(asteroid)
                            break
                
                # Add more asteroids occasionally
                if len(asteroids) < MAX_ASTEROIDS and random.random() < 0.01:
                    asteroids.extend(generate_random_asteroids(1, ships))
                
                # Handle delivery zones
                # Update existing zones
                for zone in delivery_zones[:]:
                    zone.update()
                    if zone.is_expired():
                        delivery_zones.remove(zone)
                    
                    # Check for ship interactions with zones
                    for ship in ships:
                        if not ship.destroyed and zone.check_ship_interaction(ship):
                            # Success sound/effect would go here
                            pass
                
                # Spawn new zones if timer expired
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
                    
                # Check win conditions:
                # 1. Only one ship left alive
                # 2. All ships destroyed
                # 3. A ship reached the credit goal (5 credits)
                winning_ship = None
                credit_goal = 5
                
                for ship in ships:
                    if ship.credits >= credit_goal:
                        winning_ship = ship
                        game_over = True
                        break
                
                surviving_ships = [ship for ship in ships if not ship.destroyed]
                if len(surviving_ships) <= 1 or all(ship.destroyed for ship in ships):
                    game_over = True
                    if len(surviving_ships) == 1:
                        winning_ship = surviving_ships[0]
            
            # Draw all entities
            # Draw delivery zones first (so they appear behind other entities)
            for zone in delivery_zones:
                zone.draw(screen)
                
            for asteroid in asteroids:
                asteroid.draw(screen)
                
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
            
            # Draw score and game info
            score_text = font.render(f"Ships: {sum(1 for ship in ships if not ship.destroyed)} / {len(ships)}   Asteroids: {len(asteroids)}   Goal: 5 Credits", True, WHITE)
            screen.blit(score_text, (10, 10))
            
            # Show delivery zone info if active
            if delivery_zones:
                zone_info = f"Active zones: {len([z for z in delivery_zones if z.zone_type == 'pickup'])} pickup, {len([z for z in delivery_zones if z.zone_type == 'dropoff'])} dropoff"
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
            
            # Draw game over message
            if game_over:
                if winning_ship is not None:
                    # Show winner
                    if not winning_ship.ai_controlled:
                        # Find which player won
                        player_idx = next((idx for idx, s in enumerate(ships) if s == winning_ship and not s.ai_controlled), 0)
                        player_num = player_idx + 1
                        game_over_text = font.render(f"PLAYER {player_num} WINS! Credits: ${winning_ship.credits} - Press R to restart", True, GREEN)
                    else:
                        game_over_text = font.render(f"AI WINS! Credits: ${winning_ship.credits} - Press R to restart", True, BLUE)
                elif len(surviving_ships) == 0:
                    # All ships destroyed
                    game_over_text = font.render("GAME OVER - All ships destroyed - Press R to restart", True, RED)
                else:
                    # Backup message if no clear winner
                    game_over_text = font.render("GAME OVER - Press R to restart", True, RED)
                    
                screen.blit(game_over_text, (SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2))
            
            # Update the display
            pygame.display.flip()
            
            # Cap the frame rate
            clock.tick(FPS)
    
    # Loop back to menu or exit based on in_menu flag
    if not in_menu:
        pygame.quit()
        sys.exit()

if __name__ == "__main__":
    main()