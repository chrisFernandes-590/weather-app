// ──────────────────────────────────────────────
//  utils/logger.js — API Call Tracking Utility
//  Logs every outgoing OpenWeatherMap API call
//  Persists to data/logs.json
// ──────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const os = require("os");

const isServerless = !!process.env.VERCEL || process.env.NODE_ENV === "production" || __dirname.includes("/var/task");
const LOG_FILE = isServerless 
  ? path.join(os.tmpdir(), "weather_logs.json") 
  : path.join(__dirname, "..", "data", "logs.json");
const DAILY_LIMIT = 1000; // OpenWeatherMap free tier

// ── Ensure data directory & file exist ──
function ensureLogFile() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "[]", "utf-8");
  }
}

// ── Read all logs from file ──
function readLogs() {
  ensureLogFile();
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Write logs to file ──
function writeLogs(logs) {
  ensureLogFile();
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf-8");
}

// ── Log an API call ──
// endpoint: "Geocoding" | "Current Weather" | "5-Day Forecast"
// city: city name or "lat,lon" for coordinate-based calls
// status: "success" | "error"
// statusCode: HTTP status code (200, 401, 500, etc.)
function logApiCall({ endpoint, city, status, statusCode, errorMsg }) {
  const logs = readLogs();

  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    endpoint,
    city: city || "Unknown",
    status: status || "success",
    statusCode: statusCode || 200,
  };
  
  if (errorMsg) {
    entry.errorMsg = errorMsg;
  }

  logs.push(entry);

  // Keep only last 5000 entries to prevent file from growing too large
  if (logs.length > 5000) {
    logs.splice(0, logs.length - 5000);
  }

  writeLogs(logs);
  return entry;
}

// ── Get today's date string (YYYY-MM-DD) ──
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ── Get aggregated stats ──
function getStats() {
  const logs = readLogs();
  const today = todayStr();

  // Today's logs
  const todayLogs = logs.filter((l) => l.timestamp.startsWith(today));
  
  // Separate actual API calls from cache hits
  const apiCallsToday = todayLogs.filter((l) => !l.status.includes("cache"));
  const todayCount = apiCallsToday.length;
  const remaining = Math.max(0, DAILY_LIMIT - todayCount);

  // Error count today (strict matching to exclude "success (backup)")
  const todayErrors = todayLogs.filter((l) => l.status === "error").length;

  // Cache hits today
  const todayCacheHits = todayLogs.filter((l) => l.status.includes("cache")).length;

  // Per-endpoint breakdown (today) 
  const endpointCounts = {};
  apiCallsToday.forEach((l) => {
    endpointCounts[l.endpoint] = (endpointCounts[l.endpoint] || 0) + 1;
  });

  // Most used endpoint today
  let mostUsed = "None";
  let mostUsedCount = 0;
  Object.entries(endpointCounts).forEach(([ep, count]) => {
    if (count > mostUsedCount) {
      mostUsed = ep;
      mostUsedCount = count;
    }
  });

  // Per-day aggregation (last 7 days)
  const dailyCounts = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyCounts[key] = 0;
  }
  logs.filter((l) => !l.status.includes("cache")).forEach((l) => {
    const day = l.timestamp.split("T")[0];
    if (dailyCounts.hasOwnProperty(day)) {
      dailyCounts[day]++;
    }
  });

  // Hourly breakdown (today) — for line chart
  const hourlyCounts = {};
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, "0")}:00`;
    hourlyCounts[label] = 0;
  }
  apiCallsToday.forEach((l) => {
    const hour = new Date(l.timestamp).getHours();
    const label = `${String(hour).padStart(2, "0")}:00`;
    hourlyCounts[label]++;
  });

  // All-time endpoint breakdown (for pie chart)
  const allEndpointCounts = {};
  logs.filter((l) => !l.status.includes("cache")).forEach((l) => {
    allEndpointCounts[l.endpoint] = (allEndpointCounts[l.endpoint] || 0) + 1;
  });

  return {
    dailyLimit: DAILY_LIMIT,
    todayCount,
    remaining,
    todayErrors,
    todayCacheHits,
    mostUsed,
    mostUsedCount,
    endpointCounts,
    dailyCounts,
    hourlyCounts,
    allEndpointCounts,
    totalLogs: logs.length,
  };
}

// ── Get recent logs (paginated) ──
function getLogs({ limit = 50, offset = 0, endpoint = null, status = null, date = null } = {}) {
  let logs = readLogs();

  // Filters
  if (endpoint) {
    logs = logs.filter((l) => l.endpoint === endpoint);
  }
  if (status) {
    logs = logs.filter((l) => l.status === status);
  }
  if (date) {
    logs = logs.filter((l) => l.timestamp.startsWith(date));
  }

  // Reverse (most recent first) and paginate
  const total = logs.length;
  const paginated = logs.reverse().slice(offset, offset + limit);

  return { logs: paginated, total };
}

// ── Export all logs as CSV string ──
function exportCSV() {
  const logs = readLogs();
  const header = "Timestamp,Endpoint,City,Status,StatusCode\n";
  const rows = logs
    .map(
      (l) =>
        `"${l.timestamp}","${l.endpoint}","${l.city}","${l.status}",${l.statusCode}`
    )
    .join("\n");
  return header + rows;
}

module.exports = {
  logApiCall,
  getStats,
  getLogs,
  exportCSV,
  DAILY_LIMIT,
};
