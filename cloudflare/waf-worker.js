/**
 * Cloudflare WAF Worker — preludiojogos.com + espacopreludio.com.br
 *
 * Cobre ambos os produtos com a mesma lógica de borda:
 *  1. Bloqueia UAs de clonadores/downloaders de site (HTTrack, websave…)
 *  2. Injeta cabeçalhos de segurança, incluindo frame-ancestors (só via HTTP header)
 *  3. HSTS para forçar HTTPS
 *  4. X-Robots-Tag: noindex nas páginas de app do jogo (EP já tem <meta noindex>)
 */

const CLONER_UA = /\b(httrack|winhttrack|websave|sitesuck(?:er)?|teleport[\s\-.]pro|black[\s\-]widow|webcopier|webzip|webstrip(?:per)?|offline[\s\-.]explorer|surfoffline|netattach|webwhacker|wwwoffle)\b/i;

// Cabeçalhos aplicados a TODAS as respostas dos dois domínios
const SEC_BASE = {
  'X-Frame-Options':           'SAMEORIGIN',
  'X-Content-Type-Options':    'nosniff',
  'Referrer-Policy':           'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

// frame-ancestors cobre os dois produtos (ambos podem embedar o próprio conteúdo)
const FRAME_ANCESTORS =
  "frame-ancestors 'self' " +
  "https://preludiojogos.com https://www.preludiojogos.com " +
  "https://preludiojogos.com.br https://www.preludiojogos.com.br " +
  "https://espacopreludio.com https://www.espacopreludio.com " +
  "https://espacopreludio.com.br https://www.espacopreludio.com.br";

// Páginas de app do jogo sem <meta robots> no HTML — precisam do header
const NOINDEX_JOGO = new Set([
  '/sala.html', '/entrada.html', '/painel.html',
  '/cadastro.html', '/login.html',
  '/deck-builder.html', '/encontro-marcado.html',
]);

export default {
  async fetch(request) {
    const ua = request.headers.get('User-Agent') || '';

    // Bloqueia clonador na borda — nunca chega à origem
    if (CLONER_UA.test(ua)) {
      return new Response('Acesso negado.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    let response;
    try {
      response = await fetch(request);
    } catch (_) {
      return new Response('Bad Gateway', { status: 502 });
    }

    const headers = new Headers(response.headers);

    // Cabeçalhos base
    for (const [k, v] of Object.entries(SEC_BASE)) headers.set(k, v);
    headers.set('Content-Security-Policy', FRAME_ANCESTORS);

    // X-Robots-Tag só para páginas do jogo (EP já tem <meta name="robots" noindex>)
    const url  = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;

    if (!host.includes('espacopreludio') && NOINDEX_JOGO.has(path)) {
      headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
