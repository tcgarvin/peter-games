# Art brief: PIRATES cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/pirates/slice.json`.

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

The game, PIRATES: a top-down naval battle between two wooden sailing ships on a dark blue
ocean with rolling light-blue wave lines, four round brown wooden ports at the edges of the sea.
Each captain steers their ship, raises or lowers the sails (none / half / full) to control speed,
and fires broadsides of three black cannonballs out of the left (PORT) or right (STARBOARD) side
of the ship. Five hits sink a ship; sailing off the edge of the sea means fleeing the battle and
losing. Player 1 is the RED ship (starts on the left), Player 2 is the BLUE ship (starts on the
right). 2 players at once, or 1 player vs a CPU captain.

Control panel (two-player, P1 on the left, P2 on the right), each player has:
- one ball-top joystick: left/right = TURN (steer the ship), up/down = SAILS (raise / lower)
- two buttons side by side: the left one labelled "PORT", the right one labelled "STARBOARD"
  (fire the left-side and right-side broadside)
- shared, in the middle: a "1 PLAYER" start button and a "2 PLAYER" start button
That is 2 joysticks and 6 buttons in total. Design the art around each control for this game
(nautical / pirate motifs: ship's wheel, brass, rope, weathered planks, compass rose, cannons,
Jolly Roger; red and blue colour coding for the two players; whatever you think is best). Text
in the art is welcome; spell it exactly. Every control must be clearly visible, separate from the
others, and large enough to press with a thumb on a phone. Keep each player's PORT and STARBOARD
buttons well apart from each other and from the joystick.

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 4:3 aspect ratio
  (width:height = 4:3, landscape monitor) and nothing drawn in it. The live game will be drawn
  over it. Make it as large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title PIRATES at top, screen in the middle, control panel below.
   Both joysticks upright/centered, all buttons up.
B. Edit of A: both joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: both joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: both joysticks tilted LEFT. Change nothing else.
E. Edit of A: both joysticks tilted RIGHT. Change nothing else.
F. Edit of A: all six buttons (both PORT, both STARBOARD and both start buttons) pressed in,
   lit up. Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   screen must be as large as possible and centered; the controls flank it: P1 joystick + PORT +
   STARBOARD to the left of the screen, P2 joystick + PORT + STARBOARD to the right, start
   buttons wherever they fit (for example under the side controls). A short marquee strip is
   fine. Same visual design as A.
H. to L. Edits of G, exactly like B to F: both sticks UP, DOWN, LEFT, RIGHT, then all buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
