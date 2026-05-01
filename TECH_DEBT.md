# Tech Debt Backlog — luiskirsch.github.io (frontend)

Findings da auditoria de qualidade de código de **2026-05-01**. Os críticos e high-value já foram corrigidos (ver commits `f03a367` e `f644e30`). Este arquivo lista o que ficou pendente, com motivo.

Cada item pode virar um GitHub Issue independente. Severidade: **P1** = bug latente, **P2** = smell que piora manutenção, **P3** = preferência de estilo.

---

## P1 — Bugs latentes

### #F1 Audit sistemático de innerHTML com user data

- **Severidade:** P1
- **Arquivos:** `staging/js/ui/streaming.js:310`, `staging/js/ui/room.js:45`, `staging/sala.html` (vários inline)
- **Problema:** Vários sítios usam `.innerHTML = ...` ou `.innerHTML += ...`. Hoje o conteúdo é controlado, mas o padrão é arriscado — uma futura mudança que parametriza o conteúdo abre XSS.
- **Fix sugerido:** Auditoria sistemática: trocar `.innerHTML` por construção via `document.createElement` + `textContent` quando possível. Onde é necessário HTML, sanitizar com helper único `safeHtml()`.

### #F2 Validar Content-Type antes de .json()

- **Severidade:** P1
- **Arquivo:** `staging/js/ui/streaming.js` (e outros)
- **Problema:** `await res.json()` sem verificar header. Se o backend devolver HTML (504 do Cloudflare, p.ex.), `.json()` lança e o erro é genérico.
- **Fix sugerido:** Helper `await jsonResponse(res)` que checa `res.headers.get("content-type")?.includes("application/json")`. Se não, retorna mensagem específica.

---

## P2 — Refactors estruturais

### #F3 Converter recording.js / streaming.js / payments.js pra ES modules

- **Severidade:** P2
- **Arquivos:** `staging/js/ui/{recording,streaming,payments}.js`
- **Problema:** Esses 3 são IIFE carregados via `<script src="">` (não-módulo). Não podem usar `import`. Levou a window.PANEL_SERVER_BASE como bridge improvisada e duplicação de constantes.
- **Fix sugerido:** Converter pra ES module e trocar tag pra `<script type="module">` em sala.html. Garantir ordem de inicialização (DOM ready, etc).
- **Tradeoff:** Risco de quebrar timing de inicialização. Precisa testar bem.

### #F4 Sistema sistêmico de stream-hide

- **Severidade:** P2
- **Arquivos:** `staging/sala.html` (várias linhas com `class="stream-hide"`)
- **Problema:** Modo Transmissão depende de developer lembrar de adicionar a classe em qualquer novo elemento credencial. Sem proteção sistemática.
- **Fix sugerido:** Trocar por atributo `data-sensitive="true"` + CSS `html.streaming-mode [data-sensitive] { display: none }`. Adicionar lint que avisa quando email/code aparece em template sem o atributo.

### #F5 Helpers compartilhados (pollPayment, fetchWithAuth, ProfileButtonWithAvatar)

- **Severidade:** P2
- **Arquivos:** `staging/js/ui/recording.js`, `streaming.js`, `init.js`, `mobile.js`, `profile.js`
- **Problema:** 3 padrões duplicados em vários sítios:
  1. Polling de pagamento (60×3000ms loop com clear)
  2. Fetch + JSON parse + fallback
  3. Render de botão de perfil com avatar/foto/emoji
- **Fix sugerido:** Após F3 (módulos), extrair pra helpers em utils.js.

### #F6 Bridge.js para window._osl* exports

- **Severidade:** P2
- **Arquivos:** `staging/js/firebase-app.js:24`, `staging/js/init.js:64-77`
- **Problema:** Vários `window._oslX` definidos espalhados — semipublic API sem documento.
- **Fix sugerido:** Único `staging/js/bridge.js` que define todas exposições com JSDoc.

---

## P2 — Style / consistência

### #F7 localStorage key naming convention

- **Severidade:** P2
- **Arquivos:** Vários
- **Problema:** Mistura de `osl_X`, `oslX`, `PANEL_SERVER_BASE` (uppercase). Sem documento sobre convenção.
- **Fix sugerido:** Padronizar pra `osl_snake_case` em todos. Documentar em README do staging.

### #F8 try-catch consistency

- **Severidade:** P2
- **Arquivos:** Vários (`staging/js/ui/profile.js`, `game/cards.js`, etc)
- **Problema:** `catch (_) {}` vs `catch (e) {}` vs `catch(error){}` — sem padrão.
- **Fix sugerido:** Convenção: `catch (_)` quando ignorando, `catch (err)` quando logando. ESLint rule.

### #F9 Error handling consistency em init.js

- **Severidade:** P2
- **Arquivo:** `staging/js/init.js:150-171`
- **Problema:** Bloco grande de error rendering inline mistura logging + UI.
- **Fix sugerido:** Extrair `handleInitError(err)` que separa logging (sempre) de UI (só pra erros user-facing).

---

## P3 — Magic numbers

### #F10 Timing constants

- **Severidade:** P3
- **Arquivos:** `staging/js/ui/room.js:232` (800ms), `staging/js/game/effects.js:55` (4000ms / 400ms)
- **Problema:** Magic numbers sem nome.
- **Fix sugerido:** `const VIDEO_TILE_AVATAR_DELAY_MS = 800; const TOAST_VISIBLE_MS = 4000; const TOAST_FADE_MS = 400;` em constants.js.

---

## Resumo

| Severidade | Count |
|---|---|
| P1 | 2 |
| P2 | 7 |
| P3 | 1 |
| **Total** | **10** |

(Algumas P3/P2 menores foram fundidas em itens maiores; total backend + frontend = 26 issues no backlog.)
