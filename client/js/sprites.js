// Спрайтовый рендер бойца: листы 4x2, нарезанные препроцессором в atlas.json.
// Если ассеты не загрузились, игра откатывается на процедурного бойца (fighter.js).

const BASE = 'assets/ronin/';
const WORLD_H = 205; // высота бойца в стойке, мировые единицы

export const sprites = {
  ready: false,
  atlas: null,
  sheets: {},
};

export async function loadSprites() {
  try {
    const res = await fetch(BASE + 'atlas.json');
    if (!res.ok) return false;
    const atlas = await res.json();
    const loaded = await Promise.all(Object.entries(atlas.sheets).map(
      ([name, sheet]) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([name, img]);
        img.onerror = reject;
        img.src = BASE + sheet.file;
      }),
    ));
    for (const [name, img] of loaded) sprites.sheets[name] = img;
    sprites.atlas = atlas;
    sprites.ready = true;
  } catch {
    sprites.ready = false;
  }
  return sprites.ready;
}

/* Раскладка анимаций по листам и кадрам.
 * Тайминги windup/strike/recover совпадают с серверными фазами атаки. */
const ANIM = {
  idle: { sheet: 'idle', frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 1150, loop: true },
  walk: { sheet: 'walk', frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 760, loop: true },
  windup: { sheet: 'attack', frames: [0, 1, 2], dur: 260 },
  strike: { sheet: 'attack', frames: [3, 4], dur: 150 },
  recover: { sheet: 'attack', frames: [5, 6, 7], dur: 280 },
  hit: { sheet: 'hit', frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 620 },
  ko: { sheet: 'ko', frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 950 },
  win: { sheet: 'win', frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 1400 },
};

export class SpriteFighter {
  constructor(idx) {
    this.idx = idx;
    this.x = 0;
    this.facing = idx === 0 ? 1 : -1;
    this.st = 'idle';
    this.stAt = performance.now();
    this.flashUntil = 0;
    this._prevX = 0;
    this._moveDir = 0;
  }

  setState(st, now) {
    if (st !== this.st) {
      this.st = st;
      this.stAt = now;
    }
  }

  flash() { this.flashUntil = performance.now() + 170; }

  update() {
    const dx = this.x - this._prevX;
    this._prevX = this.x;
    if (Math.abs(dx) > 0.4) this._moveDir = Math.sign(dx);
    else this._moveDir = 0;
  }

  _frame() {
    const anim = ANIM[this.st] || ANIM.idle;
    const t = performance.now() - this.stAt;
    let index;
    if (anim.loop) {
      let phase = (t % anim.dur) / anim.dur;
      // шаг назад — тот же цикл в обратную сторону
      if (this.st === 'walk' && this._moveDir !== 0 && this._moveDir !== this.facing) {
        phase = 1 - phase;
      }
      index = Math.min(anim.frames.length - 1, Math.floor(phase * anim.frames.length));
    } else {
      index = Math.min(anim.frames.length - 1, Math.floor((t / anim.dur) * anim.frames.length));
    }
    return { anim, frame: sprites.atlas.sheets[anim.sheet].frames[anim.frames[index]] };
  }

  draw(ctx) {
    const { anim, frame } = this._frame();
    const img = sprites.sheets[anim.sheet];
    const s = WORLD_H / sprites.atlas.unitHeight;

    ctx.save();
    ctx.translate(this.x, 0);

    // тень
    const spread = this.st === 'ko' ? 1.8 : 1;
    const sh = ctx.createRadialGradient(0, 6, 4, 0, 6, 58 * spread);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, 6, 58 * spread, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(this.facing, 1);
    const dx = -frame.ax * s;
    const dy = -frame.h * s;
    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * s, frame.h * s);

    // вспышка урона: повторная отрисовка «светом»
    if (performance.now() < this.flashUntil) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * s, frame.h * s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }
}
