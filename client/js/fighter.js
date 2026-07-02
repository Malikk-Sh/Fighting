// Процедурный боец: послойный векторный «риг» из частей тела.
// Позы заданы углами суставов, между ними — плавная интерполяция,
// поэтому стойка, шаг, замах, удар, попадание и нокаут анимируются сами.
//
// Локальные координаты бойца: (0,0) — точка на земле под ним,
// +x — направление взгляда (отражается через scale), вверх — отрицательный y.

const HP = Math.PI / 2;

const THIGH = 48, SHIN = 46;
const TORSO = 60;          // таз -> шея
const HEAD_R = 17;
const UPPER_ARM = 40, FOREARM = 36;
const PELVIS_Y = -(THIGH + SHIN) + 2;

const OUTLINE = 'rgba(22, 10, 28, 0.5)';

export const PALETTES = [
  { // Игрок 1 — «Алый»
    skin: ['#f4c795', '#c58a52'],
    pants: ['#ff5a3c', '#9c2412'],
    glove: ['#d63a24', '#701408'],
    hair: '#221a1a',
    band: '#ffd23c',
    belt: '#2b2028',
  },
  { // Игрок 2 — «Лазурный»
    skin: ['#b97e4e', '#7e4e28'],
    pants: ['#3c9cff', '#1a4fae'],
    glove: ['#2456c8', '#102a6e'],
    hair: '#101018',
    band: '#7ae4ff',
    belt: '#1c2436',
  },
];

function lerp(a, b, t) { return a + (b - a) * t; }

