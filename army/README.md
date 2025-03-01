# Army Battle Simulation

A tactical battle simulation between two AI-controlled armies, created with Claude.

## How to Run

```bash
cd army
uv run python army.py
```

## Game Description

Two AI opponents command three regiments each (red vs. blue). The AI players maneuver their regiments and fire volleys at enemy regiments to destroy them. Game ends when all regiments of one color are destroyed.

## Controls & Features

- **Q/ESC**: Quit the game
- **D**: Toggle debug mode (shows aiming/reloading status)
- **SPACE**: Restart after game over
- **1/2/3**: Change simulation speed (1x, 2x, 3x)

## Game Mechanics

- Each regiment is represented as a colored rectangle
- Regiments can move forward/backward and wheel left/right
- Regiments fire volleys of bullets from their front line (long edge)
- Tactical firing mechanics:
  - Regiment must be stationary for a period before it can fire (aiming)
  - Regiment cannot move for a period after firing (recovery)
  - Volleys consist of multiple bullets fired with slight variations in timing and direction
- Status indicators show when regiments are:
  - AIMING: Getting ready to fire
  - READY: Can fire immediately
  - RELOADING: Cooling down after firing
- The game ends when all regiments of one team are destroyed

## AI Behavior

Each AI controls its regiments independently:
- Targets the closest enemy regiment
- Maneuvers to optimal firing positions
- Stops to aim when in a good position
- Fires volleys when properly aimed and in range
- Maintains tactical spacing
- Recovers position after firing