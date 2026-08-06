(async function protegerEntrada() {
  const BACKEND_BASE_URL = "https://osl-video-server.onrender.com";

  function liberarPagina() {
    function doLiberar() {
      document.body.classList.remove("osl-loading");
      document.body.classList.add("osl-ready");
    }
    if (document.body) {
      doLiberar();
    } else {
      document.addEventListener("DOMContentLoaded", doLiberar);
    }
  }

  function irParaPainel() {
    window.location.href = "./painel.html";
  }

  function irParaVendas() {
    window.location.href = "./vendas.html";
  }

  function tokenLocalValido() {
    const token = sessionStorage.getItem("osl_access_token");
    const exp = Number(sessionStorage.getItem("osl_access_expires_at") || 0);
    return !!token && (exp === 0 || Date.now() < exp);
  }

  async function tentarRenovarPorCodigo() {
    const licenseCode = localStorage.getItem("osl_license_code");
    const uid = localStorage.getItem("osl_auth_uid");
    const email = localStorage.getItem("osl_license_email") || "";

    if (!licenseCode || !uid) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/emitir-acesso-por-codigo`, {
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
        return data.accessToken;
      }
    } catch (e) {
      clearTimeout(timer);
      console.warn("Renovação por código falhou:", e);
    }

    return null;
  }

  try {
    if (tokenLocalValido()) {
      liberarPagina();
      return;
    }

    sessionStorage.removeItem("osl_access_token");
    sessionStorage.removeItem("osl_access_expires_at");

    const temLicenca = !!localStorage.getItem("osl_license_code");
    const temUid = !!localStorage.getItem("osl_auth_uid");

    if (temLicenca && temUid) {
      const renovado = await tentarRenovarPorCodigo();
      if (renovado) {
        liberarPagina();
        return;
      }
      liberarPagina();
      return;
    }

    liberarPagina();
  } catch (error) {
    console.error("Erro ao validar acesso:", error);
    if (localStorage.getItem("osl_license_code") || localStorage.getItem("osl_auth_uid")) {
      liberarPagina();
    } else {
      irParaVendas();
    }
  }
})();
