(() => {
  // Runtime override file now keeps go2rtcBase empty to rely on nginx /api proxy.
  // If you ever need a direct URL, set window.CAMDASH_CONFIG.go2rtcBase manually.
  window.CAMDASH_CONFIG = { ...(window.CAMDASH_CONFIG || {}), go2rtcBase: "" };
})();
