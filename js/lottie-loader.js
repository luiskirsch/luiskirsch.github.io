(function () {
  "use strict";

  if (window.lottie || document.querySelector('script[data-osl-lottie]')) return;

  function loadLottie() {
    if (window.lottie || document.querySelector('script[data-osl-lottie]')) return;
    var script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
    script.integrity = "sha512-jEnuDt6jfecCjthQAJ+ed0MTVA++5ZKmlUcmDGBv2vUI/REn6FuIdixLNnQT+vKusE2hhTk2is3cFvv5wA+Sgg==";
    script.crossOrigin = "anonymous";
    script.dataset.oslLottie = "";
    document.head.appendChild(script);
  }

  if (document.readyState === "complete") {
    loadLottie();
  } else {
    window.addEventListener("load", loadLottie, { once: true });
  }
})();
