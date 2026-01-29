window.CAMDASH_CONFIG = {
  // Base URL for go2rtc, or "" to use same-origin /api via nginx
  go2rtcBase: "",

  // Default page cycle interval (seconds)
  defaultSeconds: 60,

  // Enable/disable auto page cycling
  autoCycle: true,

  // Data source for cameras/slides
  dataSource: {
    mode: "remote", // "remote" (DB) or "local" (use pages below)
    apiBase: "/camdash-api",
    refreshSeconds: 20,
  },

  // UI options
  ui: {
    topbarAutoHide: true,
    topbarHotspotPx: 6,
    showClock: true,
    showTimer: true,
    showPage: true,
    showBrand: true,
    showNav: true,
    showBadges: true,
    showLiveBadge: true,
    showEmptyLabels: true,
    showBackgroundGrid: true,
    compact: false,
    layout: "auto", // "fixed" (always 2x2) or "auto" (adapt to camera count)
    includeLocationInLabel: true,
    adminEnabled: true,
    showAdminButton: false,
    titlePrefix: "CamDash",
    labels: {
      prev: "Prev",
      next: "Next",
      timer: "Timer",
      page: "Page",
      clock: "Clock",
      live: "LIVE",
      empty: "Empty",
      noCameras: "No cameras",
      loading: "loading...",
      ok: "live",
      buffer: "buffer",
      fatal: "fatal",
      unsupported: "HLS unsupported",
      configMissing: "config.js missing/empty",
    },
    theme: {
      // Provide any CSS variables you want to override
      // accent: "#4af2c8",
      // accent2: "#5aa6ff",
      // bg: "#0b0f14",
      // panel: "rgba(255,255,255,.05)",
      // panelStrong: "rgba(255,255,255,.08)",
      // text: "rgba(255,255,255,.92)",
      // muted: "rgba(255,255,255,.6)",
      // border: "rgba(255,255,255,.12)",
      // radius: "18px",
      // gap: "clamp(10px,1.2vw,16px)",
      // topbarHeight: "64px",
    },
  },

  // Hls.js tuning (optional overrides)
  hls: {
    liveSyncDurationCount: 3,
    maxLiveSyncPlaybackRate: 1.0,
    maxBufferLength: 8,
    maxMaxBufferLength: 16,
    enableWorker: true,
  },

  // Local fallback pages (only used if dataSource.mode = "local")
  pages: [
    {
      name: "Page 1",
      cams: [
        { id: "cam_1", label: "Camera 1" },
        { id: "cam_2", label: "Camera 2" },
        { id: "cam_3", label: "Camera 3" },
        { id: "cam_4", label: "Camera 4" },
      ],
    },
    {
      name: "Page 2",
      cams: [
        { id: "cam_5", label: "Camera 5" },
        { id: "cam_6", label: "Camera 6" },
      ],
    },
  ],
};
