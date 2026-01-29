
/*
 * CamDash - CCTV dashboard with paging, auto cycling, and HLS playback.
 */

(() => {
  "use strict";

  const cfg = window.CAMDASH_CONFIG || {};
  const ROLE_CREDS = {
    admin: { user: "admin", pass: "29Logserv75" },
    priv: { user: "video", pass: "bigbrother" },
    kiosk: { user: "kiosk", pass: "kiosk" },
  };

  const dom = {
    grid: document.getElementById("grid"),
    subtitle: document.getElementById("subtitle"),
    brand: document.querySelector(".brand"),
    brandTitle: document.getElementById("brandTitle"),
    timerValue: document.getElementById("timerValue"),
    pageValue: document.getElementById("pageValue"),
    clock: document.getElementById("clock"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    segButtons: Array.from(document.querySelectorAll(".seg")),
    timerChip: document.getElementById("timerChip"),
    timerSelect: document.getElementById("timerSelect"),
    pageChip: document.getElementById("pageChip"),
    clockChip: document.getElementById("clockChip"),
    prevLabel: document.getElementById("prevLabel"),
    nextLabel: document.getElementById("nextLabel"),
    timerLabel: document.getElementById("timerLabel"),
    pageLabel: document.getElementById("pageLabel"),
    clockLabel: document.getElementById("clockLabel"),
    adminBtn: document.getElementById("adminBtn"),
    wallBtn: document.getElementById("wallBtn"),
    adminOverlay: document.getElementById("adminOverlay"),
    adminClose: document.getElementById("adminClose"),
    adminAuth: document.getElementById("adminAuth"),
    adminAuthForm: document.getElementById("adminAuthForm"),
    adminAuthError: document.getElementById("adminAuthError"),
    adminUser: document.getElementById("adminUser"),
    adminPass: document.getElementById("adminPass"),
    adminTabs: document.getElementById("adminTabs"),
    adminBody: document.getElementById("adminBody"),
    adminCameras: document.getElementById("adminCameras"),
    adminProfiles: document.getElementById("adminProfiles"),
    roleOverlay: document.getElementById("roleOverlay"),
    roleButtons: Array.from(document.querySelectorAll(".role-btn")),
    roleUser: document.getElementById("roleUser"),
    rolePass: document.getElementById("rolePass"),
    roleError: document.getElementById("roleError"),
    kioskProfile: document.getElementById("kioskProfile"),
    kioskSelectWrap: document.getElementById("kioskSelectWrap"),
    wallOverlay: document.getElementById("liveOverlay"),
    wallClose: document.getElementById("liveClose"),
    liveVideo: document.getElementById("liveVideo"),
    liveName: document.getElementById("liveName"),
    liveState: document.getElementById("liveState"),
  };

  const ALLOWED_TIMERS = [30, 60, 90];
  const DEFAULTS = {
    seconds: 60,
    topbarHotspotPx: 6,
    dataSource: {
      mode: "local",
      apiBase: "/camdash-api",
      refreshSeconds: 20,
    },
    snapwall: {
      refreshSeconds: 17, // slightly slower to reduce load
      width: 480,
      height: 270,
    },
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
      unsupported: "HLS unsupported",
      configMissing: "config.js fehlt/leer",
      adminTitle: "CamDash Admin",
    },
    hls: {
      liveSyncDurationCount: 3,
      maxLiveSyncPlaybackRate: 1.0,
      maxBufferLength: 8,
      maxMaxBufferLength: 16,
      enableWorker: true,
    },
  };

  const STORAGE = {
    timer: "camdash.timer",
    page: "camdash.page",
    roleProfile: "camdash.roleProfile",
  };
  const PROFILE_QUERY_KEYS = ["profile", "profileId"];
  const AUTH_STORAGE_KEY = "camdash.adminAuth";

  const adminState = {
    open: false,
    activeTab: "cameras",
    selectedProfileId: null,
    draftSlides: null,
    draftProfileName: "",
    editingCameraId: null,
  };

  const config = normalizeConfig(cfg);

  let adminAuthHeader = loadAdminAuth();
  let pages = [];
  let dataState = null;
  let maxCamsPerSlide = 6;
  let seconds = config.defaultSeconds;
  let pageIndex = 0;
  let hlsInstances = [];
  let cleanupFns = [];
  let cycleHandle = null;
  let pagesSignature = "";
  let role = null; // kiosk | priv | admin (set after auth)
  let roleProfileId = loadLocal(STORAGE.roleProfile) || "";
  let wallMode = false;
  let snapshotTimer = null;
  let liveHls = null;
  let isAuthed = false;

  init().catch((err) => {
    console.error("CamDash init failed", err);
    renderEmptyState(config.ui.labels.configMissing);
  });

  async function init() {
    applyUiConfig();

    pages = await loadPages();
    if (!pages.length) {
      renderEmptyState(config.ui.labels.configMissing);
      return;
    }

    const url = new URL(location.href);
    seconds = resolveSeconds(url);
    pageIndex = resolvePageIndex(url);

    startClock();
    initControls();
    initAdmin();
    initRoles();

    setTimerUi(seconds);
    updateUrlState();
    applyRoleUi();
    render();
    scheduleCycle(true);
    scheduleRemoteRefresh();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCycle();
      } else {
        scheduleCycle();
      }
    });
  }

  function normalizeConfig(cfgValue) {
    const ui = cfgValue.ui && typeof cfgValue.ui === "object" ? cfgValue.ui : {};
    const hls = cfgValue.hls && typeof cfgValue.hls === "object" ? cfgValue.hls : {};
    const labels = ui.labels && typeof ui.labels === "object" ? ui.labels : {};
    const theme = ui.theme && typeof ui.theme === "object" ? ui.theme : {};
    const base = typeof cfgValue.go2rtcBase === "string" ? cfgValue.go2rtcBase.trim() : "";
    const dataSource = cfgValue.dataSource && typeof cfgValue.dataSource === "object" ? cfgValue.dataSource : {};
    const snapwall = cfgValue.snapwall && typeof cfgValue.snapwall === "object" ? cfgValue.snapwall : {};

    const mode = dataSource.mode === "remote" ? "remote" : "local";
    const apiBase = cleanBase(dataSource.apiBase || DEFAULTS.dataSource.apiBase);
    const refreshSeconds = clamp(toInt(dataSource.refreshSeconds, DEFAULTS.dataSource.refreshSeconds), 5, 600);

    return {
      go2rtcBase: base.replace(/\/+$/, ""),
      defaultSeconds: getAllowedTimer(cfgValue.defaultSeconds) ?? DEFAULTS.seconds,
      autoCycle: cfgValue.autoCycle !== false,
      dataSource: {
        mode,
        apiBase,
        refreshSeconds,
      },
      snapwall: {
        refreshSeconds: clamp(toInt(snapwall.refreshSeconds, DEFAULTS.snapwall.refreshSeconds), 5, 120),
        width: clamp(toInt(snapwall.width, DEFAULTS.snapwall.width), 120, 1920),
        height: clamp(toInt(snapwall.height, DEFAULTS.snapwall.height), 90, 1080),
      },
      ui: {
        topbarAutoHide: ui.topbarAutoHide !== false,
        topbarHotspotPx: clamp(toInt(ui.topbarHotspotPx, DEFAULTS.topbarHotspotPx), 2, 24),
        showClock: ui.showClock !== false,
        showTimer: ui.showTimer !== false,
        showPage: ui.showPage !== false,
        showBrand: ui.showBrand !== false,
        showNav: ui.showNav !== false,
        showBadges: ui.showBadges !== false,
        showLiveBadge: ui.showLiveBadge !== false,
        showEmptyLabels: ui.showEmptyLabels !== false,
        showBackgroundGrid: ui.showBackgroundGrid !== false,
        compact: ui.compact === true,
        layout: ui.layout === "auto" ? "auto" : "fixed",
        includeLocationInLabel: ui.includeLocationInLabel !== false,
        adminEnabled: ui.adminEnabled !== false,
        showAdminButton: ui.showAdminButton === true,
        titlePrefix:
          typeof ui.titlePrefix === "string" && ui.titlePrefix.trim() ? ui.titlePrefix.trim() : "CamDash",
        labels: { ...DEFAULTS.labels, ...labels },
        theme,
      },
      hls: { ...DEFAULTS.hls, ...hls },
      pages: Array.isArray(cfgValue.pages) ? cfgValue.pages : [],
    };
  }
  function applyUiConfig() {
    document.body.classList.toggle("topbar-pinned", !config.ui.topbarAutoHide);
    document.body.classList.toggle("compact", config.ui.compact);
    document.body.classList.toggle("no-grid", !config.ui.showBackgroundGrid);
    document.documentElement.style.setProperty("--topbar-hotspot", `${config.ui.topbarHotspotPx}px`);

    applyThemeVars(config.ui.theme);

    if (dom.brandTitle) dom.brandTitle.textContent = config.ui.titlePrefix;

    if (dom.prevLabel) dom.prevLabel.textContent = config.ui.labels.prev;
    if (dom.nextLabel) dom.nextLabel.textContent = config.ui.labels.next;
    if (dom.timerLabel) dom.timerLabel.textContent = config.ui.labels.timer;
    if (dom.pageLabel) dom.pageLabel.textContent = config.ui.labels.page;
    if (dom.clockLabel) dom.clockLabel.textContent = config.ui.labels.clock;

    if (dom.prevBtn) {
      dom.prevBtn.title = config.ui.labels.prev;
      dom.prevBtn.setAttribute("aria-label", config.ui.labels.prev);
    }
    if (dom.nextBtn) {
      dom.nextBtn.title = config.ui.labels.next;
      dom.nextBtn.setAttribute("aria-label", config.ui.labels.next);
    }

    setVisible(dom.brand, config.ui.showBrand);
    setVisible(dom.clockChip, config.ui.showClock);
    setVisible(dom.pageChip, config.ui.showPage);
    setVisible(dom.prevBtn, config.ui.showNav);
    setVisible(dom.nextBtn, config.ui.showNav);

    const showTimer = config.ui.showTimer && config.autoCycle;
    setVisible(dom.timerChip, showTimer);
    setVisible(dom.timerSelect, showTimer);

    if (dom.adminBtn) {
      const showAdmin = config.ui.adminEnabled && config.dataSource.mode === "remote" && config.ui.showAdminButton;
      setVisible(dom.adminBtn, showAdmin);
    }
  }

  async function loadPages() {
    if (config.dataSource.mode !== "remote") {
      return normalizeLocalPages(config.pages);
    }

    const state = await fetchState();
    if (state) {
      setRemoteState(state, true);
      return pages;
    }

    return normalizeLocalPages(config.pages);
  }

  function normalizeLocalPages(localPages) {
    const safePages = Array.isArray(localPages) ? localPages : [];
    return safePages.map((page, index) => {
      const cams = Array.isArray(page?.cams) ? page.cams : [];
      return {
        name: page?.name || `Seite ${index + 1}`,
        cams: cams.map((cam) => (cam && cam.id ? cam : null)),
      };
    });
  }

  function setRemoteState(state, initial) {
    dataState = state;
    maxCamsPerSlide = toInt(state?.maxCamsPerSlide, 6) || 6;
    fillKioskProfiles();
    applyRoleUi();
    let nextPages = buildPagesFromState(state);
    if (!nextPages.length) {
      nextPages = normalizeLocalPages(config.pages);
    }

    const nextSignature = JSON.stringify(nextPages);
    const pagesChanged = nextSignature !== pagesSignature;
    pages = nextPages;
    pagesSignature = nextSignature;

    if (!initial) {
      const nextIndex = clampPageIndex(pageIndex);
      const pageIndexChanged = nextIndex !== pageIndex;
      pageIndex = nextIndex;
      if (pagesChanged || pageIndexChanged) {
        updateUrlState();
        render();
      }
      scheduleCycle();
    }
  }

  function buildPagesFromState(state) {
    const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
    const cameras = Array.isArray(state?.cameras) ? state.cameras : [];
    const overrideId = roleProfileId || resolveProfileOverride(profiles);
    const activeProfileId = overrideId || state?.activeProfileId;
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

    if (!activeProfile) return [];

    const camMap = new Map(cameras.map((cam) => [cam.id, cam]));

    return (activeProfile.slides || []).map((slide, index) => {
      const cams = (slide.cameraIds || []).map((camId) => {
        const cam = camMap.get(camId);
        if (!cam || !cam.source) return null;

        let label = cam.name || cam.source;
        if (config.ui.includeLocationInLabel && cam.location) {
          label = `${label} - ${cam.location}`;
        }

        return { id: cam.source, label };
      });

      return {
        name: slide.name || `Slide ${index + 1}`,
        cams,
      };
    });
  }

  function startClock() {
    if (!dom.clock || !config.ui.showClock) return;
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const tick = () => {
      dom.clock.textContent = formatter.format(new Date());
    };

    tick();
    setInterval(tick, 1000);
  }

  function initControls() {
    if (dom.prevBtn) {
      dom.prevBtn.addEventListener("click", () => {
        if (role !== "admin") return;
        setPage(pageIndex - 1);
      });
    }

    if (dom.nextBtn) {
      dom.nextBtn.addEventListener("click", () => {
        if (role !== "admin") return;
        setPage(pageIndex + 1);
      });
    }

    if (config.autoCycle) {
      dom.segButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = getAllowedTimer(btn.dataset.t);
          if (!t) return;
          setTimer(t);
        });
      });
    }

    window.addEventListener("keydown", (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (role === "admin" && e.key === "ArrowLeft") {
        setPage(pageIndex - 1);
      } else if (role === "admin" && e.key === "ArrowRight") {
        setPage(pageIndex + 1);
      } else if (config.autoCycle && role === "admin") {
        if (e.key === "1") setTimer(30);
        if (e.key === "2") setTimer(60);
        if (e.key === "3") setTimer(90);
      }
    });
  }

  function initRoles() {
    if (!dom.roleOverlay) return;

    fillKioskProfiles();
    toggleRoleOverlay(true);

    dom.roleButtons.forEach((btn) => {
      btn.addEventListener("click", () => handleRoleSelection(btn.dataset.role));
    });

    if (dom.kioskProfile) {
      dom.kioskProfile.addEventListener("change", () => {
        roleProfileId = dom.kioskProfile.value || "";
        saveLocal(STORAGE.roleProfile, roleProfileId);
      });
    }

    if (dom.roleOverlay) {
      dom.roleOverlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const activeRole = document.activeElement?.dataset?.role || "kiosk";
          handleRoleSelection(activeRole);
        }
      });
    }

    if (dom.wallBtn) {
      dom.wallBtn.addEventListener("click", () => {
        wallMode = !wallMode;
        render();
        if (!wallMode) scheduleCycle(true);
      });
    }

    if (dom.wallOverlay) {
      dom.wallOverlay.addEventListener("click", (e) => {
        if (e.target === dom.wallOverlay) closeLive();
      });
    }
    if (dom.wallClose) {
      dom.wallClose.addEventListener("click", closeLive);
    }
  }
  function initAdmin() {
    if (!config.ui.adminEnabled || config.dataSource.mode !== "remote") return;

    if (dom.adminBtn) {
      dom.adminBtn.addEventListener("click", () => toggleAdmin(true));
    }

    if (dom.adminClose) {
      dom.adminClose.addEventListener("click", () => toggleAdmin(false));
    }

    if (dom.adminOverlay) {
      dom.adminOverlay.addEventListener("click", (e) => {
        if (e.target === dom.adminOverlay) toggleAdmin(false);
      });

      dom.adminOverlay.addEventListener("click", handleAdminClick);
      dom.adminOverlay.addEventListener("submit", handleAdminSubmit);
      dom.adminOverlay.addEventListener("input", handleAdminInput);
      dom.adminOverlay.addEventListener("change", handleAdminInput);
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && adminState.open) {
        toggleAdmin(false);
      }

      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
        toggleAdmin(true);
      }
    });

    const url = new URL(location.href);
    if (url.searchParams.get("admin") === "1") {
      toggleAdmin(true);
    }
  }

  function handleRoleSelection(nextRole) {
    if (!nextRole) return;

    const user = cleanText(dom.roleUser?.value);
    const pass = cleanText(dom.rolePass?.value);
    const cred = ROLE_CREDS[nextRole];
    const ok = cred && user === cred.user && pass === cred.pass;
    if (!ok) {
      if (dom.roleError) {
        dom.roleError.textContent = "Falscher Benutzer oder Passwort";
        dom.roleError.classList.remove("hidden");
      }
      return;
    } else if (dom.roleError) {
      dom.roleError.classList.add("hidden");
      dom.roleError.textContent = "";
    }

    role = nextRole;
    wallMode = role === "priv";
    isAuthed = true;

    if (role === "kiosk") {
      if (dom.kioskProfile && dom.kioskProfile.value) {
        roleProfileId = dom.kioskProfile.value;
        saveLocal(STORAGE.roleProfile, roleProfileId);
      } else if (dataState?.activeProfileId) {
        roleProfileId = dataState.activeProfileId;
      }
    } else if (role !== "kiosk") {
      roleProfileId = "";
    }

    applyRoleUi();
    toggleRoleOverlay(false);
    render();
    if (wallMode) {
      stopCycle();
    } else {
      scheduleCycle(true);
    }
  }

  function applyRoleUi() {
    if (!isAuthed) {
      setVisible(dom.adminBtn, false);
      setVisible(dom.wallBtn, false);
      setVisible(dom.prevBtn, false);
      setVisible(dom.nextBtn, false);
      setVisible(dom.timerChip, false);
      setVisible(dom.timerSelect, false);
      return;
    }

    document.body.classList.toggle("role-kiosk", role === "kiosk");
    document.body.classList.toggle("role-priv", role === "priv");
    document.body.classList.toggle("role-admin", role === "admin");

    const showAdmin = role === "admin" && config.ui.adminEnabled && config.dataSource.mode === "remote";
    setVisible(dom.adminBtn, showAdmin);

    const showWall = role === "priv" || role === "admin";
    setVisible(dom.wallBtn, showWall);

    const showNav = config.ui.showNav && role === "admin";
    setVisible(dom.prevBtn, showNav);
    setVisible(dom.nextBtn, showNav);

    const showTimer = config.ui.showTimer && config.autoCycle && role === "admin";
    setVisible(dom.timerChip, showTimer);
    setVisible(dom.timerSelect, showTimer);

    if (role === "kiosk") {
      stopCycle();
      scheduleCycle(true);
    }
  }

  function toggleRoleOverlay(show) {
    if (!dom.roleOverlay) return;
    dom.roleOverlay.classList.toggle("hidden", !show);
    dom.roleOverlay.setAttribute("aria-hidden", show ? "false" : "true");

    if (show && dataState) {
      fillKioskProfiles();
    }
  }

  function fillKioskProfiles() {
    if (!dom.kioskProfile || !dataState?.profiles) return;
    const select = dom.kioskProfile;
    select.innerHTML = "";
    dataState.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name || "Profile";
      select.appendChild(opt);
    });
    const desired = roleProfileId || dataState.activeProfileId;
    if (desired) select.value = desired;
    setVisible(dom.kioskSelectWrap, true);
  }

  async function ensureAdminAccess() {
    const status = await checkAdminAuth();
    if (status.ok) {
      showAdminAuth(false);
      return true;
    }

    if (status.offline) {
      showAdminAuth(true, "API offline. Start the API container.");
      return false;
    }

    showAdminAuth(true, "Login required.");
    return false;
  }

  async function checkAdminAuth() {
    try {
      const headers = adminAuthHeader ? { Authorization: adminAuthHeader } : {};
      const res = await fetch(`${config.dataSource.apiBase}/auth`, { headers, cache: "no-store" });
      if (res.ok) {
        return { ok: true };
      }
      if (res.status === 401) {
        saveAdminAuth(null);
        adminAuthHeader = null;
        return { ok: false, required: true };
      }
      return { ok: false };
    } catch (err) {
      return { ok: false, offline: true };
    }
  }

  function showAdminAuth(show, message) {
    if (!dom.adminAuth) return;
    setVisible(dom.adminAuth, show);
    setAdminContentVisible(!show);
    if (dom.adminAuthError) dom.adminAuthError.textContent = message || "";
    if (show && dom.adminUser) dom.adminUser.focus();
  }

  function setAdminContentVisible(visible) {
    setVisible(dom.adminTabs, visible);
    setVisible(dom.adminBody, visible);
  }

  async function handleAdminLogin() {
    const user = cleanText(dom.adminUser?.value);
    const pass = dom.adminPass?.value || "";

    if (!user || !pass) {
      if (dom.adminAuthError) dom.adminAuthError.textContent = "Username and password required.";
      return;
    }

    const header = `Basic ${btoa(`${user}:${pass}`)}`;

    try {
      const res = await fetch(`${config.dataSource.apiBase}/auth`, {
        headers: { Authorization: header },
        cache: "no-store",
      });

      if (!res.ok) {
        if (dom.adminAuthError) dom.adminAuthError.textContent = "Invalid credentials.";
        return;
      }

      adminAuthHeader = header;
      saveAdminAuth(header);
      showAdminAuth(false);
      renderAdmin();
    } catch (err) {
      if (dom.adminAuthError) dom.adminAuthError.textContent = "API offline.";
    }
  }

  async function toggleAdmin(open) {
    if (!dom.adminOverlay) return;

    if (!open) {
      adminState.open = false;
      setVisible(dom.adminOverlay, false);
      dom.adminOverlay.setAttribute("aria-hidden", "true");
      return;
    }

    adminState.open = true;
    setVisible(dom.adminOverlay, true);
    dom.adminOverlay.setAttribute("aria-hidden", "false");

    if (!dataState) {
      await refreshRemoteState(true);
    }

    const access = await ensureAdminAccess();
    if (!access) {
      return;
    }

    renderAdmin();
  }

  function renderAdmin() {
    if (!dom.adminOverlay || !dom.adminCameras || !dom.adminProfiles) return;

    const tabs = Array.from(dom.adminOverlay.querySelectorAll(".admin-tab"));
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === adminState.activeTab);
    });

    renderCameraSection();
    renderProfileSection();

    setVisible(dom.adminCameras, adminState.activeTab === "cameras");
    setVisible(dom.adminProfiles, adminState.activeTab === "profiles");
  }

  function renderCameraSection() {
    if (!dom.adminCameras) return;

    if (!dataState) {
      dom.adminCameras.innerHTML = `<div class="admin-note">API offline. Start the API container and refresh.</div>`;
      return;
    }

    const cameras = Array.isArray(dataState.cameras) ? dataState.cameras : [];
    const editing = cameras.find((cam) => cam.id === adminState.editingCameraId) || null;

    const saveLabel = editing ? "Save changes" : "Add camera";

    const rows = cameras
      .map((cam) => {
        const name = escapeHtml(cam.name || "");
        const location = escapeHtml(cam.location || "");
        const source = escapeHtml(cam.source || "");
        return `
          <tr>
            <td>${name}</td>
            <td>${location}</td>
            <td>${source}</td>
            <td>
              <div class="admin-actions">
                <button class="admin-action" data-action="camera-edit" data-id="${cam.id}">Edit</button>
                <button class="admin-action" data-action="camera-delete" data-id="${cam.id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    dom.adminCameras.innerHTML = `
      <div class="admin-section-head">
        <div class="admin-section-title">Cameras</div>
        <div class="admin-actions">
          <button class="admin-action" data-action="camera-new">New camera</button>
        </div>
      </div>

      <form class="admin-form" id="cameraForm" data-edit-id="${editing ? editing.id : ""}">
        <div class="admin-field">
          <label>Name</label>
          <input id="cameraName" type="text" placeholder="Entrance" value="${editing ? escapeHtml(editing.name) : ""}" required/>
        </div>
        <div class="admin-field">
          <label>Location</label>
          <input id="cameraLocation" type="text" placeholder="Building A" value="${editing ? escapeHtml(editing.location || "") : ""}"/>
        </div>
        <div class="admin-field" style="grid-column: span 2;">
          <label>RTSP / Stream Source</label>
          <input id="cameraSource" type="text" placeholder="rtsp://... or go2rtc stream id" value="${editing ? escapeHtml(editing.source) : ""}" required/>
        </div>
        <div class="admin-actions">
          <button class="admin-action" type="submit">${saveLabel}</button>
          ${editing ? '<button class="admin-action" type="button" data-action="camera-cancel">Cancel</button>' : ""}
        </div>
      </form>

      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Location</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4">No cameras yet.</td></tr>'}
        </tbody>
      </table>
    `;
  }
  function renderProfileSection() {
    if (!dom.adminProfiles) return;

    if (!dataState) {
      dom.adminProfiles.innerHTML = `<div class="admin-note">API offline. Start the API container and refresh.</div>`;
      return;
    }

    const profiles = Array.isArray(dataState.profiles) ? dataState.profiles : [];
    const activeId = dataState.activeProfileId;

    if (!profiles.length) {
      dom.adminProfiles.innerHTML = `<div class="admin-note">No profiles available.</div>`;
      return;
    }

    if (!adminState.selectedProfileId || !profiles.find((p) => p.id === adminState.selectedProfileId)) {
      adminState.selectedProfileId = activeId || profiles[0].id;
      const selected = profiles.find((p) => p.id === adminState.selectedProfileId) || profiles[0];
      adminState.draftSlides = cloneSlides(selected.slides || []);
      adminState.draftProfileName = selected.name;
    }

    const selectedProfile = profiles.find((p) => p.id === adminState.selectedProfileId) || profiles[0];

    const profileItems = profiles
      .map((profile) => {
        const isActive = profile.id === activeId;
        const isSelected = profile.id === adminState.selectedProfileId;
        return `
          <div class="profile-item ${isSelected ? "active" : ""}" data-action="profile-select" data-id="${profile.id}">
            <div class="profile-meta">
              <div class="profile-name">${escapeHtml(profile.name)}</div>
              ${isActive ? '<span class="profile-tag">Active</span>' : ""}
            </div>
            <div class="profile-id">ID: ${escapeHtml(profile.id)}</div>
            <div class="admin-actions">
              ${!isActive ? `<button class="admin-action" data-action="profile-set-active" data-id="${profile.id}">Set active</button>` : ""}
              ${profiles.length > 1 ? `<button class="admin-action" data-action="profile-delete" data-id="${profile.id}">Delete</button>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    const slides = adminState.draftSlides || cloneSlides(selectedProfile.slides || []);
    const cameraOptions = buildCameraOptions(dataState.cameras || []);

    const slideCards = slides
      .map((slide, index) => {
        const slots = normalizeSlots(slide.cameraIds || [], maxCamsPerSlide);
        const selects = slots
          .map((cameraId, slotIndex) => {
            return `
              <select data-role="slide-camera" data-slide-index="${index}" data-slot="${slotIndex}">
                <option value="">-- empty --</option>
                ${cameraOptions(cameraId)}
              </select>
            `;
          })
          .join("");

        return `
          <div class="slide-card" data-slide-id="${slide.id || ""}" data-slide-index="${index}">
            <div class="slide-header">
              <div class="admin-field" style="flex:1;">
                <label>Slide name</label>
                <input data-role="slide-name" data-slide-index="${index}" type="text" value="${escapeHtml(slide.name || "")}"/>
              </div>
              <button class="admin-action" data-action="slide-remove" data-slide-index="${index}">Remove</button>
            </div>
            <div class="slide-cams">
              ${selects}
            </div>
          </div>
        `;
      })
      .join("");

    dom.adminProfiles.innerHTML = `
      <div class="admin-section-head">
        <div class="admin-section-title">Slideshows</div>
        <div class="admin-actions">
          <button class="admin-action" data-action="profile-add">Add profile</button>
        </div>
      </div>
      <div class="admin-split">
        <div class="profile-list">
          ${profileItems}
        </div>
        <div>
          <div class="admin-form full">
            <div class="admin-field">
              <label>Profile name</label>
              <input id="profileNameInput" type="text" value="${escapeHtml(adminState.draftProfileName || selectedProfile.name)}"/>
            </div>
            <div class="admin-actions">
              <button class="admin-action" data-action="profile-name-save" data-id="${selectedProfile.id}">Save name</button>
              ${activeId !== selectedProfile.id ? `<button class="admin-action" data-action="profile-set-active" data-id="${selectedProfile.id}">Set active</button>` : ""}
            </div>
          </div>

          <div class="admin-section-head" style="margin-top:14px;">
            <div class="admin-section-title">Slides</div>
            <div class="admin-actions">
              <span class="admin-note">Max ${maxCamsPerSlide} cams/slide</span>
              <button class="admin-action" data-action="slide-add">Add slide</button>
              <button class="admin-action" data-action="slides-save" data-id="${selectedProfile.id}">Save slides</button>
            </div>
          </div>
          ${slideCards || '<div class="admin-note">No slides yet.</div>'}
        </div>
      </div>
    `;
  }

  function buildCameraOptions(cameras) {
    const list = Array.isArray(cameras) ? cameras : [];
    const options = list.map((cam) => {
      const label = cam.location ? `${cam.name} - ${cam.location}` : cam.name;
      return { id: cam.id, label: escapeHtml(label || cam.source || "") };
    });

    return (selectedId) =>
      options
        .map((opt) => `<option value="${opt.id}" ${opt.id === selectedId ? "selected" : ""}>${opt.label}</option>`)
        .join("");
  }

  function handleAdminClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) {
      const tabEl = event.target.closest(".admin-tab");
      if (tabEl) {
        const tab = tabEl.dataset.tab;
        if (tab) {
          adminState.activeTab = tab;
          renderAdmin();
        }
      }
      return;
    }

    const action = actionEl.dataset.action;

    if (action === "camera-new") {
      adminState.editingCameraId = null;
      renderCameraSection();
      return;
    }

    if (action === "camera-edit") {
      adminState.editingCameraId = actionEl.dataset.id || null;
      renderCameraSection();
      return;
    }

    if (action === "camera-cancel") {
      adminState.editingCameraId = null;
      renderCameraSection();
      return;
    }

    if (action === "camera-delete") {
      const id = actionEl.dataset.id;
      if (!id) return;
      if (!confirm("Delete this camera?")) return;
      deleteCamera(id);
      return;
    }

    if (action === "profile-add") {
      createProfile();
      return;
    }

    if (action === "profile-select") {
      const id = actionEl.dataset.id;
      if (!id) return;
      selectProfile(id);
      return;
    }

    if (action === "profile-set-active") {
      const id = actionEl.dataset.id;
      if (!id) return;
      setActiveProfile(id);
      return;
    }

    if (action === "profile-delete") {
      const id = actionEl.dataset.id;
      if (!id) return;
      if (!confirm("Delete this profile?")) return;
      deleteProfile(id);
      return;
    }

    if (action === "slide-add") {
      addSlide();
      return;
    }

    if (action === "slide-remove") {
      const index = toInt(actionEl.dataset.slideIndex, -1);
      if (index < 0) return;
      removeSlide(index);
      return;
    }

    if (action === "slides-save") {
      const id = actionEl.dataset.id;
      if (!id) return;
      saveSlides(id);
      return;
    }

    if (action === "profile-name-save") {
      const id = actionEl.dataset.id;
      if (!id) return;
      saveProfileName(id);
      return;
    }

  }

  function handleAdminSubmit(event) {
    const form = event.target;
    if (!form) return;
    if (form.id === "adminAuthForm") {
      event.preventDefault();
      handleAdminLogin();
      return;
    }
    if (form.id !== "cameraForm") return;
    event.preventDefault();
    saveCamera(form);
  }

  function handleAdminInput(event) {
    const target = event.target;
    if (!target) return;

    if (target.id === "profileNameInput") {
      adminState.draftProfileName = target.value;
      return;
    }

    if (target.dataset.role === "slide-name") {
      const index = toInt(target.dataset.slideIndex, -1);
      if (index < 0) return;
      ensureDraftSlides();
      if (adminState.draftSlides[index]) {
        adminState.draftSlides[index].name = target.value;
      }
      return;
    }

    if (target.dataset.role === "slide-camera") {
      const index = toInt(target.dataset.slideIndex, -1);
      const slot = toInt(target.dataset.slot, -1);
      if (index < 0 || slot < 0) return;
      ensureDraftSlides();
      const slide = adminState.draftSlides[index];
      if (!slide) return;
      if (!Array.isArray(slide.cameraIds)) slide.cameraIds = [];
      slide.cameraIds[slot] = target.value || null;
    }
  }
  async function saveCamera(form) {
    if (!form) return;
    const editId = form.dataset.editId || "";
    const name = cleanText(form.querySelector("#cameraName")?.value);
    const location = cleanText(form.querySelector("#cameraLocation")?.value, "");
    const source = cleanText(form.querySelector("#cameraSource")?.value);

    if (!name || !source) {
      alert("Name and source are required.");
      return;
    }

    try {
      if (editId) {
        await apiFetch(`/cameras/${editId}`, {
          method: "PUT",
          body: JSON.stringify({ name, location, source }),
        });
      } else {
        await apiFetch("/cameras", {
          method: "POST",
          body: JSON.stringify({ name, location, source }),
        });
      }

      adminState.editingCameraId = null;
      await refreshRemoteState(true);
      renderAdmin();
    } catch (err) {
      alert("Failed to save camera.");
    }
  }

  async function deleteCamera(id) {
    try {
      await apiFetch(`/cameras/${id}`, { method: "DELETE" });
      await refreshRemoteState(true);
      renderAdmin();
    } catch (err) {
      alert("Failed to delete camera.");
    }
  }

  async function createProfile() {
    try {
      const profile = await apiFetch("/profiles", {
        method: "POST",
        body: JSON.stringify({ name: "New Profile" }),
      });

      await refreshRemoteState(true);
      if (profile?.id) {
        selectProfile(profile.id);
      } else {
        renderAdmin();
      }
    } catch (err) {
      alert("Failed to create profile.");
    }
  }

  async function deleteProfile(id) {
    try {
      await apiFetch(`/profiles/${id}`, { method: "DELETE" });
      await refreshRemoteState(true);
      adminState.selectedProfileId = null;
      renderAdmin();
    } catch (err) {
      alert("Failed to delete profile.");
    }
  }

  async function setActiveProfile(id) {
    try {
      await apiFetch("/settings/active-profile", {
        method: "PUT",
        body: JSON.stringify({ profileId: id }),
      });
      await refreshRemoteState(true);
      renderAdmin();
    } catch (err) {
      alert("Failed to set active profile.");
    }
  }

  async function saveProfileName(id) {
    const name = cleanText(adminState.draftProfileName);
    if (!name) {
      alert("Profile name is required.");
      return;
    }

    try {
      await apiFetch(`/profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      await refreshRemoteState(true);
      renderAdmin();
    } catch (err) {
      alert("Failed to rename profile.");
    }
  }

  function selectProfile(id) {
    if (!dataState) return;
    const profile = (dataState.profiles || []).find((item) => item.id === id);
    if (!profile) return;
    adminState.selectedProfileId = id;
    adminState.draftSlides = cloneSlides(profile.slides || []);
    adminState.draftProfileName = profile.name;
    renderProfileSection();
  }

  function ensureDraftSlides() {
    if (adminState.draftSlides) return;
    const profile = (dataState?.profiles || []).find((item) => item.id === adminState.selectedProfileId);
    adminState.draftSlides = cloneSlides(profile?.slides || []);
  }

  function addSlide() {
    ensureDraftSlides();
    adminState.draftSlides.push({
      id: "",
      name: `Slide ${adminState.draftSlides.length + 1}`,
      cameraIds: [],
    });
    renderProfileSection();
  }

  function removeSlide(index) {
    ensureDraftSlides();
    adminState.draftSlides.splice(index, 1);
    renderProfileSection();
  }

  async function saveSlides(profileId) {
    ensureDraftSlides();
    const slides = collectSlidesFromDom();

    if (!slides.length) {
      alert("At least one slide is required.");
      return;
    }

    try {
      await apiFetch(`/profiles/${profileId}/slides`, {
        method: "PUT",
        body: JSON.stringify({ slides }),
      });
      adminState.draftSlides = null;
      adminState.draftProfileName = "";
      await refreshRemoteState(true);
      renderAdmin();
    } catch (err) {
      alert("Failed to save slides.");
    }
  }

  function collectSlidesFromDom() {
    if (!dom.adminProfiles) return [];
    const cards = Array.from(dom.adminProfiles.querySelectorAll(".slide-card"));

    return cards.map((card, index) => {
      const nameInput = card.querySelector("[data-role=slide-name]");
      const name = cleanText(nameInput?.value, `Slide ${index + 1}`);
      const selects = Array.from(card.querySelectorAll("[data-role=slide-camera]"));
      const cameraIds = selects
        .map((select) => select.value)
        .filter((value) => Boolean(value))
        .slice(0, maxCamsPerSlide);

      return {
        id: card.dataset.slideId || "",
        name,
        cameraIds,
      };
    });
  }
  function scheduleRemoteRefresh() {
    if (config.dataSource.mode !== "remote") return;
    const interval = config.dataSource.refreshSeconds * 1000;
    if (!interval) return;

    setInterval(async () => {
      if (document.hidden || adminState.open) return;
      await refreshRemoteState(false);
    }, interval);
  }

  async function refreshRemoteState(force) {
    if (config.dataSource.mode !== "remote") return;
    if (adminState.open && !force) return;

    const state = await fetchState();
    if (state) {
      setRemoteState(state, false);
    }
  }

  async function fetchState() {
    try {
      const res = await fetch(`${config.dataSource.apiBase}/state`, { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function apiFetch(path, options) {
    const headers = { "Content-Type": "application/json" };
    if (adminAuthHeader) headers.Authorization = adminAuthHeader;

    const res = await fetch(`${config.dataSource.apiBase}${path}`, {
      headers,
      ...options,
    });

    if (res.status === 401) {
      showAdminAuth(true, "Login required.");
      throw new Error("unauthorized");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "request_failed");
    }

    if (res.status === 204) return null;
    return res.json();
  }

  function setTimer(t) {
    seconds = t;
    setTimerUi(seconds);
    saveLocal(STORAGE.timer, seconds);
    updateUrlState();
    scheduleCycle(true);
  }

  function setPage(index) {
    if (!pages.length) return;
    pageIndex = (index + pages.length) % pages.length;
    saveLocal(STORAGE.page, pageIndex);
    updateUrlState();
    render();
    scheduleCycle();
  }

  function setTimerUi(t) {
    if (dom.timerValue) dom.timerValue.textContent = `${t}s`;
    dom.segButtons.forEach((b) => {
      const value = parseInt(b.dataset.t, 10);
      b.classList.toggle("active", value === t);
    });
  }

  function updateUrlState() {
    if (!pages.length) return;
    const next = new URL(location.href);
    next.searchParams.set("t", String(seconds));
    next.searchParams.set("p", String(pageIndex + 1));
    history.replaceState({}, "", next.toString());
  }

  function render() {
    if (!isAuthed) {
      toggleRoleOverlay(true);
      return;
    }

    cleanup();
    if (wallMode) return renderWall();
    if (!pages.length) return;

    const page = pages[pageIndex];
    const pageName = page?.name || `Seite ${pageIndex + 1}`;

    if (dom.subtitle) dom.subtitle.textContent = pageName;
    if (dom.pageValue) dom.pageValue.textContent = `${pageIndex + 1}/${pages.length}`;
    document.title = `${config.ui.titlePrefix} - ${pageName}`;

    const camsRaw = Array.isArray(page?.cams) ? page.cams : [];
    const normalized = camsRaw.map((cam) => (cam && cam.id ? cam : null));
    const cams = config.ui.layout === "auto" ? normalized.filter(Boolean) : padTo(normalized, 4);

    applyGridLayout(cams.length || 1);

    if (!dom.grid) return;

    if (!cams.length) {
      dom.grid.appendChild(makeEmptyTile(config.ui.labels.noCameras));
      return;
    }

    cams.forEach((cam) => {
      if (cam && cam.id) dom.grid.appendChild(makeTile(cam));
      else dom.grid.appendChild(makeEmptyTile(config.ui.labels.empty));
    });
  }

  function renderWall() {
    document.body.classList.add("wall-mode");
    const cams = Array.isArray(dataState?.cameras) ? dataState.cameras : [];
    if (dom.subtitle) dom.subtitle.textContent = "Alle Kameras";
    if (dom.pageValue) dom.pageValue.textContent = "–";
    document.title = `${config.ui.titlePrefix} - Übersicht`;

    if (!dom.grid) return;
    dom.grid.innerHTML = "";
    dom.grid.style.gridTemplateColumns = "repeat(5, minmax(0,1fr))";
    dom.grid.style.gridTemplateRows = "repeat(4, minmax(0,1fr))";

    if (!cams.length) {
      dom.grid.appendChild(makeEmptyTile(config.ui.labels.noCameras));
      return;
    }

    cams.forEach((cam) => {
      dom.grid.appendChild(makeSnapTile(cam));
    });

    startSnapshotRefresh();
  }

  function makeEmptyTile(label) {
    const tile = document.createElement("div");
    tile.className = "tile empty fade";

    if (config.ui.showEmptyLabels) {
      const text = document.createElement("div");
      text.className = "empty-label";
      text.textContent = label;
      tile.appendChild(text);
    }
    return tile;
  }

  function makeSnapTile(cam) {
    const tile = document.createElement("div");
    tile.className = "snap-tile fade";

    const img = document.createElement("img");
    img.dataset.src = cam.source;
    img.src = snapshotUrl(cam.source);
    tile.appendChild(img);

    const badge = document.createElement("div");
    badge.className = "snap-badge";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = cam.name || cam.source;
    const loc = document.createElement("div");
    loc.className = "loc";
    loc.textContent = cam.location || "";
    badge.appendChild(name);
    if (cam.location) badge.appendChild(loc);
    tile.appendChild(badge);

    tile.addEventListener("click", () => openLive(cam));
    return tile;
  }

  function makeTile({ id, label }) {
    const tile = document.createElement("div");
    tile.className = "tile fade";

    let ping = null;
    let state = null;
    if (config.ui.showBadges) {
      const badge = document.createElement("div");
      badge.className = "badge";

      ping = document.createElement("div");
      ping.className = "ping";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = label || id;

      state = document.createElement("div");
      state.className = "state";
      state.textContent = config.ui.labels.loading;

      badge.appendChild(ping);
      badge.appendChild(name);
      badge.appendChild(state);
      tile.appendChild(badge);
    }

    const corner = document.createElement("div");
    corner.className = "corner";
    corner.textContent = config.ui.labels.live;

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const src = hlsUrl(id);

    const markOk = () => {
      if (state) state.textContent = config.ui.labels.ok;
      if (ping) ping.classList.remove("err", "warn");
    };

    const markWarn = (msg) => {
      if (state) state.textContent = msg || config.ui.labels.buffer;
      if (ping) {
        ping.classList.remove("err");
        ping.classList.add("warn");
      }
    };

    const markFatal = (msg) => {
      if (state) state.textContent = msg || config.ui.labels.fatal;
      if (ping) {
        ping.classList.remove("warn");
        ping.classList.add("err");
      }
    };

    const HLS = window.Hls;
    if (HLS && HLS.isSupported()) {
      const hls = new HLS(config.hls);

      hls.on(HLS.Events.MANIFEST_PARSED, markOk);
      hls.on(HLS.Events.FRAG_LOADED, markOk);

      hls.on(HLS.Events.ERROR, (_evt, data) => {
        if (!data) return;
        if (!data.fatal) {
          if (data.details === HLS.ErrorDetails.BUFFER_STALLED_ERROR) {
            markWarn();
          }
          return;
        }

        const details = data.details ? `err: ${data.details}` : config.ui.labels.fatal;
        markFatal(details);

        try {
          if (data.type === HLS.ErrorTypes.MEDIA_ERROR) {
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
      video.src = src;
      video.addEventListener("playing", markOk, { once: false });
      video.addEventListener("waiting", () => markWarn(), { once: false });
      video.addEventListener("error", () => markFatal("video"), { once: false });
    } else {
      markFatal(config.ui.labels.unsupported);
    }

    cleanupFns.push(() => {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch (_) {}
    });

    tile.appendChild(video);
    if (config.ui.showLiveBadge) tile.appendChild(corner);
    return tile;
  }
  function hlsUrl(streamId) {
    const base = config.go2rtcBase;
    return `${base}/api/stream.m3u8?src=${encodeURIComponent(streamId)}`;
  }

  function snapshotUrl(streamId) {
    const base = config.go2rtcBase;
    const qs = `src=${encodeURIComponent(streamId)}&w=${config.snapwall.width}&h=${config.snapwall.height}&_=${Date.now()}`;
    return `${base}/api/frame.jpeg?${qs}`;
  }

  function startSnapshotRefresh() {
    if (snapshotTimer) clearInterval(snapshotTimer);
    refreshSnapshots();
    snapshotTimer = setInterval(refreshSnapshots, config.snapwall.refreshSeconds * 1000);
    cleanupFns.push(() => {
      if (snapshotTimer) clearInterval(snapshotTimer);
      snapshotTimer = null;
    });
  }

  function refreshSnapshots() {
    if (!dom.grid) return;
    const imgs = Array.from(dom.grid.querySelectorAll(".snap-tile img"));
    imgs.forEach((img) => {
      const src = img.dataset.src;
      if (!src) return;
      img.src = snapshotUrl(src);
    });
  }

  function openLive(cam) {
    if (!dom.wallOverlay || !dom.liveVideo) return;
    dom.liveName.textContent = cam.name || cam.source;
    dom.liveState.textContent = "loading…";
    dom.wallOverlay.classList.remove("hidden");
    dom.wallOverlay.setAttribute("aria-hidden", "false");

    const video = dom.liveVideo;
    video.src = "";
    video.muted = true;
    video.autoplay = true;
    const src = hlsUrl(cam.source || cam.id);

    const HLS = window.Hls;
    if (liveHls) {
      try { liveHls.destroy(); } catch (_) {}
      liveHls = null;
    }

    if (HLS && HLS.isSupported()) {
      const hls = new HLS(config.hls);
      hls.on(HLS.Events.MANIFEST_PARSED, () => (dom.liveState.textContent = "live"));
      hls.on(HLS.Events.ERROR, (_evt, data) => {
        if (data?.fatal) {
          dom.liveState.textContent = "error";
          try { hls.destroy(); } catch (_) {}
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      liveHls = hls;
      setTimeout(() => video.play().catch(() => {}), 50);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("playing", () => (dom.liveState.textContent = "live"), { once: true });
      video.addEventListener("error", () => (dom.liveState.textContent = "error"), { once: true });
      video.play().catch(() => {});
    } else {
      dom.liveState.textContent = "HLS unsupported";
    }
  }

  function closeLive(silent) {
    if (!dom.wallOverlay) return;
    dom.wallOverlay.classList.add("hidden");
    dom.wallOverlay.setAttribute("aria-hidden", "true");
    if (dom.liveVideo) {
      try {
        dom.liveVideo.pause();
        dom.liveVideo.removeAttribute("src");
        dom.liveVideo.load();
      } catch (_) {}
    }
    if (liveHls) {
      try { liveHls.destroy(); } catch (_) {}
      liveHls = null;
    }
    if (!silent) {
      // keep overlay hidden
    }
  }

  function applyGridLayout(count) {
    if (!dom.grid) return;
    if (config.ui.layout !== "auto") {
      dom.grid.style.gridTemplateColumns = "";
      dom.grid.style.gridTemplateRows = "";
      return;
    }

    const tiles = Math.max(count, 1);
    let columns = 2;
    let rows = 2;

    if (tiles <= 1) {
      columns = 1;
      rows = 1;
    } else if (tiles === 2) {
      columns = 2;
      rows = 1;
    } else if (tiles === 3) {
      columns = 3;
      rows = 1;
    } else if (tiles === 4) {
      columns = 2;
      rows = 2;
    } else {
      columns = 3;
      rows = 2;
    }

    dom.grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0,1fr))`;
    dom.grid.style.gridTemplateRows = `repeat(${rows}, minmax(0,1fr))`;
  }

  function cleanup() {
    document.body.classList.remove("wall-mode");

    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];

    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;

    hlsInstances.forEach((hls) => {
      try { hls.destroy(); } catch {}
    });
    hlsInstances = [];

    closeLive(true);

    if (dom.grid) dom.grid.innerHTML = "";
  }

  function scheduleCycle(force = false) {
    if (!isAuthed || wallMode) {
      stopCycle();
      return;
    }

    if (!config.autoCycle || pages.length <= 1) {
      stopCycle();
      return;
    }

    if (cycleHandle && !force) return;
    stopCycle();

    cycleHandle = setInterval(() => {
      pageIndex = (pageIndex + 1) % pages.length;
      saveLocal(STORAGE.page, pageIndex);
      updateUrlState();
      render();
    }, seconds * 1000);
  }

  function stopCycle() {
    if (cycleHandle) clearInterval(cycleHandle);
    cycleHandle = null;
  }

  function renderEmptyState(message) {
    if (dom.subtitle) dom.subtitle.textContent = message;
    if (!dom.grid) return;

    applyGridLayout(1);
    dom.grid.innerHTML = "";
    dom.grid.appendChild(makeEmptyTile(message));
  }

  function resolveSeconds(urlValue) {
    const fromUrl = getAllowedTimer(urlValue.searchParams.get("t"));
    if (fromUrl) return fromUrl;

    const stored = getAllowedTimer(loadLocal(STORAGE.timer));
    if (stored) return stored;

    return config.defaultSeconds;
  }

  function resolvePageIndex(urlValue) {
    if (!pages.length) return 0;
    const param = parseInt(urlValue.searchParams.get("p"), 10);
    if (Number.isFinite(param) && param >= 1 && param <= pages.length) {
      return param - 1;
    }

    const stored = parseInt(loadLocal(STORAGE.page), 10);
    if (Number.isFinite(stored) && stored >= 0 && stored < pages.length) {
      return stored;
    }

    return 0;
  }

  function resolveProfileOverride(profiles) {
    if (!Array.isArray(profiles) || !profiles.length) return null;
    const url = new URL(location.href);
    let desired = "";
    for (const key of PROFILE_QUERY_KEYS) {
      desired = cleanText(url.searchParams.get(key));
      if (desired) break;
    }
    if (!desired) return null;
    return profiles.find((profile) => profile.id === desired) ? desired : null;
  }

  function clampPageIndex(value) {
    if (!pages.length) return 0;
    return Math.min(pages.length - 1, Math.max(0, value));
  }

  function getAllowedTimer(value) {
    const parsed = parseInt(value, 10);
    return ALLOWED_TIMERS.includes(parsed) ? parsed : null;
  }

  function padTo(list, size) {
    const output = list.slice(0, size);
    while (output.length < size) output.push(null);
    return output;
  }

  function saveLocal(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  function loadLocal(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function loadAdminAuth() {
    try {
      return sessionStorage.getItem(AUTH_STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function saveAdminAuth(value) {
    try {
      if (value) sessionStorage.setItem(AUTH_STORAGE_KEY, value);
      else sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {}
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function applyThemeVars(theme) {
    if (!theme || typeof theme !== "object") return;
    const mapping = {
      accent: "--accent",
      accent2: "--accent-2",
      bg: "--bg",
      panel: "--panel",
      panelStrong: "--panel-strong",
      text: "--text",
      muted: "--muted",
      border: "--border",
      radius: "--radius",
      gap: "--gap",
      topbarHeight: "--topbar-height",
    };

    Object.entries(mapping).forEach(([key, variable]) => {
      const value = theme[key];
      if (typeof value === "string" && value.trim()) {
        document.documentElement.style.setProperty(variable, value.trim());
      }
    });
  }

  function normalizeSlots(ids, maxSlots) {
    const slots = Array.isArray(ids) ? ids.slice(0, maxSlots) : [];
    while (slots.length < maxSlots) slots.push("");
    return slots;
  }

  function cloneSlides(slides) {
    return JSON.parse(JSON.stringify(slides || []));
  }

  function cleanText(value, fallback = "") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanBase(value) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed || DEFAULTS.dataSource.apiBase;
  }

  function toInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
