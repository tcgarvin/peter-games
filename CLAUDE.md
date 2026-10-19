# CLAUDE.md - Peter's Games Codebase Guide

## Project Structure
Each game in this repository is a standalone project. All commands should be run from within each game's directory, not from the root folder. Further instructions for each game can be found in their respective README.md files.

## Build & Run Commands
For each game directory:
- Install dependencies: `cd [game-dir] && uv add pygame` (no need to run `uv venv` or `uv pip install`)
- Run games:
  - Army: `cd army && uv run python army.py &`
  - Artillery: `cd artillery && uv run python artillery.py &`
  - Flappy Bird: `cd flappy2 && uv run python flappy_2player.py &`
  - Monster Slicing: `cd slicing && uv run python run_game.py &`
  - OMD (Orcs Must Die): `cd omd && uv run python main.py &`
  - Platformer: `cd platformer && uv run python platformer.py &`
  - Pirates: `cd pirates && uv run python pirates.py &`
  - Snake: `cd snake && uv run python snake.py &`
  - Spacewar (pygame): `cd spacewar && uv run python spacewar.py &`
  - Spacewar Web (Three.js): `cd spacewar-web && python3 -m http.server 8000 &` then open http://localhost:8000
  - Racing: `cd racing && uv run --script racing.py &`
  - Arcade (web ports of all the games in cabinets): `cd arcade && python3 -m http.server 8765 &` then open http://localhost:8765 (lobby) or http://localhost:8765/#snake; tests: `cd arcade && npm test`; porting guide: `arcade/PORTING.md`

Note: Always run games in the background (with &), not the foreground. No need to pkill in advance.
Note: Games without a pyproject.toml use inline script metadata and must be run with `uv run --script <file>.py` instead of `uv run python <file>.py`.

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