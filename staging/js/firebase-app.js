// Single source of Firebase app initialization for the staging site.
// Idempotent: if another module (or another script tag) already initialized
// the default app, this one reuses it. Both `staging/js/firebase.js` (game
// runtime) and `staging/js/active-theme.js` import from here.

import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const IS_REAL_STAGING_PROJECT = firebaseConfig.__isStagingProject === true;
