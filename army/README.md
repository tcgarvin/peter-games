# Army Battle Simulation

A tactical battle simulation between two AI-controlled armies in the style of historical line-formation combat. Each team commands three regiments maneuvering for position and firing volleys.

## How to Run

```bash
cd army
uv add pygame  # Only needed first time
uv run python army.py
```

## Game Description

Two AI opponents command three regiments each (red vs. blue). The AI players maneuver their regiments and fire volleys at enemy regiments to destroy them. Game ends when all regiments of one color are destroyed.

## Controls & Features

- **Q/ESC**: Quit the game
- **D**: Toggle debug mode (shows aiming/reloading status and AI decisions)
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

Each regiment has its own AI personality type and behavior:
- **CautiousAI**: Maintains distance, prefers precision and safety
- **AggressiveAI**: Closes in for combat, more unpredictable
- **FlankingAI**: Attempts to position away from allies for crossfire

Each AI:
- Targets the closest enemy regiment
- Maneuvers to optimal firing positions based on personality
- Stops to aim when in a good position
- Fires volleys when properly aimed and in range
- Maintains tactical spacing based on coordination values
- Recovers position after firing

## Technical Details

- Built with Pygame
- Modular architecture with separate components for:
  - Entities (regiments, bullets)
  - AI decision-making
  - Game logic
  - Rendering
- Randomized AI assignment and parameters for replayability

## File Structure

The codebase is organized into several key files:

- **army.py**: Main game file that ties everything together
  - Initializes the game environment and Pygame
  - Creates regiments and assigns random AI personalities
  - Contains the main game loop
  - Coordinates input handling, game logic updates, and rendering

- **entities.py**: Core game entities and mechanics
  - Defines Regiment and Bullet classes
  - Contains movement, firing, and damage mechanics
  - Handles collision detection between bullets and regiments
  - Defines game constants like regiment health and speeds

- **ai.py**: AI decision-making for regiment control
  - Implements different AI personality types (Cautious, Aggressive, Flanking)
  - Controls tactical decision-making based on battlefield conditions
  - Each AI type has different behavior parameters (aggression, caution, coordination)

- **game_logic.py**: Core gameplay systems
  - Processes game events (keyboard input)
  - Updates regiment positions and actions
  - Manages bullet movement and collision detection
  - Checks win conditions and controls game speed

- **rendering.py**: Visual presentation
  - Handles all visual aspects of the game
  - Draws the battlefield, regiments, and bullets
  - Displays UI elements like team status and controls
  - Shows debug information when debug mode is active