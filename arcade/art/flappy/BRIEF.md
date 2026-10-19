# Art brief: FLAPPY cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/flappy/slice.json`.

---

You have no working shell in this session (the sandbox cannot start), and you do not need one.
Use ONLY your built-in image generation tool (generate and edit). Do not try to read or write
files. The images are collected automatically from where your tool saves them.

## What you are designing

Arcade cabinet art for one game in "Peter's Arcade", small games played in a web browser inside
a skeuomorphic arcade cabinet. The page shows the cabinet filling the viewport; the live game is
drawn (with a CRT shader) over the cabinet's screen, and the buttons painted on the control
panel are the real touch controls on phones. Make it look like a real, lovingly made 1980s
arcade cabinet for this specific game. You own the visual design.

The game, FLAPPY: a two-player, head-to-head Flappy Bird race. On a black night-sky screen, two
round birds hover side by side: Player 1 is a RED ball-bird on the left half, Player 2 is a BLUE
ball-bird on the right half, split by a thin white line. Bright GREEN pipes with gaps scroll in
from the right; gravity pulls the birds down and each tap of FLAP gives a hop upward. Thread the
gaps to score. Whoever crashes into a pipe or the ground first explodes in a burst of fire and
loses. 2 players at once, or 1 player vs CPU. Think arcade bird/sky/pipe/feather motifs, but the
theme is yours: make it distinct and cheerful, not a copy of any existing game's branding.

Control panel (two-player, P1 on the left, P2 on the right). There are NO joysticks at all:
- Player 1: one big RED round arcade button labelled "FLAP" (with "P1" or "PLAYER 1" nearby)
- Player 2: one big BLUE round arcade button labelled "FLAP" (with "P2" or "PLAYER 2" nearby)
- shared: a smaller "1 PLAYER" start button and a smaller "2 PLAYER" start button
That is four buttons total; do not add any other buttons, sticks, coin slots on the panel, or
knobs that look pressable. Text in the art is welcome; spell it exactly. Every button must be
clearly visible, well separated from the others, and the FLAP buttons should be large enough to
hammer with a thumb on a phone.

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 4:3 aspect ratio
  (width:height = 4:3, landscape-oriented monitor) and nothing drawn in it. The live game will
  be drawn over it. Make it as large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title FLAPPY at top, screen in the middle, control panel below
   with the two FLAP buttons and the two start buttons. All buttons up (not pressed).
B. Edit of A: all four buttons (both FLAP buttons and both start buttons) pressed in and lit up.
   Change nothing else.

C. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   screen must be as large as possible and centered; the controls flank it: P1's red FLAP button
   to the left of the screen, P2's blue FLAP button to the right, the 1 PLAYER start button
   under the left FLAP and the 2 PLAYER start button under the right FLAP. A short marquee strip
   is fine. Same visual design as A.
D. Edit of C: all four buttons pressed in and lit up, exactly like B. Change nothing else.

For the edits, the pressed buttons must read clearly at phone size: the cap sunk into its bezel,
glowing brighter, with its shadow responding. Keep the rest of the image pixel-identical as far
as you can; only the buttons should change.

When done, list the images in order A to D with one line on each.
