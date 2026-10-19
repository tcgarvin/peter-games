# Art brief: ORCS MUST DIE - 2D cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/omd/slice.json`.

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

The game, ORCS MUST DIE - 2D: a top-down co-op fortress-defence game. A glowing orange rift /
objective sits in the middle of a dark stone dungeon maze with brown rock walls. Waves of orcs
pour in from gates on all four sides and march on the objective: red orcs (basic), small yellow
orcs (fast) and big purple orcs (tanks). Two heroes run through the maze swinging melee attacks
to cut the orcs down before they smash the objective. Player 1 is the BLUE hero, Player 2 is the
GREEN hero. Waves keep getting bigger; the score is how many waves you survive. 2 players co-op,
or 1 player with a CPU partner. A war-camp / fortress-gate / medieval-fantasy theme with orc
banners, battle axes, iron studs, torches would suit it, but the design is yours.

Control panel (two-player, P1 on the left, P2 on the right):
- Player 1 (BLUE): one ball-top joystick (MOVE, 8 directions) and one ATTACK button
- Player 2 (GREEN): one ball-top joystick (MOVE, 8 directions) and one ATTACK button
- shared: a "1 PLAYER" start button and a "2 PLAYER" start button
Colour-code each player's side (blue for P1, green for P2). Text in the art is welcome; spell it
exactly (ORCS MUST DIE - 2D, MOVE, ATTACK, 1 PLAYER, 2 PLAYER). Every control must be clearly
visible, separate from the others, and large enough to press with a thumb on a phone.

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 5:4 aspect ratio
  (width:height = 5:4, i.e. 1.25 times as wide as it is tall) and nothing drawn in it. The live
  game will be drawn over it. Make it as large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title ORCS MUST DIE - 2D at top, screen in the middle, control
   panel below. Both joysticks upright/centered, all buttons up.
B. Edit of A: both joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: both joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: both joysticks tilted LEFT. Change nothing else.
E. Edit of A: both joysticks tilted RIGHT. Change nothing else.
F. Edit of A: all four buttons (both ATTACK buttons and both start buttons) pressed in, lit up.
   Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   5:4 screen must be as large as possible and centered; the controls flank it: P1 joystick +
   ATTACK to the left of the screen, P2 joystick + ATTACK to the right, start buttons wherever
   they fit (for example under the side controls). A short marquee strip is fine. Same visual
   design as A.
H. to L. Edits of G, exactly like B to F: both sticks UP, DOWN, LEFT, RIGHT, then all buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
