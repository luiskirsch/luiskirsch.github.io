/**
 * cena.preludiojogos.com.br — serve a cabana 3D (Godot/WebGL 2) do bucket R2 "sextolugar-cena".
 *
 * O lobby (preludiojogos.com/sala.html) embute <canal>/atual.html num iframe. Domínio de outro
 * site (.com.br ≠ .com): o Chrome roda a cena num processo próprio e a compilação de shaders da
 * primeira visita não trava a interface do lobby.
 *
 * Os objetos já sobem com Content-Type, Cache-Control (imutável nas versões, no-cache no
 * atual.html) e, no .wasm/.pck/.js, Content-Encoding: gzip — repassados como estão
 * (encodeBody: "manual" evita comprimir de novo). Publicação: sextolugar-godot/ferramentas/publicar_web.py
 */
const PODE_EMBUTIR = [
  'https://preludiojogos.com', 'https://www.preludiojogos.com',
  'https://preludiojogos.com.br', 'https://www.preludiojogos.com.br',
  'http://localhost:*', 'http://127.0.0.1:*',
].join(' ');

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    let chave = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (chave === '' || chave === 'producao' || chave === 'producao/') chave = 'producao/atual.html';
    if (chave === 'staging' || chave === 'staging/') chave = 'staging/atual.html';
    if (!/^(producao|staging)\//.test(chave) || chave.includes('..')) {
      return new Response('Não encontrado', { status: 404 });
    }

    const objeto = request.method === 'HEAD' ? await env.CENA.head(chave) : await env.CENA.get(chave);
    if (!objeto) return new Response('Não encontrado', { status: 404 });

    const cabecalhos = new Headers();
    objeto.writeHttpMetadata(cabecalhos);
    cabecalhos.set('ETag', objeto.httpEtag);
    cabecalhos.set('X-Content-Type-Options', 'nosniff');
    cabecalhos.set('Content-Security-Policy', `frame-ancestors ${PODE_EMBUTIR}`);
    cabecalhos.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (request.method === 'HEAD') cabecalhos.set('Content-Length', String(objeto.size));
    return new Response(request.method === 'HEAD' ? null : objeto.body, {
      headers: cabecalhos,
      encodeBody: objeto.httpMetadata && objeto.httpMetadata.contentEncoding ? 'manual' : 'automatic',
    });
  },
};
