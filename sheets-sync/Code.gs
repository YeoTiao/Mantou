/**
 * Exchange Companion <-> Google Sheets bridge.
 *
 * Paste this into a new project at script.google.com, set TOKEN below, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Paste the web app URL and the same TOKEN into the app (More > Settings > Google Sheets).
 *
 * The app reads every linked tab, works out what changed on each side, and sends
 * back only its own changes. Each synced row is tagged with hidden developer
 * metadata (key "xcid"), so sorting, inserting or moving rows never breaks the link.
 * Formula columns (Month, SGD Actual, Price SGD) are never written, only copied
 * down into new rows.
 */

const TOKEN = "PASTE-A-LONG-RANDOM-SECRET-HERE";

// The "WooHoo Exchange Planzz :D" folder. The budget is found there by name once it
// has been saved as a Google Sheet (File > Save as Google Sheets).
const FOLDER_ID = "15BrPTHvkhqHv6exAoTJUsF28CSoWeM69";
const BUDGET_NAME = "spain";           // matched case-insensitively against the file name
const BUDGET_ID = "";                  // optional: set this to skip the folder search

const TABS = {
  expenses: {
    file: () => budgetId_(), tab: "Input (Actual)", header: 6,
    cols: { date: ["C", "date"], group: ["E", "text"], sub: ["F", "text"], city: ["G", "text"], item: ["H", "text"],
            eur: ["I", "num"], sgd: ["J", "num"], remarks: ["L", "text"] },
    ro: { month: ["D", "text"], sgdActual: ["K", "num"] },
    formulas: ["D", "K"]
  },
  housing: {
    file: () => "1ybeTjHUD_-wrIgmxJVNY1iNFEPJ8W_qotkYV6leS5ic", tab: "Accommodations", header: 1,
    cols: { decision: ["A", "text"], link: ["B", "text"], eur: ["C", "num"], location: ["F", "text"], metro: ["G", "num"],
            size: ["H", "num"], beds: ["I", "num"], baths: ["J", "num"], floor: ["K", "num"], notes: ["L", "text"], nearby: ["M", "text"] },
    ro: { sgd: ["D", "num"], sgdPP: ["E", "num"] },
    formulas: ["D", "E"]
  },
  bucket: {
    file: () => "1sh8QUC-6POgHqGW7buSp2acY8E6-HrLKVXU-IJbYzcU", tab: "Bucket List", header: 3,
    cols: { tierG: ["D", "text"], country: ["G", "text"], city: ["H", "text"], start: ["I", "date"], end: ["J", "date"], todo: ["K", "text"] },
    ro: { tierC: ["C", "text"], yawhong: ["E", "text"], xinhui: ["F", "text"] },
    formulas: []
  }
};
const KEY = "xcid";

function doGet(e) {
  return guard_(e && e.parameter && e.parameter.t, () => {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const out = { ok: true, tabs: {} };
      Object.keys(TABS).forEach(sec => { try { out.tabs[sec] = { rows: readTab_(sec) }; } catch (err) { out.tabs[sec] = { error: String(err.message || err) }; } });
      try { const sh = sheet_("expenses"); const r = Number(sh.getRange("D3").getValue()); if (r > 0) out.eurSgd = r; } catch (err) {}
      return out;
    } finally { lock.releaseLock(); }
  });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  return guard_(body.t, () => {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const results = [];
      Object.keys(TABS).forEach(sec => {
        const ops = (body.ops || []).filter(o => o.sec === sec);
        if (!ops.length) return;
        let sh;
        try { sh = sheet_(sec); } catch (err) { ops.forEach(o => results.push({ id: o.id, ok: false, error: String(err.message || err) })); return; }
        const cfg = TABS[sec];
        let rows = rowIndex_(sh);
        ops.filter(o => o.op === "upsert").forEach(o => {
          try {
            let r = rows[o.id];
            if (!r) { r = appendRow_(sh, cfg); sh.getRange(r + ":" + r).addDeveloperMetadata(KEY, o.id, SpreadsheetApp.DeveloperMetadataVisibility.PROJECT); rows[o.id] = r; fillFormulas_(sh, cfg, r); }
            writeRow_(sh, cfg, r, o.v || {});
            results.push({ id: o.id, ok: true });
          } catch (err) { results.push({ id: o.id, ok: false, error: String(err.message || err) }); }
        });
        // Delete bottom-up so earlier row numbers stay valid.
        ops.filter(o => o.op === "delete").map(o => ({ o, r: rows[o.id] })).sort((a, b) => (b.r || 0) - (a.r || 0)).forEach(({ o, r }) => {
          try { if (r) sh.deleteRow(r); results.push({ id: o.id, ok: true }); } catch (err) { results.push({ id: o.id, ok: false, error: String(err.message || err) }); }
        });
      });
      return { ok: true, results };
    } finally { lock.releaseLock(); }
  });
}

/* ---------- helpers ---------- */

