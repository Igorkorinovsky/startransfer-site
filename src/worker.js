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


export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/booking') {
      return request.method === 'POST' ? booking(request, env) : reply(false, 405);
    }
    return env.ASSETS.fetch(request);
  }
};
