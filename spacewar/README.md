# Spacewar Delivery Game

A space delivery game where players navigate through asteroid fields to collect and deliver cargo.

## Features

- Choose between 0, 1, or 2 player modes
- Player-controlled ships with different control schemes
- AI-controlled ships with sophisticated avoidance and delivery behaviors
- Asteroid field with different sized asteroids that break apart when hit
- Physics-based movement with momentum in frictionless space
- Delivery gameplay with pickup and dropoff zones
- Earn credits by successfully delivering cargo
- First ship to earn 5 credits wins the game
- Realistic collision detection and screen wrapping

## How to Run

```bash
cd spacewar
uv add pygame
uv run python spacewar.py
```

## Controls

### Menu Controls
- **Arrow Keys**: Navigate menu options
- **Enter**: Select option and start game
- **ESC**: Quit the game

### Game Controls
- **Player 1**: Arrow Keys
  - ↑ (Up Arrow): Apply thrust
  - ← (Left Arrow): Rotate counterclockwise
  - → (Right Arrow): Rotate clockwise
- **Player 2**: WASD Keys
  - W: Apply thrust
  - A: Rotate counterclockwise
  - D: Rotate clockwise
- **R**: Restart the current game
- **ESC**: Return to main menu

## Game Design

The game features player ships and AI ships navigating through asteroid fields to collect and deliver cargo. All ships use physics-based movement in a frictionless space environment with momentum and screen wrapping.

### Delivery Gameplay
- **Pickup Zones** (orange): Slow down inside to collect cargo
- **Dropoff Zones** (purple): Deliver cargo to earn credits
- **Win Condition**: First ship to earn 5 credits wins
- Ships carrying cargo display a red dot in their center
- Credit count is displayed above each ship

### AI Behaviors
AI ships use sophisticated behaviors:
- **Cruise Mode**: Normal navigation when no threats are nearby
- **Avoid Mode**: Careful maneuvering to avoid approaching asteroids
- **Evade Mode**: Emergency evasive action when collision is imminent
- **Pickup Mode**: Approach pickup zones and slow down to collect cargo
- **Dropoff Mode**: Navigate to dropoff zones to deliver cargo

Asteroids break into smaller pieces when hit, creating increasingly complex environments as the game progresses.

## Future Enhancements

- Weapon systems for ships
- Different types of cargo with varying values
- Hazardous cargo that requires careful handling
- Time-limited delivery missions with bonuses
- Multiple game modes (race, survival, team delivery)
- Special abilities and power-ups to help with deliveries
- Ship upgrades using earned credits
- More advanced AI behaviors and tactics
- Visual effects and sound