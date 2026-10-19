// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/artillery.js';
import { PlayerInput } from '../shell/controls.js';

function botDrivenInput(game) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    players,
    sample() {
      players.forEach((p, i) => {
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

test('two CPU gunners finish a game with a winner', () => {
  for (let round = 0; round < 5; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 5) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^PLAYER [12] WINS$/);
  }
});

test('holding the stick steps power once, then repeats', () => {
  const game = createGame({ bots: [false, false] });
  const input = { player: () => p };
  const p = new PlayerInput();
  const startPower = game.cannons[0].power;
  p.apply(0, -1, {});
  game.update(input);
  assert.equal(game.cannons[0].power, startPower + 5);
  for (let i = 0; i < 10; i++) {
    p.apply(0, -1, {});
    game.update(input);
  }
  assert.equal(game.cannons[0].power, startPower + 5, 'no repeat before the delay');
});

test('a player who hits their own cannon loses', () => {
  const game = createGame({ bots: [false, false] });
  const shooter = game.cannons[0];
  game.projectile = shooter.fire(90, 30); // straight up, comes back down on itself
  const idle = { player: () => new PlayerInput() };
  for (let i = 0; i < 600 && !game.over; i++) game.update(idle);
  assert.ok(game.over);
  assert.equal(game.winner, 1);
});
