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
  apiKey: "AIzaSyAflOnCIpF6NYCxdd23XSZTLK2V54XLGFU",
  authDomain: "sextolugar-staging.firebaseapp.com",
  projectId: "sextolugar-staging",
  storageBucket: "sextolugar-staging.firebasestorage.app",
  messagingSenderId: "407627003441",
  appId: "1:407627003441:web:c501d2d46f04f40cd7c710",
  measurementId: "G-WRYDRCC4GV",

  // --- STAGING MARKER ---
  // Set to true once the values above are replaced with the real
  // sextolugar-staging credentials. While false, the site connects to
  // production Firestore (read-only effects on theme, but writes will
  // hit production data — be careful in admin-theme.html).
  __isStagingProject: true,
};
