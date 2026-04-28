# Staging — O SextoLugar

Ambiente de pré-produção do site. Aqui se trabalha mudanças (eventos sazonais, redesigns, novas features) **antes** de publicar no `preludiojogos.com.br`.

URL: `https://preludiojogos.com.br/staging/`

## Proteção

Acesso restrito via **Cloudflare Access** (Zero Trust). Todo request a `/staging/*` é interceptado e exige autenticação por OTP enviada para um e-mail autorizado.

Adicionalmente, todos os HTMLs daqui têm:
- `<meta name="robots" content="noindex, nofollow">` — não aparecem no Google
- Banner laranja fixo no topo identificando o ambiente
- Prefixo `[STAGING]` no `<title>` da aba

## Fluxo de trabalho

1. Edita os arquivos dentro de `/staging/` (NUNCA edita prod direto pra mudanças experimentais).
2. `git commit && git push` — GitHub Pages publica em ~1min.
3. Acessa `preludiojogos.com.br/staging/<arquivo>.html`, autentica no Cloudflare, valida.
4. Quando aprovado, **promover para produção** copiando os arquivos:
   ```bash
   # estando em luiskirsch.github.io/
   cp staging/vendas.html ./vendas.html
   cp staging/entrada.html ./entrada.html
   # (apenas os arquivos que mudaram)
   git add . && git commit -m "promote staging → prod: <descrição>" && git push
   ```
5. Validar em produção (`preludiojogos.com.br`).

## Estrutura

```
staging/
  *.html          ← cópias dos HTMLs de produção (com noindex + banner)
  *.png, *.jpg    ← assets duplicados (paths relativos preservados)
  _staging.js     ← injeta o banner e o prefixo de título
  README.md       ← este arquivo
```

## Configuração do Cloudflare Access (one-time setup)

> Pré-requisito: domínio `preludiojogos.com.br` precisa estar no Cloudflare com DNS **proxied** (registro laranja). Se estiver "DNS only" (cinza), Access não funciona.

1. **Cloudflare Dashboard → Zero Trust** (cria conta grátis se não tiver — até 50 usuários sem custo).
2. **Settings → Authentication → Login methods**: ativa **One-time PIN** (e-mail OTP). Sem necessidade de Google/GitHub SSO pra começar.
3. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `OSL Staging`
   - Session duration: `24 hours`
   - Application domain: `preludiojogos.com.br`
   - Path: `staging` (sem barra inicial; cobre `/staging/*`)
4. **Identity providers**: marca apenas `One-time PIN`.
5. **Add a policy**:
   - Policy name: `Staff`
   - Action: `Allow`
   - Configure rules → Include → Selector `Emails` → adiciona os e-mails autorizados (ex: `luishenriquekirsch@hotmail.com`).
6. **Save** e testa abrindo `https://preludiojogos.com.br/staging/` em uma janela anônima — deve aparecer a tela de login do Cloudflare.

## Notas

- **Backend de staging** roda separado em Railway (ver `osl-video-server/`). O front em `/staging/` deve apontar para o endpoint de staging quando configurado.
- **Firestore separado** (`sextolugar-staging`) — config Firebase trocada por env/flag (Sprint 5).
- **Nunca exponha esta URL** em redes sociais, repos públicos ou para usuários reais.
