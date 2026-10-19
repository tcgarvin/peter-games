// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/army.js';
import { PlayerInput } from '../shell/controls.js';

function botDrivenInput(game, bots) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    players,
    sample() {
      players.forEach((p, i) => {
        if (!bots[i]) return p.apply(0, 0, {});
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function humanInput() {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    players,
    /** One tick with player 1's controls set as given; player 2 idle. */
    step(game, x, y, buttons = {}) {
      players[0].apply(x, y, buttons);
      players[1].apply(0, 0, {});
      game.update(this);
    },
    player: (i) => players[i],
  };
}

test('two CPU armies fight to a finish with a winner', () => {
  for (let round = 0; round < 5; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game, [true, true]);
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 5) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^(RED|BLUE) ARMY WINS$/);
  }
});

test('the CPU beats an army that never moves', () => {
  const game = createGame({ bots: [false, true] });
  const input = botDrivenInput(game, [false, true]);
  for (let i = 0; i < 60 * 60 * 5 && !game.over; i++) {
    input.sample();
    game.update(input);
  }
  assert.equal(game.resultText, 'BLUE ARMY WINS');
  assert.throws(() => game.botInput(0));
});

test('the stick marches only the commanded regiment, relative to its facing', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const [first, second] = game.armies[0].regiments;
  const start = [first.x, second.x];
  for (let i = 0; i < 100; i++) input.step(game, 0, -1);
  assert.equal(first.x, start[0] + 50, 'advances 0.5 per tick, facing right');
  assert.equal(second.x, start[1]);
  for (let i = 0; i < 100; i++) input.step(game, 1, 0);
  assert.ok(Math.abs(first.angle - 40) < 1e-9, 'wheels right 0.4 degrees per tick');
  input.step(game, 0, 0);
  const x = first.x;
  input.step(game, 0, 0);
  assert.equal(first.x, x, 'releasing the stick halts it');
});

test('NEXT passes command on and the last order stands', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const army = game.armies[0];
  const [first, second] = army.regiments;
  input.step(game, 0, -1);
  input.step(game, 0, -1, { fire2: true });
  assert.equal(army.selected, 1);
  const x = first.x;
  input.step(game, 0, 0);
  input.step(game, 0, 0);
  assert.equal(first.x, x + 1, 'the first regiment keeps marching');
  assert.equal(second.order, 'hold');
  // Destroyed regiments are skipped.
  army.regiments[2].takeDamage(1000);
  input.step(game, 0, 0, { fire2: true });
  assert.equal(army.selected, 0);
});

test('VOLLEY makes ready, fires once loaded, and the regiment must then stand', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  const reg = game.armies[0].regiments[0];
  input.step(game, 0, -1); // marching resets the make-ready time
  input.step(game, 0, 0, { fire: true });
  let ticks = 1;
  while (game.armies[0].shotsFired === 0 && ticks < 100) {
    input.step(game, 0, 0);
    ticks++;
  }
  assert.equal(ticks, 45, 'fires after standing for SETUP_TIME');
  assert.equal(game.armies[0].shotsFired, 10);
  const x = reg.x;
  for (let i = 0; i < 30; i++) input.step(game, 0, -1);
  assert.equal(reg.x, x, 'cannot march while recovering from the volley');
});
