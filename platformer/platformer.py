import pygame
import sys
import random

# Initialize pygame
pygame.init()

# Game constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
RED = (255, 0, 0)
BROWN = (139, 69, 19)
YELLOW = (255, 255, 0)
PURPLE = (128, 0, 128)

class Player:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 32, 32)
        self.velocity_y = 0
        self.velocity_x = 0
        self.on_ground = False
        self.jump_power = -20  # Much stronger jump power
        self.move_speed = 7    # Faster movement speed
        self.gravity = 0.6     # Lower gravity for higher jumps
        self.score = 0
        self.level = 1

    def update(self, platforms, coins, spikes=None):
        # Apply gravity
        self.velocity_y += self.gravity
        
        # Update horizontal position
        self.rect.x += self.velocity_x
        
        # Check horizontal collisions
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                if self.velocity_x > 0:
                    self.rect.right = platform.rect.left
                elif self.velocity_x < 0:
                    self.rect.left = platform.rect.right
        
        # Update vertical position separately (helps with platform detection)
        self.rect.y += self.velocity_y
        self.on_ground = False
        
        # Check vertical collisions
        for platform in platforms:
            if self.rect.colliderect(platform.rect):
                # Landing on top of a platform
                if self.velocity_y > 0 and self.rect.bottom - self.velocity_y <= platform.rect.top + 5:
                    self.rect.bottom = platform.rect.top
                    self.on_ground = True
                    self.velocity_y = 0
                # Hitting bottom of a platform while jumping
                elif self.velocity_y < 0 and self.rect.top - self.velocity_y >= platform.rect.bottom - 5:
                    self.rect.top = platform.rect.bottom
                    self.velocity_y = 0

        # Check for coin collisions
        coins_to_remove = []
        for coin in coins:
            if self.rect.colliderect(coin.rect):
                self.score += 1
                coins_to_remove.append(coin)
        
        # Check for spike collisions
        hit_spike = False
        if spikes:
            for spike in spikes:
                if self.rect.colliderect(spike.rect):
                    hit_spike = True
                    break
        
        # Return coins to remove and spike collision status
        return coins_to_remove, hit_spike

    def jump(self):
        if self.on_ground:
            self.velocity_y = self.jump_power
            # Small "jump buffer" - prevents sticking to platforms
            self.rect.y -= 2

    def draw(self, screen):
        pygame.draw.rect(screen, BLUE, self.rect)


class Platform:
    def __init__(self, x, y, width, height):
        self.rect = pygame.Rect(x, y, width, height)
    
    def draw(self, screen):
        pygame.draw.rect(screen, BROWN, self.rect)


class Coin:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, 16, 16)
    
    def draw(self, screen):
        pygame.draw.ellipse(screen, YELLOW, self.rect)


class Spike:
    def __init__(self, x, y, width=20, height=20):
        self.rect = pygame.Rect(x, y, width, height)
    
    def draw(self, screen):
        pygame.draw.polygon(screen, RED, [
            (self.rect.left, self.rect.bottom),
            (self.rect.centerx, self.rect.top),
            (self.rect.right, self.rect.bottom)
        ])


class MovingPlatform(Platform):
    def __init__(self, x, y, width, height, x_speed=0, y_speed=0, x_range=0, y_range=0):
        super().__init__(x, y, width, height)
        self.x_speed = x_speed
        self.y_speed = y_speed
        self.original_x = x
        self.original_y = y
        self.x_range = x_range
        self.y_range = y_range
    
    def update(self):
        self.rect.x += self.x_speed
        self.rect.y += self.y_speed
        
        # Reverse direction if reached range limit for x-axis
        if self.x_range > 0:
            if self.rect.x > self.original_x + self.x_range:
                self.x_speed = -abs(self.x_speed)
            elif self.rect.x < self.original_x:
                self.x_speed = abs(self.x_speed)
        
        # Reverse direction if reached range limit for y-axis
        if self.y_range > 0:
            if self.rect.y > self.original_y + self.y_range:
                self.y_speed = -abs(self.y_speed)
            elif self.rect.y < self.original_y:
                self.y_speed = abs(self.y_speed)
    
    def draw(self, screen):
        pygame.draw.rect(screen, PURPLE, self.rect)


