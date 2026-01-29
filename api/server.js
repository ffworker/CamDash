const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const PORT = parseInt(process.env.CAMDASH_PORT || "3000", 10);
const DB_PATH = process.env.CAMDASH_DB || path.join(__dirname, "..", "data", "camdash.db");
const MAX_CAMS_PER_SLIDE = parseInt(process.env.CAMDASH_MAX_CAMS || "6", 10);
const ADMIN_USER = process.env.CAMDASH_ADMIN_USER || "";
const ADMIN_PASS = process.env.CAMDASH_ADMIN_PASS || "";
const AUTH_ENABLED = Boolean(ADMIN_USER && ADMIN_PASS);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function parseBasicAuth(header) {
  if (!header || !header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    user: decoded.slice(0, separator),
    pass: decoded.slice(separator + 1),
  };
}

function isAuthorized(req) {
  if (!AUTH_ENABLED) return true;
  const creds = parseBasicAuth(req.headers.authorization);
  return Boolean(creds && creds.user === ADMIN_USER && creds.pass === ADMIN_PASS);
}

function unauthorized(res) {
  res.status(401).json({ error: "unauthorized" });
}

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next();
  if (req.method === "GET" && req.path !== "/auth") return next();
  if (!isAuthorized(req)) return unauthorized(res);
  return next();
});

let db;

async function initDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS cameras (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slides (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slide_cameras (
      slide_id TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (slide_id, position),
      FOREIGN KEY(slide_id) REFERENCES slides(id) ON DELETE CASCADE,
      FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const profileCount = await db.get("SELECT COUNT(*) as count FROM profiles");
  if (!profileCount || profileCount.count === 0) {
    const profileId = crypto.randomUUID();
    const slideId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run("INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)", [profileId, "Default", now]);
    await db.run("INSERT INTO slides (id, profile_id, name, position) VALUES (?, ?, ?, ?)", [
      slideId,
      profileId,
      "Slide 1",
      0,
    ]);
    await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", ["activeProfileId", profileId]);
  }
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

async function getActiveProfileId() {
  const row = await db.get("SELECT value FROM settings WHERE key = ?", ["activeProfileId"]);
  return row ? row.value : null;
}

async function setActiveProfileId(profileId) {
  const existing = await db.get("SELECT id FROM profiles WHERE id = ?", [profileId]);
  if (!existing) return false;
  await db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    "activeProfileId",
    profileId,
  ]);
  return true;
}

async function fetchState() {
  const cameras = await db.all("SELECT id, name, location, source FROM cameras ORDER BY name COLLATE NOCASE");
  const profiles = await db.all("SELECT id, name FROM profiles ORDER BY created_at");
  const slides = await db.all("SELECT id, profile_id, name, position FROM slides ORDER BY position");
  const slideCams = await db.all("SELECT slide_id, camera_id, position FROM slide_cameras ORDER BY position");

  const slidesById = new Map();
  const slidesByProfile = new Map();

  slides.forEach((slide) => {
    const entry = { id: slide.id, name: slide.name, position: slide.position, cameraIds: [] };
    slidesById.set(slide.id, entry);
    const list = slidesByProfile.get(slide.profile_id) || [];
    list.push(entry);
    slidesByProfile.set(slide.profile_id, list);
  });

  slideCams.forEach((row) => {
    const slide = slidesById.get(row.slide_id);
    if (!slide) return;
    slide.cameraIds[row.position] = row.camera_id;
  });

  const profilePayload = profiles.map((profile) => {
    const slidesForProfile = slidesByProfile.get(profile.id) || [];
    slidesForProfile.sort((a, b) => a.position - b.position);
    return {
      id: profile.id,
      name: profile.name,
      slides: slidesForProfile.map((slide) => ({
        id: slide.id,
        name: slide.name,
        cameraIds: slide.cameraIds.filter(Boolean).slice(0, MAX_CAMS_PER_SLIDE),
      })),
    };
  });

  const activeProfileId = await getActiveProfileId();

  return {
    activeProfileId,
    maxCamsPerSlide: MAX_CAMS_PER_SLIDE,
    profiles: profilePayload,
    cameras,
  };
}

app.get("/auth", (_req, res) => {
  res.json({ ok: true, enabled: AUTH_ENABLED });
});

// Serve dashboard/config.js with injected host/port so the client can
// determine the go2rtc base URL when the file is requested. Priority:
// 1) Environment variables `CAMDASH_GO2RTC_HOST`/`CAMDASH_GO2RTC_PORT`
// 2) Request hostname
// 3) empty (client will fall back to same-origin)
app.get("/dashboard/config.js", (req, res) => {
  const configPath = path.join(__dirname, "..", "dashboard", "config.js");
  fs.readFile(configPath, "utf8", (err, data) => {
    if (err) {
      res.status(500).type("text/plain").send("// failed to load config.js\n");
      return;
    }

    const host = process.env.CAMDASH_GO2RTC_HOST || req.hostname || "";
    const port = process.env.CAMDASH_GO2RTC_PORT || "";

    const inject = [];
    if (host) inject.push(`window.CAMDASH_GO2RTC_HOST=${JSON.stringify(host)};`);
    if (port) inject.push(`window.CAMDASH_GO2RTC_PORT=${JSON.stringify(port)};`);
    const out = (inject.length ? inject.join("") + "\n" : "") + data;

    res.type("application/javascript").send(out);
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/state", async (_req, res) => {
  try {
    const state = await fetchState();
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: "failed_to_load_state" });
  }
});

app.post("/cameras", async (req, res) => {
  try {
    const name = cleanText(req.body?.name);
    const location = cleanText(req.body?.location, "");
    const source = cleanText(req.body?.source);
    if (!name || !source) {
      res.status(400).json({ error: "name_and_source_required" });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run("INSERT INTO cameras (id, name, location, source, created_at) VALUES (?, ?, ?, ?, ?)", [
      id,
      name,
      location,
      source,
      now,
    ]);

    res.status(201).json({ id, name, location, source });
  } catch (err) {
    res.status(500).json({ error: "camera_create_failed" });
  }
});

app.put("/cameras/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await db.get("SELECT id FROM cameras WHERE id = ?", [id]);
    if (!existing) {
      res.status(404).json({ error: "camera_not_found" });
      return;
    }

    const name = cleanText(req.body?.name);
    const location = cleanText(req.body?.location, "");
    const source = cleanText(req.body?.source);
    if (!name || !source) {
      res.status(400).json({ error: "name_and_source_required" });
      return;
    }

    await db.run("UPDATE cameras SET name = ?, location = ?, source = ? WHERE id = ?", [
      name,
      location,
      source,
      id,
    ]);

    res.json({ id, name, location, source });
  } catch (err) {
    res.status(500).json({ error: "camera_update_failed" });
  }
});

