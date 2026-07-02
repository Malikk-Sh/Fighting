// Арена: закатное небо, горы, город с пагодами, фонари и деревянный помост.
// Три слоя силуэтов с разным коэффициентом параллакса + пол в мировых координатах.

import { ARENA_W, WALL_PAD } from './game-const.js';

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
  const { w, h, camX, scale, groundY, t } = v;

  // ---------- небо ----------
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#0d0922');
  sky.addColorStop(0.45, '#33184c');
  sky.addColorStop(0.78, '#6e2c54');
  sky.addColorStop(1, '#d96540');
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

  // солнце у горизонта
  const sunX = w * 0.62 - camX * scale * 0.05;
  const sunY = groundY - 40 * scale;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260 * scale);
  glow.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
  glow.addColorStop(0.25, 'rgba(255, 160, 90, 0.35)');
  glow.addColorStop(1, 'rgba(255, 140, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, groundY);
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 46 * scale, 0, Math.PI * 2);
  ctx.fill();
  // «срез» солнца горизонтом рисуем ниже слоями

  // облака
  ctx.fillStyle = 'rgba(60, 30, 70, 0.55)';
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
  ctx.fillStyle = '#251639';
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
  ctx.fillStyle = '#160d2c';
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
      ctx.fillStyle = '#160d2c';
    }
  });

  // дымка над горизонтом
  const haze = ctx.createLinearGradient(0, groundY - 90 * scale, 0, groundY);
  haze.addColorStop(0, 'rgba(217, 101, 64, 0)');
  haze.addColorStop(1, 'rgba(217, 101, 64, 0.35)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, groundY - 90 * scale, w, 90 * scale);

  // ---------- слой 3: столбы с фонарями (parallax 0.75) ----------
  layerFeatures(w, camX, scale, 0.75, 330 * scale, (x, k) => {
    const ph = 210 * scale * (0.9 + sr(k + 21) * 0.2);
    ctx.fillStyle = '#0e0818';
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
  floor.addColorStop(0, '#6b3c26');
  floor.addColorStop(0.12, '#553020');
  floor.addColorStop(1, '#1c0f0c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, groundY, w, h - groundY);

  // тёплый отсвет заката на полу
  const fg = ctx.createRadialGradient(sunX, groundY, 10, sunX, groundY, w * 0.7);
  fg.addColorStop(0, 'rgba(255, 160, 90, 0.22)');
  fg.addColorStop(1, 'rgba(255, 160, 90, 0)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, groundY, w, h - groundY);

  // доски: швы, расходящиеся в перспективе
  const worldToScreenX = (wx) => (wx - camX) * scale + w / 2;
  ctx.strokeStyle = 'rgba(20, 8, 6, 0.5)';
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
  ctx.strokeStyle = 'rgba(15, 6, 5, 0.35)';
  for (let i = 1; i <= 3; i++) {
    const y = groundY + (h - groundY) * (i * i) * 0.09;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // кромка помоста
  ctx.fillStyle = 'rgba(255, 205, 150, 0.28)';
  ctx.fillRect(0, groundY, w, 3);

  // границы арены
  ctx.strokeStyle = 'rgba(255, 210, 60, 0.4)';
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
  vg.addColorStop(1, 'rgba(5, 2, 12, 0.55)');
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
