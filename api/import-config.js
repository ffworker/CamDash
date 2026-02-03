
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const yaml = require("js-yaml");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const args = process.argv.slice(2);
const options = parseArgs(args);

const ROOT = path.resolve(__dirname, "..");
const GO2RTC_PATH = path.resolve(options.go2rtcPath || path.join(ROOT, "config", "go2rtc.yml"));
const CONFIG_PATH = path.resolve(options.configPath || path.join(ROOT, "config", "config.js"));
const DB_PATH = path.resolve(options.dbPath || path.join(ROOT, "data", "camdash.db"));
const PROFILE_NAME = options.profileName || "Default";

main().catch((err) => {
  console.error("Import failed:", err.message || err);
  process.exit(1);
});

async function main() {
  const config = readConfig(CONFIG_PATH);
  const pages = extractPages(config);
  const streams = readStreams(GO2RTC_PATH);

  const cameraMap = buildCameraMap(pages, streams);
  const slides = buildSlides(pages, cameraMap, options.maxCams);

  if (options.dryRun) {
    printSummary(cameraMap, slides);
    return;
  }

  const db = await openDb(DB_PATH);
  await ensureSchema(db);

  if (options.reset) {
    await resetDb(db);
  }

  const cameraIdBySource = await upsertCameras(db, cameraMap);

  const profileId = await getOrCreateProfile(db, PROFILE_NAME, options.replace);
  await replaceSlides(db, profileId, slides, cameraIdBySource, options.maxCams);
  await setActiveProfile(db, profileId);

  console.log(`Imported ${cameraIdBySource.size} cameras into profile "${PROFILE_NAME}"`);
}

function parseArgs(argv) {
  const out = { replace: false, reset: false, dryRun: false, maxCams: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--go2rtc") out.go2rtcPath = argv[i + 1];
    if (arg === "--config") out.configPath = argv[i + 1];
    if (arg === "--db") out.dbPath = argv[i + 1];
    if (arg === "--profile") out.profileName = argv[i + 1];
    if (arg === "--replace") out.replace = true;
    if (arg === "--reset") out.reset = true;
    if (arg === "--dry-run") out.dryRun = true;
    if (arg === "--max-cams") out.maxCams = parseInt(argv[i + 1], 10);
  }
  return out;
}

function readConfig(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 1000 });
  return sandbox.window.CAMDASH_CONFIG || null;
}

function extractPages(config) {
  if (!config || !Array.isArray(config.pages)) return [];
  return config.pages.map((page) => ({
    name: page?.name || "Slide",
    cams: Array.isArray(page?.cams) ? page.cams.filter(Boolean) : [],
  }));
}

function readStreams(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const doc = yaml.load(content) || {};
  return doc.streams && typeof doc.streams === "object" ? doc.streams : {};
}

function buildCameraMap(pages, streams) {
  const map = new Map();

  pages.forEach((page) => {
    page.cams.forEach((cam) => {
      if (!cam || !cam.id) return;
      const entry = map.get(cam.id) || {
        source: cam.id,
        name: cam.label || cam.id,
        location: page.name || "",
      };

      if (!entry.name && cam.label) entry.name = cam.label;
      if (!entry.location && page.name) entry.location = page.name;

      map.set(cam.id, entry);
    });
  });

  Object.keys(streams || {}).forEach((key) => {
    if (map.has(key)) return;
    map.set(key, { source: key, name: key, location: "" });
  });

  return map;
}

function buildSlides(pages, cameraMap, maxCams) {
  const slides = pages.map((page) => ({
    name: page.name,
    cameraSources: page.cams.map((cam) => cam.id).filter(Boolean),
  }));

  if (slides.length) return slides;

  const sources = Array.from(cameraMap.keys());
  if (!sources.length) return [];

  const chunkSize = maxCams || 6;
  const result = [];
  for (let i = 0; i < sources.length; i += chunkSize) {
    result.push({
      name: `Slide ${result.length + 1}`,
      cameraSources: sources.slice(i, i + chunkSize),
    });
  }
  return result;
}

function printSummary(cameraMap, slides) {
  console.log(`Cameras: ${cameraMap.size}`);
  console.log(`Slides: ${slides.length}`);
  slides.forEach((slide, idx) => {
    console.log(`- ${idx + 1}. ${slide.name} (${slide.cameraSources.length} cams)`);
  });
}

async function openDb(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return open({ filename: filePath, driver: sqlite3.Database });
}

async function ensureSchema(db) {
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
}

async function resetDb(db) {
  await db.exec("DELETE FROM slide_cameras;");
  await db.exec("DELETE FROM slides;");
  await db.exec("DELETE FROM profiles;");
  await db.exec("DELETE FROM cameras;");
  await db.exec("DELETE FROM settings;");
}

async function upsertCameras(db, cameraMap) {
  const now = new Date().toISOString();
  const map = new Map();

  for (const entry of cameraMap.values()) {
    const existing = await db.get("SELECT id FROM cameras WHERE source = ?", [entry.source]);
    if (existing) {
      await db.run("UPDATE cameras SET name = ?, location = ? WHERE id = ?", [
        entry.name,
        entry.location,
        existing.id,
      ]);
      map.set(entry.source, existing.id);
    } else {
      const id = crypto.randomUUID();
      await db.run("INSERT INTO cameras (id, name, location, source, created_at) VALUES (?, ?, ?, ?, ?)", [
        id,
        entry.name,
        entry.location,
        entry.source,
        now,
      ]);
      map.set(entry.source, id);
    }
  }

  return map;
}

async function getOrCreateProfile(db, name, replace) {
  const existing = await db.get("SELECT id FROM profiles WHERE name = ?", [name]);
  if (existing) {
    if (replace) {
      await db.run("DELETE FROM slides WHERE profile_id = ?", [existing.id]);
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run("INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)", [id, name, now]);
  return id;
}

async function replaceSlides(db, profileId, slides, cameraIdBySource, maxCams) {
  if (!slides.length) return;

  await db.exec("BEGIN");
  await db.run("DELETE FROM slides WHERE profile_id = ?", [profileId]);

  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    const slideId = crypto.randomUUID();
    const slideName = slide.name || `Slide ${i + 1}`;

    await db.run("INSERT INTO slides (id, profile_id, name, position) VALUES (?, ?, ?, ?)", [
      slideId,
      profileId,
      slideName,
      i,
    ]);

    const camSources = (slide.cameraSources || []).slice(0, maxCams || 6);
    for (let pos = 0; pos < camSources.length; pos += 1) {
      const camId = cameraIdBySource.get(camSources[pos]);
      if (!camId) continue;
      await db.run("INSERT INTO slide_cameras (slide_id, camera_id, position) VALUES (?, ?, ?)", [
        slideId,
        camId,
        pos,
      ]);
    }
  }

  await db.exec("COMMIT");
}

async function setActiveProfile(db, profileId) {
  await db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ["activeProfileId", profileId]
  );
}
