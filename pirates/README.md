# Pirate Ship Combat

A 2-player top-down pirate ship battle game with physics-based movement and broadside cannon warfare.

## Overview

Command your pirate ship in intense naval combat! Navigate the high seas, manage your sails, and unleash devastating broadsides to sink your opponent. The first captain to reduce their enemy to zero hitpoints claims victory.

## Features

- Physics-based ship movement with realistic drifting
- Three sail settings (None, Mid, Full) for speed control
- Separate port and starboard broadside cannons
- 5 hitpoints per ship with visual health bars
- Detailed ship rendering with dynamic sails
- Animated ocean waves
- Screen-wrapping navigation
- Local 2-player competitive gameplay

## Controls

### Player 1 (Red Ship)
- **LEFT/RIGHT Arrow**: Turn port/starboard
- **UP/DOWN Arrow**: Raise/lower sails
- **Comma (,)**: Fire port broadside (left side)
- **Period (.)**: Fire starboard broadside (right side)

### Player 2 (Blue Ship)
- **A/D**: Turn port/starboard
- **W/S**: Raise/lower sails
- **Q**: Fire port broadside (left side)
- **E**: Fire starboard broadside (right side)

### General Controls
- **ESC**: Quit game
- **R**: Restart game (after game over)

## Gameplay Mechanics

### Sailing
Ships have three sail settings that affect acceleration:
- **No Sails**: Minimal movement, useful for precise positioning
- **Mid Sails**: Moderate speed, good balance of control and mobility
- **Full Sails**: Maximum speed for quick maneuvers or retreats

Ships drift naturally due to inertia, requiring skill to navigate effectively.

### Combat
- Each ship starts with 5 hitpoints
- Cannons fire from the sides of your ship (perpendicular to heading)
- Each broadside fires 3 cannonballs with slight spread
- Cannons have a cooldown period between volleys
- Cannonballs travel slowly enough to be dodged with skillful maneuvering
- Cannonballs expire after 3 seconds or when leaving the screen
- **Fleeing**: Leaving the battlefield (going off any edge of the screen) results in immediate defeat!

### Strategy Tips
- Position your ship's broadside toward your opponent while presenting a smaller target
- Use sail management to control your drift and maintain firing positions
- Time your volleys to catch opponents during turns
- Use the ports for cover or tactical repositioning
- Master the drift to execute tight circles around your opponent

## Starting Positions

- Player 1 (Red) starts at the West Port (left side)
- Player 2 (Blue) starts at the East Port (right side)
- Ships begin facing each other
- Four ports mark the cardinal directions for reference

## Running the Game

```bash
cd pirates && uv run python pirates.py &
```

## Configuration

The game can be tuned by editing `config.json`. You can adjust:

### Sail Acceleration
Control how fast ships accelerate at different sail settings:
- `sail_acceleration.none`: Acceleration with no sails (default: 0.02)
- `sail_acceleration.mid`: Acceleration with mid sails (default: 0.08)
- `sail_acceleration.full`: Acceleration with full sails (default: 0.15)

### Ship Physics
- `ship.rotation_speed`: How fast ships turn in degrees per frame (default: 2.0)
- `ship.drag`: Velocity retention per frame, lower = more drag (default: 0.98)
- `ship.max_velocity`: Maximum ship speed (default: 4.0)

### Cannon Settings
- `cannon.cooldown`: Frames between volleys (default: 90, which is 1.5 seconds at 60 FPS)
- `cannon.speed`: Cannonball velocity (default: 3.0)
- `cannon.lifetime`: Frames before cannonballs expire (default: 180, which is 3 seconds)
- `cannon.broadside_count`: Number of cannonballs per broadside (default: 3)

Example configuration:
```json
{
  "sail_acceleration": {
    "none": 0.02,
    "mid": 0.08,
    "full": 0.15
  },
  "ship": {
    "rotation_speed": 2.0,
    "drag": 0.98,
    "max_velocity": 4.0
  },
  "cannon": {
    "cooldown": 90,
    "speed": 3.0,
    "lifetime": 180,
    "broadside_count": 3
  }
}
```

## Technical Details

- Built with Pygame
- 60 FPS gameplay
- 1200x900 resolution
- Physics constants tuned for balanced gameplay
- Broadside mechanics inspired by historical naval combat

## Code Structure

- `pirates.py`: Main game loop, event handling, and rendering
- `entities.py`: Game entities (Ship, Cannonball, Port) and physics constants

## Victory Conditions

The game ends when one ship is destroyed (reaches 0 HP). The surviving captain is declared the winner!

Press R to start a new battle or ESC to exit.
