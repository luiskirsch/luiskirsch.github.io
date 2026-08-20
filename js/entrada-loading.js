window.addEventListener("DOMContentLoaded", () => {
  // A interface é utilizável enquanto a renovação de acesso acontece ao fundo.
  document.body.classList.remove("osl-loading");
  document.body.classList.add("osl-ready");
});
