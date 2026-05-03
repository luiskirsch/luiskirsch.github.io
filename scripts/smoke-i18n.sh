#!/usr/bin/env bash
# Smoke test do i18n em produção (preludiojogos.com).
#
# Roda: bash scripts/smoke-i18n.sh
# Saída: cada teste com OK/FAIL + sumário.
# Exit code 0 se tudo passou; >0 = quantos falharam.

set -uo pipefail

BASE="${BASE:-https://preludiojogos.com}"
BACKEND="${BACKEND:-https://osl-video-server-production.up.railway.app}"

# Cores ANSI
G="\033[32m"; R="\033[31m"; Y="\033[33m"; D="\033[2m"; N="\033[0m"

PASS=0
FAIL=0
FAIL_LIST=()

ok()   { printf "  ${G}✓${N} %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  ${R}✗${N} %s\n" "$1"; FAIL=$((FAIL+1)); FAIL_LIST+=("$1"); }
hdr()  { printf "\n${Y}== %s ==${N}\n" "$1"; }

# ── 1. JSON files (16 = 8 namespaces × 2 locales — ou mais se foram criados) ──
hdr "1. Translation JSONs"
NAMESPACES=(common index erro pendente sucesso login cadastro entrada vendas sala painel jogo cards missions achievements xptitles effects backend)
for locale in pt-BR en-US; do
  for ns in "${NAMESPACES[@]}"; do
    url="${BASE}/i18n/locales/${locale}/${ns}.json"
    body=$(curl -fsSL --max-time 10 "$url" 2>/dev/null) || { fail "$locale/$ns.json — HTTP error"; continue; }
    # valida JSON via node (sempre disponível com Railway CLI etc)
    if echo "$body" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{JSON.parse(d);process.exit(0)}catch(e){process.exit(1)}})" 2>/dev/null; then
      size=$(echo -n "$body" | wc -c)
      ok "$locale/$ns.json (${size}b)"
    else
      fail "$locale/$ns.json — invalid JSON"
    fi
  done
done

# ── 2. init.js ─────────────────────────────────────────────────────────────────
hdr "2. init.js"
init_url="${BASE}/i18n/init.js"
init_body=$(curl -fsSL --max-time 10 "$init_url" 2>/dev/null) || { fail "init.js — HTTP error"; }
if [[ -n "$init_body" ]]; then
  # Verificações básicas: tem detectLocale, localizeCard, localizeBackendError
  for sym in "detectLocale" "localizeCard" "localizeBackendError" "OSL_I18N_LOADED" "applyTranslations" "createSwitcher"; do
    echo "$init_body" | grep -q "$sym" && ok "init.js exporta $sym" || fail "init.js missing $sym"
  done
fi

# ── 3. HTMLs principais — data-i18n-ns + script src=./i18n/init.js ─────────────
# Usa pipe streaming (sem captura em variável) pra evitar truncate em arquivos
# grandes (sala.html é ~250KB). Cada check faz seu próprio curl.
hdr "3. HTMLs com i18n hooked"
HTMLS=(index.html erro.html pendente.html sucesso.html login.html cadastro.html entrada.html vendas.html sala.html painel.html jogo.html)
for html in "${HTMLS[@]}"; do
  has_ns=$(curl -fsSL --max-time 30 "${BASE}/${html}" 2>/dev/null | grep -c 'data-i18n-ns=' || true)
  has_init=$(curl -fsSL --max-time 30 "${BASE}/${html}" 2>/dev/null | grep -c '/i18n/init.js' || true)
  if [[ "$has_ns" -ge 1 && "$has_init" -ge 1 ]]; then
    ok "$html — init.js + ns"
  elif [[ "$has_ns" -eq 0 && "$has_init" -eq 0 ]]; then
    fail "$html — HTTP fail ou sem i18n hook"
  else
    fail "$html — partial: ns=$has_ns init=$has_init"
  fi
done

# ── 4. Title localizado (EN) ───────────────────────────────────────────────────
hdr "4. Title tags com data-i18n"
for html in index.html vendas.html sala.html painel.html entrada.html; do
  count=$(curl -fsSL --max-time 30 "${BASE}/${html}" 2>/dev/null | grep -c '<title data-i18n=' || true)
  [[ "$count" -ge 1 ]] && ok "$html title marcado" || fail "$html title sem data-i18n"
done

# ── 5. Cartas — sample 3 cards traduzidas em EN ──────────────────────────────
hdr "5. Cartas EN spot check"
cards_en=$(curl -fsSL --max-time 10 "${BASE}/i18n/locales/en-US/cards.json" 2>/dev/null)
if [[ -n "$cards_en" ]]; then
  for slug_path in "basic.o_observador.title:The Observer" "basic.pressao_real.title:Real Pressure" "packs.casais.o_momento_exato.title:The Exact Moment"; do
    path="${slug_path%:*}"
    expected="${slug_path#*:}"
    actual=$(echo "$cards_en" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const v='$path'.split('.').reduce((a,k)=>a&&a[k],j);console.log(v||'')})" 2>/dev/null)
    [[ "$actual" == "$expected" ]] && ok "card $path = \"$expected\"" || fail "card $path expected \"$expected\" got \"$actual\""
  done
fi

# ── 6. Backend i18n — products.json em PT e EN ─────────────────────────────────
hdr "6. Backend products endpoint"
# Não é endpoint público. Mas podemos testar criar-pagamento com X-Locale e validar
# que o backend não quebra (não vamos completar pagamento — só validar response).
# Por segurança, fazemos GET no /health e checamos que o backend está vivo.
health=$(curl -fsSL --max-time 10 "${BACKEND}/health" 2>/dev/null) || fail "Backend health unreachable"
if [[ -n "$health" ]]; then
  echo "$health" | grep -q '"ok":true' && ok "Backend health OK" || fail "Backend health não OK"
fi

# ── 7. Switcher — testa que init.js criaria o widget ──────────────────────────
hdr "7. Switcher widget code"
echo "$init_body" | grep -q 'osl-lang-switcher' && ok "init.js define osl-lang-switcher" || fail "switcher ID ausente"
echo "$init_body" | grep -q 'pt-BR' && echo "$init_body" | grep -q 'en-US' && \
  ok "switcher menciona pt-BR + en-US" || fail "switcher locales ausentes"

# ── Sumário ────────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
printf "\n${Y}══ Sumário ══${N}\n"
printf "  ${G}%d ok${N} / %d total\n" "$PASS" "$TOTAL"
if (( FAIL > 0 )); then
  printf "  ${R}%d falhas:${N}\n" "$FAIL"
  for f in "${FAIL_LIST[@]}"; do printf "    ${R}·${N} %s\n" "$f"; done
fi

exit "$FAIL"
