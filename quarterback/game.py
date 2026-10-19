import pygame
import math
from enum import Enum
from dataclasses import dataclass
from typing import Optional


# Constants
SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 600
FPS = 60

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (50, 150, 50)
BLUE = (50, 100, 255)
RED = (255, 50, 50)
YELLOW = (255, 255, 100)
DARK_GREEN = (30, 100, 30)

# Physics
GRAVITY = 0.8
JUMP_STRENGTH = -15
PLAYER_SPEED = 5
BALL_THROW_POWER = 15
DEFENDER_SPEED = 2

# Field
ENDZONE_START = SCREEN_WIDTH - 150  # Endzone starts 150 pixels from right


class GameState(Enum):
    PLAYING = 1
    TACKLED = 2
    TOUCHDOWN = 3
    INCOMPLETE = 4
    TURNOVER_ON_DOWNS = 5


@dataclass
class Vector2:
    x: float
    y: float

    def __add__(self, other):
        return Vector2(self.x + other.x, self.y + other.y)

    def __mul__(self, scalar):
        return Vector2(self.x * scalar, self.y * scalar)


class Ball:
    def __init__(self, x: float, y: float):
        self.pos = Vector2(x, y)
        self.velocity = Vector2(0, 0)
        self.radius = 8
        self.active = False
        self.caught = False

    def throw(self, start_x: float, start_y: float, target_x: float, target_y: float):
        self.pos = Vector2(start_x, start_y)
        dx = target_x - start_x
        dy = target_y - start_y
        distance = math.sqrt(dx**2 + dy**2)

        if distance > 0:
            self.velocity.x = (dx / distance) * BALL_THROW_POWER
            self.velocity.y = (dy / distance) * BALL_THROW_POWER - 5  # Arc upward
            self.active = True
            self.caught = False

    def update(self):
        if self.active and not self.caught:
            self.velocity.y += GRAVITY
            self.pos = self.pos + self.velocity

            # Ball hits ground
            if self.pos.y >= SCREEN_HEIGHT - 50:
                self.active = False
                self.pos.y = SCREEN_HEIGHT - 50

    def draw(self, screen):
        if self.active:
            pygame.draw.circle(screen, YELLOW, (int(self.pos.x), int(self.pos.y)), self.radius)


