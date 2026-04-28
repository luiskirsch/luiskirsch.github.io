// Firebase config for STAGING.
//
// IMPORTANT: this file should point to the `sextolugar-staging` Firebase
// project once it's created. Until then, it falls back to the production
// project so the rest of the staging site keeps functioning (auth, sala,
// pagamentos). The fallback means active-theme will read from the
// production Firestore — that's fine; the doc just doesn't exist yet.
//
// Sprint 5 hand-off:
// 1) Create the `sextolugar-staging` Firebase project (see staging/README.md).
// 2) Replace the values below with the staging Web App credentials.
// 3) Create `config/activeTheme` doc in the staging Firestore.
// 4) Promotion to production must NOT copy this file.

export const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330",
  measurementId: "G-D6HG779ZFR",

  // --- STAGING MARKER ---
  // Set to true once the values above are replaced with the real
  // sextolugar-staging credentials. While false, the site connects to
  // production Firestore (read-only effects on theme, but writes will
  // hit production data — be careful in admin-theme.html).
  __isStagingProject: false,
};
