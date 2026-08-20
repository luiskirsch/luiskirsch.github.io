(async function protegerSala() {
  const BASE = "https://osl-video-server-production.up.railway.app";

  function tokenLocalValido() {
    const token = sessionStorage.getItem("osl_access_token");
    const exp   = Number(sessionStorage.getItem("osl_access_expires_at") || 0);
    return !!token && (exp === 0 || Date.now() < exp);
  }

  async function renovarAcesso() {
    const licenseCode = localStorage.getItem("osl_license_code");
    const uid         = localStorage.getItem("osl_auth_uid");
    const email       = localStorage.getItem("osl_license_email") || "";
    if (!licenseCode || !uid) return false;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);

    try {
      const res  = await fetch(`${BASE}/emitir-acesso-por-codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode, uid, email }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.accessToken) {
        sessionStorage.setItem("osl_access_token", data.accessToken);
        sessionStorage.setItem("osl_access_expires_at", String(data.expiresAt || ""));
        return true;
      }
      return false;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  // A página permanece visível e utilizável; a renovação ocorre em segundo plano.
  // 1. Token local ainda válido → segue imediatamente, sem bater no servidor
  if (tokenLocalValido()) {
    return;
  }

  // 2. Token expirado ou ausente → tenta renovar
  const temLicenca = !!localStorage.getItem("osl_license_code");

  if (temLicenca) {
    const ok = await renovarAcesso();
    if (ok) {
      return;
    }
    // Falhou (servidor frio / offline) → deixa entrar mesmo assim
    // o video.js vai validar novamente ao entrar na chamada
    return;
  }

  // 3. Sem licença → acesso livre ao deck básico (free-to-play)
  return;
})();
