import pygame
import sys
import random
import time
import math

# Initialize pygame
pygame.init()

# Game constants
WIDTH, HEIGHT = 800, 600
GRAVITY = 0.25  # Reduced gravity
FLAP_STRENGTH = -7  # Weaker flap
PIPE_SPEED = 2  # Slower pipes
PIPE_FREQUENCY = 2200  # More time between pipes
PIPE_GAP = 200  # Wider gap between pipes

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 0, 255)
YELLOW = (255, 255, 0)
PURPLE = (128, 0, 128)  # Added for third player

# Set up the display
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Flappy Bird")
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, 36)

# Global variables for screen shake effect
shake_intensity = 0
shake_decay = 0.9
shake_offset_x = 0
shake_offset_y = 0

class Bird:
    def __init__(self, x, color, controls):
        self.x = x
        self.y = HEIGHT // 2
        self.vel = 0
        self.color = color
        self.radius = 15
        self.alive = True
        self.score = 0
        self.key_up = controls
        
        # Explosion variables
        self.exploding = False
        self.explosion_radius = 0
        self.explosion_max_radius = 80  # Much bigger explosion
        self.explosion_speed = 1.5      # Slower expansion for longer effect
        self.explosion_particles = []
        self.explosion_complete = False  # Track when explosion is done
        self.explosion_phase = 0        # For multi-phase explosions

    def flap(self):
        if self.alive:
            self.vel = FLAP_STRENGTH

    def update(self):
        if not self.alive:
            if self.exploding:
                # Update explosion
                self.update_explosion()
            return

        # Apply gravity
        self.vel += GRAVITY
        self.y += self.vel

        # Check ceiling and floor
        if self.y <= self.radius:
            self.y = self.radius
            self.vel = 0
        elif self.y >= HEIGHT - self.radius:
            self.y = HEIGHT - self.radius
            self.alive = False
            self.start_explosion()

    def draw(self):
        if self.alive:
            pygame.draw.circle(screen, self.color, (self.x, int(self.y)), self.radius)
        elif self.exploding:
            # Draw explosion
            self.draw_explosion()

    def check_collision(self, pipes):
        if not self.alive:
            return

        # Check collision with pipes
        for pipe in pipes:
            # Upper pipe collision
            if (self.x + self.radius > pipe.x and 
                self.x - self.radius < pipe.x + pipe.width):
                if self.y - self.radius < pipe.height:
                    self.alive = False
                    self.start_explosion()
                    return

            # Lower pipe collision
            if (self.x + self.radius > pipe.x and 
                self.x - self.radius < pipe.x + pipe.width):
                if self.y + self.radius > pipe.height + PIPE_GAP:
                    self.alive = False
                    self.start_explosion()
                    return
    
    def start_explosion(self):
        self.exploding = True
        self.explosion_radius = self.radius
        self.explosion_complete = False
        self.explosion_phase = 0
        
        # Create initial explosion particles
        self.explosion_particles = []
        self.add_explosion_particles(50)  # More initial particles
        
        # Trigger screen shake (set in main game loop)
        global shake_intensity
        shake_intensity = 20  # Initial intensity of shake
        
        # Add a sound effect if sound is implemented
        # pygame.mixer.Sound("explosion.wav").play()
    
    def add_explosion_particles(self, count, is_secondary=False):
        """Add explosion particles to the effect"""
        for _ in range(count):
            angle = random.uniform(0, 2 * math.pi)
            
            if is_secondary:
                # Secondary particles move faster and more randomly
                speed = random.uniform(2, 8)
                size = random.randint(1, 6)
                lifetime = random.randint(30, 60)  # Longer lifetime
                
                # More varied colors for secondary particles
                if random.random() < 0.3:  # 30% chance of spark color
                    color_variation = (255, 255, random.randint(0, 100))  # Yellow/white sparks
                else:
                    color_variation = (
                        max(0, min(255, self.color[0] + random.randint(-30, 30))),
                        max(0, min(255, self.color[1] + random.randint(-30, 30))),
                        max(0, min(255, self.color[2] + random.randint(-30, 30)))
                    )
            else:
                # Primary explosion particles
                speed = random.uniform(1, 6)
                size = random.randint(3, 10)  # Larger particles
                lifetime = random.randint(40, 80)  # Longer lifetime
                
                # More saturated colors
                if random.random() < 0.6:  # 60% chance of fire colors
                    color_variation = (
                        random.randint(200, 255),  # Red
                        random.randint(50, 150),   # Green (for orange)
                        0                          # Blue
                    )
                else:
                    color_variation = (
                        max(0, min(255, self.color[0] + random.randint(-20, 20))),
                        max(0, min(255, self.color[1] + random.randint(-20, 20))),
                        max(0, min(255, self.color[2] + random.randint(-20, 20)))
                    )
            
            # Compute velocity components
            dx = math.cos(angle) * speed
            dy = math.sin(angle) * speed
            
            # Add gravity effect to some particles
            gravity = random.uniform(0, 0.1) if random.random() < 0.7 else 0
            
            self.explosion_particles.append({
                'x': self.x + (random.uniform(-5, 5) if is_secondary else 0),
                'y': self.y + (random.uniform(-5, 5) if is_secondary else 0),
                'dx': dx,
                'dy': dy,
                'gravity': gravity,
                'size': size,
                'original_size': size,  # Keep track of original size for fading
                'lifetime': lifetime,
                'max_lifetime': lifetime,  # For calculating alpha fading
                'color': color_variation,
                'trail': random.random() < 0.3,  # 30% chance of having a trail
                'trail_count': 0
            })
    
    def update_explosion(self):
        # Update explosion phase timing
        if self.explosion_phase == 0 and self.explosion_radius > self.explosion_max_radius * 0.3:
            # First expansion phase reaches 30% - add more particles
            self.explosion_phase = 1
            self.add_explosion_particles(30, True)
            
        elif self.explosion_phase == 1 and self.explosion_radius > self.explosion_max_radius * 0.6:
            # Second expansion phase at 60% - add even more particles
            self.explosion_phase = 2
            self.add_explosion_particles(40, True)
        
        # Update explosion radius
        self.explosion_radius += self.explosion_speed
        
        # Check if explosion is complete
        if self.explosion_radius > self.explosion_max_radius:
            # Don't reset radius, just stop expanding
            self.explosion_radius = self.explosion_max_radius
            
            # Check if all particles are gone before marking as complete
            if len(self.explosion_particles) == 0:
                self.explosion_complete = True
                self.exploding = False
        
        # Update particles with physics and effects
        for particle in self.explosion_particles[:]:
            # Move particle
            particle['x'] += particle['dx']
            particle['y'] += particle['dy']
            
            # Apply gravity effect for falling particles
            particle['dy'] += particle['gravity']
            
            # Decay lifetime
            particle['lifetime'] -= 1
            
            # Shrink particles as they age
            life_ratio = particle['lifetime'] / particle['max_lifetime']
            particle['size'] = particle['original_size'] * max(0.5, life_ratio)
            
            # Remove dead particles
            if particle['lifetime'] <= 0:
                self.explosion_particles.remove(particle)
                continue
            
            # Add trail effect for some particles
            if particle['trail'] and random.random() < 0.3:
                # Limit trail density
                particle['trail_count'] += 1
                if particle['trail_count'] % 2 == 0:
                    # Add a smaller particle at this position with short lifetime
                    trail_size = particle['size'] * 0.6
                    trail_color = (
                        min(255, particle['color'][0] + 50),  # Brighter
                        min(255, particle['color'][1] + 50),
                        min(255, particle['color'][2] + 50)
                    )
                    self.explosion_particles.append({
                        'x': particle['x'],
                        'y': particle['y'],
                        'dx': 0,
                        'dy': 0,
                        'gravity': 0,
                        'size': trail_size,
                        'original_size': trail_size,
                        'lifetime': random.randint(5, 10),
                        'max_lifetime': 10,
                        'color': trail_color,
                        'trail': False,
                        'trail_count': 0
                    })
    
    def draw_explosion(self):
        # Draw multiple explosion rings with fade effect
        if self.explosion_radius > 0:
            # Main explosion ring
            pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 
                               int(self.explosion_radius), 3)
            
            # Inner rings (shockwaves)
            for i in range(1, 4):
                inner_radius = self.explosion_radius * (0.8 - i * 0.15)
                if inner_radius > 0:
                    # Fade the inner rings
                    alpha = 255 * (inner_radius / self.explosion_radius)
                    ring_color = (
                        min(255, self.color[0] + 50),
                        min(255, self.color[1] + 50),
                        min(255, self.color[2] + 50)
                    )
                    pygame.draw.circle(screen, ring_color, (int(self.x), int(self.y)), 
                                       int(inner_radius), 2)
        
        # Draw bright center of explosion
        if self.explosion_radius < self.explosion_max_radius * 0.7:
            center_size = max(5, self.radius * (1 - self.explosion_radius / self.explosion_max_radius))
            bright_color = (255, 255, 200)  # Bright yellow/white center
            pygame.draw.circle(screen, bright_color, (int(self.x), int(self.y)), int(center_size))
        
        # Draw particles with size-based rendering
        for particle in self.explosion_particles:
            # Calculate alpha based on lifetime
            life_ratio = particle['lifetime'] / particle['max_lifetime']
            
            # Draw particle
            pygame.draw.circle(screen, particle['color'], 
                               (int(particle['x']), int(particle['y'])), 
                               max(1, int(particle['size'])))