class Player:
    def __init__(self, x: float, y: float, color):
        self.pos = Vector2(x, y)
        self.velocity = Vector2(0, 0)
        self.width = 30
        self.height = 50
        self.color = color
        self.on_ground = False
        self.facing_right = True
        self.walk_frame = 0
        self.animation_counter = 0

    def update(self):
        # Apply gravity
        self.velocity.y += GRAVITY
        self.pos = self.pos + self.velocity

        # Ground collision
        ground_level = SCREEN_HEIGHT - 100 - self.height
        if self.pos.y >= ground_level:
            self.pos.y = ground_level
            self.velocity.y = 0
            self.on_ground = True
        else:
            self.on_ground = False

        # Keep player on screen
        if self.pos.x < 0:
            self.pos.x = 0
        elif self.pos.x > SCREEN_WIDTH - self.width:
            self.pos.x = SCREEN_WIDTH - self.width

        # Update walking animation
        if abs(self.velocity.x) > 0.5 and self.on_ground:
            self.animation_counter += 1
            if self.animation_counter >= 8:
                self.walk_frame = 1 - self.walk_frame
                self.animation_counter = 0
        else:
            self.walk_frame = 0
            self.animation_counter = 0

    def jump(self):
        if self.on_ground:
            self.velocity.y = JUMP_STRENGTH

    def move(self, direction: int):
        self.velocity.x = direction * PLAYER_SPEED
        if direction != 0:
            self.facing_right = direction > 0

    def draw(self, screen):
        # Draw stick figure
        center_x = int(self.pos.x + self.width // 2)
        bottom_y = int(self.pos.y + self.height)

        # Head
        head_radius = 8
        head_y = int(self.pos.y + head_radius + 2)
        pygame.draw.circle(screen, self.color, (center_x, head_y), head_radius, 2)

        # Body
        body_top_y = head_y + head_radius
        body_bottom_y = body_top_y + 20
        pygame.draw.line(screen, self.color, (center_x, body_top_y),
                        (center_x, body_bottom_y), 3)

        # Arms
        arm_y = body_top_y + 5
        arm_length = 12
        if self.facing_right:
            left_arm_x = center_x - arm_length
            right_arm_x = center_x + arm_length
        else:
            left_arm_x = center_x - arm_length
            right_arm_x = center_x + arm_length

        pygame.draw.line(screen, self.color, (center_x, arm_y),
                        (left_arm_x, arm_y + 8), 3)
        pygame.draw.line(screen, self.color, (center_x, arm_y),
                        (right_arm_x, arm_y + 8), 3)

        # Legs (animated)
        leg_top_y = body_bottom_y
        leg_bottom_y = bottom_y
        leg_spread = 6 if self.walk_frame == 0 else -6

        # Left leg
        left_leg_x = center_x - leg_spread
        pygame.draw.line(screen, self.color, (center_x, leg_top_y),
                        (left_leg_x, leg_bottom_y), 3)

        # Right leg
        right_leg_x = center_x + leg_spread
        pygame.draw.line(screen, self.color, (center_x, leg_top_y),
                        (right_leg_x, leg_bottom_y), 3)

    def get_rect(self):
        return pygame.Rect(int(self.pos.x), int(self.pos.y), self.width, self.height)


class Quarterback(Player):
    def __init__(self, x: float, y: float):
        super().__init__(x, y, BLUE)
        self.has_ball = True

    def draw(self, screen):
        super().draw(screen)
        # Draw QB label below
        font = pygame.font.Font(None, 20)
        text = font.render("QB", True, WHITE)
        text_rect = text.get_rect(center=(int(self.pos.x + self.width // 2),
                                          int(self.pos.y + self.height + 12)))
        screen.blit(text, text_rect)


class Receiver(Player):
    def __init__(self, x: float, y: float):
        super().__init__(x, y, BLUE)
        self.route_progress = 0
        self.caught_ball = False
        self.has_ball = False

    def update(self):
        super().update()
        # Simple route: run forward (only if not controlled by player)
        if not self.has_ball:
            if self.route_progress < 300:
                self.velocity.x = 3
                self.route_progress += 3
            else:
                self.velocity.x = 0

    def draw(self, screen):
        super().draw(screen)
        # Draw WR label below
        font = pygame.font.Font(None, 20)
        text = font.render("WR", True, WHITE)
        text_rect = text.get_rect(center=(int(self.pos.x + self.width // 2),
                                          int(self.pos.y + self.height + 12)))
        screen.blit(text, text_rect)


class Defender(Player):
    def __init__(self, x: float, y: float):
        super().__init__(x, y, RED)

    def update_ai(self, target: Player):
        # Move towards target
        if abs(target.pos.x - self.pos.x) > 10:
            direction = 1 if target.pos.x > self.pos.x else -1
            self.velocity.x = direction * DEFENDER_SPEED
        else:
            self.velocity.x = 0

    def draw(self, screen):
        super().draw(screen)
        # Draw D label below
        font = pygame.font.Font(None, 20)
        text = font.render("D", True, WHITE)
        text_rect = text.get_rect(center=(int(self.pos.x + self.width // 2),
                                          int(self.pos.y + self.height + 12)))
        screen.blit(text, text_rect)


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Quarterback Simulator")
        self.clock = pygame.time.Clock()
        self.running = True
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)

        self.reset_game()

    def reset_game(self):
        self.score = 0
        self.tackles = 0
        self.down = 1
        self.yards_to_first_down = 10
        self.reset_play()

    def reset_play(self):
        self.qb = Quarterback(100, SCREEN_HEIGHT - 200)
        self.receiver = Receiver(150, SCREEN_HEIGHT - 200)
        self.defenders = [
            Defender(600, SCREEN_HEIGHT - 200),
            Defender(800, SCREEN_HEIGHT - 200),
        ]
        self.ball = Ball(0, 0)
        self.state = GameState.PLAYING
        self.charging_throw = False
        self.throw_power = 0
        self.min_throw_power = 40
        self.max_throw_power = 150
        self.throw_power_direction = 1
        self.controlled_player = self.qb  # Start controlling QB

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    self.controlled_player.jump()
                elif event.key == pygame.K_r and self.state != GameState.PLAYING:
                    if self.state == GameState.TURNOVER_ON_DOWNS:
                        self.reset_game()
                    elif self.state == GameState.TOUCHDOWN:
                        self.reset_play()
                    else:
                        self.reset_play()
                elif event.key == pygame.K_f and self.controlled_player.has_ball:
                    # Start charging throw (only QB can throw)
                    if self.controlled_player == self.qb:
                        self.charging_throw = True
                        self.throw_power = self.min_throw_power
                        self.throw_power_direction = 1
            elif event.type == pygame.KEYUP:
                if event.key == pygame.K_f and self.charging_throw:
                    # Release throw
                    self.throw_ball()
                    self.charging_throw = False
                    self.throw_power = 0

    def calculate_parabola_points(self, start_x, start_y, power):
        """Calculate points along a parabolic trajectory based on throw power"""
        points = []
        angle = 45  # degrees
        velocity = power / 5  # Convert power to velocity

        # Convert to radians
        rad = math.radians(angle)
        vx = velocity * math.cos(rad)
        vy = -velocity * math.sin(rad)

        # Simulate trajectory
        x, y = start_x, start_y
        for i in range(60):  # Number of points to calculate
            points.append((int(x), int(y)))
            x += vx
            y += vy
            vy += GRAVITY

            # Stop if ball hits ground
            if y >= SCREEN_HEIGHT - 100:
                points.append((int(x), SCREEN_HEIGHT - 100))
                break

        return points

    def throw_ball(self):
        """Throw the ball based on current throw power"""
        if not self.qb.has_ball:
            return

        start_x = self.qb.pos.x + self.qb.width // 2
        start_y = self.qb.pos.y + self.qb.height // 2

        # Calculate throw velocity based on power
        angle = 45
        velocity = self.throw_power / 5
        rad = math.radians(angle)

        self.ball.pos = Vector2(start_x, start_y)
        self.ball.velocity.x = velocity * math.cos(rad)
        self.ball.velocity.y = -velocity * math.sin(rad)
        self.ball.active = True
        self.ball.caught = False
        self.qb.has_ball = False

    def update(self):
        if self.state != GameState.PLAYING:
            return

        # Handle controlled player movement
        keys = pygame.key.get_pressed()
        direction = 0
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            direction -= 1
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            direction += 1
        self.controlled_player.move(direction)

        # Update throw charging with oscillation
        if self.charging_throw:
            self.throw_power += 2.5 * self.throw_power_direction

            # Reverse direction at boundaries
            if self.throw_power >= self.max_throw_power:
                self.throw_power = self.max_throw_power
                self.throw_power_direction = -1
            elif self.throw_power <= self.min_throw_power:
                self.throw_power = self.min_throw_power
                self.throw_power_direction = 1

        # Update all entities
        self.qb.update()
        self.receiver.update()
        self.ball.update()

        # Determine ball carrier for defender AI
        ball_carrier = None
        if self.qb.has_ball:
            ball_carrier = self.qb
        elif self.receiver.has_ball:
            ball_carrier = self.receiver

        # Update defenders to chase ball carrier
        for defender in self.defenders:
            if ball_carrier:
                defender.update_ai(ball_carrier)
            defender.update()

        # Check if receiver catches ball
        if self.ball.active and not self.ball.caught:
            receiver_rect = self.receiver.get_rect()
            ball_rect = pygame.Rect(int(self.ball.pos.x - self.ball.radius),
                                   int(self.ball.pos.y - self.ball.radius),
                                   self.ball.radius * 2, self.ball.radius * 2)
            if receiver_rect.colliderect(ball_rect):
                self.ball.caught = True
                self.ball.active = False
                self.receiver.caught_ball = True
                self.receiver.has_ball = True
                # Switch control to receiver
                self.controlled_player = self.receiver

        # Check for incomplete pass (ball hit ground without being caught)
        if not self.ball.active and not self.ball.caught and not self.qb.has_ball and not self.receiver.has_ball:
            self.state = GameState.INCOMPLETE
            self.down += 1

        # Check for tackles (only if player has ball)
        if ball_carrier:
            carrier_rect = ball_carrier.get_rect()
            for defender in self.defenders:
                if carrier_rect.colliderect(defender.get_rect()):
                    self.state = GameState.TACKLED
                    self.tackles += 1
                    self.down += 1

        # Check for touchdown (ball carrier in endzone)
        if ball_carrier and ball_carrier.pos.x >= ENDZONE_START:
            self.state = GameState.TOUCHDOWN
            self.score += 6  # 6 points for touchdown
            self.down = 1

        # Check for turnover on downs
        if self.down > 4:
            self.state = GameState.TURNOVER_ON_DOWNS

    def draw(self):
        # Draw field
        self.screen.fill(GREEN)

        # Draw yard lines
        for x in range(0, SCREEN_WIDTH, 100):
            pygame.draw.line(self.screen, WHITE, (x, SCREEN_HEIGHT - 100),
                           (x, SCREEN_HEIGHT), 2)

        # Draw ground
        pygame.draw.rect(self.screen, DARK_GREEN,
                        (0, SCREEN_HEIGHT - 100, SCREEN_WIDTH, 100))

        # Draw endzone
        endzone_color = (100, 100, 255, 128)  # Semi-transparent blue
        endzone_rect = pygame.Rect(ENDZONE_START, 0, SCREEN_WIDTH - ENDZONE_START, SCREEN_HEIGHT - 100)
        pygame.draw.rect(self.screen, endzone_color, endzone_rect)
        pygame.draw.line(self.screen, WHITE, (ENDZONE_START, 0), (ENDZONE_START, SCREEN_HEIGHT - 100), 3)

        # Draw "END ZONE" text
        endzone_font = pygame.font.Font(None, 48)
        endzone_text = endzone_font.render("END", True, WHITE)
        endzone_text2 = endzone_font.render("ZONE", True, WHITE)
        self.screen.blit(endzone_text, (ENDZONE_START + 30, SCREEN_HEIGHT // 2 - 40))
        self.screen.blit(endzone_text2, (ENDZONE_START + 20, SCREEN_HEIGHT // 2 + 10))

        # Draw entities
        self.qb.draw(self.screen)
        self.receiver.draw(self.screen)
        self.ball.draw(self.screen)

        for defender in self.defenders:
            defender.draw(self.screen)

        # Draw control indicator (yellow dot under controlled player)
        if self.controlled_player:
            indicator_x = int(self.controlled_player.pos.x + self.controlled_player.width // 2)
            indicator_y = int(self.controlled_player.pos.y + self.controlled_player.height + 20)
            pygame.draw.circle(self.screen, YELLOW, (indicator_x, indicator_y), 5)
            pygame.draw.circle(self.screen, BLACK, (indicator_x, indicator_y), 5, 1)

        # Draw throw arc if charging
        if self.charging_throw and self.qb.has_ball:
            start_x = self.qb.pos.x + self.qb.width // 2
            start_y = self.qb.pos.y + self.qb.height // 2
            points = self.calculate_parabola_points(start_x, start_y, self.throw_power)

            if len(points) > 1:
                # Draw the parabola arc
                pygame.draw.lines(self.screen, YELLOW, False, points, 3)

                # Draw dots along the arc
                for i in range(0, len(points), 5):
                    pygame.draw.circle(self.screen, YELLOW, points[i], 3)

                # Draw power meter
                power_percent = self.throw_power / self.max_throw_power
                meter_width = 200
                meter_height = 20
                meter_x = SCREEN_WIDTH // 2 - meter_width // 2
                meter_y = 50

                # Meter background
                pygame.draw.rect(self.screen, BLACK, (meter_x - 2, meter_y - 2,
                                                       meter_width + 4, meter_height + 4))
                pygame.draw.rect(self.screen, WHITE, (meter_x, meter_y,
                                                       meter_width, meter_height), 2)

                # Meter fill
                fill_width = int(meter_width * power_percent)
                color = YELLOW if power_percent < 0.8 else RED
                pygame.draw.rect(self.screen, color, (meter_x, meter_y,
                                                       fill_width, meter_height))

                # Power text
                power_text = self.small_font.render("THROW POWER", True, WHITE)
                text_rect = power_text.get_rect(center=(SCREEN_WIDTH // 2, meter_y - 15))
                self.screen.blit(power_text, text_rect)

        # Draw UI
        score_text = self.font.render(f"Score: {self.score}", True, WHITE)
        self.screen.blit(score_text, (10, 10))

        # Draw downs and field position
        down_ordinal = ["1st", "2nd", "3rd", "4th"][min(self.down - 1, 3)]
        down_text = self.font.render(f"{down_ordinal} Down", True, YELLOW)
        self.screen.blit(down_text, (10, 50))

        tackles_text = self.small_font.render(f"Tackles: {self.tackles}", True, WHITE)
        self.screen.blit(tackles_text, (10, 90))

        # Draw controls
        controls = [
            "Arrow Keys / A,D: Move",
            "Space: Jump",
            "Hold F: Charge throw, Release: Throw"
        ]
        y_offset = SCREEN_HEIGHT - 90
        for i, control in enumerate(controls):
            text = self.small_font.render(control, True, WHITE)
            self.screen.blit(text, (SCREEN_WIDTH - 250, y_offset + i * 25))

        # Draw game state messages
        if self.state == GameState.TACKLED:
            msg_text = self.font.render("TACKLED! Press R for next down", True, RED)
            text_rect = msg_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
            pygame.draw.rect(self.screen, BLACK, text_rect.inflate(20, 20))
            self.screen.blit(msg_text, text_rect)
        elif self.state == GameState.TOUCHDOWN:
            msg_text = self.font.render("TOUCHDOWN! +6 Points! Press R to continue", True, YELLOW)
            text_rect = msg_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
            pygame.draw.rect(self.screen, BLACK, text_rect.inflate(20, 20))
            self.screen.blit(msg_text, text_rect)
        elif self.state == GameState.INCOMPLETE:
            msg_text = self.font.render("INCOMPLETE PASS! Press R for next down", True, RED)
            text_rect = msg_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
            pygame.draw.rect(self.screen, BLACK, text_rect.inflate(20, 20))
            self.screen.blit(msg_text, text_rect)
        elif self.state == GameState.TURNOVER_ON_DOWNS:
            msg_text = self.font.render("TURNOVER ON DOWNS! Game Over. Press R to restart", True, RED)
            text_rect = msg_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
            pygame.draw.rect(self.screen, BLACK, text_rect.inflate(20, 20))
            self.screen.blit(msg_text, text_rect)

        pygame.display.flip()

    def run(self):
        while self.running:
            self.handle_events()
            self.update()
            self.draw()
            self.clock.tick(FPS)

        pygame.quit()


def main():
    game = Game()
    game.run()


if __name__ == "__main__":
    main()
