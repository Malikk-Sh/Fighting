// Экранные состояния и HUD: меню, ожидание, отсчёт, итог, сообщения.

const $ = (id) => document.getElementById(id);

const screens = ['screen-menu', 'screen-wait', 'screen-over', 'screen-msg'];

export const ui = {
  onCreate: null,
  onJoin: null,
  onRematch: null,

  init() {
    $('btn-create').addEventListener('click', () => this.onCreate && this.onCreate());
    $('btn-join').addEventListener('click', () => this._join());
    $('input-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._join();
    });
    $('input-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    $('btn-cancel').addEventListener('click', () => location.reload());
    $('btn-menu').addEventListener('click', () => location.reload());
    $('btn-msg-menu').addEventListener('click', () => location.reload());
    $('btn-rematch').addEventListener('click', () => this.onRematch && this.onRematch());
    $('room-code').addEventListener('click', () => {
      const code = $('room-code').textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    });
  },

  _join() {
    const code = $('input-code').value.trim();
    if (code.length < 4) return this.menuError('Введите код комнаты из 4 символов');
    this.onJoin && this.onJoin(code);
  },

  show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  },
  hideScreens() {
    for (const s of screens) $(s).classList.add('hidden');
  },

  menuError(text) {
    const el = $('menu-error');
    el.textContent = text;
    el.classList.remove('hidden');
  },

  showWaiting(code, lanUrls) {
    $('room-code').textContent = code;
    const urlEl = $('wait-url');
    const host = location.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && lanUrls && lanUrls.length) {
      urlEl.textContent = 'Адрес для второго устройства в вашей Wi-Fi сети:\n' + lanUrls.join('\n');
    } else {
      urlEl.textContent = 'Второй игрок открывает: ' + location.origin;
    }
    this.show('screen-wait');
  },

  setYou(myIdx) {
    $('name-' + myIdx).innerHTML = `ИГРОК ${myIdx + 1} <span class="you">— ВЫ</span>`;
    $('name-' + (1 - myIdx)).textContent = `ИГРОК ${2 - myIdx}`;
  },

  setHud(visible) {
    $('hud').classList.toggle('hidden', !visible);
    $('controls').classList.toggle('hidden', !visible);
  },

  setControls(visible) {
    $('controls').classList.toggle('hidden', !visible);
  },

  setHp(idx, hp) {
    const segs = $('hp-' + idx).querySelectorAll('.hp-seg');
    segs.forEach((seg, i) => seg.classList.toggle('lost', i >= hp));
  },

  resetHp() {
    this.setHp(0, 2);
    this.setHp(1, 2);
  },

  setPing(ms) {
    $('ping').textContent = ms > 0 ? ms + ' мс' : '— мс';
  },

  announce(text, holdMs = 700) {
    const el = $('announce');
    el.textContent = text;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth; // перезапуск CSS-анимации
    el.classList.add('pop');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => el.classList.add('hidden'), holdMs);
  },

  showOver(win, sub) {
    const title = $('over-title');
    title.textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    title.className = win ? 'win' : 'lose';
    $('over-banner').src = win ? 'assets/ui/banner-win.png' : 'assets/ui/banner-lose.png';
    $('over-sub').textContent = sub || '';
    $('over-status').textContent = '';
    $('btn-rematch').disabled = false;
    this.show('screen-over');
  },

  overStatus(text, disableRematch = false) {
    $('over-status').textContent = text;
    if (disableRematch) $('btn-rematch').disabled = true;
  },

  showMessage(title, text) {
    $('msg-title').textContent = title;
    $('msg-text').textContent = text;
    this.show('screen-msg');
  },
};
