#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "pygame"
# ]
# ///

import pygame
import random

# Constants: Window is twice as large.
SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 1200
BLOCK_SIZE = 20
GRID_WIDTH = SCREEN_WIDTH // BLOCK_SIZE
GRID_HEIGHT = SCREEN_HEIGHT // BLOCK_SIZE

# Color-blind safe colors (Okabe-Ito palette)
BLUE = (0, 114, 178)      # Player 1
ORANGE = (230, 159, 0)    # Player 2
GREEN = (0, 158, 115)     # For Player 3 (human) or the Bot in mode 4
BG_COLOR = (0, 0, 0)
FOOD_COLOR = (255, 0, 0)  # Red dots

MAX_FOOD = 5

# Control mappings
PLAYER1_CONTROLS = {
    pygame.K_w: (0, -1),
    pygame.K_a: (-1, 0),
    pygame.K_s: (0, 1),
    pygame.K_d: (1, 0)
}
PLAYER2_CONTROLS = {
    pygame.K_UP: (0, -1),
    pygame.K_LEFT: (-1, 0),
    pygame.K_DOWN: (0, 1),
    pygame.K_RIGHT: (1, 0)
}
# For three-player mode (all human) using y, g, h, j
PLAYER3_CONTROLS = {
    pygame.K_y: (0, -1),
    pygame.K_g: (-1, 0),
    pygame.K_h: (0, 1),
    pygame.K_j: (1, 0)
}

# In single-player mode, we use arrow keys as well (PLAYER2_CONTROLS)


class Snake:
    def __init__(self, color, start_pos, direction, controls, init_length=3, name=""):
        self.color = color
        self.direction = direction  # (dx, dy)
        self.controls = controls
        self.length = init_length
        self.name = name
        # Initialize positions so that the head is at start_pos.
        self.positions = [
            (start_pos[0] - (init_length - 1 - i) * direction[0],
             start_pos[1] - (init_length - 1 - i) * direction[1])
            for i in range(init_length)
        ]
        self.alive = True

    def move(self):
        head = self.positions[-1]
        new_head = (head[0] + self.direction[0], head[1] + self.direction[1])
        self.positions.append(new_head)
        if len(self.positions) > self.length:
            self.positions.pop(0)

    def change_direction(self, key):
        if key in self.controls:
            new_dir = self.controls[key]
            # Prevent reversing direction.
            if new_dir[0] == -self.direction[0] and new_dir[1] == -self.direction[1]:
                return
            self.direction = new_dir

    def draw(self, surface, block_size):
        for pos in self.positions:
            rect = pygame.Rect(pos[0] * block_size, pos[1] * block_size, block_size, block_size)
            pygame.draw.rect(surface, self.color, rect)


def get_random_food_position_multi(players, foods):
    while True:
        pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
        if any(pos in snake.positions for snake in players):
            continue
        if pos in foods:
            continue
        return pos


def get_random_food_position_single(snake, foods):
    while True:
        pos = (random.randint(0, GRID_WIDTH - 1), random.randint(0, GRID_HEIGHT - 1))
        if pos not in snake.positions and pos not in foods:
            return pos


def check_collision_single(snake):
    head = snake.positions[-1]
    # Boundary check.
    if head[0] < 0 or head[0] >= GRID_WIDTH or head[1] < 0 or head[1] >= GRID_HEIGHT:
        return True
    # Self-collision.
    if head in snake.positions[:-1]:
        return True
    return False


def check_collision_multi(snake, players):
    head = snake.positions[-1]
    # Boundary check.
    if head[0] < 0 or head[0] >= GRID_WIDTH or head[1] < 0 or head[1] >= GRID_HEIGHT:
        return True
    # Self-collision.
    if head in snake.positions[:-1]:
        return True
    # Collision with any other snake.
    for other in players:
        if other is snake or not other.alive:
            continue
        if head in other.positions:
            return True
    return False


def bot_decision(snake, foods, players):
    """
    Simple AI: Move toward the nearest food dot.
    """
    head = snake.positions[-1]
    nearest = None
    nearest_dist = None
    for food in foods:
        d = abs(food[0] - head[0]) + abs(food[1] - head[1])
        if nearest is None or d < nearest_dist:
            nearest = food
            nearest_dist = d
    if nearest is None:
        return snake.direction

    dx = nearest[0] - head[0]
    dy = nearest[1] - head[1]
    candidates = []
    if dx != 0:
        candidates.append((1 if dx > 0 else -1, 0))
    if dy != 0:
        candidates.append((0, 1 if dy > 0 else -1))
    random.shuffle(candidates)
    for cand in candidates:
        if cand[0] == -snake.direction[0] and cand[1] == -snake.direction[1]:
            continue
        return cand
    return snake.direction


def choose_mode(screen, clock, font):
    choosing = True
    while choosing:
        screen.fill(BG_COLOR)
        title_text = font.render("Choose Mode", True, (255, 255, 255))
        single_text = font.render("Press 1 for Single Player", True, (255, 255, 255))
        two_text = font.render("Press 2 for Two Player", True, (255, 255, 255))
        three_text = font.render("Press 3 for Three Player", True, (255, 255, 255))
        bot_text = font.render("Press 4 for 2 Players + AI Bot", True, (255, 255, 255))
        screen.blit(title_text, title_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 200)))
        screen.blit(single_text, single_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 100)))
        screen.blit(two_text, two_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 50)))
        screen.blit(three_text, three_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)))
        screen.blit(bot_text, bot_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 50)))
        pygame.display.flip()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                exit()
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_1:
                    return 1
                elif event.key == pygame.K_2:
                    return 2
                elif event.key == pygame.K_3:
                    return 3
                elif event.key == pygame.K_4:
                    return 4
        clock.tick(10)