def create_level(level_num=1):
    if level_num == 1:
        platforms = [
            # Floor
            Platform(0, SCREEN_HEIGHT - 40, SCREEN_WIDTH, 40),
            
            # Platforms - made wider for easier landing
            Platform(100, 450, 200, 20),
            Platform(400, 350, 200, 20),
            Platform(200, 250, 200, 20),
            Platform(500, 150, 200, 20),
        ]
        
        coins = [
            Coin(150, 430),
            Coin(450, 330),
            Coin(250, 230),
            Coin(550, 130),
            Coin(700, SCREEN_HEIGHT - 60)
        ]
        
        spikes = []
        
        moving_platforms = []
        
        return platforms, coins, spikes, moving_platforms
    
    elif level_num == 2:
        platforms = [
            # Floor with smaller gaps
            Platform(0, SCREEN_HEIGHT - 40, 300, 40),
            Platform(350, SCREEN_HEIGHT - 40, 300, 40),
            Platform(700, SCREEN_HEIGHT - 40, 100, 40),
            
            # More platforms for easier navigation - adding stair-like pattern
            Platform(100, 450, 200, 20),  # Lowest platform
            Platform(350, 390, 200, 20),  # Stair step 1
            Platform(150, 330, 150, 20),  # Stair step 2
            Platform(350, 270, 200, 20),  # Middle platform
            Platform(150, 210, 150, 20),  # Stair step 3
            Platform(350, 150, 200, 20),  # Higher platform
            Platform(550, 150, 150, 20),  # Top right platform
            Platform(100, 150, 150, 20),  # Top left platform
            
            # Additional helper platforms
            Platform(250, 330, 50, 20),   # Small stepping stone
            Platform(500, 330, 50, 20),   # Small stepping stone
            Platform(250, 210, 50, 20),   # Small stepping stone
            # Bridge platform between gaps
            Platform(300, 520, 50, 20),
        ]
        
        coins = [
            Coin(150, 430),         # Coin on lowest platform
            Coin(400, 370),         # Coin on stair step 1
            Coin(200, 310),         # Coin on stair step 2
            Coin(400, 250),         # Coin on middle platform
            Coin(200, 190),         # Coin on stair step 3
            Coin(400, 130),         # Coin on higher platform
            Coin(600, 130),         # Coin on top right platform
            Coin(150, 130),         # Coin on top left platform
            Coin(400, SCREEN_HEIGHT - 60)  # Coin on ground
        ]
        
        spikes = [
            # Only one spike hazard in the floor gap
            Spike(310, SCREEN_HEIGHT - 60, 30, 20),
            # Fewer spikes on platforms
            Spike(540, 290, 20, 10),
        ]
        
        moving_platforms = [
            MovingPlatform(200, 250, 150, 20, x_speed=1, x_range=100),  # Even slower and wider
            # Vertical platform is now optional for coins
        ]
        
        return platforms, coins, spikes, moving_platforms


def main():
    # Set up the display
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Platformer Game")
    clock = pygame.time.Clock()
    
    # Create player
    player = Player(50, SCREEN_HEIGHT - 100)
    
    # Create initial level
    platforms, coins, spikes, moving_platforms = create_level(player.level)
    
    # Game states
    game_over = False
    level_complete = False
    level_transition_timer = 0
    reset_player = False
    
    # Game loop
    running = True
    while running:
        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    player.jump()
                # Press R to restart level
                if event.key == pygame.K_r:
                    reset_player = True
        
        if reset_player:
            # Reset player position
            player.rect.x = 50
            player.rect.y = SCREEN_HEIGHT - 100
            player.velocity_x = 0
            player.velocity_y = 0
            reset_player = False
            game_over = False
        
        if not game_over and not level_complete:
            # Get keyboard state
            keys = pygame.key.get_pressed()
            player.velocity_x = 0
            if keys[pygame.K_LEFT]:
                player.velocity_x = -player.move_speed
            if keys[pygame.K_RIGHT]:
                player.velocity_x = player.move_speed
            
            # Update moving platforms
            for platform in moving_platforms:
                platform.update()
            
            # Update player
            coins_to_remove, hit_spike = player.update(platforms + moving_platforms, coins, spikes)
            
            # Remove collected coins
            for coin in coins_to_remove:
                coins.remove(coin)
            
            # Check if player hit a spike
            if hit_spike:
                game_over = True
            
            # Check if player fell off the screen
            if player.rect.top > SCREEN_HEIGHT:
                game_over = True
            
            # Check if all coins are collected
            if len(coins) == 0:
                level_complete = True
                level_transition_timer = FPS * 2  # 2 seconds
        
        # Draw everything
        screen.fill(BLACK)
        
        # Draw platforms
        for platform in platforms:
            platform.draw(screen)
        
        # Draw moving platforms
        for platform in moving_platforms:
            platform.draw(screen)
        
        # Draw coins
        for coin in coins:
            coin.draw(screen)
        
        # Draw spikes
        for spike in spikes:
            spike.draw(screen)
        
        # Draw player
        player.draw(screen)
        
        # Draw HUD
        font = pygame.font.Font(None, 36)
        score_text = font.render(f"Score: {player.score}", True, WHITE)
        level_text = font.render(f"Level: {player.level}", True, WHITE)
        screen.blit(score_text, (10, 10))
        screen.blit(level_text, (10, 50))
        
        # Handle game over
        if game_over:
            game_over_text = font.render("Game Over! Press R to Restart", True, RED)
            screen.blit(game_over_text, (SCREEN_WIDTH // 2 - 150, SCREEN_HEIGHT // 2))
        
        # Handle level complete
        if level_complete:
            victory_text = font.render("Level Complete!", True, GREEN)
            screen.blit(victory_text, (SCREEN_WIDTH // 2 - 100, SCREEN_HEIGHT // 2))
            
            # Transition to next level after delay
            level_transition_timer -= 1
            if level_transition_timer <= 0:
                player.level += 1
                # Reset player position
                player.rect.x = 50
                player.rect.y = SCREEN_HEIGHT - 100
                player.velocity_x = 0
                player.velocity_y = 0
                # Load next level
                platforms, coins, spikes, moving_platforms = create_level(player.level)
                level_complete = False
        
        # Update the display
        pygame.display.flip()
        
        # Cap the frame rate
        clock.tick(FPS)
    
    # Quit pygame
    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()