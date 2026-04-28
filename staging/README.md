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
  *.html              ← cópias dos HTMLs de produção (com noindex + banner)
  *.png, *.jpg        ← assets duplicados (paths relativos preservados)
  img/                ← assets de imagem do site (cópia de /img/)
  js/                 ← módulos JS do site (cópia de /js/)
  js/theme-loader.js  ← carregador de temas sazonais (Sprint 2)
  themes/             ← definições de temas
    default.json
    valentines-2026.json
  _staging.js         ← injeta banner e prefixo de título
  README.md           ← este arquivo
```

## Sistema de temas (Sprint 2)

Páginas em staging carregam `js/theme-loader.js` no `<head>`. Ele lê o tema ativo na seguinte ordem de prioridade:

1. `?theme=<id>` na URL — override pra preview
2. `localStorage.osl_theme_override` — persiste entre páginas
3. `window.OSL_ACTIVE_THEME` — preenchido pelo Firestore (Sprint 5)
4. `default`

E aplica três coisas: **CSS variables** em `:root`, **classes** no `<body>` (pra ativar decorações via CSS) e **textos/imagens** via atributos `data-theme-key` / `data-theme-img` no HTML.

### Arquivos de tema (JSON)

```jsonc
{
  "id": "valentines-2026",
  "name": "Dia dos Namorados 2026",
  "activeFrom": "2026-05-25",      // Sprint 5 lê isso pra ligar/desligar
  "activeUntil": "2026-06-15",
  "cssVars": { "--gold": "#ff5f7e", ... },
  "bodyClass": "theme-valentines",  // CSS pode usar .theme-valentines pra decorar
  "copy": {
    "vendas.heroTitle": "Para os dois ficarem.<br>Não para passarem o tempo."
  },
  "images": {
    "vendas.heroBanner": "./img/luis.png"
  }
}
```

### Como testar um tema (preview)

```
https://preludiojogos.com.br/staging/vendas.html?theme=valentines-2026
https://preludiojogos.com.br/staging/entrada.html?theme=valentines-2026
```

Ou no DevTools console: `OSL_setTheme('valentines-2026', true)` (persiste em localStorage). Pra limpar: `OSL_clearThemeOverride()`.

### Cobertura atual de marcação

| Página | Elementos marcados |
|---|---|
| `vendas.html` | hero eyebrow / title / sub / cta / note + imagem do banner |
| `entrada.html` | título / subtítulo / whisper |

Outras páginas (`sala.html`, `jogo.html`, etc.) ainda usam o `theme-loader` automaticamente quando incluído, mas não têm `data-theme-key` marcado — só herdam as `cssVars`. Estender conforme demanda.

### Como adicionar um novo evento sazonal

1. Cria `staging/themes/<evento>.json` com os overrides necessários (basta o que muda; o que não estiver no JSON usa o `default`).
2. Testa via `?theme=<evento>` em staging.
3. Quando aprovado, configura `activeFrom`/`activeUntil` no JSON e (Sprint 5) aponta o Firestore pra ele.
4. Promove pra prod copiando `themes/<evento>.json`, eventuais novos assets e qualquer mudança em HTMLs.

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
