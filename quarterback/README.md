# Quarterback Simulator

A side-scrolling quarterback simulator game built with pygame.

## Features

- **Running**: Control the quarterback with arrow keys or A/D
- **Jumping**: Press spacebar to jump over defenders
- **Throwing**: Hold F to charge your throw (watch the parabola grow!), release to throw
- **Football Rules**:
  - 4 downs to score a touchdown
  - Tackling only ends the play if the ball carrier is tackled
  - Incomplete passes end the down
  - Defenders chase whoever has the ball (QB or WR)
  - Score touchdowns in the endzone at the right side of the screen
  - Turnover on downs after 4th down

## Installation

This project uses `uv` for package management:

```bash
uv sync
```

## Running the Game

```bash
uv run python game.py
```

## Controls

- **Arrow Keys** or **A/D**: Move left/right
- **Space**: Jump
- **Hold F**: Charge throw power (release to throw)
- **R**: Restart after being tackled or scoring

## Gameplay

- You have 4 downs to reach the endzone and score a touchdown
- **Control switches automatically**: Yellow dot shows who you're controlling
  - Start with QB control
  - After WR catches, control switches to WR
- Avoid the red defenders (D) who chase whoever has the ball
- **As QB**: Hold F to charge your throw - a yellow parabola arc shows the trajectory (oscillates!)
  - The longer you hold, the farther the ball will go (up to max, then back down)
  - Release F to launch the ball along the arc
- Throw the ball to your blue receiver (WR) who runs a route automatically
- **As WR**: Once you catch the ball, run to the endzone!
  - Defenders will now chase you
  - Use arrow keys to dodge and reach the endzone
- Get the ball carrier to the blue endzone on the right side of the screen
- Each touchdown scores 6 points
- Getting tackled or incomplete pass ends the down - press R for next down
- After 4 downs without scoring, it's turnover on downs (game over)

## Game Objects

- **QB** (Blue): You control the quarterback
- **WR** (Blue): Your receiver running a route
- **D** (Red): Defenders trying to tackle you
- **Yellow ball**: Throw it to complete passes!

Good luck!
