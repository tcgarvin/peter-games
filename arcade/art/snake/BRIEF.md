# Art brief: SNAKE cabinet

The exact prompt given to `codex exec -s read-only` (image tool only), Codex session
01a15048-00e3-7a21-a757-157be5f57caa. Codex re-rendered each base once to correct it (the first
drafts were discarded); the final A-L were copied into `src/` and cut into sprites with
`uv run --script tools/slice_cabinet.py art/snake/slice.json`. The portrait screen opening came
out 828x784 rather than square, so the 821x821 screen overlaps the thin dark bezel above it
slightly; that reads fine through the CRT.

---

You have no working shell in this session (the sandbox cannot start), and you do not need one.
Use ONLY your built-in image generation tool (generate and edit). Do not try to read or write
files. The images are collected automatically from where your tool saves them.

## What you are designing

Arcade cabinet art for one game in "Peter's Arcade", small games played in a web browser inside
a skeuomorphic arcade cabinet. The page shows the cabinet filling the viewport; the live game is
drawn (with a CRT shader) over the cabinet's screen, and the joysticks and buttons painted on the
control panel are the real touch controls on phones. Make it look like a real, lovingly made
1980s arcade cabinet for this specific game. You own the visual design.

The game, SNAKE: the classic grid snake game, played head to head. On a pure black playfield,
square-block snakes slither around a 60x60 grid eating red food dots and growing longer. Hit a
wall, your own tail or another snake and you are out; the last snake alive wins. Player 1's
snake is BLUE, Player 2's snake is ORANGE, and a GREEN computer snake sometimes joins in.
Food is small bright RED dots. Simple, bold, blocky, neon-on-black. 2 players head to head, or
1 player vs a CPU snake.

Control panel (two-player, P1 on the left, P2 on the right):
- each player: one ball-top joystick (4-way: steers the snake up / down / left / right) and one
  button labeled TURBO (hold it to make your snake go faster)
- shared: a "1 PLAYER" start button and a "2 PLAYER" start button
Design the art around each control for this game (for example a BLUE theme on P1's side and an
ORANGE theme on P2's side, 4-way gate plates, snake/serpent motifs, whatever you think is best).
Text in the art is welcome; spell it exactly (SNAKE, TURBO, 1 PLAYER, 2 PLAYER). Every control
must be clearly visible, separate from the others, and large enough to press with a thumb on a
phone.

Hard requirements for every image:
- The screen area is a flat, plain, near-black SQUARE with an exact 1:1 aspect ratio and
  nothing drawn in it. The live game will be drawn over it. Make it as large as the composition
  allows.
- Seen straight on, no perspective tilt, so the screen is a true square.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title SNAKE at top, the square screen in the middle, control panel
   below. Both joysticks upright/centered, all buttons up.
B. Edit of A: both joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: both joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: both joysticks tilted LEFT. Change nothing else.
E. Edit of A: both joysticks tilted RIGHT. Change nothing else.
F. Edit of A: all four buttons (both TURBO buttons and both start buttons) pressed in, lit up.
   Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   square screen must be as large as possible (nearly the full height) and centered; the controls
   flank it: P1 joystick + TURBO to the left of the screen, P2 joystick + TURBO to the right,
   start buttons wherever they fit (for example under the side controls). A short marquee strip
   is fine. Same visual design as A.
H. to L. Edits of G, exactly like B to F: both sticks UP, DOWN, LEFT, RIGHT, then all buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
