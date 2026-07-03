// Арена: закатное небо, горы, город с пагодами, фонари и деревянный помост.
// Три слоя силуэтов с разным коэффициентом параллакса + пол в мировых координатах.

import { ARENA_W, WALL_PAD } from './game-const.js';
import { bg } from './sprites.js';

function sr(i) { // детерминированный псевдослучайный [0..1)
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Перебор «фич» слоя с параллаксом: вызывает fn(screenX, k) для видимых k.
function layerFeatures(w, camX, scale, parallax, spacing, fn) {
  const shift = camX * scale * parallax;
  const kMin = Math.floor((shift - spacing * 2) / spacing);
  const kMax = Math.ceil((shift + w + spacing) / spacing);
  for (let k = kMin; k <= kMax; k++) {
    fn(k * spacing - shift, k);
  }
}

export function drawArena(ctx, v) {
  if (bg.ready) return drawSpriteArena(ctx, v);
  return drawProceduralArena(ctx, v);
}

/* Арена из сгенерированных слоёв (assets/bg): небо, дальний план,
 * земля, ближнее обрамление — каждый со своим коэффициентом параллакса. */
function drawSpriteArena(ctx, v) {
  const { w, h, camX, scale, groundY } = v;
  const worldShift = (camX - ARENA_W / 2) * scale;
  // задник опущен ниже верхней кромки пола: его нижняя граница (горизонт)
  // лежит в глубине помоста, поэтому промежутка между фоном и землёй нет
  const horizon = groundY + (h - groundY) * 0.22;

  // земля: движется вместе с миром (рисуется первой — фон ложится поверх)
  const ground = bg.imgs.ground;
  const gW = Math.max(w * 1.5, ARENA_W * scale * 1.3);
  ctx.drawImage(ground, w / 2 - gW / 2 - worldShift, groundY, gW, h - groundY);
  // лёгкое затемнение пола, чтобы белые бойцы не сливались
  ctx.fillStyle = 'rgba(25, 8, 8, 0.14)';
  ctx.fillRect(0, groundY, w, h - groundY);

  // небо: якорь по нижней кромке (опущенному горизонту), лёгкий параллакс
  const sky = bg.imgs.sky;
  const sScale = Math.max(horizon / sky.height, (w * 1.15) / sky.width);
  const sW = sky.width * sScale, sH = sky.height * sScale;
  ctx.drawImage(sky, w / 2 - sW / 2 - worldShift * 0.05, horizon - sH, sW, sH);

  // дальний план: бамбук и горящий корабль. Нижние ~10% картинки прозрачны
  // (контент заканчивается на днище корабля), поэтому слой опускается так,
  // чтобы плотная часть легла на горизонт — красное небо не просвечивает
  const far = bg.imgs.far;
  const fW = Math.max(w * 1.3, ARENA_W * scale * 1.05);
  const fH = fW * far.height / far.width;
  ctx.drawImage(far, w / 2 - fW / 2 - worldShift * 0.35, horizon - fH * 0.885, fW, fH);

  // тёмная дымка, отделяющая задник от зоны боя (бойцы читаются лучше)
  const depth = ctx.createLinearGradient(0, horizon - fH * 0.8, 0, horizon);
  depth.addColorStop(0, 'rgba(12, 2, 3, 0)');
  depth.addColorStop(1, 'rgba(12, 2, 3, 0.42)');
  ctx.fillStyle = depth;
  ctx.fillRect(0, horizon - fH * 0.8, w, fH * 0.8);

  // «сшивка» планов: тёмная дымка от горизонта вглубь пола
  const seamH = Math.max(26, (h - groundY) * 0.3);
  const seam = ctx.createLinearGradient(0, horizon - 2, 0, horizon + seamH);
  seam.addColorStop(0, 'rgba(14, 3, 4, 0.5)');
  seam.addColorStop(1, 'rgba(14, 3, 4, 0)');
  ctx.fillStyle = seam;
  ctx.fillRect(0, horizon - 2, w, seamH);

  // границы арены — красные метки
  const worldToScreenX = (wx) => (wx - camX) * scale + w / 2;
  ctx.strokeStyle = 'rgba(200, 30, 20, 0.5)';
  ctx.lineWidth = 4;
  for (const wx of [WALL_PAD - 40, ARENA_W - WALL_PAD + 40]) {
    const sx = worldToScreenX(wx);
    ctx.beginPath();
    ctx.moveTo(sx, horizon + 4);
    ctx.lineTo(sx + (sx - w / 2) * 0.22, h);
    ctx.stroke();
  }

  // ближнее обрамление: воткнутые катаны и фонарь стоят на линии боя
  const near = bg.imgs.near;
  const nW = Math.max(w * 1.25, ARENA_W * scale * 1.15);
  const nH = nW * near.height / near.width;
  const nearBase = groundY + (h - groundY) * 0.42;
  ctx.drawImage(near, w / 2 - nW / 2 - worldShift * 0.8, nearBase - nH, nW, nH);

  // виньетка
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.45, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4, 1, 2, 0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/* Процедурная арена — запасной вариант, если ассеты фона не загрузились. */
function drawProceduralArena(ctx, v) {
  const { w, h, camX, scale, groundY, t } = v;

  // ---------- небо: кроваво-красная тушь ----------
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#2a0608');
  sky.addColorStop(0.45, '#6e120e');
  sky.addColorStop(0.78, '#a02414');
  sky.addColorStop(1, '#d8622a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, groundY);

  // звёзды
  ctx.fillStyle = 'rgba(255,245,230,0.8)';
  for (let i = 0; i < 40; i++) {
    const x = sr(i) * w;
    const y = sr(i + 100) * groundY * 0.5;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + sr(i + 200)) + i));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;

  // белый месяц в верхней части неба
  const sunX = w * 0.72 - camX * scale * 0.05;
  const sunY = groundY * 0.22;
  const glow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 180 * scale);
  glow.addColorStop(0, 'rgba(255, 246, 230, 0.5)');
  glow.addColorStop(1, 'rgba(255, 246, 230, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, groundY);
  ctx.fillStyle = '#f4ede0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34 * scale, 0, Math.PI * 2);
  ctx.fill();

  // чернильные облака
  ctx.fillStyle = 'rgba(20, 5, 6, 0.7)';
  for (let i = 0; i < 5; i++) {
    const cx = ((sr(i + 40) * 1.4 * w + t * 6 * (0.4 + sr(i))) % (w * 1.4)) - w * 0.2;
    const cy = groundY * (0.2 + sr(i + 50) * 0.35);
    const cw = (90 + sr(i + 60) * 160) * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, cw * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + cw * 0.4, cy - cw * 0.1, cw * 0.55, cw * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- слой 1: горы (parallax 0.15) ----------
  ctx.fillStyle = '#380c0c';
  layerFeatures(w, camX, scale, 0.15, 240 * scale, (x, k) => {
    const mh = (70 + sr(k) * 120) * scale;
    const mw = (160 + sr(k + 7) * 120) * scale;
    ctx.beginPath();
    ctx.moveTo(x - mw, groundY);
    ctx.quadraticCurveTo(x - mw * 0.25, groundY - mh * 1.15, x, groundY - mh);
    ctx.quadraticCurveTo(x + mw * 0.3, groundY - mh * 0.8, x + mw, groundY);
    ctx.closePath();
    ctx.fill();
  });

  // ---------- слой 2: город с пагодами (parallax 0.4) ----------
  ctx.fillStyle = '#150607';
  layerFeatures(w, camX, scale, 0.4, 210 * scale, (x, k) => {
    if (sr(k + 3) > 0.55) {
      drawPagoda(ctx, x, groundY, (0.6 + sr(k) * 0.55) * scale);
    } else {
      const bw = (50 + sr(k) * 60) * scale;
      const bh = (60 + sr(k + 11) * 110) * scale;
      ctx.fillRect(x - bw / 2, groundY - bh, bw, bh);
      // тёплые окна
      ctx.fillStyle = 'rgba(255, 190, 100, 0.75)';
      const cols = 2 + Math.floor(sr(k + 13) * 2);
      for (let wx = 0; wx < cols; wx++) {
        for (let wy = 0; wy < 4; wy++) {
          if (sr(k * 17 + wx * 5 + wy) > 0.55) {
            ctx.fillRect(x - bw / 2 + 8 * scale + wx * 16 * scale, groundY - bh + 10 * scale + wy * 22 * scale, 6 * scale, 8 * scale);
          }
        }
      }
      ctx.fillStyle = '#150607';
    }
  });

  // дымка над горизонтом
  const haze = ctx.createLinearGradient(0, groundY - 90 * scale, 0, groundY);
  haze.addColorStop(0, 'rgba(216, 98, 42, 0)');
  haze.addColorStop(1, 'rgba(216, 98, 42, 0.4)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, groundY - 90 * scale, w, 90 * scale);

  // ---------- слой 3: столбы с фонарями (parallax 0.75) ----------
  layerFeatures(w, camX, scale, 0.75, 330 * scale, (x, k) => {
    const ph = 210 * scale * (0.9 + sr(k + 21) * 0.2);
    ctx.fillStyle = '#0a0304';
    ctx.fillRect(x - 7 * scale, groundY - ph, 14 * scale, ph);
    ctx.fillRect(x - 30 * scale, groundY - ph, 60 * scale, 8 * scale);
    // фонарь
    const ly = groundY - ph + 26 * scale;
    const sway = Math.sin(t * 1.3 + k) * 3 * scale;
    const lg = ctx.createRadialGradient(x + sway, ly, 2, x + sway, ly, 46 * scale);
    lg.addColorStop(0, 'rgba(255, 190, 90, 0.85)');
    lg.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(x + sway, ly, 46 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb84e';
    ctx.beginPath();
    ctx.ellipse(x + sway, ly, 8 * scale, 11 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#301608';
    ctx.fillRect(x + sway - 5 * scale, ly - 14 * scale, 10 * scale, 3.5 * scale);
  });

  // ---------- пол: деревянный помост (мировые координаты) ----------
  const floor = ctx.createLinearGradient(0, groundY, 0, h);
  floor.addColorStop(0, '#a89a88');
  floor.addColorStop(0.12, '#8a7c6c');
  floor.addColorStop(1, '#2a221c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, groundY, w, h - groundY);

  // тёплый отсвет заката на полу
  const fg = ctx.createRadialGradient(sunX, groundY, 10, sunX, groundY, w * 0.7);
  fg.addColorStop(0, 'rgba(255, 120, 70, 0.18)');
  fg.addColorStop(1, 'rgba(255, 120, 70, 0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, groundY, w, h - groundY);

  // доски: швы, расходящиеся в перспективе
  const worldToScreenX = (wx) => (wx - camX) * scale + w / 2;
  ctx.strokeStyle = 'rgba(35, 25, 20, 0.22)';
  ctx.lineWidth = 2;
  for (let wx = -600; wx <= ARENA_W + 600; wx += 85) {
    const sx = worldToScreenX(wx);
    const spread = (sx - w / 2) * 0.22;
    ctx.beginPath();
    ctx.moveTo(sx, groundY);
    ctx.lineTo(sx + spread, h);
    ctx.stroke();
  }
  // горизонтальные стыки досок
  ctx.strokeStyle = 'rgba(35, 25, 20, 0.16)';
  for (let i = 1; i <= 3; i++) {
    const y = groundY + (h - groundY) * (i * i) * 0.09;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // кромка помоста
  ctx.fillStyle = 'rgba(255, 248, 235, 0.35)';
  ctx.fillRect(0, groundY, w, 3);

  // границы арены
  ctx.strokeStyle = 'rgba(200, 30, 20, 0.55)';
  ctx.lineWidth = 4;
  for (const wx of [WALL_PAD - 40, ARENA_W - WALL_PAD + 40]) {
    const sx = worldToScreenX(wx);
    ctx.beginPath();
    ctx.moveTo(sx, groundY + 4);
    ctx.lineTo(sx + (sx - w / 2) * 0.22, h);
    ctx.stroke();
  }

  // ---------- виньетка ----------
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.45, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4, 1, 2, 0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function drawPagoda(ctx, x, groundY, s) {
  ctx.beginPath();
  let y = groundY;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const tw = (95 - i * 24) * s;
    const th = 42 * s;
    ctx.rect(x - tw * 0.55, y - th, tw * 1.1, th);
    // изогнутая крыша яруса
    ctx.moveTo(x - tw, y - th);
    ctx.quadraticCurveTo(x - tw * 0.9, y - th - 16 * s, x - tw * 0.55, y - th - 12 * s);
    ctx.lineTo(x + tw * 0.55, y - th - 12 * s);
    ctx.quadraticCurveTo(x + tw * 0.9, y - th - 16 * s, x + tw, y - th);
    ctx.closePath();
    y -= th + 12 * s;
  }
  // шпиль
  ctx.rect(x - 2.5 * s, y - 26 * s, 5 * s, 26 * s);
  ctx.fill();
}
