# Orcs Must Die - 2D

A 2D, top-down version of "Orcs Must Die" for 2 players. This is a simplified version focusing on the core gameplay elements, where players cooperatively defend an objective from waves of enemies.

## Game Overview

- **Objective**: Defend the central point from waves of enemies
- **Multiplayer**: Two players with different controls work together
- **Combat**: Each player has a melee attack that damages enemies in range
- **Enemies**: Waves of enemies with different types (basic, fast, tank)
- **Scoring**: Earn points for defeating enemies

## Controls

### Player 1
- **Movement**: WASD keys
- **Attack**: Space bar

### Player 2
- **Movement**: Arrow keys
- **Attack**: Right Ctrl

### General
- **Start Game**: Enter
- **Pause/Resume**: P
- **Restart (after game over)**: R
- **Quit**: Escape

## Enemy Types

- **Basic** (Red): Balanced stats
- **Fast** (Yellow): Quick but weaker
- **Tank** (Purple): Slow but tough

## Installation

1. Ensure you have Python 3.8+ and pygame installed:
```
uv add pygame
```

2. Run the game:
```
uv run python main.py
```

## Future Plans

Future versions will add:
- Trap placement mechanics
- More enemy types
- Level selection
- Power-ups
- Sound effects