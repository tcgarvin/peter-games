// Entry point: the lobby, or a game when the URL names one (#snake, or ?game=snake).

import { runArcade } from './shell/arcade.js';
import { showLobby } from './shell/lobby.js';
import { GAMES } from './games/registry.js';

const ART = './art/';
const host = document.getElementById('arcade');
const id = location.hash.slice(1) || new URLSearchParams(location.search).get('game');

// The shell has no teardown, so switching games reloads the page.
addEventListener('hashchange', () => location.reload());

if (!id) {
  await showLobby(host, ART);
} else {
  if (!GAMES.some((g) => g.id === id)) throw new Error(`Unknown game ${id}`);
  const game = await import(`./games/${id}.js`);
  document.title = `${GAMES.find((g) => g.id === id).title} - Peter's Arcade`;
  const exit = document.createElement('a');
  exit.className = 'arcade-exit';
  exit.href = '#';
  exit.textContent = '◀ ARCADE';
  document.body.append(exit);
  runArcade(host, game, `${ART}${id}/`);
}
