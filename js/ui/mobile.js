// Controlador de UI mobile: bottom bar, drawers de chat/histórico/vídeo, strip de avatares
'use strict';

// Aplica o tema de fundo salvo antes do primeiro render — sem flash
(function () {
  var saved = localStorage.getItem("osl_bg");
  if (saved && saved !== "default") document.documentElement.classList.add("bg-" + saved);
})();

document.addEventListener("DOMContentLoaded", function () {
(function () {
  var IS_MOBILE = window.matchMedia("(max-width: 640px), (max-width: 960px) and (pointer: coarse)");

  // ── Element refs ──────────────────────────────────────────────────────────
  var mobileBar         = document.getElementById("mobileBottomBar");
  var mobileRevealBtn   = document.getElementById("mobileRevealBtn");
  var mobileResetBtn    = document.getElementById("mobileResetBtn");
  var mobileStartBtn    = document.getElementById("mobileStartBtn");
  var mobileChatBtn     = document.getElementById("mobileChatBtn");
  var mobileHistBtn     = document.getElementById("mobileHistoryBtn");
  var mobileProfileBtn  = document.getElementById("mobileProfileBtn");
  var mobileChatOverlay = document.getElementById("mobileChatOverlay");
  var mobileHistOverlay = document.getElementById("mobileHistoryOverlay");
  var mobileChatMsgs    = document.getElementById("mobileChatMessages");
  var mobileChatBody    = mobileChatMsgs ? mobileChatMsgs.parentElement : null;
  var mobileHistList    = document.getElementById("mobileHistoryList");
  var mobileMsgInput    = document.getElementById("mobileMsgInput");
  var mobileSendBtn     = document.getElementById("mobileSendBtn");
  var mobileChatBadge   = document.getElementById("mobileChatBadge");
  var mobileVideoThumb  = document.getElementById("mobileVideoThumb");
  var mobilePlayerStrip = document.getElementById("mobilePlayerStripInline");
  var mobileCardLabel   = document.getElementById("mobileCardLabel");

  var desktopRevealBtn  = document.getElementById("revealCardBtn");
  var desktopResetBtn   = document.getElementById("resetRitualBtn");
  var desktopStartBtn   = document.getElementById("startBtn");
  var desktopSendBtn    = document.getElementById("sendBtn");
  var desktopMsgInput   = document.getElementById("messageInput");
  var desktopMessages   = document.getElementById("messages");
  var desktopHistory    = document.getElementById("historyList");
  var desktopPlayerList = document.getElementById("playerList");

  // Aplica avatar do cache antes do Firestore responder — evita flash
  (function () {
    var selfAvatarPhoto = localStorage.getItem("osl_avatar_photo") || "";
    var selfAvatar      = localStorage.getItem("osl_avatar") || "";
    var mBtn  = document.getElementById("mobileProfileBtn");
    var dBtn  = document.getElementById("myProfileBtn");
    var profileLabel = oslTr("sala:topbar.actions.profile", "👤 Perfil").replace(/^[^\s]+\s*/, "");
    if (selfAvatarPhoto) {
      if (mBtn) { mBtn.style.backgroundImage = "url('" + selfAvatarPhoto + "')"; mBtn.style.backgroundSize = "cover"; mBtn.style.backgroundPosition = "center"; mBtn.style.fontSize = "0"; mBtn.textContent = ""; }
      if (dBtn) { var badge = dBtn.querySelector(".badge"); dBtn.innerHTML = ""; var img = document.createElement("img"); img.src = selfAvatarPhoto; img.style.cssText = "width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0"; dBtn.appendChild(img); dBtn.appendChild(document.createTextNode(profileLabel)); if (badge) dBtn.appendChild(badge); }
    } else if (selfAvatar) {
      if (mBtn) mBtn.textContent = selfAvatar;
      if (dBtn) dBtn.textContent = selfAvatar + " " + profileLabel;
    }
  })();

  var chatIsOpen = false, histIsOpen = false, unreadCount = 0;

  // ── Viewport / teclado ────────────────────────────────────────────────────
  function adjustChatForKeyboard() {
    if (!chatIsOpen) { mobileChatOverlay.style.top = ""; mobileChatOverlay.style.height = ""; return; }
    var vv = window.visualViewport || null;
    if (vv) { mobileChatOverlay.style.top = vv.offsetTop + "px"; mobileChatOverlay.style.height = vv.height + "px"; }
    scrollChatToBottom(false);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", adjustChatForKeyboard);
    window.visualViewport.addEventListener("scroll", adjustChatForKeyboard);
  }

  function applyMobileMode(mobile) {
    mobileBar.style.display = mobile ? "flex" : "none";
    if (mobilePlayerStrip) mobilePlayerStrip.style.display = mobile ? "flex" : "none";
    if (mobileCardLabel)   mobileCardLabel.style.display   = mobile ? "block" : "none";
  }
  applyMobileMode(IS_MOBILE.matches);
  IS_MOBILE.addEventListener("change", function (e) { applyMobileMode(e.matches); });

  // ── Sync buttons from desktop ─────────────────────────────────────────────
  function syncButtonStates() {
    if (desktopRevealBtn) mobileRevealBtn.disabled = desktopRevealBtn.disabled;
    if (desktopResetBtn)  mobileResetBtn.disabled  = desktopResetBtn.disabled;
  }
  setInterval(syncButtonStates, 800);
  syncButtonStates();

  function mobileCallOrFallback(fnKey, desktopBtn) {
    if (window._osl && typeof window._osl[fnKey] === "function") {
      window._osl[fnKey]();
    } else if (desktopBtn && !desktopBtn.disabled) {
      try { desktopBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }
      catch (e) { desktopBtn.click(); }
    }
  }

  mobileRevealBtn.addEventListener("click", function () { mobileCallOrFallback("revealCard", desktopRevealBtn); });
  mobileResetBtn.addEventListener("click",  function () { mobileCallOrFallback("resetDeck",  desktopResetBtn); });
  mobileStartBtn.addEventListener("click",  function () { mobileCallOrFallback("startGame",  desktopStartBtn); });

  function syncStartBtn() {
    var isHost, isStarted;
    if (window._osl) {
      isHost    = !!window._osl.getIsHost?.();
      isStarted = !!window._osl.isStarted?.();
      if (!isHost    && desktopStartBtn  && !desktopStartBtn.disabled)  isHost    = true;
      if (!isStarted && desktopRevealBtn && !desktopRevealBtn.disabled) isStarted = true;
    } else {
      isHost    = desktopStartBtn  ? !desktopStartBtn.disabled  : false;
      isStarted = desktopRevealBtn ? !desktopRevealBtn.disabled : false;
    }
    if (!isHost) {
      mobileStartBtn.style.display = ""; mobileStartBtn.disabled = true; mobileStartBtn.textContent = oslTr("sala:buttons.startRitualBtnWaitHost", "Aguardando anfitrião");
      mobileRevealBtn.style.display = "none"; mobileResetBtn.style.display = "none"; return;
    }
    if (isStarted) {
      mobileStartBtn.style.display = "none"; mobileRevealBtn.style.display = ""; mobileResetBtn.style.display = ""; mobileStartBtn.disabled = false;
    } else {
      mobileStartBtn.style.display = ""; mobileStartBtn.disabled = false; mobileStartBtn.textContent = oslTr("sala:mobile.startRitual", "Iniciar Ritual");
      mobileRevealBtn.style.display = "none"; mobileResetBtn.style.display = "none";
    }
  }
  setInterval(syncStartBtn, 1000);
  syncStartBtn();

  // ── Chat ──────────────────────────────────────────────────────────────────
  function openChat() {
    chatIsOpen = true; mobileChatOverlay.classList.add("open"); syncChatMessages();
    unreadCount = 0; mobileChatBadge.classList.remove("visible");
  }
  function closeChat() {
    chatIsOpen = false; mobileChatOverlay.classList.remove("open");
    mobileChatOverlay.style.top = ""; mobileChatOverlay.style.height = "";
    if (mobileMsgInput) mobileMsgInput.blur();
  }
  function scrollChatToBottom(smooth) {
    var el = mobileChatBody || mobileChatMsgs; if (!el) return;
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "instant" }); }); });
  }
  function syncChatMessages(smooth) {
    if (!mobileChatMsgs || !desktopMessages) return;
    mobileChatMsgs.innerHTML = desktopMessages.innerHTML; scrollChatToBottom(smooth);
  }

  mobileChatBtn.addEventListener("click", function () { if (chatIsOpen) { closeChat(); return; } if (histIsOpen) closeHistory(); openChat(); });
  mobileChatOverlay.addEventListener("click", function (e) { if (e.target === mobileChatOverlay) closeChat(); });

  if (desktopMessages) {
    new MutationObserver(function () {
      if (chatIsOpen) syncChatMessages(true); else { unreadCount++; mobileChatBadge.classList.add("visible"); }
    }).observe(desktopMessages, { childList: true, subtree: true });
  }

  if (mobileSendBtn && mobileMsgInput) {
    mobileSendBtn.addEventListener("click", function () {
      if (!desktopMsgInput || !desktopSendBtn) return;
      desktopMsgInput.value = mobileMsgInput.value; desktopSendBtn.click();
      mobileMsgInput.value = ""; document.dispatchEvent(new CustomEvent("osl:typing", { detail: { active: false } })); mobileMsgInput.focus();
    });
    mobileMsgInput.addEventListener("keydown", function (e) { if (e.key === "Enter") mobileSendBtn.click(); });
    mobileMsgInput.addEventListener("input",   function ()  { document.dispatchEvent(new CustomEvent("osl:typing", { detail: { active: mobileMsgInput.value.trim().length > 0 } })); });
    mobileMsgInput.addEventListener("blur",    function ()  { document.dispatchEvent(new CustomEvent("osl:typing", { detail: { active: false } })); });
  }

  // ── Histórico ─────────────────────────────────────────────────────────────
  function openHistory()  { histIsOpen = true;  mobileHistOverlay.classList.add("open");    syncHistory(); }
  function closeHistory() { histIsOpen = false; mobileHistOverlay.classList.remove("open"); }
  function syncHistory()  { if (!mobileHistList || !desktopHistory) return; mobileHistList.innerHTML = desktopHistory.innerHTML; }

  if (mobileHistBtn) mobileHistBtn.addEventListener("click", function () { if (histIsOpen) { closeHistory(); return; } if (chatIsOpen) closeChat(); openHistory(); });
  mobileHistOverlay.addEventListener("click", function (e) { if (e.target === mobileHistOverlay) closeHistory(); });
  if (desktopHistory) new MutationObserver(function () { if (histIsOpen) syncHistory(); }).observe(desktopHistory, { childList: true, subtree: true });

  // Swipe down fecha histórico
  (function () {
    var startY = 0;
    var drawer = mobileHistOverlay.querySelector(".mobileDrawer");
    if (!drawer) return;
    drawer.addEventListener("touchstart", function (e) { startY = e.touches[0].clientY; }, { passive: true });
    drawer.addEventListener("touchend",   function (e) { if (e.changedTouches[0].clientY - startY > 60) closeHistory(); }, { passive: true });
  })();

  // ── Player strip ──────────────────────────────────────────────────────────
  function makeAvatarWrap(initText, nameText, bg, isActive, isSelf, onClickFn, pid, photoUrl) {
    var wrap = document.createElement("div"); wrap.className = "mobileAvatarWrap";
    var av = document.createElement("div"); av.className = "mobileAvatar" + (isActive ? " mobileAvatar--active" : "") + (isSelf ? " mobileAvatar--self" : "");
    if (photoUrl) { av.style.backgroundImage = "url('" + photoUrl + "')"; av.style.backgroundSize = "cover"; av.style.backgroundPosition = "center"; av.style.fontSize = "0"; }
    else { if (bg) av.style.background = bg; av.textContent = initText; }
    av.dataset.pid = pid || ""; av.dataset.initText = initText;
    if (onClickFn) av.addEventListener("click", onClickFn);
    av.style.setProperty("-webkit-tap-highlight-color", "transparent");
    var nm = document.createElement("span"); nm.className = "mobileAvatarName" + (isActive ? " mobileAvatarName--active" : "");
    nm.textContent = nameText.length > 8 ? nameText.slice(0, 8) + "…" : nameText;
    wrap.appendChild(av); wrap.appendChild(nm); return wrap;
  }

  var lastStripKey = null;
  var _mobileUiQuery = window.matchMedia("(max-width: 640px),(max-width:960px) and (orientation:landscape) and (pointer:coarse)");

  function syncAvatarVideos() {
    if (!mobilePlayerStrip || !_mobileUiQuery.matches) return;
    mobilePlayerStrip.querySelectorAll(".mobileAvatar[data-pid]").forEach(function (avatarEl) {
      var pid = avatarEl.dataset.pid; if (!pid) return;
      var lkTrack = window._oslGetRemoteVideoTrack ? window._oslGetRemoteVideoTrack(pid) : null;
      if (!lkTrack) {
        if (avatarEl._oslRemoteTrack) {
          var stolenVid = avatarEl.querySelector("video");
          if (stolenVid) { var dm = null; document.querySelectorAll(".videoTile").forEach(function (t) { if (t.dataset.identity === pid) dm = t.querySelector(".videoMedia"); }); if (dm) dm.appendChild(stolenVid); else stolenVid.remove(); }
          avatarEl._oslRemoteTrack = null; avatarEl.innerHTML = avatarEl.dataset.initText || "?";
        }
        return;
      }
      if (avatarEl._oslRemoteTrack === lkTrack && avatarEl.querySelector("video")) return;
      var desktopVid = null;
      document.querySelectorAll(".videoTile").forEach(function (t) { if (t.dataset.identity === pid) { var v = t.querySelector(".videoMedia video"); if (v) desktopVid = v; } });
      if (!desktopVid) return;
      avatarEl._oslRemoteTrack = lkTrack; avatarEl.innerHTML = "";
      desktopVid.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block";
      avatarEl.appendChild(desktopVid); desktopVid.play().catch(function () {});
    });
  }

  function syncPlayerStrip() {
    if (!mobilePlayerStrip) return;
    var selfPid = (window._osl && window._osl.getParticipantId) ? window._osl.getParticipantId() : "";
    var allEls  = desktopPlayerList ? Array.from(desktopPlayerList.querySelectorAll(".player")) : [];
    var others  = allEls.filter(function (el) { var pid = el.dataset.pid || ""; return !selfPid || !pid || pid !== selfPid; });
    var newKey  = others.slice(0, 4).map(function (el) { return (el.dataset.pid || "") + (el.querySelector(".playerHost") ? "H" : ""); }).join(",");
    if (newKey !== lastStripKey) {
      lastStripKey = newKey; mobilePlayerStrip.innerHTML = "";
      for (var i = 0; i < 4; i++) {
        var playerEl = others[i] || null;
        if (playerEl) {
          var avatarEl = playerEl.querySelector(".avatar"); var nameEl = playerEl.querySelector(".playerName");
          var wrap = makeAvatarWrap(avatarEl ? avatarEl.textContent.trim() : "?", nameEl ? nameEl.textContent.trim() : oslTr("sala:players.fallbackName", "Jogador"), "", !!playerEl.querySelector(".playerHost"), false, (function (el) { return function () { el.click(); }; })(playerEl), playerEl.dataset.pid || "", avatarEl ? (avatarEl.dataset.photoUrl || "") : "");
          mobilePlayerStrip.appendChild(wrap);
        } else {
          var wrap = document.createElement("div"); wrap.className = "mobileAvatarWrap";
          var av = document.createElement("div"); av.className = "mobileAvatar mobileAvatar--empty";
          var nm = document.createElement("span"); nm.className = "mobileAvatarName"; nm.innerHTML = "&nbsp;";
          wrap.appendChild(av); wrap.appendChild(nm); mobilePlayerStrip.appendChild(wrap);
        }
      }
    }
    syncAvatarVideos();
  }

  if (desktopPlayerList) new MutationObserver(syncPlayerStrip).observe(desktopPlayerList, { childList: true, subtree: true });
  setInterval(syncPlayerStrip, 2000);
  syncPlayerStrip();

  // ── Self video thumbnail (espelho) ────────────────────────────────────────
  var _mirrorTrack = null;

  function mirrorSelfVideo() {
    if (!mobileVideoThumb || !_mobileUiQuery.matches) return;
    var lkTrack = window._oslLocalVideoTrack || null;
    if (!lkTrack) {
      _mirrorTrack = null;
      var stolenVid = mobileVideoThumb.querySelector("video");
      if (stolenVid) { var sm = document.querySelector("#videoSelfSlot .videoMedia"); if (sm) sm.appendChild(stolenVid); else stolenVid.remove(); }
      if (!mobileVideoThumb.querySelector(".mobileVideoOff")) mobileVideoThumb.innerHTML = '<span class="mobileVideoOff">🎥</span>';
      return;
    }
    if (lkTrack === _mirrorTrack && mobileVideoThumb.querySelector("video")) return;
    var desktopVid = document.querySelector("#videoSelfSlot .videoMedia video");
    if (!desktopVid) return;
    _mirrorTrack = lkTrack; mobileVideoThumb.innerHTML = "";
    desktopVid.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;transform:scaleX(-1);display:block";
    mobileVideoThumb.appendChild(desktopVid); desktopVid.play().catch(function () {});
  }

  var selfSlotEl = document.getElementById("videoSelfSlot");
  if (selfSlotEl) new MutationObserver(mirrorSelfVideo).observe(selfSlotEl, { childList: true, subtree: true });
  setInterval(mirrorSelfVideo, 800);
  setInterval(syncAvatarVideos, 1000);

  // ── Botão X fecha o chat ──────────────────────────────────────────────────
  document.getElementById("mobileChatCloseBtn")?.addEventListener("click", closeChat);

  // ── Botão de perfil ───────────────────────────────────────────────────────
  if (mobileProfileBtn) {
    function doOpenProfile() {
      var fn = window.oslOpenProfile || (window._osl && window._osl.openSelfProfile);
      if (fn) { try { fn(); } catch (e) {} }
      else { var modal = document.getElementById("profileModal"); if (modal) modal.classList.remove("hidden"); }
    }
    mobileProfileBtn.addEventListener("touchend", function (e) { e.preventDefault(); doOpenProfile(); }, { passive: false });
    mobileProfileBtn.addEventListener("click", doOpenProfile);
  }

  // ── Botão de perfil mobile (dispara evento para o módulo ES) ─────────────
  if (mobileProfileBtn) {
    mobileProfileBtn.addEventListener("touchend", function (e) { e.preventDefault(); }, { passive: false });
  }

  // ── Video overlay ─────────────────────────────────────────────────────────
  function openVideoOverlay() {
    var ov = document.getElementById("mobileVideoOverlay"); if (!ov) return;
    var btns = document.getElementById("mobileVideoDrawerBtns");
    if (btns) {
      var desktopBar = document.querySelector(".videoControlBar");
      var vc = window.oslVideoControls;
      var fnMap = { joinVideoBtn: vc && vc.joinVideo, joinAudioBtn: vc && vc.joinAudio, toggleMicBtn: vc && vc.toggleMic, toggleCamBtn: vc && vc.toggleCam, leaveVideoBtn: vc && vc.leaveVideo };
      if (desktopBar) {
        btns.innerHTML = "";
        desktopBar.querySelectorAll("button").forEach(function (btn) {
          var clone = btn.cloneNode(true); clone.disabled = false; var id = btn.id;
          clone.addEventListener("click", function () { var fn = fnMap[id]; if (fn) fn(); else btn.click(); closeVideoOverlay(); });
          btns.appendChild(clone);
        });
      }
    }
    ov.style.display = "flex"; ov.classList.add("open");
  }

  function closeVideoOverlay() {
    var ov = document.getElementById("mobileVideoOverlay"); if (!ov) return;
    ov.classList.remove("open"); ov.style.display = "";
  }

  if (mobileVideoThumb) {
    mobileVideoThumb.addEventListener("touchend", function (e) { e.preventDefault(); openVideoOverlay(); }, { passive: false });
    mobileVideoThumb.addEventListener("click", openVideoOverlay);
  }

  var videoOverlay = document.getElementById("mobileVideoOverlay");
  if (videoOverlay) videoOverlay.addEventListener("click", function (e) { if (e.target === videoOverlay) closeVideoOverlay(); });

  // ── Botão de perfil desktop ───────────────────────────────────────────────
  if (mobileProfileBtn) {
    document.addEventListener("osl:profileLoaded", function (e) {
      var data = e.detail;
      if (!data) return;
      var photo = data.avatarPhotoUrl || ""; var emoji = data.avatarEmoji || "";
      if (photo) { mobileProfileBtn.style.backgroundImage = "url('" + photo + "')"; mobileProfileBtn.style.backgroundSize = "cover"; mobileProfileBtn.style.backgroundPosition = "center"; mobileProfileBtn.style.fontSize = "0"; mobileProfileBtn.textContent = ""; }
      else if (emoji) { mobileProfileBtn.style.backgroundImage = ""; mobileProfileBtn.style.fontSize = ""; mobileProfileBtn.textContent = emoji; }
    });
  }

})();
}); // DOMContentLoaded
