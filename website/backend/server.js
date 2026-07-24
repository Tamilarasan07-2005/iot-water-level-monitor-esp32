/**
 * ─────────────────────────────────────────────────────────────────
 *  Water Tank Monitoring — Backend Server
 *  Express + Google Drive integration + ThingsBoard REST API
 *
 *  Endpoints:
 *    GET  /test-connection          – fetch latest telemetry from ThingsBoard
 *    GET  /status                   – current collection state
 *    POST /collect                  – fetch one telemetry reading & buffer it
 *    POST /reset-max-volume         – reset the in-memory max volume tracker
 *    GET  /query                    – return current in-memory CSV as JSON
 *    GET  /latest-file              – download current CSV as attachment
 *
 *    GET  /drive/list-files         – list CSV files in Google Drive folder
 *    POST /drive/query-data         – query a single Drive file
 *    POST /drive/query-range        – query all Drive files over a date range
 *
 *    GET  /drive/get-prediction-file    – load water_consumption_2026.csv from Drive
 *    GET  /drive/prediction-summary     – annual rainfall/consumption statistics
 *
 *  Environment variables (set in .env file, DO NOT hardcode):
 *    DEVICE_TOKEN          – ThingsBoard device access token
 *    TB_USER_TOKEN         – ThingsBoard user JWT token (refresh monthly)
 *    DEVICE_ID             – ThingsBoard device UUID
 *    FOLDER_ID             – Google Drive folder ID for CSV storage
 *    PORT                  – server port (default 5000)
 * ─────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const axios      = require("axios");
const { google } = require("googleapis");
const { authorize } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

// ── Tank specs ────────────────────────────────────────────────
const TANK_CAPACITY_LITERS = 20;

// ── ThingsBoard ───────────────────────────────────────────────
const TB_URL       = "https://eu.thingsboard.cloud";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN   || "YOUR_DEVICE_ACCESS_TOKEN";
const USER_TOKEN   = process.env.TB_USER_TOKEN  || "YOUR_USER_JWT_TOKEN";
const DEVICE_ID    = process.env.DEVICE_ID      || "YOUR_DEVICE_UUID";

// ── Google Drive ──────────────────────────────────────────────
const FOLDER_ID = process.env.FOLDER_ID || "YOUR_GOOGLE_DRIVE_FOLDER_ID";

// ── In-memory state ───────────────────────────────────────────
let rowCount            = 0;
let readingCount        = 0;
let currentRow          = {};
let lastSuccessfulFetch = null;
let currentCSVContent   = null;
let currentFileName     = null;
let isUploading         = false;
let maxVolume           = 0;

// ─────────────────────────────────────────────────────────────
//  CSV helpers
// ─────────────────────────────────────────────────────────────
const CSV_HEADER =
  "timestamp,volume_liters_1,level_percent_1,volume_liters_2,level_percent_2," +
  "volume_liters_3,level_percent_3,volume_liters_4,level_percent_4," +
  "volume_liters_5,level_percent_5\n";

function generateFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `water_tank_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
         `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.csv`;
}

function initializeCSV() {
  currentFileName   = generateFileName();
  currentCSVContent = CSV_HEADER;
  console.log(`📁 Created: ${currentFileName}`);
}

function createNewCSVFile() {
  currentFileName   = generateFileName();
  currentCSVContent = CSV_HEADER;
  rowCount          = 0;
  console.log(`📁 New file: ${currentFileName}`);
}

function addRowToMemory() {
  if (readingCount === 0) return;
  const rowData = [];
  for (let i = 1; i <= 5; i++) {
    if (currentRow[`volume_${i}`] !== undefined) {
      rowData.push(currentRow[`volume_${i}`]);
      rowData.push(currentRow[`level_${i}`]);
    } else {
      rowData.push("NULL");
      rowData.push("NULL");
    }
  }
  const timestamp = new Date().toISOString();
  currentCSVContent += `${timestamp},${rowData.join(",")}\n`;
  console.log(`📝 Row ${rowCount + 1}: ${readingCount} readings`);
  currentRow   = {};
  readingCount = 0;
}

// ─────────────────────────────────────────────────────────────
//  ThingsBoard telemetry fetch
// ─────────────────────────────────────────────────────────────
async function fetchTelemetryFromThingsBoard() {
  try {
    const response = await axios.get(
      `${TB_URL}/api/plugins/telemetry/DEVICE/${DEVICE_ID}/values/timeseries`,
      {
        headers: {
          Authorization: `Bearer ${USER_TOKEN}`,
          "Content-Type": "application/json",
        },
        params: { keys: "volume_liters,level_percent", limit: 1 },
        timeout: 10000,
      }
    );
    const data = response.data;
    if (
      data.volume_liters?.length > 0 &&
      data.level_percent?.length > 0
    ) {
      const volume = parseFloat(data.volume_liters[0].value);
      const level  = parseFloat(data.level_percent[0].value);
      if (volume > maxVolume) {
        maxVolume = volume;
        console.log(`🏆 New max volume: ${maxVolume.toFixed(2)} L`);
      }
      lastSuccessfulFetch = new Date();
      console.log(`✅ Volume: ${volume.toFixed(2)} L  Level: ${level}%`);
      return { volume_liters: volume, level_percent: level };
    }
    return null;
  } catch (error) {
    console.error("ThingsBoard fetch error:", error.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  Google Drive upload
// ─────────────────────────────────────────────────────────────
async function uploadToDriveFromMemory(content, fileName) {
  if (isUploading) return;
  try {
    isUploading = true;
    const auth  = await authorize();
    const drive = google.drive({ version: "v3", auth });
    await drive.files.create({
      requestBody: { name: fileName, parents: [FOLDER_ID] },
      media:       { mimeType: "text/csv", body: content },
      fields:      "id",
    });
    console.log(`📤 Uploaded: ${fileName}`);
  } catch (error) {
    console.error(`❌ Upload failed: ${error.message}`);
  } finally {
    isUploading = false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Routes — live monitoring
// ─────────────────────────────────────────────────────────────

// Manual trigger: fetch one reading and buffer it
app.post("/collect", async (req, res) => {
  try {
    const telemetry = await fetchTelemetryFromThingsBoard();
    if (!telemetry) {
      return res.status(429).json({ error: "No data available from ThingsBoard" });
    }
    readingCount++;
    currentRow[`volume_${readingCount}`] = telemetry.volume_liters;
    currentRow[`level_${readingCount}`]  = telemetry.level_percent;

    if (readingCount >= 5) {
      addRowToMemory();
      rowCount++;
      if (rowCount >= 5) {
        const completedFileName = currentFileName;
        const completedContent  = currentCSVContent;
        createNewCSVFile();
        // Fire-and-forget upload (don't block the response)
        uploadToDriveFromMemory(completedContent, completedFileName);
      }
    }

    res.json({
      success: true,
      readingCount,
      rowCount,
      totalReadings: rowCount * 5 + readingCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test ThingsBoard connection and return latest values
app.get("/test-connection", async (req, res) => {
  const telemetry = await fetchTelemetryFromThingsBoard();
  res.json({
    success:      telemetry !== null,
    telemetry,
    maxVolume,
    tankCapacity: TANK_CAPACITY_LITERS,
  });
});

// In-memory collection status
app.get("/status", (req, res) => {
  res.json({
    file:            currentFileName,
    rows:            rowCount,
    currentReadings: readingCount,
    maxVolume,
    tankCapacity:    TANK_CAPACITY_LITERS,
    lastFetch:       lastSuccessfulFetch,
  });
});

// Reset max-volume tracker
app.post("/reset-max-volume", (req, res) => {
  maxVolume = 0;
  res.json({ success: true, message: "Max volume reset to 0" });
});

// Return current in-memory CSV data as JSON
app.get("/query", (req, res) => {
  if (!currentCSVContent) {
    return res.status(503).json({ error: "No data collected yet" });
  }
  const lines = currentCSVContent.split("\n").slice(1);
  const data  = [];
  lines.forEach((line) => {
    if (line.trim()) {
      const parts   = line.split(",");
      const rowData = { timestamp: parts[0], readings: [] };
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] !== "NULL" && parts[i] !== undefined) {
          rowData.readings.push({
            volume: parseFloat(parts[i]),
            level:  parseFloat(parts[i + 1]),
          });
        }
      }
      data.push(rowData);
    }
  });
  res.json({ totalRows: data.length, data, maxVolume, tankCapacity: TANK_CAPACITY_LITERS });
});

// Download current CSV
app.get("/latest-file", (req, res) => {
  if (!currentCSVContent) {
    return res.status(503).json({ error: "No data collected yet" });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${currentFileName}"`);
  res.send(currentCSVContent);
});

// ─────────────────────────────────────────────────────────────
//  Routes — Google Drive historical queries
// ─────────────────────────────────────────────────────────────

app.get("/drive/list-files", async (req, res) => {
  try {
    const auth  = await authorize();
    const drive = google.drive({ version: "v3", auth });
    const response = await drive.files.list({
      q:       `'${FOLDER_ID}' in parents and mimeType='text/csv' and trashed=false`,
      fields:  "files(id, name, createdTime, size)",
      orderBy: "createdTime desc",
    });
    res.json({ success: true, files: response.data.files || [] });
  } catch (error) {
    console.error("Drive list error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper: read a Drive file to string
async function readDriveFile(drive, fileId) {
  const fileResponse = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return new Promise((resolve, reject) => {
    let content = "";
    fileResponse.data.on("data",  (chunk) => (content += chunk));
    fileResponse.data.on("end",   () => resolve(content));
    fileResponse.data.on("error", reject);
  });
}

// Helper: parse a CSV content string into reading objects with date filter
function parseCSVReadings(csvContent, start, end) {
  const lines = csvContent.split("\n").slice(1);
  const data  = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts     = line.split(",");
    const timestamp = parts[0];
    if (!timestamp || timestamp === "NULL") continue;

    const rowDate = new Date(timestamp);
    if (start && end && (rowDate < start || rowDate > end)) continue;

    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] !== "NULL" && parts[i] !== undefined && parts[i + 1] !== undefined) {
        data.push({
          timestamp,
          volume: parseFloat(parts[i]),
          level:  parseFloat(parts[i + 1]),
        });
      }
    }
  }
  return data;
}

app.post("/drive/query-data", async (req, res) => {
  try {
    const { fileId, startDate, endDate } = req.body;
    if (!fileId) return res.status(400).json({ error: "fileId is required" });

    const auth       = await authorize();
    const drive      = google.drive({ version: "v3", auth });
    const csvContent = await readDriveFile(drive, fileId);

    const start = startDate ? new Date(startDate) : null;
    const end   = endDate   ? new Date(endDate)   : null;
    if (end) end.setHours(23, 59, 59, 999);

    const data = parseCSVReadings(csvContent, start, end);
    res.json({ success: true, data, totalReadings: data.length });
  } catch (error) {
    console.error("Drive query-data error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/drive/query-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }

    const auth  = await authorize();
    const drive = google.drive({ version: "v3", auth });

    const listResponse = await drive.files.list({
      q:       `'${FOLDER_ID}' in parents and mimeType='text/csv' and trashed=false`,
      fields:  "files(id, name, createdTime)",
      orderBy: "createdTime asc",
    });

    const files   = listResponse.data.files || [];
    const allData = [];
    const start   = new Date(startDate);
    const end     = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    for (const file of files) {
      try {
        const csvContent = await readDriveFile(drive, file.id);
        const readings   = parseCSVReadings(csvContent, start, end);
        readings.forEach((r) => (r.file = file.name));
        allData.push(...readings);
      } catch (fileError) {
        console.error(`Error reading ${file.name}:`, fileError.message);
      }
    }

    allData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    console.log(`✅ ${allData.length} readings across ${files.length} files`);

    res.json({
      success:        true,
      data:           allData,
      totalReadings:  allData.length,
      filesProcessed: files.length,
      dateRange:      { start: start.toISOString(), end: end.toISOString() },
    });
  } catch (error) {
    console.error("Drive query-range error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Routes — Prediction (water_consumption_2026.csv)
// ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthNameFromValue(v) {
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 1 && n <= 12 ? MONTH_NAMES[n - 1] : v;
}

async function getPredictionFileContent(drive) {
  const response = await drive.files.list({
    q:        `name='water_consumption_2026.csv' and trashed=false`,
    fields:   "files(id, name)",
    pageSize: 1,
  });
  const files = response.data.files || [];
  if (files.length === 0) throw new Error("water_consumption_2026.csv not found in Google Drive");
  return readDriveFile(drive, files[0].id);
}

app.get("/drive/get-prediction-file", async (req, res) => {
  try {
    const auth  = await authorize();
    const drive = google.drive({ version: "v3", auth });
    const csv   = await getPredictionFileContent(drive);

    const lines = csv.split("\n");
    const data  = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",");
      if (values.length < 4) continue;

      const monthName = monthNameFromValue(values[0]?.trim());
      if (!monthName) continue;

      data.push({
        month:                monthName,
        rainfall:             parseFloat(values[1]) || 0,
        predicted_consumption: parseFloat(values[3]) || 0,
      });
    }

    console.log(`✅ Loaded ${data.length} prediction records`);
    res.json({ success: true, data, totalRows: data.length });
  } catch (error) {
    console.error("Prediction file error:", error.message);
    const statusCode = error.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

app.get("/drive/prediction-summary", async (req, res) => {
  try {
    const auth  = await authorize();
    const drive = google.drive({ version: "v3", auth });
    const csv   = await getPredictionFileContent(drive);

    const lines = csv.split("\n");
    let totalRainfall = 0, maxRainfall = 0, minRainfall = Infinity;
    let totalConsumption = 0, maxConsumption = 0, minConsumption = Infinity;
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(",");
      if (values.length < 4) continue;

      const rainfall    = parseFloat(values[1]) || 0;
      const consumption = parseFloat(values[3]) || 0;

      totalRainfall    += rainfall;
      maxRainfall       = Math.max(maxRainfall, rainfall);
      if (rainfall > 0)    minRainfall    = Math.min(minRainfall, rainfall);

      totalConsumption += consumption;
      maxConsumption    = Math.max(maxConsumption, consumption);
      if (consumption > 0) minConsumption = Math.min(minConsumption, consumption);

      count++;
    }

    res.json({
      success: true,
      summary: {
        totalRainfall:       totalRainfall.toFixed(2),
        averageRainfall:     count > 0 ? (totalRainfall / count).toFixed(2) : "0",
        maxRainfall:         maxRainfall.toFixed(2),
        minRainfall:         minRainfall === Infinity ? "0" : minRainfall.toFixed(2),
        totalConsumption:    totalConsumption.toFixed(2),
        averageConsumption:  count > 0 ? (totalConsumption / count).toFixed(2) : "0",
        maxConsumption:      maxConsumption.toFixed(2),
        minConsumption:      minConsumption === Infinity ? "0" : minConsumption.toFixed(2),
        totalMonths:         count,
      },
    });
  } catch (error) {
    console.error("Prediction summary error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  Auto-collection — polls ThingsBoard every 5 seconds
// ─────────────────────────────────────────────────────────────
let autoCollectTimer;
async function autoCollect() {
  try {
    await axios.post(`http://localhost:${PORT}/collect`);
  } catch (_) {
    // swallow errors — the /collect route logs them
  }
  autoCollectTimer = setTimeout(autoCollect, 5000);
}

// ─────────────────────────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

initializeCSV();
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Tank capacity: ${TANK_CAPACITY_LITERS} L`);
  console.log(`🔄 Auto-collecting every 5 seconds\n`);
  setTimeout(() => {
    console.log("✓ Auto-collection started\n");
    autoCollect();
  }, 2000);
});
