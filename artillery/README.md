# Artillery Game

A classic artillery-style game inspired by games like Gorillas and Scorched Earth.

## Gameplay

- Two players take turns firing cannons at each other
- Use arrow keys to adjust angle and power
- Press spacebar to fire
- One hit defeats an opponent
- Random terrain is generated for each game

## Controls

- **Left/Right**: Adjust firing angle
- **Up/Down**: Adjust firing power
- **Spacebar**: Fire cannon
- **R**: Restart the game (after game over)
- **ESC**: Exit the game at any time

## Running the Game

```bash
# From the project root
cd artillery && uv add pygame
uv run python artillery.py
```