function guard_(t, fn) {
  if (!TOKEN || TOKEN.indexOf("PASTE") === 0) return json_({ ok: false, error: "Set TOKEN at the top of the script, then deploy a new version." });
  if (t !== TOKEN) return json_({ ok: false, error: "Wrong secret" });
  try { return json_(fn()); } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function budgetId_() {
  if (BUDGET_ID) return BUDGET_ID;
  const cache = PropertiesService.getScriptProperties(); const known = cache.getProperty("budgetId");
  if (known) { try { DriveApp.getFileById(known); return known; } catch (e) {} }
  const it = DriveApp.getFolderById(FOLDER_ID).getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) { const f = it.next(); if (f.getName().toLowerCase().indexOf(BUDGET_NAME) >= 0 && !f.isTrashed()) { cache.setProperty("budgetId", f.getId()); return f.getId(); } }
  throw new Error("Budget isn't a Google Sheet yet. Open the .xlsx and choose File > Save as Google Sheets.");
}
function sheet_(sec) {
  const cfg = TABS[sec]; const sh = SpreadsheetApp.openById(cfg.file()).getSheetByName(cfg.tab);
  if (!sh) throw new Error("Tab \"" + cfg.tab + "\" not found");
  return sh;
}
function colNum_(a) { let n = 0; for (const ch of a) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function pad_(n) { return (n < 10 ? "0" : "") + n; }

function norm_(type, raw, disp, tz) {
  if (type === "date") {
    if (raw instanceof Date) return Utilities.formatDate(raw, tz, "yyyy-MM-dd");
    return String(disp || "").trim();
  }
  if (type === "num") {
    if (typeof raw === "number") return Math.round(raw * 100) / 100;
    const n = parseFloat(String(disp || "").replace(/,/g, ""));
    return isNaN(n) ? "" : Math.round(n * 100) / 100;
  }
  if (raw instanceof Date) return String(disp);
  return String(raw == null ? "" : raw).replace(/\r\n?/g, "\n");
}

function rowIndex_(sh) {
  const map = {}, seen = {};
  sh.createDeveloperMetadataFinder().withKey(KEY).find().forEach(md => {
    const loc = md.getLocation(); if (loc.getLocationType() !== SpreadsheetApp.DeveloperMetadataLocationType.ROW) return;
    const r = loc.getRow().getRow(), id = md.getValue();
    if (seen[r] || map[id]) { md.remove(); return; }   // one id per row, one row per id
    seen[r] = id; map[id] = r;
  });
  return map;
}

function readTab_(sec) {
  const cfg = TABS[sec], sh = sheet_(sec), tz = sh.getParent().getSpreadsheetTimeZone();
  const first = cfg.header + 1, last = sh.getLastRow();
  if (last < first) return [];
  const width = sh.getLastColumn();
  const rng = sh.getRange(first, 1, last - first + 1, width);
  const raw = rng.getValues(), disp = rng.getDisplayValues();
  const ids = {}; const idx = rowIndex_(sh); Object.keys(idx).forEach(id => ids[idx[id]] = id);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const r = first + i, v = {}, ro = {};
    let has = false;
    Object.keys(cfg.cols).forEach(k => { const [c, t] = cfg.cols[k]; const j = colNum_(c) - 1; v[k] = norm_(t, raw[i][j], disp[i][j], tz); if (v[k] !== "") has = true; });
    Object.keys(cfg.ro).forEach(k => { const [c, t] = cfg.ro[k]; const j = colNum_(c) - 1; ro[k] = norm_(t, raw[i][j], disp[i][j], tz); if (ro[k] !== "" && cfg.formulas.indexOf(c) < 0) has = true; });
    let id = ids[r];
    if (!has) {
      // A tagged row that was cleared by hand counts as deleted.
      if (id) sh.getRange(r + ":" + r).getDeveloperMetadata().filter(m => m.getKey() === KEY).forEach(m => m.remove());
      continue;
    }
    if (!id) { id = "s" + Utilities.getUuid().replace(/-/g, "").slice(0, 12); sh.getRange(r + ":" + r).addDeveloperMetadata(KEY, id, SpreadsheetApp.DeveloperMetadataVisibility.PROJECT); }
    out.push({ id, row: r, v, ro });
  }
  return out;
}

function appendRow_(sh, cfg) {
  const first = cfg.header + 1, last = Math.max(sh.getLastRow(), first);
  const letters = Object.keys(cfg.cols).map(k => cfg.cols[k][0]).concat(Object.keys(cfg.ro).map(k => cfg.ro[k][0]).filter(c => cfg.formulas.indexOf(c) < 0));
  let lastUsed = cfg.header;
  if (last >= first) {
    const vals = sh.getRange(first, 1, last - first + 1, sh.getLastColumn()).getValues();
    vals.forEach((row, i) => { if (letters.some(c => String(row[colNum_(c) - 1]) !== "")) lastUsed = first + i; });
  }
  const r = lastUsed + 1;
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);
  return r;
}

function fillFormulas_(sh, cfg, r) {
  cfg.formulas.forEach(c => {
    const col = colNum_(c), cell = sh.getRange(r, col);
    if (cell.getFormula()) return;
    for (let k = r - 1; k > cfg.header; k--) { const f = sh.getRange(k, col).getFormulaR1C1(); if (f) { cell.setFormulaR1C1(f); return; } }
  });
}

function writeRow_(sh, cfg, r, v) {
  const tz = sh.getParent().getSpreadsheetTimeZone();
  Object.keys(cfg.cols).forEach(k => {
    if (!(k in v)) return;
    const [c, t] = cfg.cols[k], cell = sh.getRange(r, colNum_(c));
    const cur = norm_(t, cell.getValue(), cell.getDisplayValue(), tz);
    let want = v[k] == null ? "" : v[k];
    if (t === "num" && want !== "") want = Math.round(Number(want) * 100) / 100;
    if (String(cur) === String(want)) return;            // leave untouched cells (and their formats) alone
    if (want === "") { cell.clearContent(); return; }
    if (t === "date") { const m = String(want).match(/^(\d{4})-(\d{2})-(\d{2})$/); cell.setValue(m ? Utilities.parseDate(want, tz, "yyyy-MM-dd") : want); return; }
    if (t === "num") { cell.setValue(want); return; }
    const s = String(want);
    cell.setValue(/^[=+\-@]/.test(s) ? "'" + s : s);
  });
}
