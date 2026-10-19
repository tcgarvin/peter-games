// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/pirates.js';
import { PlayerInput } from '../shell/controls.js';

function botDrivenInput(game) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample() {
      players.forEach((p, i) => {
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function humanInput() {
  const players = [new PlayerInput(), new PlayerInput()];
  return { players, player: (i) => players[i] };
}

test('two CPU captains finish a battle with a winner, without fleeing', () => {
  for (let round = 0; round < 10; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 3) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^(PLAYER [12] WINS|BOTH SHIPS SUNK)$/);
    assert.ok(!game.ships.some((s) => s.fled), 'a CPU captain sailed off the map');
  }
});

test('a CPU captain sinks a human who just drifts', () => {
  const game = createGame({ bots: [false, true] });
  const input = humanInput();
  // Drop the sails so the human doesn't simply flee off the east edge.
  input.players[0].apply(0, 1, {});
  input.players[1].apply(0, 0, {});
  game.update(input);
  let ticks = 0;
  while (!game.over && ticks < 60 * 60 * 2) {
    input.players[0].apply(0, 0, {});
    const bot = game.botInput(1);
    input.players[1].apply(bot.x, bot.y, bot.buttons);
    game.update(input);
    ticks++;
  }
  assert.equal(game.resultText, 'PLAYER 2 WINS');
});

test('the stick steps the sails one notch per push', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const ship = game.ships[0];
  assert.equal(ship.sail, 1);
  input.players[0].apply(0, -1, {}); // up raises
  game.update(input);
  assert.equal(ship.sail, 2);
  input.players[0].apply(0, 0, {});
  game.update(input);
  for (let i = 0; i < 2; i++) {
    input.players[0].apply(0, 1, {}); // down lowers
    game.update(input);
    input.players[0].apply(0, 0, {});
    game.update(input);
  }
  assert.equal(ship.sail, 0);
  input.players[0].apply(0, 1, {});
  game.update(input);
  assert.equal(ship.sail, 0, 'sails stop at NONE');
});

test('PORT fires out of the left side, STARBOARD out of the right, each with its own reload', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const ship = game.ships[0]; // heading east, so port is north (up) and starboard south
  input.players[0].apply(0, 0, { fire: true });
  game.update(input);
  assert.equal(game.cannonballs.length, 3);
  for (const ball of game.cannonballs) {
    assert.ok(ball.vy < -2, 'port balls fly north');
    assert.ok(ball.y < ship.y, 'port balls start on the port rail');
  }
  input.players[0].apply(0, 0, {});
  game.update(input);
  input.players[0].apply(0, 0, { fire: true, fire2: true });
  game.update(input);
  assert.equal(game.cannonballs.length, 6, 'port is reloading, starboard fires');
  assert.equal(game.cannonballs.filter((b) => b.vy > 2).length, 3);
});

test('three balls from a broadside hit for three damage; sailing off the map loses', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const [red, blue] = game.ships;
  for (const ship of game.ships) ship.sail = 0; // all but stopped
  blue.x = red.x;
  blue.y = red.y + 100; // abeam to starboard
  blue.angle = 0;
  input.players[0].apply(0, 0, { fire2: true });
  for (let i = 0; i < 80; i++) {
    game.update(input);
    input.players[0].apply(0, 0, {});
  }
  assert.equal(blue.hp, 2);

  red.x = 2;
  red.angle = 180; // facing the west edge
  red.vx = -2;
  for (let i = 0; i < 10 && !game.over; i++) game.update(input);
  assert.ok(game.over);
  assert.equal(game.resultText, 'P1 FLED  P2 WINS');
});
