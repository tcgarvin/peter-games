# Spacewar Game

A classic arcade-style space game featuring ships and asteroids in space combat.

## Features

- Ships controlled by AI (player controls coming soon)
- Asteroid field with different sized asteroids
- Physics-based movement with momentum in space
- Ships with asteroid avoidance AI

## How to Run

```bash
cd spacewar
uv add pygame
uv run python spacewar.py
```

## Controls

- Currently AI-only mode
- Future: WASD/Arrows for movement, Space for firing weapons

## Game Design

The game features ships navigating through asteroid fields. The AI focuses on avoiding collisions with asteroids while maintaining momentum-based movement in a frictionless space environment.

Future versions will include player controls, combat mechanics between ships, and more advanced AI behaviors.