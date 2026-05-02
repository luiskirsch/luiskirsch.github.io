# Staging — SEXTOLUGAR

Ambiente de pré-produção do site. Aqui se trabalha mudanças (eventos sazonais, redesigns, novas features) **antes** de publicar no `preludiojogos.com`.

URL: `https://preludiojogos.com/staging/`

## Proteção

Acesso restrito via **Cloudflare Access** (Zero Trust). Todo request a `/staging/*` é interceptado e exige autenticação por OTP enviada para um e-mail autorizado.

Adicionalmente, todos os HTMLs daqui têm:
- `<meta name="robots" content="noindex, nofollow">` — não aparecem no Google
- Banner laranja fixo no topo identificando o ambiente
- Prefixo `[STAGING]` no `<title>` da aba

## Fluxo de trabalho

1. Edita os arquivos dentro de `/staging/` (NUNCA edita prod direto pra mudanças experimentais).
2. `git commit && git push` — GitHub Pages publica em ~1min.
3. Acessa `preludiojogos.com/staging/<arquivo>.html`, autentica no Cloudflare, valida.
4. Quando aprovado, **promover para produção** copiando os arquivos:
   ```bash
   # estando em luiskirsch.github.io/
   cp staging/vendas.html ./vendas.html
   cp staging/entrada.html ./entrada.html
   # (apenas os arquivos que mudaram)
   git add . && git commit -m "promote staging → prod: <descrição>" && git push
   ```
5. Validar em produção (`preludiojogos.com`).

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
https://preludiojogos.com/staging/vendas.html?theme=valentines-2026
https://preludiojogos.com/staging/entrada.html?theme=valentines-2026
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
3. Quando aprovado, ativa via [`/staging/admin-theme.html`](admin-theme.html) (ou direto no Firestore Console — campos do doc `config/activeTheme` documentados abaixo).
4. Promove pra prod copiando `themes/<evento>.json`, eventuais novos assets e qualquer mudança em HTMLs (**NÃO copiar `js/firebase-config.js`** — ver seção de promoção).

## Ativação dinâmica via Firestore (Sprint 5)

`js/active-theme.js` é carregado depois do `theme-loader.js` em `vendas.html` e `entrada.html`. Ele lê o doc `config/activeTheme` no Firestore e, se houver evento sazonal ativo na janela de datas atual, troca o tema em runtime sem deploy.

### Esquema do doc `config/activeTheme`

```jsonc
{
  "themeId":         "valentines-2026",   // qual tema usar quando dentro da janela
  "activeFrom":      "2026-05-25",        // YYYY-MM-DD ou ISO datetime; null = ativa imediato
  "activeUntil":     "2026-06-15",        // null = ativa permanente
  "fallbackThemeId": "default",           // qual tema usar fora da janela
  "updatedAt":       <serverTimestamp>,
  "updatedBy":       "luish@..."
}
```

Lógica:
- Se `now >= activeFrom` e `now <= activeUntil` (ou se ambos forem null), aplica `themeId`.
- Caso contrário, aplica `fallbackThemeId`.
- Override manual via `?theme=` ou `localStorage.osl_theme_override` **sempre vence** o doc.

### Cache no cliente

`active-theme.js` grava o último `themeId` resolvido em `localStorage.osl_active_theme_cached`. Em visitas subsequentes o `theme-loader.js` lê esse cache **antes** de o Firestore responder, eliminando o flash de default → sazonal.

### Painel admin

[`/staging/admin-theme.html`](admin-theme.html) — página protegida por Cloudflare Access + Firebase Auth. Permite editar o doc sem abrir o Firestore Console. Login com qualquer usuário Firebase do projeto.

Botões:
- **Salvar** — grava o doc com os valores do form.
- **Aplicar agora (30d)** — preenche `activeFrom = hoje` e `activeUntil = hoje + 30 dias`.
- **Desativar evento** — zera tudo, volta a `default`.

