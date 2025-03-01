# CLAUDE.md - Peter's Games Codebase Guide

## Project Structure
Each game in this repository is a standalone project. All commands should be run from within each game's directory, not from the root folder. Further instructions for each game can be found in their respective README.md files.

## Build & Run Commands
For each game directory:
- Install dependencies: `cd [game-dir] && uv add pygame` (no need to run `uv venv` or `uv pip install`)
- Run games:
  - Flappy Bird: `cd flappy2 && uv run python flappy_2player.py`
  - Monster Slicing: `cd slicing && uv run python run_game.py`
  - Snake: `cd snake && uv run python snake.py`

## Code Style Guidelines
- **Imports**: Standard library first, then third-party packages
- **Naming**: snake_case for variables/functions, PascalCase for classes, UPPER_CASE for constants
- **Type Hints**: Used in slicing game but optional in other projects
- **Layout**: Game constants at top, class definitions, helper functions, then main game loop
- **Main Pattern**: Use `if __name__ == "__main__": main()` guard pattern
- **Constants**: Define color constants and game parameters at the top of files
- **Object-Oriented**: Use classes to represent game entities (Player, Monster, etc.)

## Error Handling
Minimal try/except blocks; generally let errors propagate in game code