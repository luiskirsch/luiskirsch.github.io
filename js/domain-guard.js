(function () {
  // Anti-iframe: se embarcado em frame de outra origem, força navegação do parent ou apaga conteúdo
  if (window.top !== window.self) {
    try { window.top.location.replace(location.href); }
    catch (_) { document.documentElement.innerHTML = ''; }
    return;
  }

  var h = (location.hostname || '').toLowerCase();
  if (!h) return; // file:// ou empty — desenvolvimento local sem servidor

  var ALLOWED = [
    'preludiojogos.com',
    'www.preludiojogos.com',
    'preludiojogos.com.br',
    'www.preludiojogos.com.br',
    'luiskirsch.github.io',
    'localhost',
    '127.0.0.1'
  ];

  if (ALLOWED.indexOf(h) === -1) {
    document.documentElement.innerHTML =
      '<style>*{margin:0;padding:0}html,body{background:#0a0805;height:100%;display:flex;' +
      'align-items:center;justify-content:center}p{color:#ccc;font:15px/1.7 sans-serif;' +
      'text-align:center;max-width:320px}a{color:#e06e30;text-decoration:none}</style>' +
      '<p>Este conteúdo só está disponível no site oficial.<br>' +
      '<a href="https://preludiojogos.com.br">preludiojogos.com.br</a></p>';
    setTimeout(function () {
      location.replace('https://preludiojogos.com.br');
    }, 2500);
  }
})();
