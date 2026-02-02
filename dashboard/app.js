
/*
 * CamDash - CCTV dashboard with paging, auto cycling, and WebRTC playback.
 */

(() => {
  "use strict";

  const cfg = window.CAMDASH_CONFIG || {};

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
    logoutBtn: document.getElementById("logoutBtn"),
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
    adminUsers: document.getElementById("adminUsers"),
    roleOverlay: document.getElementById("roleOverlay"),
    roleForm: document.getElementById("roleForm"),
    roleUser: document.getElementById("roleUser"),
    rolePass: document.getElementById("rolePass"),
    roleError: document.getElementById("roleError"),
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
      unsupported: "WebRTC unsupported",
      configMissing: "config.js fehlt/leer",
      adminTitle: "CamDash Admin",
    },
  };

  const STORAGE = {
    timer: "camdash.timer",
    page: "camdash.page",
    roleProfile: "camdash.roleProfile",
    token: "camdash.token",
    role: "camdash.role",
    startView: "camdash.startView",
  };
  const PROFILE_QUERY_KEYS = ["profile", "profileId"];
  const AUTH_STORAGE_KEY = "camdash.adminAuth";

  const adminState = {
    open: false,
    activeTab: "cameras",
    selectedProfileId: null,
    draftSlides: null,
    draftProfileName: "",
    profileAllowLive: false,
    editingCameraId: null,
    users: [],
    profiles: [],
    editingUserId: null,
    draftUser: null,
  };

  const config = normalizeConfig(cfg);

  let adminAuthHeader = loadAdminAuth();
  let pages = [];
  let dataState = null;
  let maxCamsPerSlide = 6;
  let seconds = config.defaultSeconds;
  let pageIndex = 0;
  let cleanupFns = [];
  let cycleHandle = null;
  let pagesSignature = "";
  let role = null; // kiosk | priv | admin (set after auth)
  let roleProfileId = loadLocal(STORAGE.roleProfile) || "";
  let wallMode = false; // default to slides view
  let snapshotTimer = null;
  let snapshotsPaused = false;
  let livePc = null;
  let tilePcs = [];
  let currentProfileAllowLive = false;
  let isAuthed = false;
  let liveStateLabel = null;
  let authToken = loadLocal(STORAGE.token) || "";
  role = loadLocal(STORAGE.role) || null;
  wallMode = false;

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
    currentProfileAllowLive = false;
    const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
    const cameras = Array.isArray(state?.cameras) ? state.cameras : [];

    let chosenProfileId = roleProfileId || state?.activeProfileId;
    if (role === "admin") {
      const overrideId = resolveProfileOverride(profiles);
      if (overrideId) chosenProfileId = overrideId;
    }

    const activeProfile = profiles.find((profile) => profile.id === chosenProfileId) || profiles[0];
    if (!activeProfile) return [];
    currentProfileAllowLive = Boolean(activeProfile.allowLive);

    const camMap = new Map(cameras.map((cam) => [cam.id, cam]));

    return (activeProfile.slides || []).map((slide, index) => {
      const cams = (slide.cameraIds || []).map((camId) => {
        const cam = camMap.get(camId);
        if (!cam || !cam.source) return null;

        let label = cam.name || cam.source;
        if (config.ui.includeLocationInLabel && cam.location) {
          label = `${label} - ${cam.location}`;
        }

        return { id: cam.source, label, source: cam.source, name: cam.name || cam.source };
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
        setPage(pageIndex - 1);
      });
    }

    if (dom.nextBtn) {
      dom.nextBtn.addEventListener("click", () => {
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

      if (e.key === "ArrowLeft") {
        setPage(pageIndex - 1);
      } else if (e.key === "ArrowRight") {
        setPage(pageIndex + 1);
      } else if (config.autoCycle) {
        if (e.key === "1") setTimer(30);
        if (e.key === "2") setTimer(60);
        if (e.key === "3") setTimer(90);
      }
    });
  }

  function initRoles() {
    if (!dom.roleOverlay) return;

    toggleRoleOverlay(true);

    if (dom.roleForm) {
      dom.roleForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleRoleAuth();
      });
    }

    if (dom.roleOverlay) {
      dom.roleOverlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          handleRoleAuth();
        }
      });
    }

    if (dom.wallBtn) {
      dom.wallBtn.addEventListener("click", () => {
        // Wall view disabled; keep slides-only start view
      });
    }
    if (dom.logoutBtn) {
      dom.logoutBtn.addEventListener("click", () => {
        logout();
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

  function handleRoleAuth() {
    const user = cleanText(dom.roleUser?.value);
    const pass = cleanText(dom.rolePass?.value);
    if (!user || !pass) return;

    fetch(`${config.dataSource.apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid");
        return res.json();
      })
      .then((payload) => {
        if (!payload || !payload.token || !payload.role) throw new Error("invalid");
        authToken = payload.token;
        saveLocal(STORAGE.token, authToken);
        saveLocal(STORAGE.role, role);
        saveLocal(STORAGE.startView, wallMode ? "wall" : "slides");
        if (dom.roleError) {
          dom.roleError.classList.add("hidden");
          dom.roleError.textContent = "";
        }
        role = payload.role;
        wallMode = false;
        saveLocal(STORAGE.startView, "slides");
        isAuthed = true;
        // honor server-selected profile for kiosk/video; admin can switch later
        if (payload.profileId) {
          roleProfileId = payload.profileId;
          saveLocal(STORAGE.roleProfile, roleProfileId);
        }
        if (role !== "kiosk" && !payload.profileId) {
          roleProfileId = "";
        }
        applyRoleUi();
        toggleRoleOverlay(false);
        pageIndex = 0;
        render();
        if (wallMode) stopCycle();
        else scheduleCycle(true);
      })
      .catch(() => {
        if (dom.roleError) {
          dom.roleError.textContent = "Falscher Benutzer oder Passwort";
          dom.roleError.classList.remove("hidden");
        }
      });
  }

  function logout() {
    authToken = "";
    role = null;
    roleProfileId = "";
    wallMode = false;
    isAuthed = false;
    saveLocal(STORAGE.token, "");
    saveLocal(STORAGE.role, "");
    saveLocal(STORAGE.roleProfile, "");
    saveLocal(STORAGE.startView, "");
    adminState.open = false;
    setVisible(dom.adminOverlay, false);
    dom.adminOverlay?.setAttribute("aria-hidden", "true");
    toggleRoleOverlay(true);
    renderEmptyState("Bitte einloggen");
    stopCycle();
  }

  function applyRoleUi() {
    if (!isAuthed) {
      setVisible(dom.adminBtn, false);
      setVisible(dom.wallBtn, false);
      setVisible(dom.logoutBtn, false);
      setVisible(dom.prevBtn, false);
      setVisible(dom.nextBtn, false);
      setVisible(dom.timerChip, false);
      setVisible(dom.timerSelect, false);
      document.body.classList.add("locked");
      return;
    }
    document.body.classList.remove("locked");

    document.body.classList.toggle("role-kiosk", role === "kiosk");
    document.body.classList.toggle("role-priv", role === "priv");
    document.body.classList.toggle("role-admin", role === "admin");

    // Always show admin button for admin role when remote mode is enabled.
    const showAdmin = role === "admin" && config.dataSource.mode === "remote";
    setVisible(dom.adminBtn, showAdmin);

    const showWall = false; // disable wall toggle; slides-only start view
    setVisible(dom.wallBtn, showWall);
    setVisible(dom.logoutBtn, true);

    const showNav = config.ui.showNav && (role === "admin" || role === "priv");
    setVisible(dom.prevBtn, showNav);
    setVisible(dom.nextBtn, showNav);

    const showTimer = config.ui.showTimer && config.autoCycle && (role === "admin" || role === "priv");
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
    if (role === "admin" && authToken) {
      showAdminAuth(false);
      return true;
    }

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

    if (role !== "admin") {
      alert("Admin access only.");
      toggleAdmin(false);
      return;
    }

    if (!dataState) {
      await refreshRemoteState(true);
    }

    const access = await ensureAdminAccess();
    if (!access) {
      return;
    }

    renderAdmin();
    if (adminState.activeTab === "users") loadAdminUsers();
  }

  function renderAdmin() {
    if (!dom.adminOverlay || !dom.adminCameras || !dom.adminProfiles) return;

    const tabs = Array.from(dom.adminOverlay.querySelectorAll(".admin-tab"));
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === adminState.activeTab);
    });

    renderCameraSection();
    renderProfileSection();
    renderUserSection();

    setVisible(dom.adminCameras, adminState.activeTab === "cameras");
    setVisible(dom.adminProfiles, adminState.activeTab === "profiles");
    setVisible(dom.adminUsers, adminState.activeTab === "users");
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
      adminState.profileAllowLive = Boolean(selected.allowLive);
    }

    const selectedProfile = profiles.find((p) => p.id === adminState.selectedProfileId) || profiles[0];
    adminState.profileAllowLive = Boolean(selectedProfile.allowLive);

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
            <div class="admin-field">
              <label>
                <input id="profileAllowLiveInput" type="checkbox" ${adminState.profileAllowLive ? "checked" : ""}/>
                Snapshots + click-to-live (unchecked = inline live video tiles)
              </label>
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

function renderUserSection() {
    if (!dom.adminUsers) return;
    if (!dataState) {
      dom.adminUsers.innerHTML = `<div class="admin-note">API offline.</div>`;
      return;
    }

    const profiles = Array.isArray(dataState.profiles) ? dataState.profiles : [];
    const users = Array.isArray(adminState.users) ? adminState.users : [];
    const profileSelect = (selectedId) =>
      ['<option value="">(active profile)</option>']
        .concat(
          profiles.map(
            (p) =>
              `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.name || "Profile")}</option>`
          )
        )
        .join("");
    const rows =
      users
        .map((u) => {
          const startProfileName = findProfileName(profiles, u.startProfileId) || "(active profile)";
          return `
          <tr>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.role)}</td>
            <td>${escapeHtml(startProfileName)}</td>
            <td>
              <div class="admin-actions">
                <button class="admin-action" data-action="user-edit" data-id="${u.id}">Edit</button>
                <button class="admin-action" data-action="user-delete" data-id="${u.id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
        })
        .join("") || `<tr><td colspan="4">No users yet.</td></tr>`;

    const editing = adminState.draftUser;

    dom.adminUsers.innerHTML = `
      <div class="admin-section-head">
        <div class="admin-section-title">Users</div>
        <div class="admin-actions">
          <button class="admin-action" data-action="user-new">New user</button>
        </div>
      </div>
      <table class="admin-table">
        <thead>
          <tr><th>User</th><th>Role</th><th>Start Profile</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${
        editing
          ? `<div class="admin-form full" id="userForm" data-id="${editing.id || ""}">
              <div class="admin-field">
                <label>Username</label>
                <input data-role="user-username" value="${escapeHtml(editing.username || "")}" required/>
              </div>
              <div class="admin-field">
                <label>Password${editing.id ? " (leave blank to keep)" : ""}</label>
                <input data-role="user-password" type="password" value=""/>
              </div>
              <div class="admin-field">
                <label>Role</label>
                <select data-role="user-role">
                  ${["admin", "video", "kiosk"]
                    .map((r) => `<option value="${r}" ${editing.role === r ? "selected" : ""}>${r}</option>`)
                    .join("")}
                </select>
              </div>
              <div class="admin-field">
                <label>Start profile</label>
                <select data-role="user-start-profile">
                  ${profileSelect(editing.startProfileId)}
                </select>
              </div>
              <div class="admin-actions">
                <button class="admin-action" data-action="user-save">${editing.id ? "Update" : "Create"}</button>
                <button class="admin-action" data-action="user-cancel">Cancel</button>
              </div>
            </div>`
          : ""
      }
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

  function findProfileName(profiles, id) {
    if (!id) return "";
    const p = Array.isArray(profiles) ? profiles.find((x) => x.id === id) : null;
    return p ? p.name || "" : "";
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
          if (tab === "users") loadAdminUsers();
          if (tab === "profiles") refreshAdminProfiles();
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

    if (action === "user-new") {
      startEditUser(null);
      return;
    }
    if (action === "user-edit") {
      startEditUser(actionEl.dataset.id);
      return;
    }
    if (action === "user-delete") {
      const id = actionEl.dataset.id;
      if (!id) return;
      if (!confirm("Delete this user?")) return;
      deleteUser(id);
      return;
    }
    if (action === "user-save") {
      saveUser();
      return;
    }
    if (action === "user-cancel") {
      adminState.draftUser = null;
      adminState.editingUserId = null;
      renderUserSection();
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
    if (target.id === "profileAllowLiveInput") {
      adminState.profileAllowLive = target.checked;
      return;
    }

    if (target.dataset.role === "user-username" && adminState.draftUser) {
      adminState.draftUser.username = target.value;
      return;
    }
    if (target.dataset.role === "user-password" && adminState.draftUser) {
      adminState.draftUser.password = target.value;
      return;
    }
    if (target.dataset.role === "user-role" && adminState.draftUser) {
      adminState.draftUser.role = target.value;
      return;
    }
    if (target.dataset.role === "user-start-profile" && adminState.draftUser) {
      adminState.draftUser.startProfileId = target.value;
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
      return;
    }

    if (target.dataset.role === "user-profile" && adminState.draftUser) {
      const value = target.value;
      const list = new Set(adminState.draftUser.profiles || []);
      if (target.checked) list.add(value);
      else list.delete(value);
      adminState.draftUser.profiles = Array.from(list);
      return;
    }
  }

  async function loadAdminUsers() {
    try {
      const res = await apiFetch("/users", { method: "GET" });
      adminState.users = Array.isArray(res) ? res : [];
      adminState.draftUser = null;
      adminState.editingUserId = null;
      renderUserSection();
    } catch (_) {
      if (dom.adminUsers) dom.adminUsers.innerHTML = `<div class="admin-note">Failed to load users.</div>`;
    }
  }

  function startEditUser(id) {
    const users = Array.isArray(adminState.users) ? adminState.users : [];
    const existing = users.find((u) => u.id === id);
    adminState.editingUserId = id || null;
    adminState.draftUser =
      existing || {
        id: null,
        username: "",
        role: "video",
        startView: "slides",
        startProfileId: "",
        profiles: [],
      };
    renderUserSection();
  }

  async function saveUser() {
    if (!dom.adminUsers) return;
    const form = dom.adminUsers.querySelector("#userForm");
    if (!form) return;
    const username = cleanText(form.querySelector("[data-role='user-username']")?.value);
    const password = cleanText(form.querySelector("[data-role='user-password']")?.value, "");
    const role = cleanText(form.querySelector("[data-role='user-role']")?.value, "video");
    const startProfileId = cleanText(form.querySelector("[data-role='user-start-profile']")?.value, "");
    const profiles = [];

    if (!username || !role) return;

    const payload = {
      username,
      role,
      startView: "slides",
      startProfileId: startProfileId || null,
      profiles,
    };
    if (password) payload.password = password;

    const id = adminState.editingUserId;
    try {
      if (id) {
        await apiFetch(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/users", { method: "POST", body: JSON.stringify({ ...payload, password: password || "changeme" }) });
      }
      adminState.draftUser = null;
      adminState.editingUserId = null;
      await loadAdminUsers();
    } catch (_) {
      alert("Failed to save user");
    }
  }

  async function deleteUser(id) {
    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" });
      await loadAdminUsers();
    } catch (_) {
      alert("Failed to delete user");
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
        body: JSON.stringify({ name: "New Profile", allowLive: false }),
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
      const res = await apiFetch(`/profiles/${id}`, { method: "DELETE" });
      await refreshRemoteState(true);
      adminState.selectedProfileId = null;
      renderAdmin();
    } catch (err) {
      const msg = err?.message || err?.error || "Failed to delete profile.";
      alert(msg);
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
        body: JSON.stringify({ name, allowLive: adminState.profileAllowLive }),
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
    adminState.profileAllowLive = Boolean(profile.allowLive);
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
        body: JSON.stringify({ slides, allowLive: adminState.profileAllowLive }),
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
      const headers = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const res = await fetch(`${config.dataSource.apiBase}/state`, { cache: "no-store", headers });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function apiFetch(path, options) {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
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

  function makeTile({ id, label, source, name }) {
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

    const markOk = (msg) => {
      if (state) state.textContent = msg || "live";
      if (ping) ping.classList.remove("err", "warn");
    };

    const markFatal = (msg) => {
      if (state) state.textContent = msg || config.ui.labels.fatal;
      if (ping) {
        ping.classList.remove("warn");
        ping.classList.add("err");
      }
    };

    const streamId = source || id;

    if (currentProfileAllowLive) {
      // Snapshot + click-to-live
      const img = document.createElement("img");
      img.alt = label || streamId;
      const refresh = () => {
        img.src = snapshotUrl(streamId);
      };
      img.addEventListener("load", () => markOk("snapshot"));
      img.addEventListener("error", () => markFatal("snapshot"));
      refresh();
      const interval = setInterval(refresh, config.snapwall.refreshSeconds * 1000);
      tile.addEventListener("click", () => {
        openLive({ source: streamId, name: name || label || id });
      });
      tile.classList.add("clickable");
      cleanupFns.push(() => clearInterval(interval));
      tile.appendChild(img);
    } else {
      // Inline live video (WebRTC)
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      playWebrtc(video, webrtcUrl(streamId), tilePcs)
        .then((ok) => {
          if (ok) markOk("live");
          else markFatal("webrtc");
        })
        .catch(() => markFatal("webrtc"));

      cleanupFns.push(() => {
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
          video.srcObject = null;
        } catch (_) {}
      });

      tile.appendChild(video);
    }

    if (config.ui.showLiveBadge) tile.appendChild(corner);
    return tile;
  }
  function webrtcUrl(streamId) {
    const base = config.go2rtcBase;
    return `${base}/api/webrtc?src=${encodeURIComponent(streamId)}`;
  }

  function snapshotUrl(streamId) {
    const base = config.go2rtcBase;
    const qs = `src=${encodeURIComponent(streamId)}&w=${config.snapwall.width}&h=${config.snapwall.height}&_=${Date.now()}`;
    return `${base}/api/frame.jpeg?${qs}`;
  }

  async function playWebrtc(video, apiUrl, store) {
    if (typeof RTCPeerConnection === "undefined") return false;

    let pc = null;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      if (store === "live") {
        livePc = pc;
      } else if (Array.isArray(store)) {
        store.push(pc);
      }

      const mediaStream = new MediaStream();
      pc.ontrack = (evt) => {
        if (evt.streams && evt.streams[0]) {
          video.srcObject = evt.streams[0];
        } else {
          mediaStream.addTrack(evt.track);
          video.srcObject = mediaStream;
        }
        video.play().catch(() => {});
      };

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error("webrtc sdp failed");
      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      const ok = await waitForWebrtc(pc, 5000);
      if (!ok) throw new Error("webrtc timeout");

      if (store === "live" && dom.liveState) {
        dom.liveState.textContent = "live (WebRTC)";
      }
      return true;
    } catch (err) {
      if (pc) {
        try { pc.close(); } catch (_) {}
      }
      if (store === "live") livePc = null;
      return false;
    }
  }

  function waitForWebrtc(pc, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);

      pc.onconnectionstatechange = () => {
        if (settled) return;
        if (pc.connectionState === "connected") {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        } else if (["failed", "closed"].includes(pc.connectionState)) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      };
    });
  }

  function startSnapshotRefresh() {
    if (snapshotsPaused) return;
    if (snapshotTimer) clearInterval(snapshotTimer);
    refreshSnapshots();
    snapshotTimer = setInterval(refreshSnapshots, config.snapwall.refreshSeconds * 1000);
    cleanupFns.push(() => {
      if (snapshotTimer) clearInterval(snapshotTimer);
      snapshotTimer = null;
    });
  }

  function pauseSnapshots() {
    snapshotsPaused = true;
    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;
  }

  function resumeSnapshots() {
    const wasPaused = snapshotsPaused;
    snapshotsPaused = false;
    if (wallMode && wasPaused) {
      startSnapshotRefresh();
    }
  }

  function destroyLivePlayers() {
    if (dom.liveVideo) {
      try {
        dom.liveVideo.pause();
        dom.liveVideo.removeAttribute("src");
        dom.liveVideo.load();
        dom.liveVideo.srcObject = null;
      } catch (_) {}
    }
    if (livePc) {
      try { livePc.close(); } catch (_) {}
      livePc = null;
    }
    if (tilePcs && tilePcs.length) {
      tilePcs.forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      tilePcs = [];
    }
  }

  function refreshSnapshots() {
    if (!dom.grid || snapshotsPaused) return;
    const imgs = Array.from(dom.grid.querySelectorAll(".snap-tile img"));
    imgs.forEach((img) => {
      const src = img.dataset.src;
      if (!src) return;
      img.src = snapshotUrl(src);
    });
  }

  async function openLive(cam) {
    if (!dom.wallOverlay || !dom.liveVideo) return;
    pauseSnapshots();
    dom.liveName.textContent = cam.name || cam.source;
    dom.liveState.textContent = "connecting…";
    liveStateLabel = dom.liveState;
    dom.wallOverlay.classList.remove("hidden");
    dom.wallOverlay.setAttribute("aria-hidden", "false");

    const video = dom.liveVideo;
    video.src = "";
    video.muted = true;
    video.autoplay = true;
    const streamId = cam.source || cam.id;

    destroyLivePlayers();

    // WebRTC only (no HLS fallback).
    const webrtcOk = await playWebrtc(video, webrtcUrl(streamId), "live");
    if (webrtcOk) return;

    dom.liveState.textContent = "error";
  }

  function closeLive(silent) {
    if (!dom.wallOverlay) return;
    dom.wallOverlay.classList.add("hidden");
    dom.wallOverlay.setAttribute("aria-hidden", "true");
    liveStateLabel = null;
    destroyLivePlayers();
    resumeSnapshots();
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

    destroyLivePlayers();

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
