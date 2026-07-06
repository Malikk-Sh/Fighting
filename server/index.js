'use strict';

/*
 * ARENA STRIKE — авторитетный игровой сервер.
 *
 * Один процесс делает две вещи:
 *  1) HTTP: раздаёт статику клиента из ../client
 *  2) WebSocket (ws): комнаты, матчи и вся игровая логика.
 *
 * Сервер — единственный источник истины: движение, радиус удара,
 * cooldown атаки, здоровье и победа считаются только здесь.
 * Клиент лишь отправляет намерения (dir / attack) и рисует снапшоты.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 — чтобы работало по LAN
const CLIENT_DIR = path.join(__dirname, '..', 'client');

/* ---------------- игровые константы ---------------- */
const TICK_MS = 1000 / 30;      // частота симуляции
const SNAPSHOT_MS = 50;         // частота рассылки состояния (20 Гц)
const ARENA_W = 1000;           // ширина арены в мировых единицах
const WALL_PAD = 70;            // отступ бойца от края
const BODY_BLOCK = 112;          // минимальная дистанция между бойцами
const MOVE_SPEED = 300;         // ед/сек
const ATTACK_RANGE = 175;       // дистанция засчитывания удара (между центрами)
const ATTACK_COOLDOWN = 3000;   // мс
const WINDUP_MS = 260;          // замах; попадание проверяется в его конце
const STRIKE_MS = 150;          // фаза удара
const RECOVER_MS = 280;         // возврат в стойку
const HIT_STUN_MS = 620;        // оглушение после полученного удара
const KNOCKBACK_V = 520;        // начальная скорость отброса
const MAX_HP = 2;
const COUNTDOWN_MS = 3200;      // 3..2..1..БОЙ
const ARENA_COUNT = 2;          // сколько задников в client/assets/bg

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без похожих символов
const CODE_LEN = 4;

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return null;
}

function newFighter(idx) {
  return {
    x: idx === 0 ? ARENA_W * 0.3 : ARENA_W * 0.7,
    vx: 0,                 // скорость отброса
    dir: 0,                // намерение движения (-1/0/1)
    facing: idx === 0 ? 1 : -1,
    hp: MAX_HP,
    st: 'idle',            // idle | walk | windup | strike | recover | hit | ko | win
    stUntil: 0,            // когда истекает текущее состояние
    readyAt: 0,            // когда снова доступна атака
    wantRematch: false,
  };
}

function newRoom(code) {
  return {
    code,
    /** @type {(import('ws').WebSocket|null)[]} */
    sockets: [null, null],
    phase: 'waiting',      // waiting | countdown | fighting | over
    phaseAt: 0,            // время начала фазы
    fighters: [newFighter(0), newFighter(1)],
    winner: -1,
    lastSnapshot: 0,
  };
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.sockets) {
    if (ws && ws.readyState === ws.OPEN) ws.send(data);
  }
}

function startCountdown(room) {
  const now = Date.now();
  room.phase = 'countdown';
  room.phaseAt = now;
  room.winner = -1;
  room.fighters = [newFighter(0), newFighter(1)];
  for (const f of room.fighters) f.readyAt = now + COUNTDOWN_MS; // атака доступна сразу после «БОЙ»
  room.arena = Math.floor(Math.random() * ARENA_COUNT); // арена на матч — одна для обоих
  broadcast(room, { t: 'countdown', ms: COUNTDOWN_MS, arena: room.arena });
}

function resolveStrike(room, attackerIdx) {
  const a = room.fighters[attackerIdx];
  const v = room.fighters[1 - attackerIdx];
  const dist = Math.abs(a.x - v.x);
  if (room.phase !== 'fighting') return;
  if (dist <= ATTACK_RANGE && v.st !== 'ko') {
    v.hp -= 1;
    const kbDir = v.x >= a.x ? 1 : -1;
    v.vx = kbDir * KNOCKBACK_V;
    const hitX = (a.x + v.x) / 2;
    if (v.hp <= 0) {
      v.st = 'ko';
      v.stUntil = Infinity;
      a.st = 'win';
      a.stUntil = Infinity;
      room.phase = 'over';
      room.phaseAt = Date.now();
      room.winner = attackerIdx;
      broadcast(room, { t: 'ev', k: 'hit', victim: 1 - attackerIdx, x: hitX, hp: v.hp, ko: true });
      broadcast(room, { t: 'over', winner: attackerIdx, reason: 'ko' });
    } else {
      v.st = 'hit';
      v.stUntil = Date.now() + HIT_STUN_MS;
      broadcast(room, { t: 'ev', k: 'hit', victim: 1 - attackerIdx, x: hitX, hp: v.hp, ko: false });
    }
  } else {
    broadcast(room, { t: 'ev', k: 'whiff', i: attackerIdx });
  }
}