def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Snake Game")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 48)

    while True:  # Outer loop for restarting the game.
        mode = choose_mode(screen, clock, font)
        players = []

        if mode == 1:
            # Single player mode: use arrow keys.
            player = Snake(BLUE, (5, GRID_HEIGHT // 2), (1, 0), PLAYER2_CONTROLS, name="Player")
            players.append(player)
            foods = []
            while len(foods) < MAX_FOOD:
                foods.append(get_random_food_position_single(player, foods))
        elif mode == 2:
            # Two player mode: Player 1 uses WASD, Player 2 uses arrow keys.
            player1 = Snake(BLUE, (5, GRID_HEIGHT // 2), (1, 0), PLAYER1_CONTROLS, name="Player 1")
            player2 = Snake(ORANGE, (GRID_WIDTH - 6, GRID_HEIGHT // 2), (-1, 0), PLAYER2_CONTROLS, name="Player 2")
            players.extend([player1, player2])
            foods = []
            while len(foods) < MAX_FOOD:
                foods.append(get_random_food_position_multi(players, foods))
        elif mode == 3:
            # Three player mode: Three human players.
            player1 = Snake(BLUE, (5, GRID_HEIGHT // 2), (1, 0), PLAYER1_CONTROLS, name="Player 1")
            player2 = Snake(ORANGE, (GRID_WIDTH - 6, GRID_HEIGHT // 2), (-1, 0), PLAYER2_CONTROLS, name="Player 2")
            player3 = Snake(GREEN, (GRID_WIDTH // 2, 5), (0, 1), PLAYER3_CONTROLS, name="Player 3")
            players.extend([player1, player2, player3])
            foods = []
            while len(foods) < MAX_FOOD:
                foods.append(get_random_food_position_multi(players, foods))
        elif mode == 4:
            # 2 Players + AI Bot.
            player1 = Snake(BLUE, (5, GRID_HEIGHT // 2), (1, 0), PLAYER1_CONTROLS, name="Player 1")
            player2 = Snake(ORANGE, (GRID_WIDTH - 6, GRID_HEIGHT // 2), (-1, 0), PLAYER2_CONTROLS, name="Player 2")
            bot = Snake(GREEN, (GRID_WIDTH // 2, 5), (0, 1), {}, name="Bot")
            players.extend([player1, player2, bot])
            foods = []
            while len(foods) < MAX_FOOD:
                foods.append(get_random_food_position_multi(players, foods))

        game_over = False
        winner_text = ""

        while not game_over:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    return
                if event.type == pygame.KEYDOWN:
                    # For human-controlled snakes only.
                    if mode in (1, 2, 3):
                        for snake in players:
                            if snake.controls and event.key in snake.controls:
                                snake.change_direction(event.key)
                    elif mode == 4:
                        # For 2 players + Bot, process human keys.
                        for snake in players:
                            if snake.name != "Bot" and snake.controls and event.key in snake.controls:
                                snake.change_direction(event.key)

            # For mode 4, update bot decision.
            if mode == 4:
                for snake in players:
                    if snake.name == "Bot" and snake.alive:
                        new_dir = bot_decision(snake, foods, players)
                        snake.direction = new_dir

            # Move snakes (only if alive).
            for snake in players:
                if snake.alive:
                    snake.move()

            # Handle food collisions.
            foods_to_remove = []
            if mode == 1:
                for food in foods:
                    if players[0].positions[-1] == food:
                        players[0].length += 1
                        foods_to_remove.append(food)
                for food in foods_to_remove:
                    foods.remove(food)
                while len(foods) < MAX_FOOD:
                    foods.append(get_random_food_position_single(players[0], foods))
            else:
                for food in foods:
                    for snake in players:
                        if snake.alive and snake.positions[-1] == food:
                            snake.length += 1
                            if food not in foods_to_remove:
                                foods_to_remove.append(food)
                for food in foods_to_remove:
                    foods.remove(food)
                while len(foods) < MAX_FOOD:
                    foods.append(get_random_food_position_multi(players, foods))

            # Check collisions.
            if mode == 1:
                if check_collision_single(players[0]):
                    game_over = True
                    winner_text = "Game Over"
            else:
                for snake in players:
                    if snake.alive and check_collision_multi(snake, players):
                        snake.alive = False
                alive = [snake for snake in players if snake.alive]
                if len(alive) <= 1:
                    game_over = True
                    if len(alive) == 1:
                        winner_text = alive[0].name + " Wins!"
                    else:
                        winner_text = "Draw!"

            # Drawing.
            screen.fill(BG_COLOR)
            for snake in players:
                snake.draw(screen, BLOCK_SIZE)
            for food in foods:
                center = (food[0] * BLOCK_SIZE + BLOCK_SIZE // 2,
                          food[1] * BLOCK_SIZE + BLOCK_SIZE // 2)
                pygame.draw.circle(screen, FOOD_COLOR, center, BLOCK_SIZE // 3)
            pygame.display.flip()

            clock.tick(5)

        # Game over screen.
        screen.fill(BG_COLOR)
        game_over_surface = font.render(winner_text, True, (255, 255, 255))
        restart_surface = font.render("Press Enter to Restart", True, (255, 255, 255))
        screen.blit(game_over_surface, game_over_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 40)))
        screen.blit(restart_surface, restart_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 40)))
        pygame.display.flip()

        # Wait for Enter key to restart.
        waiting = True
        while waiting:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    return
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_RETURN:
                        waiting = False
            clock.tick(10)


if __name__ == '__main__':
    main()