app.delete("/cameras/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.run("DELETE FROM cameras WHERE id = ?", [id]);
    if (result.changes === 0) {
      res.status(404).json({ error: "camera_not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "camera_delete_failed" });
  }
});

app.post("/profiles", async (req, res) => {
  try {
    const name = cleanText(req.body?.name, "New Profile");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run("INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)", [id, name, now]);

    const slideId = crypto.randomUUID();
    await db.run("INSERT INTO slides (id, profile_id, name, position) VALUES (?, ?, ?, ?)", [
      slideId,
      id,
      "Slide 1",
      0,
    ]);

    res.status(201).json({ id, name, slides: [{ id: slideId, name: "Slide 1", cameraIds: [] }] });
  } catch (err) {
    res.status(500).json({ error: "profile_create_failed" });
  }
});

app.put("/profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await db.get("SELECT id FROM profiles WHERE id = ?", [id]);
    if (!existing) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    const name = cleanText(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }

    await db.run("UPDATE profiles SET name = ? WHERE id = ?", [name, id]);
    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: "profile_update_failed" });
  }
});

app.put("/profiles/:id/slides", async (req, res) => {
  const profileId = req.params.id;
  const slides = Array.isArray(req.body?.slides) ? req.body.slides : [];

  try {
    const existing = await db.get("SELECT id FROM profiles WHERE id = ?", [profileId]);
    if (!existing) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    const cameraRows = await db.all("SELECT id FROM cameras");
    const cameraSet = new Set(cameraRows.map((row) => row.id));

    await db.exec("BEGIN");
    await db.run("DELETE FROM slides WHERE profile_id = ?", [profileId]);

    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index] || {};
      const slideId = cleanText(slide.id) || crypto.randomUUID();
      const name = cleanText(slide.name, `Slide ${index + 1}`);

      await db.run("INSERT INTO slides (id, profile_id, name, position) VALUES (?, ?, ?, ?)", [
        slideId,
        profileId,
        name,
        index,
      ]);

      const cameraIds = Array.isArray(slide.cameraIds) ? slide.cameraIds : [];
      const filtered = cameraIds.filter((id) => cameraSet.has(id)).slice(0, MAX_CAMS_PER_SLIDE);
      for (let position = 0; position < filtered.length; position += 1) {
        await db.run("INSERT INTO slide_cameras (slide_id, camera_id, position) VALUES (?, ?, ?)", [
          slideId,
          filtered[position],
          position,
        ]);
      }
    }

    await db.exec("COMMIT");

    const state = await fetchState();
    res.json(state.profiles.find((p) => p.id === profileId) || null);
  } catch (err) {
    await db.exec("ROLLBACK");
    res.status(500).json({ error: "slides_update_failed" });
  }
});

app.delete("/profiles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const count = await db.get("SELECT COUNT(*) as count FROM profiles");
    if (count && count.count <= 1) {
      res.status(400).json({ error: "cannot_delete_last_profile" });
      return;
    }

    const activeProfileId = await getActiveProfileId();
    if (activeProfileId === id) {
      res.status(400).json({ error: "cannot_delete_active_profile" });
      return;
    }

    const result = await db.run("DELETE FROM profiles WHERE id = ?", [id]);
    if (result.changes === 0) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "profile_delete_failed" });
  }
});

app.put("/settings/active-profile", async (req, res) => {
  try {
    const profileId = cleanText(req.body?.profileId);
    if (!profileId) {
      res.status(400).json({ error: "profileId_required" });
      return;
    }

    const ok = await setActiveProfileId(profileId);
    if (!ok) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    res.json({ ok: true, activeProfileId: profileId });
  } catch (err) {
    res.status(500).json({ error: "active_profile_update_failed" });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CamDash API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start CamDash API", err);
    process.exit(1);
  });
