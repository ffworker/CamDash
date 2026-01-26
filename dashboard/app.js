/* /opt/camdash/dashboard/app.js
 * CamDash – 4-up CCTV dashboard with:
 * - Auto cycling pages (timer 30/60/90)
 * - Prev/Next buttons
 * - Timer selector updates URL (?t=30|60|90)
 * - HLS.js (Firefox) with sane live settings
 * - Only shows FATAL errors, clears soft errors on recovery
 */

(() => {
  const cfg = window.CAMDASH_CONFIG;

  const grid = document.getElementById("grid");
  const subtitle = document.getElementById("subtitle");
  const timerValue = document.getElementById("timerValue");
  const pageValue = document.getElementById("pageValue");
  const clock = document.getElementById("clock");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const segButtons = Array.from(document.querySelectorAll(".seg"));

  if (!cfg?.pages?.length) {
    if (subtitle) subtitle.textContent = "config.js fehlt/leer";
    return;
  }

  const allowedTimers = [30, 60, 90];
  const url = new URL(location.href);

  let seconds = parseInt(url.searchParams.get("t") || cfg.defaultSeconds || 60, 10);
  if (!allowedTimers.includes(seconds)) seconds = 60;

  let pageIndex = 0;
  let hlsInstances = [];
  let cycleHandle = null;

  // ---- Clock (top right) ----
  const tickClock = () => {
    if (!clock) return;
    clock.textContent = new Date().toLocaleTimeString();
  };
  tickClock();
  setInterval(tickClock, 1000);

  // ---- URL helpers ----
  const updateUrlTimer = (t) => {
    const u = new URL(location.href);
    u.searchParams.set("t", String(t));
    history.replaceState({}, "", u.toString());
  };

  const setTimerUi = (t) => {
    if (timerValue) timerValue.textContent = `${t}s`;
    segButtons.forEach((b) => b.classList.toggle("active", parseInt(b.dataset.t, 10) === t));
  };

  // ---- HLS URL builder ----
  // If you set cfg.go2rtcBase to "" and proxy /api via nginx, this stays same-origin.
  // Otherwise set cfg.go2rtcBase like "http://SERVERIP:1984".
  const base = (cfg.go2rtcBase ?? "").replace(/\/+$/, "");
  const hlsUrl = (streamId) => `${base}/api/stream.m3u8?src=${encodeURIComponent(streamId)}`;

  // ---- Cleanup previous page players ----
  const cleanup = () => {
    for (const hls of hlsInstances) {
      try {
        hls.destroy();
      } catch (_) {}
    }
    hlsInstances = [];
    if (grid) grid.innerHTML = "";
  };

  // ---- Create one tile (video + badge) ----
  const makeTile = ({ id, label }) => {
    const tile = document.createElement("div");
    tile.className = "tile fade";

    const badge = document.createElement("div");
    badge.className = "badge";

    const ping = document.createElement("div");
    ping.className = "ping";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = label || id;

    const state = document.createElement("div");
    state.className = "state";
    state.textContent = "loading…";

    badge.appendChild(ping);
    badge.appendChild(name);
    badge.appendChild(state);

    const corner = document.createElement("div");
    corner.className = "corner";
    corner.textContent = "LIVE";

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true; // autoplay policy
    video.playsInline = true;

    const src = hlsUrl(id);

    // Helper to mark ok
    const markOk = () => {
      state.textContent = "ok";
      ping.classList.remove("err");
    };

    // Helper to mark fatal error
    const markFatal = (msg) => {
      state.textContent = msg || "fatal";
      ping.classList.add("err");
    };

    if (window.Hls && Hls.isSupported()) {
      // Live CCTV tuned settings: reduce buffer bloat / stalls
      const hls = new Hls({
        liveSyncDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.0,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
        enableWorker: true,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, markOk);

      // If fragments load again, stream has recovered from prior soft errors
      hls.on(Hls.Events.FRAG_LOADED, markOk);

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        // Most parsing/buffer messages are non-fatal noise for CCTV streams.
        if (!data || data.fatal !== true) return;

        const details = data.details ? `err: ${data.details}` : "fatal";
        markFatal(details);

        // Try recovery for media errors, otherwise destroy (next page load will recreate)
        try {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
          }
        } catch (_) {
          try { hls.destroy(); } catch {}
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsInstances.push(hls);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari-style native HLS (not Firefox usually)
      video.src = src;
      video.addEventListener("canplay", markOk, { once: true });
      video.addEventListener("error", () => markFatal("err: video"), { once: false });
    } else {
      markFatal("HLS unsupported");
    }

    tile.appendChild(video);
    tile.appendChild(badge);
    tile.appendChild(corner);
    return tile;
  };

  // ---- Render current page ----
  const render = () => {
    cleanup();

    const pages = cfg.pages;
    const page = pages[pageIndex];

    if (subtitle) subtitle.textContent = page?.name || `Seite ${pageIndex + 1}`;
    if (pageValue) pageValue.textContent = `${pageIndex + 1}/${pages.length}`;

    const cams = (page?.cams || []).slice(0, 4);
    while (cams.length < 4) cams.push(null);

    cams.forEach((cam) => {
      if (!grid) return;
      if (cam && cam.id) grid.appendChild(makeTile(cam));
      else {
        const empty = document.createElement("div");
        empty.className = "tile fade";
        grid.appendChild(empty);
      }
    });
  };

  // ---- Cycle scheduling ----
  const scheduleCycle = () => {
    if (cycleHandle) clearInterval(cycleHandle);
    cycleHandle = setInterval(() => {
      pageIndex = (pageIndex + 1) % cfg.pages.length;
      render();
    }, seconds * 1000);
  };

  // ---- Controls ----
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      pageIndex = (pageIndex - 1 + cfg.pages.length) % cfg.pages.length;
      render();
      scheduleCycle(); // reset timer
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      pageIndex = (pageIndex + 1) % cfg.pages.length;
      render();
      scheduleCycle();
    });
  }

  segButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = parseInt(btn.dataset.t, 10);
      if (!allowedTimers.includes(t)) return;
      seconds = t;
      setTimerUi(seconds);
      updateUrlTimer(seconds);
      scheduleCycle();
    });
  });

  // Optional keyboard shortcuts (nice for kiosk):
  // Left/Right = prev/next, 1/2/3 = 30/60/90
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      pageIndex = (pageIndex - 1 + cfg.pages.length) % cfg.pages.length;
      render(); scheduleCycle();
    } else if (e.key === "ArrowRight") {
      pageIndex = (pageIndex + 1) % cfg.pages.length;
      render(); scheduleCycle();
    } else if (e.key === "1") {
      seconds = 30; setTimerUi(seconds); updateUrlTimer(seconds); scheduleCycle();
    } else if (e.key === "2") {
      seconds = 60; setTimerUi(seconds); updateUrlTimer(seconds); scheduleCycle();
    } else if (e.key === "3") {
      seconds = 90; setTimerUi(seconds); updateUrlTimer(seconds); scheduleCycle();
    }
  });

  // ---- Init ----
  setTimerUi(seconds);
  updateUrlTimer(seconds);
  render();
  scheduleCycle();
})();