class Pipe:
    def __init__(self):
        self.x = WIDTH
        self.width = 50
        # Random height for top pipe
        self.height = random.randint(100, HEIGHT - PIPE_GAP - 100)
        self.passed = False

    def update(self):
        self.x -= PIPE_SPEED
        return self.x > -self.width  # Return True if pipe is still on screen

    def draw(self):
        # Draw top pipe
        pygame.draw.rect(screen, GREEN, (self.x, 0, self.width, self.height))
        # Draw bottom pipe
        pygame.draw.rect(screen, GREEN, (self.x, self.height + PIPE_GAP, self.width, HEIGHT - self.height - PIPE_GAP))

def show_score(birds, mode="three_player"):
    pause_text = font.render("Press P to Pause", True, YELLOW)
    screen.blit(pause_text, (WIDTH // 2 - pause_text.get_width() // 2, 10))
    
    if mode == "single":
        score_text = font.render(f"Score: {birds[0].score}", True, RED)
        screen.blit(score_text, (10, 10))
    elif mode == "two_player":
        score_text1 = font.render(f"Player 1: {birds[0].score}", True, RED)
        score_text2 = font.render(f"Player 2: {birds[1].score}", True, BLUE)
        screen.blit(score_text1, (10, 10))
        screen.blit(score_text2, (WIDTH - 150, 10))
    else:  # three_player
        score_text1 = font.render(f"P1: {birds[0].score}", True, RED)
        score_text2 = font.render(f"P2: {birds[1].score}", True, BLUE)
        score_text3 = font.render(f"P3: {birds[2].score}", True, PURPLE)
        screen.blit(score_text1, (10, 10))
        screen.blit(score_text2, (WIDTH // 2 - 50, 10))
        screen.blit(score_text3, (WIDTH - 100, 10))

def game_over_screen(birds, mode="three_player"):
    screen.fill(BLACK)
    
    title_font = pygame.font.SysFont(None, 64)
    subtitle_font = pygame.font.SysFont(None, 36)
    
    if mode == "single":
        result = "Game Over!"
        color = RED
        subtitle = f"Your score: {birds[0].score}"
        
        result_text = title_font.render(result, True, color)
        subtitle_text = subtitle_font.render(subtitle, True, color)
        restart_text = font.render("Press R to Restart or Q to Quit", True, YELLOW)
        
        screen.blit(result_text, (WIDTH // 2 - result_text.get_width() // 2, HEIGHT // 2 - 100))
        screen.blit(subtitle_text, (WIDTH // 2 - subtitle_text.get_width() // 2, HEIGHT // 2 - 50))
        screen.blit(restart_text, (WIDTH // 2 - restart_text.get_width() // 2, HEIGHT // 2 + 50))
    elif mode == "two_player":
        # Determine the winner (the one who's still alive or who scored more if both crashed)
        if birds[0].alive and not birds[1].alive:
            result = "Player 1 Wins!"
            subtitle = "Player 2 crashed!"
            color = RED
        elif birds[1].alive and not birds[0].alive:
            result = "Player 2 Wins!"
            subtitle = "Player 1 crashed!"
            color = BLUE
        else:
            # Both crashed or game ended another way, check scores
            if birds[0].score > birds[1].score:
                result = "Player 1 Wins!"
                subtitle = "Most points scored!"
                color = RED
            elif birds[1].score > birds[0].score:
                result = "Player 2 Wins!"
                subtitle = "Most points scored!"
                color = BLUE
            else:
                result = "It's a Tie!"
                subtitle = "Both players crashed!"
                color = WHITE
        
        result_text = title_font.render(result, True, color)
        subtitle_text = subtitle_font.render(subtitle, True, color)
        score_text = font.render(f"Player 1: {birds[0].score} - Player 2: {birds[1].score}", True, WHITE)
        restart_text = font.render("Press R to Restart or Q to Quit", True, YELLOW)
        
        screen.blit(result_text, (WIDTH // 2 - result_text.get_width() // 2, HEIGHT // 2 - 100))
        screen.blit(subtitle_text, (WIDTH // 2 - subtitle_text.get_width() // 2, HEIGHT // 2 - 50))
        screen.blit(score_text, (WIDTH // 2 - score_text.get_width() // 2, HEIGHT // 2))
        screen.blit(restart_text, (WIDTH // 2 - restart_text.get_width() // 2, HEIGHT // 2 + 50))
    else:  # three_player
        # Determine the winner
        alive_count = sum(1 for bird in birds if bird.alive)
        
        if alive_count == 1:
            # One player is still alive
            winner_idx = next(i for i, bird in enumerate(birds) if bird.alive)
            player_colors = [RED, BLUE, PURPLE]
            result = f"Player {winner_idx + 1} Wins!"
            subtitle = "Last bird flying!"
            color = player_colors[winner_idx]
        else:
            # All crashed or multiple alive, check scores
            max_score = max(bird.score for bird in birds)
            winners = [i for i, bird in enumerate(birds) if bird.score == max_score]
            
            if len(winners) == 1:
                # Clear winner by score
                winner_idx = winners[0]
                player_colors = [RED, BLUE, PURPLE]
                result = f"Player {winner_idx + 1} Wins!"
                subtitle = "Most points scored!"
                color = player_colors[winner_idx]
            else:
                # Tie between multiple players
                result = "It's a Tie!"
                subtitle = f"Between Players {', '.join(str(w+1) for w in winners)}!"
                color = WHITE
        
        result_text = title_font.render(result, True, color)
        subtitle_text = subtitle_font.render(subtitle, True, color)
        score_text = font.render(f"P1: {birds[0].score} - P2: {birds[1].score} - P3: {birds[2].score}", True, WHITE)
        restart_text = font.render("Press R to Restart or Q to Quit", True, YELLOW)
        
        screen.blit(result_text, (WIDTH // 2 - result_text.get_width() // 2, HEIGHT // 2 - 100))
        screen.blit(subtitle_text, (WIDTH // 2 - subtitle_text.get_width() // 2, HEIGHT // 2 - 50))
        screen.blit(score_text, (WIDTH // 2 - score_text.get_width() // 2, HEIGHT // 2))
        screen.blit(restart_text, (WIDTH // 2 - restart_text.get_width() // 2, HEIGHT // 2 + 50))
    
    pygame.display.update()

def show_game_mode_selection():
    screen.fill(BLACK)
    
    # Game title
    title_font = pygame.font.SysFont(None, 64)
    title_text = title_font.render("Flappy Bird", True, WHITE)
    screen.blit(title_text, (WIDTH // 2 - title_text.get_width() // 2, HEIGHT // 4))
    
    # Mode selection
    mode_font = pygame.font.SysFont(None, 48)
    one_player_text = mode_font.render("1. Single Player", True, YELLOW)
    two_player_text = mode_font.render("2. Two Players", True, YELLOW)
    three_player_text = mode_font.render("3. Three Players", True, YELLOW)
    
    screen.blit(one_player_text, (WIDTH // 2 - one_player_text.get_width() // 2, HEIGHT // 2 - 60))
    screen.blit(two_player_text, (WIDTH // 2 - two_player_text.get_width() // 2, HEIGHT // 2))
    screen.blit(three_player_text, (WIDTH // 2 - three_player_text.get_width() // 2, HEIGHT // 2 + 60))
    
    instruction_font = pygame.font.SysFont(None, 36)
    instruction_text = instruction_font.render("Press 1, 2, or 3 to select mode", True, WHITE)
    screen.blit(instruction_text, (WIDTH // 2 - instruction_text.get_width() // 2, HEIGHT * 3 // 4))
    
    pygame.display.update()
    
    # Wait for mode selection
    waiting = True
    mode = None
    while waiting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_1:
                    mode = "single"
                    waiting = False
                elif event.key == pygame.K_2:
                    mode = "two_player"
                    waiting = False
                elif event.key == pygame.K_3:
                    mode = "three_player"
                    waiting = False
        clock.tick(60)
    
    return mode

def show_start_screen(mode):
    screen.fill(BLACK)
    
    # Game title
    title_font = pygame.font.SysFont(None, 64)
    title_text = title_font.render(f"Flappy Bird - {mode.replace('_', ' ').title()} Mode", True, WHITE)
    screen.blit(title_text, (WIDTH // 2 - title_text.get_width() // 2, HEIGHT // 4))
    
    # Controls
    controls_font = pygame.font.SysFont(None, 36)
    
    if mode == "single":
        player_text = controls_font.render("Player (Red Bird)", True, RED)
        player_control = controls_font.render("Press W to flap", True, WHITE)
        
        screen.blit(player_text, (WIDTH // 2 - player_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player_control, (WIDTH // 2 - player_control.get_width() // 2, HEIGHT // 2 + 40))
    elif mode == "two_player":
        player1_text = controls_font.render("Player 1 (Red Bird)", True, RED)
        player1_control = controls_font.render("Press W to flap", True, WHITE)
        
        player2_text = controls_font.render("Player 2 (Blue Bird)", True, BLUE)
        player2_control = controls_font.render("Press UP ARROW to flap", True, WHITE)
        
        screen.blit(player1_text, (WIDTH // 4 - player1_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player1_control, (WIDTH // 4 - player1_control.get_width() // 2, HEIGHT // 2 + 40))
        
        screen.blit(player2_text, (3 * WIDTH // 4 - player2_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player2_control, (3 * WIDTH // 4 - player2_control.get_width() // 2, HEIGHT // 2 + 40))
    else:  # three_player
        player1_text = controls_font.render("Player 1 (Red Bird)", True, RED)
        player1_control = controls_font.render("Press W to flap", True, WHITE)
        
        player2_text = controls_font.render("Player 2 (Blue Bird)", True, BLUE)
        player2_control = controls_font.render("Press UP ARROW to flap", True, WHITE)
        
        player3_text = controls_font.render("Player 3 (Purple Bird)", True, PURPLE)
        player3_control = controls_font.render("Press SPACE to flap", True, WHITE)
        
        screen.blit(player1_text, (WIDTH // 6 - player1_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player1_control, (WIDTH // 6 - player1_control.get_width() // 2, HEIGHT // 2 + 40))
        
        screen.blit(player2_text, (WIDTH // 2 - player2_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player2_control, (WIDTH // 2 - player2_control.get_width() // 2, HEIGHT // 2 + 40))
        
        screen.blit(player3_text, (5 * WIDTH // 6 - player3_text.get_width() // 2, HEIGHT // 2))
        screen.blit(player3_control, (5 * WIDTH // 6 - player3_control.get_width() // 2, HEIGHT // 2 + 40))
    
    # Start instruction
    start_text = controls_font.render("Press ENTER to start the game", True, YELLOW)
    screen.blit(start_text, (WIDTH // 2 - start_text.get_width() // 2, HEIGHT * 3 // 4))
    
    pygame.display.update()
    
    # Wait for space key
    waiting = True
    while waiting:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.KEYDOWN and event.key == pygame.K_RETURN:
                waiting = False
        clock.tick(60)

def show_pause_screen():
    # Semi-transparent overlay
    overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 150))  # Black with 150 alpha (semi-transparent)
    screen.blit(overlay, (0, 0))
    
    # Pause title
    pause_font = pygame.font.SysFont(None, 64)
    pause_text = pause_font.render("GAME PAUSED", True, WHITE)
    screen.blit(pause_text, (WIDTH // 2 - pause_text.get_width() // 2, HEIGHT // 3))
    
    # Instructions
    controls_font = pygame.font.SysFont(None, 36)
    resume_text = controls_font.render("Press P to Resume", True, YELLOW)
    quit_text = controls_font.render("Press Q to Quit", True, YELLOW)
    
    screen.blit(resume_text, (WIDTH // 2 - resume_text.get_width() // 2, HEIGHT // 2))
    screen.blit(quit_text, (WIDTH // 2 - quit_text.get_width() // 2, HEIGHT // 2 + 40))
    
    pygame.display.update()

def main():
    # Select game mode
    mode = show_game_mode_selection()
    
    # Create players based on mode
    if mode == "single":
        bird1 = Bird(WIDTH // 2, RED, pygame.K_w)
        birds = [bird1]
    elif mode == "two_player":
        bird1 = Bird(WIDTH // 4, RED, pygame.K_w)
        bird2 = Bird(3 * WIDTH // 4, BLUE, pygame.K_UP)
        birds = [bird1, bird2]
    else:  # three_player mode
        bird1 = Bird(WIDTH // 6, RED, pygame.K_w)
        bird2 = Bird(WIDTH // 2, BLUE, pygame.K_UP)
        bird3 = Bird(5 * WIDTH // 6, PURPLE, pygame.K_SPACE)
        birds = [bird1, bird2, bird3]
    
    pipes = []
    last_pipe = pygame.time.get_ticks()
    running = True
    game_active = True
    paused = False
    
    # Use global variables for screen shake
    global shake_intensity, shake_offset_x, shake_offset_y
    
    # Show start screen with controls
    show_start_screen(mode)
    
    # Add a 2-second countdown before game starts
    countdown_font = pygame.font.SysFont(None, 100)
    for i in range(3, 0, -1):
        screen.fill(BLACK)
        count_text = countdown_font.render(str(i), True, WHITE)
        screen.blit(count_text, (WIDTH // 2 - count_text.get_width() // 2, HEIGHT // 2 - count_text.get_height() // 2))
        pygame.display.update()
        time.sleep(1)
    
    while running:
        current_time = pygame.time.get_ticks()
        
        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            
            if event.type == pygame.KEYDOWN:
                # Quit game
                if event.key == pygame.K_q:
                    if paused or not game_active:
                        running = False
                
                # Restart game from game over screen
                if event.key == pygame.K_r and not game_active:
                    # Reset the game - select mode again
                    mode = show_game_mode_selection()
                    
                    # Create players based on mode
                    if mode == "single":
                        bird1 = Bird(WIDTH // 2, RED, pygame.K_w)
                        birds = [bird1]
                    elif mode == "two_player":
                        bird1 = Bird(WIDTH // 4, RED, pygame.K_w)
                        bird2 = Bird(3 * WIDTH // 4, BLUE, pygame.K_UP)
                        birds = [bird1, bird2]
                    else:  # three_player mode
                        bird1 = Bird(WIDTH // 6, RED, pygame.K_w)
                        bird2 = Bird(WIDTH // 2, BLUE, pygame.K_UP)
                        bird3 = Bird(5 * WIDTH // 6, PURPLE, pygame.K_SPACE)
                        birds = [bird1, bird2, bird3]
                        
                    pipes = []
                    last_pipe = current_time
                    game_active = True
                    
                    # Show start screen and countdown again
                    show_start_screen(mode)
                    # Countdown before game starts
                    countdown_font = pygame.font.SysFont(None, 100)
                    for i in range(3, 0, -1):
                        screen.fill(BLACK)
                        count_text = countdown_font.render(str(i), True, WHITE)
                        screen.blit(count_text, (WIDTH // 2 - count_text.get_width() // 2, HEIGHT // 2 - count_text.get_height() // 2))
                        pygame.display.update()
                        time.sleep(1)
                
                # Toggle pause
                if event.key == pygame.K_p and game_active:
                    paused = not paused
                    if paused:
                        show_pause_screen()
                
                # Bird flapping controls (only when game is active and not paused)
                if game_active and not paused:
                    for bird in birds:
                        if event.key == bird.key_up:
                            bird.flap()
        
        if game_active and not paused:
            # Add pipes at regular intervals
            if current_time - last_pipe > PIPE_FREQUENCY:
                pipes.append(Pipe())
                last_pipe = current_time
            
            # Update all birds
            for bird in birds:
                bird.update()
            
            # Update pipes and remove off-screen pipes
            pipes = [pipe for pipe in pipes if pipe.update()]
            
            # Check for collisions
            for bird in birds:
                bird.check_collision(pipes)
            
            # Update scores when birds pass pipes
            for pipe in pipes:
                if not pipe.passed:
                    pipe_passed = False
                    # Check if any bird has passed this pipe
                    for bird in birds:
                        if pipe.x < bird.x:
                            pipe_passed = True
                            if bird.alive:
                                bird.score += 1
                    if pipe_passed:
                        pipe.passed = True
            
            # Check if game should end
            if mode == "single":
                # Single player mode - game ends when player dies
                if not birds[0].alive:
                    # Allow time for explosion to complete
                    if not birds[0].exploding or birds[0].explosion_complete:
                        # Add a slight delay to appreciate the explosion
                        pygame.time.delay(500)  # 500ms delay
                        game_active = False
            elif mode == "two_player":
                # Two player mode - game ends when any bird is dead
                if not birds[0].alive or not birds[1].alive:
                    # Allow time for explosion to complete (don't immediately end game)
                    explosion_ongoing = ((not birds[0].alive and birds[0].exploding) or 
                                        (not birds[1].alive and birds[1].exploding))
                    
                    if not explosion_ongoing:
                        # Wait for explosion to finish before ending game
                        # Check if explosions are fully complete
                        if ((not birds[0].alive and birds[0].explosion_complete) or 
                            (not birds[1].alive and birds[1].explosion_complete) or
                            # Also end if birds died without exploding 
                            (not birds[0].alive and not birds[0].exploding) or
                            (not birds[1].alive and not birds[1].exploding)):
                            # Add a slight delay to appreciate the explosion
                            pygame.time.delay(500)  # 500ms delay
                            game_active = False
            else:  # three_player mode
                # Three player mode - game ends when at least one bird is dead
                if not all(bird.alive for bird in birds):
                    # Check if any explosions are still ongoing
                    explosion_ongoing = any(not bird.alive and bird.exploding for bird in birds)
                    
                    if not explosion_ongoing:
                        # Wait for all explosions to finish
                        explosion_complete = all((bird.alive or bird.explosion_complete or not bird.exploding) for bird in birds)
                        
                        if explosion_complete:
                            # Add a slight delay to appreciate the explosion
                            pygame.time.delay(500)  # 500ms delay
                            game_active = False
            
            # Update screen shake effect
            global shake_intensity, shake_offset_x, shake_offset_y
            
            if shake_intensity > 0.5:  # Only apply shake above a threshold
                # Generate random shake offsets based on current intensity
                shake_offset_x = random.uniform(-shake_intensity, shake_intensity)
                shake_offset_y = random.uniform(-shake_intensity, shake_intensity)
                
                # Decay shake intensity for next frame
                shake_intensity *= shake_decay
            else:
                shake_intensity = 0
                shake_offset_x = 0
                shake_offset_y = 0
            
            # Draw everything
            screen.fill(BLACK)
            
            # Create a temporary surface to draw on, which we can then offset for the shake effect
            if shake_intensity > 0:
                # Save the original screen position
                original_screen_rect = screen.get_rect()
                
                # Create a layer that we'll apply the shake to
                shake_surface = pygame.Surface((WIDTH, HEIGHT))
                shake_surface.fill(BLACK)
                
                # Draw everything on the shake surface
                
                # Draw pipes
                for pipe in pipes:
                    pygame.draw.rect(shake_surface, GREEN, (pipe.x, 0, pipe.width, pipe.height))
                    pygame.draw.rect(shake_surface, GREEN, 
                                     (pipe.x, pipe.height + PIPE_GAP, pipe.width, HEIGHT - pipe.height - PIPE_GAP))
                
                # Draw birds (we need custom drawing for the shake surface)
                for bird in birds:
                    if bird.alive:
                        pygame.draw.circle(shake_surface, bird.color, (bird.x, int(bird.y)), bird.radius)
                    else:
                        # For explosions, we need to draw directly on the surface
                        bird.draw()
                
                # Draw dividing lines (only in multi-player modes)
                if mode == "two_player":
                    pygame.draw.line(shake_surface, WHITE, (WIDTH // 2, 0), (WIDTH // 2, HEIGHT), 2)
                elif mode == "three_player":
                    pygame.draw.line(shake_surface, WHITE, (WIDTH // 3, 0), (WIDTH // 3, HEIGHT), 2)
                    pygame.draw.line(shake_surface, WHITE, (2 * WIDTH // 3, 0), (2 * WIDTH // 3, HEIGHT), 2)
                
                # Apply the shake by blitting the surface with offset
                screen.blit(shake_surface, (shake_offset_x, shake_offset_y))
                
                # Show scores (directly on screen to avoid shaking UI)
                show_score(birds, mode)
            else:
                # Normal drawing without shake
                # Draw pipes
                for pipe in pipes:
                    pipe.draw()
                
                # Draw birds
                for bird in birds:
                    bird.draw()
                
                # Show scores
                show_score(birds, mode)
                
                # Draw dividing lines (only in multi-player modes)
                if mode == "two_player":
                    pygame.draw.line(screen, WHITE, (WIDTH // 2, 0), (WIDTH // 2, HEIGHT), 2)
                elif mode == "three_player":
                    pygame.draw.line(screen, WHITE, (WIDTH // 3, 0), (WIDTH // 3, HEIGHT), 2)
                    pygame.draw.line(screen, WHITE, (2 * WIDTH // 3, 0), (2 * WIDTH // 3, HEIGHT), 2)
            
        else:
            game_over_screen(birds, mode)
        
        pygame.display.update()
        clock.tick(60)
    
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()