## Setup Firebase staging — ✅ CONCLUÍDO (2026-05-01)

- `staging/js/firebase-config.js` aponta pro projeto `sextolugar-staging` (`__isStagingProject: true`).
- Authentication (Email/Password) e Firestore Database habilitados no projeto staging.
- Backend `osl-video-server-staging` rodando no Railway com service account próprio (`firebaseProjectId: sextolugar-staging` no `/health`).
- Todos os arquivos do `/staging/` apontam pro backend `https://osl-video-server-staging.up.railway.app` (substituiu os hardcodes de `osl-video-server-production` e `osl-video-server.onrender.com`).
- App RN consome o mesmo backend staging via `app.config.js` quando `APP_ENV=staging`.

Resultado: frente staging completamente isolada de prod (Firestore, backend MP webhook, secrets, bundle ID).

## Promoção staging → produção

Fluxo geral: `cp staging/<arquivo> ./<arquivo>` pros HTMLs, JSONs e assets aprovados.

**NUNCA copiar:**

| Arquivo | Por quê |
|---|---|
| `staging/js/firebase-config.js` | Tem credenciais de staging (ou de fallback prod, mas com flag de marcador) — promover sobrescreveria a config real de prod |
| `staging/_staging.js` | É o banner laranja — só faz sentido em staging |
| `staging/admin-theme.html` | Admin tool, não é página pública |
| `staging/README.md` | Doc deste ambiente |

**Sempre tirar:**
- `<meta name="robots" content="noindex, nofollow">` dos HTMLs ao copiar (foi adicionado só pra staging não vazar no Google).
- Tag `<script src="_staging.js" defer></script>` dos HTMLs.

> A promoção idealmente deveria ser scriptada — fica como TODO. Por enquanto, é cirúrgica via `cp` + remoção das tags.

Quando o evento sazonal estiver pronto pra produção:
1. Copia themes JSON novos pra `/themes/`.
2. Copia mudanças em HTMLs (sem as tags acima).
3. Copia `js/active-theme.js`, `js/firebase-app.js`, `js/firebase-config.js` (do **prod**, não do staging) e a versão atualizada de `js/firebase.js` na primeira promoção do Sprint 5.
4. Cria/atualiza o doc `config/activeTheme` no Firestore **prod** (`osextolugar-game`) com os mesmos valores que estavam funcionando em staging.

## Configuração do Cloudflare Access (one-time setup)

> Pré-requisito: domínio `preludiojogos.com` precisa estar no Cloudflare com DNS **proxied** (registro laranja). Se estiver "DNS only" (cinza), Access não funciona.

1. **Cloudflare Dashboard → Zero Trust** (cria conta grátis se não tiver — até 50 usuários sem custo).
2. **Settings → Authentication → Login methods**: ativa **One-time PIN** (e-mail OTP). Sem necessidade de Google/GitHub SSO pra começar.
3. **Access → Applications → Add an application → Self-hosted**.
   - Application name: `OSL Staging`
   - Session duration: `24 hours`
   - Application domain: `preludiojogos.com`
   - Path: `staging` (sem barra inicial; cobre `/staging/*`)
4. **Identity providers**: marca apenas `One-time PIN`.
5. **Add a policy**:
   - Policy name: `Staff`
   - Action: `Allow`
   - Configure rules → Include → Selector `Emails` → adiciona os e-mails autorizados (ex: `luishenriquekirsch@hotmail.com`).
6. **Save** e testa abrindo `https://preludiojogos.com/staging/` em uma janela anônima — deve aparecer a tela de login do Cloudflare.

## Notas

- **Backend de staging** roda em Railway (`osl-video-server-staging.up.railway.app`). Todo o `/staging/` aponta pra ele — ver `osl-video-server/STAGING.md`.
- **Firestore separado** (`sextolugar-staging`) — `staging/js/firebase-config.js` aponta direto pra ele.
- **Nunca exponha esta URL** em redes sociais, repos públicos ou para usuários reais.
