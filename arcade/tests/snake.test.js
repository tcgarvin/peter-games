// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/snake.js';
import { PlayerInput } from '../shell/controls.js';

const MAX_DEMO_TICKS = 60 * 60 * 4; // the attract demo must end within a few minutes

function botDrivenInput(game, bots) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample(human = {}) {
      players.forEach((p, i) => {
        const control = bots[i] ? game.botInput(i) : (human[i] ?? { x: 0, y: 0, buttons: {} });
        p.apply(control.x, control.y, control.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function idleInput() {
  const players = [new PlayerInput(), new PlayerInput()];
  return { players, player: (i) => players[i] };
}

function runUntilOver(game, input, limit, human) {
  let ticks = 0;
  while (!game.over && ticks < limit) {
    input.sample(human);
    game.update(input);
    ticks++;
  }
  return ticks;
}

test('two CPU snakes finish the attract demo with a result', () => {
  const lengths = [];
  for (let round = 0; round < 8; round++) {
    const game = createGame({ bots: [true, true] });
    const ticks = runUntilOver(game, botDrivenInput(game, [true, true]), MAX_DEMO_TICKS);
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^(CPU [12] WINS|DRAW)$/);
    lengths.push(Math.max(...game.snakes.map((s) => s.length)));
  }
  assert.ok(Math.max(...lengths) > 6, `CPU snakes should eat: ${lengths}`);
});

test('the CPU outlasts a player who never steers', () => {
  let cpuWins = 0;
  for (let round = 0; round < 6; round++) {
    const game = createGame({ bots: [false, true] });
    runUntilOver(game, botDrivenInput(game, [false, true]), 60 * 60);
    assert.ok(game.over);
    assert.equal(game.snakes.length, 2, '1-player mode has no third snake');
    if (game.resultText === 'CPU WINS') cpuWins++;
  }
  // The CPU's occasional careless slip may rarely kill it first, but not often.
  assert.ok(cpuWins >= 5, `CPU won only ${cpuWins} of 6`);
});

test('two players get the green bot snake as a third rival', () => {
  const game = createGame({ bots: [false, false] });
  assert.equal(game.snakes.length, 3);
  assert.throws(() => game.botInput(0));
});

test('a snake moves one cell every 12 ticks, twice as fast with TURBO', () => {
  const game = createGame({ bots: [false, false] });
  const input = idleInput();
  const [p1, p2] = game.snakes;
  const startX = p1.head[0];
  for (let i = 0; i < 24; i++) {
    input.players[0].apply(0, 0, {});
    input.players[1].apply(0, 0, { fire: true });
    game.update(input);
  }
  assert.equal(p1.head[0], startX + 2);
  assert.equal(p2.head[0], 54 - 4);
});

test('holding the stick turns the snake, but never straight back on itself', () => {
  const game = createGame({ bots: [false, false] });
  const input = idleInput();
  const p1 = game.snakes[0];
  for (let i = 0; i < 12; i++) {
    input.players[0].apply(-1, 0, {}); // reverse: ignored
    game.update(input);
  }
  assert.deepEqual(p1.direction, [1, 0]);
  for (let i = 0; i < 12; i++) {
    input.players[0].apply(0, -1, {});
    game.update(input);
  }
  assert.deepEqual(p1.direction, [0, -1]);
  assert.ok(p1.alive);
});

test('a quick up-then-left within one step is a U-turn, not a reversal into the neck', () => {
  const game = createGame({ bots: [false, false] });
  const input = idleInput();
  const p1 = game.snakes[0];
  const [hx, hy] = p1.head;
  input.players[0].apply(0, -1, {});
  game.update(input);
  input.players[0].apply(-1, 0, {});
  game.update(input);
  for (let i = 0; i < 22; i++) {
    input.players[0].apply(0, 0, {});
    game.update(input);
  }
  assert.ok(p1.alive);
  assert.deepEqual(p1.head, [hx - 1, hy - 1]);
});

test('a head-on collision kills both snakes and is a draw', () => {
  const game = createGame({ bots: [false, false] });
  game.snakes[2].alive = false; // keep the green bot out of it
  game.foods = [];
  const input = idleInput();
  let ticks = 0;
  while (!game.over && ticks < 60 * 60) {
    game.update(input);
    ticks++;
  }
  // The snakes start on the same row facing each other.
  assert.equal(game.resultText, 'DRAW');
  assert.ok(!game.snakes[0].alive && !game.snakes[1].alive);
});

test('eating food grows the snake by one', () => {
  const game = createGame({ bots: [false, false] });
  const input = idleInput();
  const p1 = game.snakes[0];
  const [hx, hy] = p1.head;
  game.foods[0] = [hx + 1, hy];
  for (let i = 0; i < 12; i++) game.update(input);
  assert.equal(p1.length, 4);
  assert.equal(game.foods.length, 5);
});
