// Точка входа: связывает сеть, ввод, рендер и экраны.

import { WS_URL } from './config.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { ui } from './ui.js';
import { sfx, unlock } from './audio.js';

const net = new Net();
const input = new Input();
const game = new Game(document.getElementById('game'));

let myIdx = -1;
let inMatch = false;
let opponentGone = false;

ui.init();
ui.show('screen-menu');

input.onAnyGesture = unlock;
game.onCooldown = (cd, total) => input.updateCooldown(cd, total);

/* ---------- подключение ---------- */

let connected = false;
async function ensureConnected() {
  if (connected) return true;
  try {
    await net.connect(WS_URL);
    connected = true;
    return true;
  } catch {
    ui.menuError('Не удалось подключиться к серверу (' + WS_URL + ')');
    return false;
  }
}

net.onDisconnect = () => {
  connected = false;
  game.stop();
  input.setEnabled(false);
  ui.setHud(false);
  ui.showMessage('Связь потеряна', 'Соединение с сервером прервано. Проверьте сеть и попробуйте снова.');
};

/* ---------- действия из меню ---------- */

ui.onCreate = async () => {
  if (!(await ensureConnected())) return;
  net.send({ t: 'create' });
};

ui.onJoin = async (code) => {
  if (!(await ensureConnected())) return;
  net.send({ t: 'join', code });
};

ui.onRematch = () => {
  if (opponentGone) return;
  net.send({ t: 'rematch' });
  ui.overStatus('Ждём соперника…');
};

/* ---------- ввод ---------- */

input.onDir = (dir) => {
  net.send({ t: 'move', dir });
  game.setMyDir(dir);
};

input.onAttack = () => {
  if (!inMatch) return;
  net.send({ t: 'attack' });
  game.noteAttackSent();
};

/* ---------- сообщения сервера ---------- */

net.on('created', (msg) => {
  myIdx = msg.idx;
  ui.showWaiting(msg.code, msg.lan);
});

net.on('joined', (msg) => {
  myIdx = msg.idx;
});

net.on('err', (msg) => {
  ui.show('screen-menu');
  ui.menuError(msg.msg);
});

net.on('countdown', (msg) => {
  // старт матча (или реванша)
  inMatch = true;
  opponentGone = false;
  ui.hideScreens();
  ui.setYou(myIdx);
  ui.resetHp();
  ui.setHud(true);
  game.startMatch(myIdx);
  input.setEnabled(false); // движение включится по «БОЙ!»

  const steps = Math.floor(msg.ms / 1000);
  for (let i = 0; i < steps; i++) {
    setTimeout(() => {
      ui.announce(String(steps - i));
      sfx.count();
    }, msg.ms - (steps - i) * 1000);
  }
});

net.on('state', (msg) => {
  game.onState(msg);
  for (let i = 0; i < 2; i++) ui.setHp(i, msg.p[i].hp);
  ui.setPing(net.ping);
});

net.on('ev', (msg) => {
  switch (msg.k) {
    case 'go':
      ui.announce('БОЙ!', 900);
      sfx.go();
      input.setEnabled(true);
      break;
    case 'attack':
      sfx.whoosh();
      break;
    case 'hit':
      game.onEvent(msg);
      if (msg.ko) sfx.ko(); else sfx.hit();
      if (msg.ko) ui.announce('НОКАУТ!', 1300);
      break;
  }
});

net.on('over', (msg) => {
  inMatch = false;
  input.setEnabled(false);
  ui.setControls(false);
  const win = msg.winner === myIdx;
  // даём анимации нокаута отыграть за полупрозрачным экраном итога
  setTimeout(() => {
    ui.showOver(win, win ? 'Соперник повержен' : 'Вы были повержены');
    if (win) sfx.win(); else sfx.lose();
    if (opponentGone) ui.overStatus('Соперник покинул матч', true);
  }, 1500);
});

net.on('rematchWait', () => {
  ui.overStatus('Соперник готов к реваншу!');
});

net.on('left', () => {
  opponentGone = true;
  if (inMatch) {
    inMatch = false;
    input.setEnabled(false);
    game.stop();
    ui.setHud(false);
    ui.showMessage('Соперник отключился', 'Противник покинул матч. Создайте новую комнату, чтобы сыграть ещё.');
  } else {
    ui.overStatus('Соперник покинул матч', true);
  }
});
