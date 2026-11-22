/**
 * cena.preludiojogos.com.br — serve a cabana 3D (Godot/WebGL 2) do bucket R2 "sextolugar-cena".
 *
 * O lobby (preludiojogos.com/sala.html) embute <canal>/atual.html num iframe; a página do avatar
 * (preludiojogos.com/avatar.html) embute avatar/atual.html (criador de avatar, build própria).
 * Domínio de outro site (.com.br ≠ .com): o Chrome roda a cena num processo próprio e a
 * compilação de shaders da primeira visita não trava a interface do lobby.
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

/**
 * Download do app nativo (botão "Entrar pelo app" do lobby): app/<nome>.zip. A API do R2 recusa
 * (500) envios grandes de uma vez, então o pacote sobe em partes (sextolugar-godot: o manifesto
 * <nome>.zip.partes.json lista as partes, o tamanho total e o sha256) e sai daqui emendado como um
 * arquivo só, com Content-Length (o navegador mostra o progresso).
 */
async function baixarApp(chave, request, env, ctx) {
  const manifesto = await env.CENA.get(chave + '.partes.json');
  if (!manifesto) return new Response('Não encontrado', { status: 404 });
  const info = await manifesto.json();
  const cabecalhos = new Headers({
    'Content-Type': info.tipo || 'application/zip',
    'Content-Length': String(info.tamanho),
    'Content-Disposition': `attachment; filename="${info.nome}"`,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (request.method === 'HEAD') return new Response(null, { headers: cabecalhos });
  const { readable, writable } = new FixedLengthStream(info.tamanho);
  const emendar = async () => {
    try {
      for (let i = 0; i < info.partes.length; i++) {
        const parte = await env.CENA.get('app/' + info.partes[i]);
        if (!parte) throw new Error('parte ausente: ' + info.partes[i]);
        await parte.body.pipeTo(writable, { preventClose: i < info.partes.length - 1 });
      }
    } catch (erro) {
      await writable.abort(erro).catch(() => {});
    }
  };
  ctx.waitUntil(emendar());   // a emenda segue enquanto o navegador baixa
  return new Response(readable, { headers: cabecalhos, encodeBody: 'manual' });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    let chave = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (/^app\/[\w.-]+\.zip$/.test(chave)) return baixarApp(chave, request, env, ctx);
    if (chave === '' || chave === 'producao' || chave === 'producao/') chave = 'producao/atual.html';
    if (chave === 'staging' || chave === 'staging/') chave = 'staging/atual.html';
    if (chave === 'avatar' || chave === 'avatar/') chave = 'avatar/atual.html';
    if (!/^(producao|staging|avatar)\//.test(chave) || chave.includes('..')) {
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
