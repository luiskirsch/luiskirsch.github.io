import { S } from "./state.js";
import { BACKEND_BASE_URL } from "./constants.js";

let currentAccount = null;
const ACCOUNT_FETCH_TIMEOUT_MS = 10000;

const LEGACY_ACCOUNT_KEYS = [
  "osl_nome",
  "osl_username",
  "osl_avatar",
  "osl_avatar_photo",
  "osl_xp_cache",
  "osl_coins",
  "osl_bg",
  "osl_card_style",
  "osl_fx",
  "osl_compras",
  "osl_daily_done",
];

function clearMismatchedAccountCache(uid) {
  try {
    const previousUid = localStorage.getItem("osl_cache_uid") || "";
    if (previousUid !== uid) {
      LEGACY_ACCOUNT_KEYS.forEach(key => localStorage.removeItem(key));
    }
  } catch (_) {}
}

function persistAccountCache(account) {
  if (!account?.uid) return;
  const profile = account.profile || {};
  const avatar = profile.avatar || {};
  const progression = account.progression || {};
  const wallet = account.wallet || {};

  try {
    clearMismatchedAccountCache(account.uid);
    localStorage.setItem("osl_cache_uid", account.uid);
    localStorage.setItem(`osl:account:${account.uid}:v1`, JSON.stringify(account));
    if (profile.displayName) localStorage.setItem("osl_nome", profile.displayName);
    if (profile.username) localStorage.setItem("osl_username", profile.username);
    localStorage.setItem("osl_xp_cache", String(Number(progression.xp) || 0));
    localStorage.setItem("osl_coins", String(Number(wallet.coins) || 0));
    if (avatar.url) {
      localStorage.setItem("osl_avatar_photo", avatar.url);
      localStorage.removeItem("osl_avatar");
    } else {
      localStorage.removeItem("osl_avatar_photo");
      if (avatar.emoji) localStorage.setItem("osl_avatar", avatar.emoji);
    }
  } catch (_) {}
}

export function applyAccountSnapshot(account) {
  if (!account?.uid || Number(account.schemaVersion) !== 1) return null;
  const currentUid = S.auth?.currentUser?.uid || null;
  if (!currentUid || String(account.uid) !== String(currentUid)) return null;
  currentAccount = account;
  persistAccountCache(account);

  const profile = account.profile || {};
  const avatar = profile.avatar || {};
  if (profile.displayName) S.playerName = String(profile.displayName).slice(0, 40);
  if (avatar.url) {
    S.selectedAvatarPhoto = avatar.url;
    S.selectedAvatarEmoji = null;
  } else if (avatar.emoji) {
    S.selectedAvatarPhoto = null;
    S.selectedAvatarEmoji = avatar.emoji;
  }
  if (avatar.color) S.selectedAvatarColor = avatar.color;

  window.dispatchEvent(new CustomEvent("osl:account-updated", { detail: account }));
  document.dispatchEvent(new CustomEvent("osl:profileLoaded", {
    detail: {
      displayName: profile.displayName,
      username: profile.username,
      avatar: profile.avatar,
      avatarPhotoUrl: avatar.url || null,
      avatarEmoji: avatar.emoji || null,
      avatarColor: avatar.color || null,
      xp: account.progression?.xp || 0,
      coins: account.wallet?.coins || 0,
    },
  }));
  return account;
}

export async function bootstrapAccount(user = S.auth?.currentUser) {
  if (!user) return null;
  const requestedUid = String(user.uid || "").trim();
  if (!requestedUid) throw new Error("ACCOUNT_BOOTSTRAP_UID_MISSING");
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ACCOUNT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/game/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ACCOUNT_BOOTSTRAP_${response.status}`);
    const payload = await response.json();
    const account = payload?.account;
    const currentUid = S.auth?.currentUser?.uid || null;
    if (!currentUid || currentUid !== requestedUid) {
      throw new Error("ACCOUNT_BOOTSTRAP_AUTH_CHANGED");
    }
    if (!account?.uid || String(account.uid) !== requestedUid) {
      throw new Error("ACCOUNT_BOOTSTRAP_UID_MISMATCH");
    }
    const applied = applyAccountSnapshot(account);
    if (!applied) throw new Error("ACCOUNT_BOOTSTRAP_INVALID_SNAPSHOT");
    return applied;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("ACCOUNT_BOOTSTRAP_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getCurrentAccount() {
  return currentAccount;
}
