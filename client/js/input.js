// Ввод: виртуальный джойстик (левая зона), кнопка удара, клавиатура.
// Наружу отдаёт колбэки onDir(-1|0|1) и onAttack(), плюс отрисовку кулдауна на кнопке.

const STICK_DEADZONE = 14; // px

export class Input {
  constructor() {
    this.onDir = () => {};
    this.onAttack = () => {};
    this.onAnyGesture = () => {}; // для разблокировки звука
    this.enabled = false;

    this._dir = 0;
    this._keys = { left: false, right: false };
    this._stickPointer = null;
    this._stickOrigin = 0;

    this.zone = document.getElementById('stick-zone');
    this.base = document.getElementById('stick-base');
    this.thumb = document.getElementById('stick-thumb');
    this.hintEl = document.getElementById('stick-hint');
    this.btn = document.getElementById('btn-attack');
    this.ring = document.getElementById('attack-ring');
    this.label = document.getElementById('attack-label');

    this._bind();
  }

  _bind() {
    document.addEventListener('pointerdown', () => this.onAnyGesture(), { capture: true });

    // --- джойстик
    this.zone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this._stickPointer !== null) return;
      this._stickPointer = e.pointerId;
      this._stickOrigin = e.clientX;
      this.base.classList.remove('hidden');
      this.base.style.left = e.clientX + 'px';
      this.base.style.top = e.clientY + 'px';
      this.hintEl.style.opacity = '0';
      this.zone.setPointerCapture(e.pointerId);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickPointer) return;
      const dx = e.clientX - this._stickOrigin;
      const clamped = Math.max(-46, Math.min(46, dx));
      this.thumb.style.transform = `translateX(${clamped}px)`;
      const dir = dx > STICK_DEADZONE ? 1 : dx < -STICK_DEADZONE ? -1 : 0;
      this._setStickDir(dir);
    });
    const stickEnd = (e) => {
      if (e.pointerId !== this._stickPointer) return;
      this._stickPointer = null;
      this.base.classList.add('hidden');
      this.thumb.style.transform = '';
      this._setStickDir(0);
    };
    this.zone.addEventListener('pointerup', stickEnd);
    this.zone.addEventListener('pointercancel', stickEnd);

    // --- кнопка удара
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.onAttack();
    });

    // --- клавиатура (для десктопа)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') { this._keys.left = true; this._emitKeyDir(); }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') { this._keys.right = true; this._emitKeyDir(); }
      if (e.code === 'Space' || e.code === 'KeyJ') {
        if (this.enabled && document.activeElement?.tagName !== 'INPUT') {
          e.preventDefault();
          this.onAttack();
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') { this._keys.left = false; this._emitKeyDir(); }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') { this._keys.right = false; this._emitKeyDir(); }
    });
    window.addEventListener('blur', () => {
      this._keys.left = this._keys.right = false;
      this._emitKeyDir();
    });
  }

  _setStickDir(dir) {
    if (dir === this._stickLast) return;
    this._stickLast = dir;
    this._emit(dir);
  }

  _emitKeyDir() {
    const dir = (this._keys.right ? 1 : 0) - (this._keys.left ? 1 : 0);
    this._emit(dir);
  }

  _emit(dir) {
    if (!this.enabled) dir = 0;
    if (dir === this._dir) return;
    this._dir = dir;
    this.onDir(dir);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this._stickPointer = null;
      this.base.classList.add('hidden');
      this.thumb.style.transform = '';
      if (this._dir !== 0) { this._dir = 0; this.onDir(0); }
      this._stickLast = 0;
    } else {
      this.hintEl.style.opacity = '';
    }
  }

  // Круговой индикатор перезарядки на кнопке. cd — мс до готовности, total — полный кулдаун.
  updateCooldown(cd, total) {
    if (cd > 0) {
      const done = 1 - cd / total; // доля готовности
      this.btn.classList.add('cooldown');
      this.btn.classList.remove('ready-pulse');
      this.ring.style.background =
        `conic-gradient(rgba(255,255,255,0.0) ${done}turn, rgba(10,4,2,0.72) ${done}turn 1turn)`;
      this.label.textContent = (cd / 1000).toFixed(1);
    } else {
      if (this.btn.classList.contains('cooldown')) {
        this.btn.classList.remove('cooldown');
        this.ring.style.background = 'none';
        this.label.textContent = 'УДАР';
      }
      if (this.enabled) this.btn.classList.add('ready-pulse');
    }
  }
}
