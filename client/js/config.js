// Определение адреса WebSocket-сервера.
// Приоритет: ?server=... в URL → window.GAME_WS_URL (index.html) → хост текущей страницы.
const qs = new URLSearchParams(location.search);
const override = qs.get('server') || window.GAME_WS_URL || '';

function toWsUrl(value) {
  if (/^wss?:\/\//.test(value)) return value;
  if (/^https?:\/\//.test(value)) return value.replace(/^http/, 'ws');
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  return proto + value;
}

export const WS_URL = override
  ? toWsUrl(override)
  : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
