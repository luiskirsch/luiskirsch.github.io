// Firebase config for STAGING.
//
// Desde 2026-11-17 o staging do jogo usa o projeto do PRÓPRIO jogo
// (osextolugar-jogo) e a API do jogo. O antigo `sextolugar-staging` virou a
// homologação do Espaço Prelúdio e não pode ser tocado pelo jogo.
//
// Consequência: o staging é uma prévia de front-end sobre os dados reais do
// jogo (protegida pelo Cloudflare Access). Escritas feitas aqui — inclusive
// no admin-theme.html — valem em produção. Para homologação isolada seria
// preciso um projeto Firebase próprio do jogo (ex.: osextolugar-jogo-hml) e
// um ambiente de staging no serviço Railway do jogo.
//
// Promotion to production must NOT copy this file.

export const firebaseConfig = {
  apiKey: "AIzaSyAkA9JXidiHEE3tFcd6o5yBcAYI2RT2daM",
  authDomain: "osextolugar-jogo.firebaseapp.com",
  projectId: "osextolugar-jogo",
  storageBucket: "osextolugar-jogo.firebasestorage.app",
  messagingSenderId: "720257993401",
  appId: "1:720257993401:web:a9d7a41c1ef8b47d5b6968",

  // --- STAGING MARKER ---
  // false: este staging NÃO tem projeto Firebase isolado (usa o do jogo).
  __isStagingProject: false,
};
