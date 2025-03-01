import pygame
import sys
import random
from typing import List, Dict, Any

from entities import (
    Ship, Asteroid, Entity, 
    SCREEN_WIDTH, SCREEN_HEIGHT, FPS, 
    BLACK, WHITE, RED, GREEN, BLUE,
    generate_random_asteroids, MAX_ASTEROIDS
)
from ai import ShipAI

def main():
    # Initialize Pygame
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Spacewar")
    
    # Set up clock for controlling frame rate
    clock = pygame.time.Clock()
    
    # Create font for UI
    font = pygame.font.SysFont(None, 24)
    
    # Create initial ships with AI
    ships = []
    ship_ais = []
    
    # Create 3 ships at different positions
    ships.append(Ship(SCREEN_WIDTH // 4, SCREEN_HEIGHT // 4, random.uniform(0, 360), True))
    ships.append(Ship(SCREEN_WIDTH * 3 // 4, SCREEN_HEIGHT // 4, random.uniform(0, 360), True))
    ships.append(Ship(SCREEN_WIDTH // 2, SCREEN_HEIGHT * 3 // 4, random.uniform(0, 360), True))
    
    # Create AI for each ship
    for ship in ships:
        ship_ais.append(ShipAI(ship))
    
    # Generate initial asteroids
    asteroids = generate_random_asteroids(10, ships)
    
    # Game state
    score = 0
    game_over = False
    ship_collision_cooldown = 0
    
    # Main game loop
    running = True
    while running:
        # Process events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                if event.key == pygame.K_r:
                    # Reset game
                    ships = []
                    ship_ais = []
                    ships.append(Ship(SCREEN_WIDTH // 4, SCREEN_HEIGHT // 4, random.uniform(0, 360), True))
                    ships.append(Ship(SCREEN_WIDTH * 3 // 4, SCREEN_HEIGHT // 4, random.uniform(0, 360), True))
                    ships.append(Ship(SCREEN_WIDTH // 2, SCREEN_HEIGHT * 3 // 4, random.uniform(0, 360), True))
                    for ship in ships:
                        ship_ais.append(ShipAI(ship))
                    asteroids = generate_random_asteroids(10, ships)
                    score = 0
                    game_over = False
        
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
            
            # Update ship controls based on AI
            for i, ship in enumerate(ships):
                if ship.destroyed:
                    continue
                    
                # Get other ships for AI decision making
                other_ships = [s for s in ships if s != ship and not s.destroyed]
                
                # Get AI decision for this ship
                thrust, rotation = ship_ais[i].make_decision(asteroids, other_ships)
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
                
            # Check if all ships are destroyed
            if all(ship.destroyed for ship in ships):
                game_over = True
        
        # Draw all entities
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
        
        # Draw score
        score_text = font.render(f"Ships: {sum(1 for ship in ships if not ship.destroyed)} / {len(ships)}   Asteroids: {len(asteroids)}", True, WHITE)
        screen.blit(score_text, (10, 10))
        
        # Draw game over message
        if game_over:
            game_over_text = font.render("GAME OVER - Press R to restart", True, RED)
            screen.blit(game_over_text, (SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2))
        
        # Update the display
        pygame.display.flip()
        
        # Cap the frame rate
        clock.tick(FPS)
    
    # Clean up
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()