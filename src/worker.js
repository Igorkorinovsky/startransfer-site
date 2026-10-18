// Cloudflare Worker: serves the static site and handles POST /api/booking -> Telegram (no database).
// Secrets (Cloudflare -> Workers & Pages -> startransfer-site -> Settings -> Variables and Secrets):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
const CARS = ['Комфорт', 'Бізнес', 'Преміум', 'Мінівен', 'Не важливо'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const reply = (ok, status = 200) => new Response(JSON.stringify({ ok }), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

async function booking(request, env) {
  // only accept requests coming from our own site
  const origin = request.headers.get('Origin');
  if (origin) {
    let same = false;
    try { same = new URL(origin).host === new URL(request.url).host; } catch (e) {}
    if (!same) return reply(false, 403);
  }

  let d;
  try { d = await request.json(); } catch (e) { return reply(false, 400); }
  if (!d || typeof d !== 'object') return reply(false, 400);

  if (d.website) return reply(true);                 // honeypot filled: pretend success, send nothing
  if (!(Number(d.elapsed) > 2500)) return reply(false, 400); // form filled too fast: likely a bot

  const name = str(d.name, 80), phone = str(d.phone, 20), from = str(d.from, 120), to = str(d.to, 120);
  const comment = str(d.comment, 500), date = str(d.date, 10);
  const car = CARS.includes(d.car) ? d.car : 'Не важливо';

  if (name.length < 2 || !/^\+?\d{9,15}$/.test(phone) || !from || !to || d.consent !== true) return reply(false, 400);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(false, 400);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(false, 500);

  const text =
    '🚗 <b>Нова заявка на трансфер</b>\n\n' +
    '👤 ' + esc(name) + '\n' +
    '📞 ' + esc(phone) + '\n' +
    '📅 ' + esc(date || 'не вказано') + '\n' +
    '📍 Звідки: ' + esc(from) + '\n' +
    '🏁 Куди: ' + esc(to) + '\n' +
    '🚘 Авто: ' + esc(car) + '\n' +
    '💬 ' + esc(comment || '—') + '\n\n' +
    '🌐 Мова сайту: ' + esc(str(d.lang, 5));

  const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true })
  });
  return reply(r.ok, r.ok ? 200 : 502);
}


// Old route slugs (Ukrainian transliteration) -> new slugs. 301 so Google moves the pages to the new URLs.
const OLD_SLUGS = {
  'transfer-khelm-varshava': 'transfer-chelm-warsaw',
  'transfer-kyiv-budapesht': 'transfer-kyiv-budapest',
  'transfer-kyiv-bukharest': 'transfer-kyiv-bucharest',
  'transfer-kyiv-krakiv': 'transfer-kyiv-krakow',
  'transfer-kyiv-kyshyniv': 'transfer-kyiv-chisinau',
  'transfer-kyiv-lyublin': 'transfer-kyiv-lublin',
  'transfer-kyiv-praha': 'transfer-kyiv-prague',
  'transfer-kyiv-varshava': 'transfer-kyiv-warsaw',
  'transfer-kyiv-viden': 'transfer-kyiv-vienna',
  'transfer-kyiv-zheshuv': 'transfer-kyiv-rzeszow',
  'transfer-lviv-bratyslava': 'transfer-lviv-bratislava',
  'transfer-lviv-budapesht': 'transfer-lviv-budapest',
  'transfer-lviv-katovitse': 'transfer-lviv-katowice',
  'transfer-lviv-krakiv': 'transfer-lviv-krakow',
  'transfer-lviv-lyublin': 'transfer-lviv-lublin',
  'transfer-lviv-peremyshl': 'transfer-lviv-przemysl',
  'transfer-lviv-praha': 'transfer-lviv-prague',
  'transfer-lviv-varshava': 'transfer-lviv-warsaw',
  'transfer-lviv-viden': 'transfer-lviv-vienna',
  'transfer-lviv-vrotslav': 'transfer-lviv-wroclaw',
  'transfer-lviv-zheshuv': 'transfer-lviv-rzeszow',
  'transfer-peremyshl-krakiv': 'transfer-przemysl-krakow',
  'transfer-peremyshl-varshava': 'transfer-przemysl-warsaw'
};

function oldSlugRedirect(url) {
  const m = url.pathname.match(/^\/(ru\/|en\/)?(transfer-[a-z]+-[a-z]+)\/?(index\.html)?$/);
  if (!m || !OLD_SLUGS[m[2]]) return null;
  return Response.redirect(url.origin + '/' + (m[1] || '') + OLD_SLUGS[m[2]] + '/' + url.search, 301);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/booking') {
      return request.method === 'POST' ? booking(request, env) : reply(false, 405);
    }
    const moved = oldSlugRedirect(url);
    if (moved) return moved;
    return env.ASSETS.fetch(request);
  }
};