function tickRoom(room, dt, now) {
  if (room.phase === 'countdown' && now - room.phaseAt >= COUNTDOWN_MS) {
    room.phase = 'fighting';
    room.phaseAt = now;
    broadcast(room, { t: 'ev', k: 'go' });
  }

  const [f0, f1] = room.fighters;

  for (let i = 0; i < 2; i++) {
    const f = room.fighters[i];
    const opp = room.fighters[1 - i];

    // истечение таймеров состояний
    if (now >= f.stUntil) {
      if (f.st === 'windup') {
        f.st = 'strike';
        f.stUntil = now + STRIKE_MS;
        resolveStrike(room, i); // попадание проверяется в момент удара
      } else if (f.st === 'strike') {
        f.st = 'recover';
        f.stUntil = now + RECOVER_MS;
      } else if (f.st === 'recover' || f.st === 'hit') {
        f.st = 'idle';
        f.stUntil = 0;
      }
    }

    // разворот к противнику
    if (f.st !== 'ko') f.facing = opp.x >= f.x ? 1 : -1;

    // движение по вводу — только в свободной стойке и только в фазе боя
    const canMove = room.phase === 'fighting' && (f.st === 'idle' || f.st === 'walk');
    if (canMove) {
      f.x += f.dir * MOVE_SPEED * dt;
      f.st = f.dir !== 0 ? 'walk' : 'idle';
    }

    // затухающий отброс
    if (Math.abs(f.vx) > 1) {
      f.x += f.vx * dt;
      f.vx *= Math.pow(0.002, dt); // быстрое затухание
    } else {
      f.vx = 0;
    }

    f.x = Math.max(WALL_PAD, Math.min(ARENA_W - WALL_PAD, f.x));
  }

  // бойцы не проходят друг сквозь друга
  const gap = Math.abs(f0.x - f1.x);
  if (gap < BODY_BLOCK && f0.st !== 'ko' && f1.st !== 'ko') {
    const push = (BODY_BLOCK - gap) / 2;
    const sign = f0.x <= f1.x ? 1 : -1;
    f0.x -= push * sign;
    f1.x += push * sign;
    f0.x = Math.max(WALL_PAD, Math.min(ARENA_W - WALL_PAD, f0.x));
    f1.x = Math.max(WALL_PAD, Math.min(ARENA_W - WALL_PAD, f1.x));
  }

  // рассылка снапшотов
  if (room.phase !== 'waiting' && now - room.lastSnapshot >= SNAPSHOT_MS) {
    room.lastSnapshot = now;
    broadcast(room, {
      t: 'state',
      phase: room.phase,
      p: room.fighters.map((f) => ({
        x: Math.round(f.x * 10) / 10,
        f: f.facing,
        hp: f.hp,
        st: f.st,
        cd: Math.max(0, f.readyAt - now),
      })),
    });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === 'countdown' || room.phase === 'fighting' || room.phase === 'over') {
      tickRoom(room, TICK_MS / 1000, now);
    }
  }
}, TICK_MS);

/* ---------------- обработка сообщений клиента ---------------- */

function lanUrls() {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${PORT}`);
      }
    }
  }
  return urls;
}

function handleMessage(ws, msg) {
  const now = Date.now();
  switch (msg.t) {
    case 'create': {
      if (ws.room) return;
      const code = makeCode();
      if (!code) return send(ws, { t: 'err', msg: 'Сервер переполнен, попробуйте позже' });
      const room = newRoom(code);
      room.sockets[0] = ws;
      rooms.set(code, room);
      ws.room = room;
      ws.idx = 0;
      send(ws, { t: 'created', code, idx: 0, lan: lanUrls() });
      break;
    }
    case 'join': {
      if (ws.room) return;
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'err', msg: 'Комната не найдена. Проверьте код.' });
      if (room.sockets[1]) return send(ws, { t: 'err', msg: 'Комната уже занята.' });
      room.sockets[1] = ws;
      ws.room = room;
      ws.idx = 1;
      send(ws, { t: 'joined', code, idx: 1 });
      startCountdown(room);
      break;
    }
    case 'move': {
      const room = ws.room;
      if (!room) return;
      const dir = msg.dir === -1 || msg.dir === 1 ? msg.dir : 0;
      room.fighters[ws.idx].dir = dir;
      break;
    }
    case 'attack': {
      const room = ws.room;
      if (!room || room.phase !== 'fighting') return;
      const f = room.fighters[ws.idx];
      if (f.st !== 'idle' && f.st !== 'walk') return;
      if (now < f.readyAt) return; // cooldown проверяет сервер
      f.readyAt = now + ATTACK_COOLDOWN;
      f.st = 'windup';
      f.stUntil = now + WINDUP_MS;
      broadcast(room, { t: 'ev', k: 'attack', i: ws.idx });
      break;
    }
    case 'rematch': {
      const room = ws.room;
      if (!room || room.phase !== 'over') return;
      if (!room.sockets[0] || !room.sockets[1]) return; // соперник вышел
      room.fighters[ws.idx].wantRematch = true;
      if (room.fighters[0].wantRematch && room.fighters[1].wantRematch) {
        startCountdown(room);
      } else {
        send(room.sockets[1 - ws.idx], { t: 'rematchWait' });
      }
      break;
    }
    case 'ping': {
      send(ws, { t: 'pong', id: msg.id });
      break;
    }
  }
}

function handleClose(ws) {
  const room = ws.room;
  if (!room) return;
  room.sockets[ws.idx] = null;
  ws.room = null;
  const other = room.sockets[1 - ws.idx];
  if (other) {
    send(other, { t: 'left' });
    if (room.phase === 'fighting' || room.phase === 'countdown') {
      room.phase = 'over';
      room.winner = 1 - ws.idx;
    }
  }
  if (!room.sockets[0] && !room.sockets[1]) {
    rooms.delete(room.code);
  }
}

/* ---------------- HTTP: статика клиента ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(CLIENT_DIR, urlPath));
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.idx = -1;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg && typeof msg.t === 'string') handleMessage(ws, msg);
  });
  ws.on('close', () => handleClose(ws));
  ws.on('error', () => {});
});

// отсев «мёртвых» соединений (телефон ушёл в сон и т.п.)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, HOST, () => {
  console.log('ARENA STRIKE server');
  console.log(`  Локально:  http://localhost:${PORT}`);
  for (const url of lanUrls()) {
    console.log(`  По сети:   ${url}  (для второго устройства в той же Wi-Fi)`);
  }
});