/* Конусный «капсульный» сегмент с градиентом и контуром — базовый кирпич тела. */
function capsule(ctx, x1, y1, r1, x2, y2, r2, light, dark) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, r1, a + HP, a - HP);
  ctx.arc(x2, y2, r2, a - HP, a + HP);
  ctx.closePath();
  const px = Math.cos(a - HP), py = Math.sin(a - HP);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mr = Math.max(r1, r2);
  const g = ctx.createLinearGradient(mx + px * mr, my + py * mr, mx - px * mr, my - py * mr);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function circleGrad(ctx, x, y, r, light, dark, outline = true) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (outline) {
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

/* ---------------- позы ----------------
 * crouch: опускание таза; lean: наклон торса (+ вперёд); lunge: вынос корпуса;
 * aF/aB — переднее/заднее плечо [плечо, локоть]; lF/lB — ноги [бедро, колено].
 * Углы от вертикали «вниз», + = вперёд. Колено < 0 — естественное сгибание.
 */
function targetPose(st, t, walkPhase) {
  const breathe = Math.sin(t * 2.6) * 2;
  switch (st) {
    case 'walk': {
      const s = Math.sin(walkPhase);
      const c = Math.cos(walkPhase);
      return {
        crouch: 6 + Math.abs(c) * 3, lean: 0.14, lunge: 2, headTilt: 0,
        aF: [0.5 + s * 0.08, 2.1], aB: [0.25 - s * 0.08, 2.35],
        lF: [0.45 * s + 0.05, -0.25 - 0.45 * Math.max(0, c * s > 0 ? Math.abs(s) : 0)],
        lB: [-0.45 * s - 0.05, -0.25 - 0.45 * Math.max(0, -c * s > 0 ? Math.abs(s) : 0)],
      };
    }
    case 'windup':
      return {
        crouch: 11, lean: -0.14, lunge: -9, headTilt: 0.1,
        aF: [-0.85, 2.55], aB: [0.75, 1.85],
        lF: [0.42, -0.2], lB: [-0.48, -0.5],
      };
    case 'strike':
      return {
        crouch: 8, lean: 0.44, lunge: 27, headTilt: -0.06,
        aF: [1.62, 0.05], aB: [-0.55, 1.7],
        lF: [0.58, -0.3], lB: [-0.78, -0.32],
      };
    case 'hit':
      return {
        crouch: 13, lean: -0.5, lunge: -9, headTilt: -0.55,
        aF: [0.95, 0.65], aB: [-0.55, 0.45],
        lF: [0.52, -0.4], lB: [-0.5, -0.5],
      };
    case 'ko':
      return {
        crouch: 70, lean: -1.42, lunge: -8, headTilt: -0.5,
        aF: [1.5, 0.3], aB: [-1.9, -0.25],
        lF: [1.3, -1.05], lB: [1.55, -1.3],
      };
    case 'win':
      return {
        crouch: 2 + Math.sin(t * 7) * 3, lean: -0.06, lunge: 0, headTilt: 0.18,
        aF: [2.5, 0.4], aB: [-2.45, -0.35],
        lF: [0.25, -0.1], lB: [-0.3, -0.2],
      };
    case 'recover':
    case 'idle':
    default:
      return {
        crouch: 5 + breathe, lean: 0.1, lunge: 0, headTilt: Math.sin(t * 2.6 + 1) * 0.03,
        aF: [0.5, 2.1 + Math.sin(t * 2.6) * 0.06], aB: [0.25, 2.35],
        lF: [0.32, -0.18], lB: [-0.36, -0.3],
      };
  }
}

const POSE_RATE = {
  idle: 10, walk: 12, windup: 15, strike: 26, recover: 8,
  hit: 22, ko: 6.5, win: 8,
};

export class FighterView {
  constructor(idx) {
    this.idx = idx;
    this.palette = PALETTES[idx];
    this.x = 0;
    this.facing = idx === 0 ? 1 : -1;
    this.st = 'idle';
    this.stAt = 0;
    this.walkPhase = 0;
    this.flashUntil = 0;
    this.pose = targetPose('idle', 0, 0);
  }

  setState(st, now) {
    if (st !== this.st) {
      this.st = st;
      this.stAt = now;
    }
  }

  flash() { this.flashUntil = performance.now() + 160; }

  update(dt, t) {
    if (this.st === 'walk') this.walkPhase += dt * 11;
    const target = targetPose(this.st, t + this.idx * 1.7, this.walkPhase);
    const rate = POSE_RATE[this.st] || 10;
    const k = 1 - Math.exp(-rate * dt);
    const p = this.pose;
    for (const key of ['crouch', 'lean', 'lunge', 'headTilt']) p[key] = lerp(p[key], target[key], k);
    for (const key of ['aF', 'aB', 'lF', 'lB']) {
      p[key][0] = lerp(p[key][0], target[key][0], k);
      p[key][1] = lerp(p[key][1], target[key][1], k);
    }
  }

  /* Прямая кинематика: координаты суставов из углов позы. */
  _joints() {
    const p = this.pose;
    const pelvis = { x: p.lunge, y: PELVIS_Y + p.crouch };
    const sl = Math.sin(p.lean), cl = Math.cos(p.lean);
    const neck = { x: pelvis.x + sl * TORSO, y: pelvis.y - cl * TORSO };
    const shoulder = { x: pelvis.x + sl * (TORSO - 6), y: pelvis.y - cl * (TORSO - 6) };
    const headA = p.lean * 0.8 + p.headTilt;
    const head = { x: neck.x + Math.sin(headA) * (HEAD_R + 6), y: neck.y - Math.cos(headA) * (HEAD_R + 6) };

    const arm = ([sh, el], side) => {
      const s = { x: shoulder.x + side * 3, y: shoulder.y };
      const e = { x: s.x + Math.sin(sh) * UPPER_ARM, y: s.y + Math.cos(sh) * UPPER_ARM };
      const h = { x: e.x + Math.sin(sh + el) * FOREARM, y: e.y + Math.cos(sh + el) * FOREARM };
      return { s, e, h };
    };
    const leg = ([hip, knee], side) => {
      const hp = { x: pelvis.x + side * 7, y: pelvis.y + 4 };
      const kn = { x: hp.x + Math.sin(hip) * THIGH, y: hp.y + Math.cos(hip) * THIGH };
      const ft = { x: kn.x + Math.sin(hip + knee) * SHIN, y: kn.y + Math.cos(hip + knee) * SHIN };
      return { hp, kn, ft };
    };

    const j = {
      pelvis, neck, shoulder, head, headA,
      armF: arm(this.pose.aF, 1),
      armB: arm(this.pose.aB, -1),
      legF: leg(this.pose.lF, 1),
      legB: leg(this.pose.lB, -1),
    };

    // «посадка» на землю: сдвигаем всё тело так, чтобы нижняя стопа стояла на полу
    const lowest = Math.max(j.legF.ft.y, j.legB.ft.y);
    const dy = -lowest;
    for (const part of [j.pelvis, j.neck, j.shoulder, j.head,
      j.armF.s, j.armF.e, j.armF.h, j.armB.s, j.armB.e, j.armB.h,
      j.legF.hp, j.legF.kn, j.legF.ft, j.legB.hp, j.legB.kn, j.legB.ft]) {
      part.y += dy;
    }
    return j;
  }

  draw(ctx, t) {
    const j = this._joints();
    const pal = this.palette;

    ctx.save();
    ctx.translate(this.x, 0);

    // тень на полу
    const spread = this.st === 'ko' ? 1.7 : 1;
    const sh = ctx.createRadialGradient(0, 6, 4, 0, 6, 60 * spread);
    sh.addColorStop(0, 'rgba(0,0,0,0.42)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, 6, 60 * spread, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(this.facing, 1);

    this._drawBody(ctx, j, t);

    // вспышка при получении урона: повторная отрисовка «светом»
    if (performance.now() < this.flashUntil) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      this._drawBody(ctx, j, t);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }

  _drawBody(ctx, j, t) {
    const pal = this.palette;
    const skin = pal.skin, pants = pal.pants, glove = pal.glove;

    // ----- дальняя рука
    this._drawArm(ctx, j.armB, skin, glove, 0.85);
    // ----- дальняя нога
    this._drawLeg(ctx, j.legB, skin, pants, 0.9);

    // ----- торс: сужающаяся капсула таз->шея с «плечами»
    capsule(ctx, j.pelvis.x, j.pelvis.y, 17, j.neck.x, j.neck.y - 2, 23, skin[0], skin[1]);
    // грудные мышцы и пресс — лёгкая графика поверх
    ctx.save();
    ctx.translate(j.shoulder.x, j.shoulder.y + 14);
    ctx.rotate(this.pose.lean * 0.8);
    ctx.strokeStyle = 'rgba(90, 45, 20, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 2, 9, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(-8, 2, 9, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 12); ctx.lineTo(0, 30);
    ctx.moveTo(-6, 18); ctx.lineTo(6, 18);
    ctx.moveTo(-5, 25); ctx.lineTo(5, 25);
    ctx.stroke();
    ctx.restore();
    // пояс
    capsule(ctx, j.pelvis.x - 15, j.pelvis.y - 2, 6, j.pelvis.x + 15, j.pelvis.y - 2, 6, pal.belt, pal.belt);

    // ----- ближняя нога
    this._drawLeg(ctx, j.legF, skin, pants, 1);

    // ----- голова
    this._drawHead(ctx, j, t);

    // след удара за кулаком
    if (this.st === 'strike') {
      ctx.globalAlpha = 0.4;
      capsule(ctx, j.armF.s.x, j.armF.s.y, 4, j.armF.h.x - 6, j.armF.h.y, 15, '#fff6d8', 'rgba(255,220,140,0)');
      ctx.globalAlpha = 1;
    }

    // ----- ближняя (ударная) рука
    this._drawArm(ctx, j.armF, skin, glove, 1);
  }

  _drawArm(ctx, a, skin, glove, tone) {
    const mul = (c) => (tone === 1 ? c : shade(c, tone));
    // дельта (плечо)
    circleGrad(ctx, a.s.x, a.s.y, 12.5, mul(skin[0]), mul(skin[1]));
    capsule(ctx, a.s.x, a.s.y, 10.5, a.e.x, a.e.y, 8.5, mul(skin[0]), mul(skin[1]));
    capsule(ctx, a.e.x, a.e.y, 8, a.h.x, a.h.y, 7, mul(skin[0]), mul(skin[1]));
    // перчатка
    circleGrad(ctx, a.h.x, a.h.y, 12, mul(glove[0]), mul(glove[1]));
    // блик на перчатке
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(a.h.x - 3.5, a.h.y - 4, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawLeg(ctx, l, skin, pants, tone) {
    const mul = (c) => (tone === 1 ? c : shade(c, tone));
    // бедро — шорты
    capsule(ctx, l.hp.x, l.hp.y, 14, l.kn.x, l.kn.y, 10, mul(pants[0]), mul(pants[1]));
    // голень — кожа
    capsule(ctx, l.kn.x, l.kn.y, 9, l.ft.x, l.ft.y - 3, 6.5, mul(skin[0]), mul(skin[1]));
    // стопа
    ctx.save();
    ctx.translate(l.ft.x, l.ft.y - 2);
    const g = ctx.createLinearGradient(0, -6, 0, 5);
    g.addColorStop(0, mul(skin[0]));
    g.addColorStop(1, mul(skin[1]));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(5, 0, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.restore();
  }

  _drawHead(ctx, j, t) {
    const pal = this.palette;
    ctx.save();
    ctx.translate(j.head.x, j.head.y);
    ctx.rotate(j.headA);

    // развевающиеся ленты повязки — за головой
    const wave = Math.sin(t * 5 + this.idx) * 4;
    ctx.strokeStyle = pal.band;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -6);
    ctx.quadraticCurveTo(-30, -4 + wave, -42, 2 + wave * 1.6);
    ctx.moveTo(-13, -5);
    ctx.quadraticCurveTo(-28, 4 - wave, -38, 12 - wave * 1.4);
    ctx.stroke();

    // череп
    circleGrad(ctx, 0, 0, HEAD_R, pal.skin[0], pal.skin[1]);
    // подбородок
    ctx.fillStyle = pal.skin[0];
    ctx.beginPath();
    ctx.ellipse(6, 9, 8, 6.5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // волосы: пучок на затылке + чёлка
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_R + 0.5, Math.PI * 0.85, Math.PI * 1.9);
    ctx.quadraticCurveTo(4, -HEAD_R * 0.55, -2, -HEAD_R * 0.25);
    ctx.closePath();
    ctx.fill();
    circleGrad(ctx, -10, -16, 7, pal.hair, pal.hair, false);

    // повязка на лбу
    ctx.strokeStyle = pal.band;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_R - 3, -Math.PI * 0.62, Math.PI * 0.12);
    ctx.stroke();

    // лицо: бровь, глаз, рот, ухо
    ctx.strokeStyle = 'rgba(35, 18, 10, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(4, -4.5); ctx.lineTo(12, -2.5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(9, 1, 3.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241408';
    ctx.beginPath(); ctx.arc(10.2, 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90, 40, 20, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(13, 8); ctx.stroke();
    ctx.fillStyle = pal.skin[1];
    ctx.beginPath(); ctx.arc(-11, 2, 3.4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }
}

/* Затемнение hex-цвета (для «дальних» конечностей — глубина). */
const shadeCache = new Map();
function shade(hex, mul) {
  const key = hex + mul;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * mul);
  const g = Math.round(((n >> 8) & 255) * mul);
  const b = Math.round((n & 255) * mul);
  v = `rgb(${r},${g},${b})`;
  shadeCache.set(key, v);
  return v;
}
