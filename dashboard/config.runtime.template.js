(() => {
  const override = {};
  const go2rtcBase = "${CAMDASH_GO2RTC_BASE}";
  if (go2rtcBase) override.go2rtcBase = go2rtcBase;
  window.CAMDASH_CONFIG = { ...(window.CAMDASH_CONFIG || {}), ...override };
})();
