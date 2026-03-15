# Spacewar Web

Browser-based Three.js port of the Spacewar delivery game with neon glow and particle effects.

## Run

```bash
cd spacewar-web && python3 -m http.server 8000 &
```

Then open http://localhost:8000

## Controls

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Thrust | ↑ | W |
| Rotate left | ← | A |
| Rotate right | → | D |
| Restart | R | R |
| Menu | ESC | ESC |

## Gameplay

- Slow down inside orange **PICKUP** zones to collect cargo
- Deliver to magenta **DROPOFF** zones to earn credits
- First ship to **5 credits** wins
- Avoid asteroids — collision destroys your ship
- 0, 1, or 2 player modes (remaining slots filled with AI)
