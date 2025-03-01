# Spacewar Game

A classic arcade-style space game featuring player and AI ships battling in an asteroid field.

## Features

- Player-controlled ship using arrow keys
- Multiple AI-controlled ships with asteroid avoidance behaviors
- Asteroid field with different sized asteroids that break apart when hit
- Physics-based movement with momentum in frictionless space
- Competitive gameplay where ships can destroy each other
- Realistic collision detection and screen wrapping

## How to Run

```bash
cd spacewar
uv add pygame
uv run python spacewar.py
```

## Controls

- **Arrow Keys**: Control your ship
  - ↑ (Up Arrow): Apply thrust
  - ← (Left Arrow): Rotate counterclockwise
  - → (Right Arrow): Rotate clockwise
- **R**: Restart the game
- **ESC**: Quit the game

## Game Design

The game features a player ship and AI ships navigating through asteroid fields. All ships use physics-based movement in a frictionless space environment with momentum and screen wrapping.

AI ships use sophisticated behaviors:
- **Cruise Mode**: Normal navigation when no threats are nearby
- **Avoid Mode**: Careful maneuvering to avoid approaching asteroids
- **Evade Mode**: Emergency evasive action when collision is imminent

The last ship surviving wins the game. Asteroids break into smaller pieces when hit, creating increasingly complex environments as the game progresses.

## Future Enhancements

- Weapon systems for ships
- Power-ups and special abilities
- Multiple game modes
- More advanced AI behaviors and tactics
- Visual effects and sound