// COOLT EDITOR: посредник, который присылает готовую обложку пользователю в Telegram.
// Переменные в Cloudflare: BOT_TOKEN (Secret), ALLOWED_ORIGIN (адрес сайта на GitHub Pages).
const enc = new TextEncoder();
const hmac = async (key, msg) => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// Проверка, что запрос пришёл из настоящего Telegram Mini App (и от какого пользователя).
async function verify(initData, token) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), token);
  if (hex(await hmac(secret, str)) !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  return JSON.parse(p.get('user'));
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('COOLT bot works', { headers: cors });
    try {
      const form = await req.formData();
      const user = await verify(form.get('initData'), env.BOT_TOKEN);
      if (!user) return json({ ok: false, error: 'Не удалось подтвердить пользователя' }, 403);
      const file = form.get('file');
      const out = new FormData();
      out.append('chat_id', String(user.id));
      out.append('document', file, file.name || 'COOLT.png'); // как документ: без сжатия
      out.append('caption', 'Обложка COOLT готова ✅');
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: out });
      const j = await r.json();
      return json({ ok: j.ok, error: j.description }, j.ok ? 200 : 502);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  }
};
