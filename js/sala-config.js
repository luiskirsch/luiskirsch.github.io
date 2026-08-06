window.PANEL_SERVER_BASE =
  location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://osl-video-server-production.up.railway.app";

// Helper global de tradução — usado pelos JS modules.
// Retorna a tradução se OSL_I18N estiver pronto; senão devolve fallback PT.
// Suporta interpolação de {{vars}} no fallback quando i18n ainda não carregou.
window.oslTr = function (key, fallback, vars) {
  try {
    var t = window.OSL_I18N && window.OSL_I18N.t;
    if (typeof t === "function") {
      var v = t(key, vars || {});
      // i18next retorna o path sem namespace quando chave não existe (ex: "ritual.foo" para "sala:ritual.foo")
      var keyStub = key.indexOf(":") !== -1 ? key.split(":")[1] : key;
      if (typeof v === "string" && v && v !== key && v !== keyStub) return v;
    }
  } catch (_) { /* empty */ }
  if (vars && fallback) {
    return String(fallback).replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return vars[k] != null ? vars[k] : "";
    });
  }
  return fallback;
};
