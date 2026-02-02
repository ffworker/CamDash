window.CAMDASH_CONFIG = {
  // Base URL for go2rtc; leave empty to use the same-origin /api proxy via nginx.
  // No environment overrides required anymore.
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
      page: "Seite",
      clock: "Stand",
      live: "LIVE",
      empty: "Empty",
      noCameras: "No cameras",
      loading: "loading...",
      ok: "live",
      buffer: "buffer",
      fatal: "fatal",
      unsupported: "WebRTC unsupported",
      configMissing: "config.js fehlt/leer",
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

  pages: [
    {
      name: "Einfahrt",
      cams: [
        { id: "einfahrt_1", label: "Einfahrt 1" },
        { id: "einfahrt_2", label: "Einfahrt 2" },
        { id: "ks_rampe_1", label: "KS Rampe 1" },
        { id: "ks_rampe_2", label: "KS Rampe 2" },
      ],
    },
    {
      name: "Fahrweg 1",
      cams: [
        { id: "fahrweg_1_1", label: "Fahrweg 1_1" },
        { id: "fahrweg_1_2", label: "Fahrweg 1_2" },
      ],
    },
    {
      name: "Rübgrund",
      cams: [
        { id: "ruebgrund_turm", label: "Ruebgrund Turm" },
        { id: "ruebgrund_schranke", label: "Ruebgrund Schranke" },
        { id: "ruebgrund_container", label: "Ruebgrund Container" },
        { id: "ruebgrund_zelt", label: "Ruebgrund Zelt" },
      ],
    },
    {
      name: "Fahrweg 2",
      cams: [
        { id: "fahrweg_2_1", label: "Fahrweg 2_1" },
        { id: "fahrweg_2_2", label: "Fahrweg 2_2" },
        { id: "fahrweg_2_3", label: "Fahrweg 2_3" },
        { id: "fahrweg_2_4", label: "Fahrweg 2_4" },
      ],
    },
    {
      name: "Ausfahrt & Sonstiges",
      cams: [
        { id: "mittelgang", label: "Mittelgang" },
        { id: "containerlager", label: "Containerlager" },
        { id: "ausfahrt", label: "Ausfahrt" },
        { id: "ausfahrt_schranke", label: "Ausfahrt Schranke" },
      ],
    },
    {
      name: "Fahrweg 3",
      cams: [
        { id: "fahrweg_3_1", label: "Fahrweg 3_1" },
        { id: "fahrweg_3_2", label: "Fahrweg 3_2" },
        { id: "fahrweg_3_3", label: "Fahrweg 3_3" },
        { id: "fahrweg_3_4", label: "Fahrweg 3_4" },
      ],
    },
  ],
};
