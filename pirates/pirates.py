import sys
import math
import pygame
from entities import (
    Ship, Cannonball, Port,
    SCREEN_WIDTH, SCREEN_HEIGHT, FPS,
    RED, BLUE, WHITE, BLACK, DARK_BLUE, LIGHT_BLUE, YELLOW,
    SAIL_NONE, SAIL_MID, SAIL_FULL
)


def initialize_game():
    ports = [
        Port(SCREEN_WIDTH // 2, 50, "North Port"),
        Port(SCREEN_WIDTH // 2, SCREEN_HEIGHT - 50, "South Port"),
        Port(50, SCREEN_HEIGHT // 2, "West Port"),
        Port(SCREEN_WIDTH - 50, SCREEN_HEIGHT // 2, "East Port")
    ]

    ship1 = Ship(50, SCREEN_HEIGHT // 2, 0, RED, 1)
    ship2 = Ship(SCREEN_WIDTH - 50, SCREEN_HEIGHT // 2, 180, BLUE, 2)

    cannonballs = []

    return [ship1, ship2], ports, cannonballs


def draw_ocean_background(screen: pygame.Surface):
    screen.fill(DARK_BLUE)

    wave_spacing = 40
    wave_offset = (pygame.time.get_ticks() // 50) % wave_spacing

    for y in range(-wave_spacing, SCREEN_HEIGHT + wave_spacing, wave_spacing):
        for x in range(0, SCREEN_WIDTH, 100):
            points = []
            for i in range(100):
                wave_x = x + i
                wave_y = y + wave_offset + math.sin((wave_x + pygame.time.get_ticks() / 100) / 20) * 3
                points.append((wave_x, wave_y))

            if len(points) > 1:
                pygame.draw.lines(screen, LIGHT_BLUE, False, points, 1)


def draw_ui(screen: pygame.Surface, ships: list, font: pygame.font.Font):
    p1_text = font.render(f"P1 HP: {ships[0].hp}/{ships[0].__class__.__bases__[0].__dict__.get('SHIP_MAX_HP', 5)}", True, RED)
    sail_names = ['None', 'Mid', 'Full']
    sail_text_p1 = font.render(f"Sails: {sail_names[ships[0].sail_level]}", True, RED)
    screen.blit(p1_text, (10, 10))
    screen.blit(sail_text_p1, (10, 50))

    p2_text = font.render(f"P2 HP: {ships[1].hp}/{ships[1].__class__.__bases__[0].__dict__.get('SHIP_MAX_HP', 5)}", True, BLUE)
    sail_text_p2 = font.render(f"Sails: {sail_names[ships[1].sail_level]}", True, BLUE)
    screen.blit(p2_text, (SCREEN_WIDTH - 200, 10))
    screen.blit(sail_text_p2, (SCREEN_WIDTH - 200, 50))

    controls_font = pygame.font.SysFont(None, 24)
    p1_controls = controls_font.render("P1: Arrows=Turn/Sails, ,/.=Port/Starboard", True, WHITE)
    p2_controls = controls_font.render("P2: WASD=Turn/Sails, Q/E=Port/Starboard", True, WHITE)
    screen.blit(p1_controls, (10, SCREEN_HEIGHT - 60))
    screen.blit(p2_controls, (10, SCREEN_HEIGHT - 30))


def draw_game_over(screen: pygame.Surface, winner: int, loser_fled: bool, font: pygame.font.Font):
    overlay = pygame.Surface((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    screen.blit(overlay, (0, 0))

    color = RED if winner == 1 else BLUE
    winner_text = font.render(f"Player {winner} Wins!", True, color)

    reason_text = ""
    if loser_fled:
        reason_text = "Opponent fled the battlefield!"
    else:
        reason_text = "Opponent's ship was sunk!"

    reason_surface = pygame.font.SysFont(None, 48).render(reason_text, True, WHITE)
    restart_text = pygame.font.SysFont(None, 36).render("Press R to Restart or ESC to Quit", True, YELLOW)

    winner_rect = winner_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 - 40))
    reason_rect = reason_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 20))
    restart_rect = restart_text.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 100))

    screen.blit(winner_text, winner_rect)
    screen.blit(reason_surface, reason_rect)
    screen.blit(restart_text, restart_rect)


def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Pirate Ship Combat")
    clock = pygame.time.Clock()
    font = pygame.font.SysFont(None, 36)
    large_font = pygame.font.SysFont(None, 72)

    while True:
        ships, ports, cannonballs = initialize_game()

        player_controls = [
            {'rotation': 0, 'sail_change': 0, 'fire_port': False, 'fire_starboard': False},
            {'rotation': 0, 'sail_change': 0, 'fire_port': False, 'fire_starboard': False}
        ]

        running = True
        game_over = False
        winner = None
        loser_fled = False

        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        sys.exit()

                    if game_over and event.key == pygame.K_r:
                        running = False

                    if event.key == pygame.K_LEFT:
                        player_controls[0]['rotation'] = -1
                    elif event.key == pygame.K_RIGHT:
                        player_controls[0]['rotation'] = 1
                    elif event.key == pygame.K_UP:
                        player_controls[0]['sail_change'] = 1
                    elif event.key == pygame.K_DOWN:
                        player_controls[0]['sail_change'] = -1
                    elif event.key == pygame.K_COMMA:
                        player_controls[0]['fire_port'] = True
                    elif event.key == pygame.K_PERIOD:
                        player_controls[0]['fire_starboard'] = True

                    elif event.key == pygame.K_a:
                        player_controls[1]['rotation'] = -1
                    elif event.key == pygame.K_d:
                        player_controls[1]['rotation'] = 1
                    elif event.key == pygame.K_w:
                        player_controls[1]['sail_change'] = 1
                    elif event.key == pygame.K_s:
                        player_controls[1]['sail_change'] = -1
                    elif event.key == pygame.K_q:
                        player_controls[1]['fire_port'] = True
                    elif event.key == pygame.K_e:
                        player_controls[1]['fire_starboard'] = True

                elif event.type == pygame.KEYUP:
                    if event.key == pygame.K_LEFT and player_controls[0]['rotation'] == -1:
                        player_controls[0]['rotation'] = 0
                    elif event.key == pygame.K_RIGHT and player_controls[0]['rotation'] == 1:
                        player_controls[0]['rotation'] = 0
                    elif event.key == pygame.K_UP:
                        player_controls[0]['sail_change'] = 0
                    elif event.key == pygame.K_DOWN:
                        player_controls[0]['sail_change'] = 0

                    elif event.key == pygame.K_a and player_controls[1]['rotation'] == -1:
                        player_controls[1]['rotation'] = 0
                    elif event.key == pygame.K_d and player_controls[1]['rotation'] == 1:
                        player_controls[1]['rotation'] = 0
                    elif event.key == pygame.K_w:
                        player_controls[1]['sail_change'] = 0
                    elif event.key == pygame.K_s:
                        player_controls[1]['sail_change'] = 0

            if not game_over:
                for i, ship in enumerate(ships):
                    if not ship.destroyed:
                        ship.update(player_controls[i]['rotation'],
                                  player_controls[i]['sail_change'])

                        if player_controls[i]['fire_port']:
                            new_balls = ship.fire_broadside("port")
                            cannonballs.extend(new_balls)
                            player_controls[i]['fire_port'] = False

                        if player_controls[i]['fire_starboard']:
                            new_balls = ship.fire_broadside("starboard")
                            cannonballs.extend(new_balls)
                            player_controls[i]['fire_starboard'] = False

                for ball in cannonballs[:]:
                    ball.update()
                    if ball.is_expired():
                        cannonballs.remove(ball)
                    else:
                        for ship in ships:
                            if not ship.destroyed and ball.is_colliding_with_ship(ship):
                                ship.take_damage(1)
                                if ball in cannonballs:
                                    cannonballs.remove(ball)
                                break

                if ships[0].destroyed:
                    game_over = True
                    winner = 2
                    loser_fled = ships[0].fled
                elif ships[1].destroyed:
                    game_over = True
                    winner = 1
                    loser_fled = ships[1].fled

            draw_ocean_background(screen)

            for port in ports:
                port.draw(screen)

            for ball in cannonballs:
                ball.draw(screen)

            for ship in ships:
                ship.draw(screen)

            draw_ui(screen, ships, font)

            if game_over:
                draw_game_over(screen, winner, loser_fled, large_font)

            pygame.display.flip()
            clock.tick(FPS)


if __name__ == "__main__":
    main()
