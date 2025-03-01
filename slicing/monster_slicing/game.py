import pygame
import random
import math
import sys
from typing import List, Tuple, Optional

# Initialize pygame
pygame.init()

# Game constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60
PLAYER_SIZE = 64
MONSTER_SIZE = 64
HEALTH_BAR_LENGTH = 200
HEALTH_BAR_HEIGHT = 20
MAX_HEALTH = 100
SWORD_LENGTH = 100
SWORD_WIDTH = 10
SLICE_DURATION = 10  # frames
MONSTER_SPEED_MIN = 2
MONSTER_SPEED_MAX = 5
MONSTER_SPAWN_RATE = 100  # lower is more frequent
DROP_CHANCE = 0.2  # 20% chance for a monster to drop an item
HEALTH_BOOST = 10
WEAPON_BOOST_DURATION = 500  # frames (about 8 seconds at 60 FPS)

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
PURPLE = (128, 0, 128)

# Set up the display
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Monster Slicing Game")
clock = pygame.time.Clock()

# Load assets (using shapes to create sprites)
def create_player_surface(size):
    surface = pygame.Surface((size, size), pygame.SRCALPHA)
    
    # Body (blue circle)
    pygame.draw.circle(surface, BLUE, (size//2, size//2), size//2 - 5)
    
    # Eyes (white circles with black pupils)
    eye_size = size // 6
    pygame.draw.circle(surface, WHITE, (size//2 - eye_size, size//2 - eye_size), eye_size)
    pygame.draw.circle(surface, WHITE, (size//2 + eye_size, size//2 - eye_size), eye_size)
    pygame.draw.circle(surface, BLACK, (size//2 - eye_size, size//2 - eye_size), eye_size//2)
    pygame.draw.circle(surface, BLACK, (size//2 + eye_size, size//2 - eye_size), eye_size//2)
    
    # Mouth (curved line)
    pygame.draw.arc(surface, BLACK, (size//3, size//2, size//3, size//4), 0, math.pi, 2)
    
    return surface

def create_monster_surface(size):
    surface = pygame.Surface((size, size), pygame.SRCALPHA)
    
    # Body (red irregular shape)
    points = [
        (size//2, 0),               # top
        (size, size//3),            # top right
        (size - size//5, size),     # bottom right
        (size//2, size - size//6),  # bottom middle
        (size//5, size),            # bottom left
        (0, size//3),               # top left
    ]
    pygame.draw.polygon(surface, RED, points)
    
    # Eyes (yellow circles with black pupils)
    eye_size = size // 7
    pygame.draw.circle(surface, YELLOW, (size//3, size//3), eye_size)
    pygame.draw.circle(surface, YELLOW, (size*2//3, size//3), eye_size)
    pygame.draw.circle(surface, BLACK, (size//3, size//3), eye_size//2)
    pygame.draw.circle(surface, BLACK, (size*2//3, size//3), eye_size//2)
    
    # Mouth (jagged white teeth)
    teeth_points = [
        (size//3, size//2),
        (size//2 - size//10, size*2//3),
        (size//2, size//2),
        (size//2 + size//10, size*2//3),
        (size*2//3, size//2),
    ]
    pygame.draw.lines(surface, WHITE, False, teeth_points, 2)
    
    return surface

def create_health_drop_surface(size):
    surface = pygame.Surface((size, size), pygame.SRCALPHA)
    
    # Heart shape
    half_size = size // 2
    quarter_size = size // 4
    
    # Draw two circles for the top of the heart
    pygame.draw.circle(surface, GREEN, (quarter_size, quarter_size), quarter_size)
    pygame.draw.circle(surface, GREEN, (half_size + quarter_size, quarter_size), quarter_size)
    
    # Draw triangle for bottom of heart
    points = [
        (0, quarter_size),
        (half_size, size),
        (size, quarter_size),
    ]
    pygame.draw.polygon(surface, GREEN, points)
    
    return surface

def create_weapon_drop_surface(size):
    surface = pygame.Surface((size, size), pygame.SRCALPHA)
    
    # Sword shape
    handle_color = (139, 69, 19)  # Brown
    blade_color = (192, 192, 192)  # Silver
    
    # Blade
    blade_points = [
        (size//2, 0),               # tip
        (size*3//5, size//3),       # right edge
        (size//2, size*3//4),       # base of blade
        (size*2//5, size//3),       # left edge
    ]
    pygame.draw.polygon(surface, blade_color, blade_points)
    
    # Handle
    pygame.draw.rect(surface, handle_color, (size*2//5, size*3//4, size//5, size//4))
    
    # Hilt
    pygame.draw.rect(surface, YELLOW, (size//3, size*2//3, size//3, size//10))
    
    return surface

# Create game assets
player_img = create_player_surface(PLAYER_SIZE)
monster_img = create_monster_surface(MONSTER_SIZE)
health_drop_img = create_health_drop_surface(MONSTER_SIZE//2)
weapon_drop_img = create_weapon_drop_surface(MONSTER_SIZE//2)

class Player:
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y
        self.health = MAX_HEALTH
        self.slicing = 0  # Counter for slice animation
        self.slice_angle = 0  # Angle of the slice
        self.weapon_boost = 0  # Counter for weapon boost duration
        self.sword_range = SWORD_LENGTH  # Base sword range
        self.speed = 5  # Player movement speed
    
    def draw(self):
        # Draw player
        screen.blit(player_img, (self.x - PLAYER_SIZE//2, self.y - PLAYER_SIZE//2))
        
        # Draw sword if slicing
        if self.slicing > 0:
            # Calculate sword position based on slice angle
            sword_color = YELLOW if self.weapon_boost > 0 else WHITE
            sword_length = self.sword_range * 1.5 if self.weapon_boost > 0 else self.sword_range
            
            # Convert angle to radians
            angle_rad = math.radians(self.slice_angle)
            
            # Calculate sword endpoints
            start_x = self.x
            start_y = self.y
            end_x = self.x + math.cos(angle_rad) * sword_length
            end_y = self.y - math.sin(angle_rad) * sword_length
            
            # Draw sword
            pygame.draw.line(screen, sword_color, (start_x, start_y), (end_x, end_y), SWORD_WIDTH)
    
    def slice(self, angle: float):
        self.slicing = SLICE_DURATION
        self.slice_angle = angle
    
    def move(self, dx: int, dy: int):
        # Update position
        self.x += dx * self.speed
        self.y += dy * self.speed
        
        # Keep player on screen
        self.x = max(PLAYER_SIZE//2, min(self.x, SCREEN_WIDTH - PLAYER_SIZE//2))
        self.y = max(PLAYER_SIZE//2, min(self.y, SCREEN_HEIGHT - PLAYER_SIZE//2))
    
    def update(self):
        # Handle keyboard input for movement
        keys = pygame.key.get_pressed()
        dx, dy = 0, 0
        
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            dy -= 1
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            dy += 1
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            dx -= 1
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            dx += 1
            
        # Normalize diagonal movement
        if dx != 0 and dy != 0:
            dx *= 0.7071  # 1/sqrt(2)
            dy *= 0.7071
            
        # Move player
        self.move(dx, dy)
        
        if self.slicing > 0:
            self.slicing -= 1
        
        if self.weapon_boost > 0:
            self.weapon_boost -= 1

# Different monster types
def create_monster_surface_variant(size, variant):
    surface = pygame.Surface((size, size), pygame.SRCALPHA)
    
    # Different monster shapes and colors based on variant
    if variant == 0:  # Basic red monster (original)
        color = RED
        points = [
            (size//2, 0),               # top
            (size, size//3),            # top right
            (size - size//5, size),     # bottom right
            (size//2, size - size//6),  # bottom middle
            (size//5, size),            # bottom left
            (0, size//3),               # top left
        ]
    elif variant == 1:  # Green triangular monster
        color = (0, 180, 0)  # Dark green
        points = [
            (size//2, 0),               # top
            (size, size),               # bottom right
            (0, size),                  # bottom left
        ]
    elif variant == 2:  # Purple blob monster
        color = PURPLE
        points = [
            (size//2, 0),               # top
            (size*3//4, size//4),       # top right
            (size, size//2),            # right
            (size*3//4, size*3//4),     # bottom right
            (size//2, size),            # bottom
            (size//4, size*3//4),       # bottom left
            (0, size//2),               # left
            (size//4, size//4),         # top left
        ]
    else:  # Orange diamond monster
        color = (255, 165, 0)  # Orange
        points = [
            (size//2, 0),               # top
            (size, size//2),            # right
            (size//2, size),            # bottom
            (0, size//2),               # left
        ]
    
    pygame.draw.polygon(surface, color, points)
    
    # Eyes (yellow circles with black pupils)
    eye_size = size // 7
    pygame.draw.circle(surface, YELLOW, (size//3, size//3), eye_size)
    pygame.draw.circle(surface, YELLOW, (size*2//3, size//3), eye_size)
    pygame.draw.circle(surface, BLACK, (size//3, size//3), eye_size//2)
    pygame.draw.circle(surface, BLACK, (size*2//3, size//3), eye_size//2)
    
    # Mouth varies by monster type
    if variant == 0:  # Original zigzag
        teeth_points = [
            (size//3, size//2),
            (size//2 - size//10, size*2//3),
            (size//2, size//2),
            (size//2 + size//10, size*2//3),
            (size*2//3, size//2),
        ]
        pygame.draw.lines(surface, WHITE, False, teeth_points, 2)
    elif variant == 1:  # Single line
        pygame.draw.line(surface, WHITE, (size//3, size*2//3), (size*2//3, size*2//3), 2)
    elif variant == 2:  # Curve
        pygame.draw.arc(surface, WHITE, (size//3, size//2, size//3, size//3), 0, math.pi, 2)
    else:  # Angry eyebrows and sharp teeth
        # Eyebrows
        pygame.draw.line(surface, WHITE, (size//4, size//4), (size*3//8, size//5), 2)
        pygame.draw.line(surface, WHITE, (size*3//4, size//4), (size*5//8, size//5), 2)
        
        # Sharp teeth
        teeth_points = [
            (size//3, size//2),
            (size*3//8, size*2//3),
            (size//2, size//2),
            (size*5//8, size*2//3),
            (size*2//3, size//2),
        ]
        pygame.draw.lines(surface, WHITE, False, teeth_points, 2)
    
    return surface

# Generate monster images
monster_imgs = [
    create_monster_surface_variant(MONSTER_SIZE, 0),
    create_monster_surface_variant(MONSTER_SIZE, 1),
    create_monster_surface_variant(MONSTER_SIZE, 2),
    create_monster_surface_variant(MONSTER_SIZE, 3)
]

class Monster:
    def __init__(self):
        # Randomly choose which side to spawn from
        side = random.randint(0, 3)  # 0: top, 1: right, 2: bottom, 3: left
        
        if side == 0:  # top
            self.x = random.randint(0, SCREEN_WIDTH)
            self.y = -MONSTER_SIZE
            angle = random.uniform(math.pi/4, 3*math.pi/4)  # Downward
        elif side == 1:  # right
            self.x = SCREEN_WIDTH + MONSTER_SIZE
            self.y = random.randint(0, SCREEN_HEIGHT)
            angle = random.uniform(3*math.pi/4, 5*math.pi/4)  # Leftward
        elif side == 2:  # bottom
            self.x = random.randint(0, SCREEN_WIDTH)
            self.y = SCREEN_HEIGHT + MONSTER_SIZE
            angle = random.uniform(5*math.pi/4, 7*math.pi/4)  # Upward
        else:  # left
            self.x = -MONSTER_SIZE
            self.y = random.randint(0, SCREEN_HEIGHT)
            angle = random.uniform(7*math.pi/4, 9*math.pi/4) % (2*math.pi)  # Rightward
        
        self.speed = random.uniform(MONSTER_SPEED_MIN, MONSTER_SPEED_MAX)
        self.dx = math.cos(angle) * self.speed
        self.dy = math.sin(angle) * self.speed
        
        # Choose a random monster variant
        self.variant = random.randint(0, len(monster_imgs) - 1)
        
        # Stronger monsters move faster and are worth more
        if self.variant > 1:
            self.speed *= 1.2
            self.dx = math.cos(angle) * self.speed
            self.dy = math.sin(angle) * self.speed
    
    def update(self):
        self.x += self.dx
        self.y += self.dy
    
    def draw(self):
        screen.blit(monster_imgs[self.variant], (self.x - MONSTER_SIZE//2, self.y - MONSTER_SIZE//2))
    
    def is_off_screen(self) -> bool:
        return (self.x < -MONSTER_SIZE or self.x > SCREEN_WIDTH + MONSTER_SIZE or
                self.y < -MONSTER_SIZE or self.y > SCREEN_HEIGHT + MONSTER_SIZE)
    
    def distance_to_player(self, player: Player) -> float:
        return math.sqrt((self.x - player.x)**2 + (self.y - player.y)**2)

class Drop:
    def __init__(self, x: int, y: int, drop_type: str):
        self.x = x
        self.y = y
        self.type = drop_type  # 'health' or 'weapon'
    
    def draw(self):
        if self.type == 'health':
            screen.blit(health_drop_img, (self.x - MONSTER_SIZE//4, self.y - MONSTER_SIZE//4))
        else:  # 'weapon'
            screen.blit(weapon_drop_img, (self.x - MONSTER_SIZE//4, self.y - MONSTER_SIZE//4))
    
    def distance_to_player(self, player: Player) -> float:
        return math.sqrt((self.x - player.x)**2 + (self.y - player.y)**2)

def draw_health_bar(player: Player):
    # Border
    pygame.draw.rect(screen, WHITE, (10, 10, HEALTH_BAR_LENGTH + 4, HEALTH_BAR_HEIGHT + 4), 2)
    
    # Health fill
    health_width = int((player.health / MAX_HEALTH) * HEALTH_BAR_LENGTH)
    pygame.draw.rect(screen, GREEN, (12, 12, health_width, HEALTH_BAR_HEIGHT))

def is_slice_hitting(player: Player, monster: Monster) -> bool:
    if player.slicing <= 0:
        return False
    
    # Calculate sword range (longer if we have a weapon boost)
    sword_range = player.sword_range * 1.5 if player.weapon_boost > 0 else player.sword_range
    
    # Get distance to monster
    distance = monster.distance_to_player(player)
    
    # Check if monster is within sword range
    if distance > sword_range + MONSTER_SIZE/2:
        return False
    
    # Calculate angle to monster
    dx = monster.x - player.x
    dy = player.y - monster.y  # Reversed y because pygame y is downward
    angle_to_monster = math.degrees(math.atan2(dy, dx)) % 360
    
    # Calculate difference between slice angle and angle to monster
    angle_diff = min((player.slice_angle - angle_to_monster) % 360, 
                     (angle_to_monster - player.slice_angle) % 360)
    
    # Check if angle difference is within 45 degrees
    return angle_diff <= 45

def main():
    player = Player(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
    monsters: List[Monster] = []
    drops: List[Drop] = []
    score = 0
    running = True
    
    while running:
        # Handle events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                # Get mouse position and calculate slice angle
                mouse_x, mouse_y = pygame.mouse.get_pos()
                dx = mouse_x - player.x
                dy = player.y - mouse_y  # Reversed y because pygame y is downward
                angle = math.degrees(math.atan2(dy, dx))
                
                # Perform slice
                player.slice(angle)
        
        # Randomly spawn monsters
        if random.randint(1, MONSTER_SPAWN_RATE) == 1:
            monsters.append(Monster())
        
        # Update player
        player.update()
        
        # Update monsters
        monsters_to_remove = []
        for i, monster in enumerate(monsters):
            monster.update()
            
            # Check if monster is off screen
            if monster.is_off_screen():
                monsters_to_remove.append(i)
                continue
            
            # Check if monster hit player
            if monster.distance_to_player(player) < (PLAYER_SIZE + MONSTER_SIZE) / 2:
                # Damage varies by monster type
                if monster.variant == 0:
                    damage = 5
                elif monster.variant == 1:
                    damage = 8
                elif monster.variant == 2:
                    damage = 12
                else:
                    damage = 15
                
                player.health -= damage
                monsters_to_remove.append(i)
                continue
            
            # Check if player's slice hit monster
            if is_slice_hitting(player, monster):
                monsters_to_remove.append(i)
                
                # Award points based on monster type
                points = (monster.variant + 1) * 10
                score += points
                
                # Higher level monsters have better drop rates
                drop_chance = DROP_CHANCE * (1 + monster.variant * 0.2)
                
                # Chance to drop item
                if random.random() < drop_chance:
                    # Stronger monsters (variant 2-3) are more likely to drop weapons
                    if monster.variant >= 2 and random.random() < 0.6:
                        drop_type = 'weapon'
                    else:
                        drop_type = 'health' if random.random() < 0.5 else 'weapon'
                    
                    drops.append(Drop(monster.x, monster.y, drop_type))
        
        # Remove monsters in reverse order to avoid index issues
        for i in sorted(monsters_to_remove, reverse=True):
            del monsters[i]
        
        # Update drops
        drops_to_remove = []
        for i, drop in enumerate(drops):
            if drop.distance_to_player(player) < (PLAYER_SIZE + MONSTER_SIZE/4) / 2:
                if drop.type == 'health':
                    player.health = min(MAX_HEALTH, player.health + HEALTH_BOOST)
                else:  # 'weapon'
                    player.weapon_boost = WEAPON_BOOST_DURATION
                
                drops_to_remove.append(i)
        
        # Remove collected drops
        for i in sorted(drops_to_remove, reverse=True):
            del drops[i]
        
        # Check player death
        if player.health <= 0:
            # Game over screen
            screen.fill(BLACK)
            font_large = pygame.font.SysFont(None, 72)
            font_medium = pygame.font.SysFont(None, 48)
            
            game_over_text = font_large.render("GAME OVER", True, RED)
            score_text = font_medium.render(f"Final Score: {score}", True, WHITE)
            restart_text = font_medium.render("Press R to Restart", True, GREEN)
            quit_text = font_medium.render("Press Q to Quit", True, YELLOW)
            
            screen.blit(game_over_text, (SCREEN_WIDTH//2 - game_over_text.get_width()//2, SCREEN_HEIGHT//4))
            screen.blit(score_text, (SCREEN_WIDTH//2 - score_text.get_width()//2, SCREEN_HEIGHT//4 + 100))
            screen.blit(restart_text, (SCREEN_WIDTH//2 - restart_text.get_width()//2, SCREEN_HEIGHT//4 + 180))
            screen.blit(quit_text, (SCREEN_WIDTH//2 - quit_text.get_width()//2, SCREEN_HEIGHT//4 + 240))
            
            pygame.display.flip()
            
            # Wait for player input
            waiting = True
            while waiting:
                for event in pygame.event.get():
                    if event.type == pygame.QUIT:
                        waiting = False
                        running = False
                    elif event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_q:
                            waiting = False
                            running = False
                        elif event.key == pygame.K_r:
                            # Reset game
                            player.health = MAX_HEALTH
                            player.weapon_boost = 0
                            monsters.clear()
                            drops.clear()
                            score = 0
                            waiting = False
        
        # Draw everything
        screen.fill(BLACK)
        
        # Draw drops
        for drop in drops:
            drop.draw()
        
        # Draw monsters
        for monster in monsters:
            monster.draw()
        
        # Draw player
        player.draw()
        
        # Draw UI
        draw_health_bar(player)
        
        # Draw score
        font = pygame.font.SysFont(None, 36)
        score_text = font.render(f"Score: {score}", True, WHITE)
        screen.blit(score_text, (SCREEN_WIDTH - score_text.get_width() - 10, 10))
        
        # Draw weapon boost indicator if active
        if player.weapon_boost > 0:
            boost_font = pygame.font.SysFont(None, 24)
            boost_text = boost_font.render(f"Weapon Boost: {player.weapon_boost // 60 + 1}s", True, YELLOW)
            screen.blit(boost_text, (10, 40))
        
        pygame.display.flip()
        clock.tick(FPS)
    
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()