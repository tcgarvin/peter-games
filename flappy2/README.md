# 2-Player Flappy Bird

A two-player version of the classic Flappy Bird game built with Python and Pygame.

## Game Instructions

### Setup
1. Make sure you have Python installed
2. Install dependencies: `uv venv && uv pip install pygame`
3. Run the game: `uv run python flappy_2player.py`

### Controls
- **Player 1 (Red Bird)**: Press `W` to flap
- **Player 2 (Blue Bird)**: Press `Up Arrow` to flap
- **Pause Game**: Press `P` during gameplay
- **Start Game**: Press `Space` at the start screen
- **Restart Game**: Press `R` at the game over screen
- **Quit Game**: Press `Q` at the pause or game over screen

### Gameplay
- Both players navigate through the same set of pipes
- Each pipe successfully passed earns 1 point
- If a player collides with a pipe or hits the ground, they crash with an explosion
- The game ends immediately when any player crashes
- The surviving player wins automatically
- If both players crash simultaneously, the player with more points wins

## Features
- 2-player simultaneous gameplay
- Clear controls display at game start
- 3-second countdown before gameplay begins
- Pause functionality with on-screen instructions
- Score tracking for each player
- Game ends as soon as a player crashes
- Spectacular explosion effect when a player crashes
- Game over screen with winner announcement and reason for winning
- Restart functionality