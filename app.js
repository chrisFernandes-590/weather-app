// ──────────────────────────────────────────────
//  Weather App — Full-Stack Upgrade
//  Node.js + Express + EJS + OpenWeatherMap API
//  Features: Geolocation, Predictor, Leaflet Map,
//            API Usage Dashboard
// ──────────────────────────────────────────────

// 1. Load environment variables
require("dotenv").config();

// 2. Import packages
const express = require("express");
const axios = require("axios");
const { logApiCall, getStats, getLogs, exportCSV } = require("./utils/logger");
const { makeWeatherRequest } = require("./utils/apiHelper");

// 3. Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 4. In-memory store for recent searches (autocomplete suggestions)
//    Stores last 20 unique city names that returned valid results
const recentSearches = [];
const MAX_SUGGESTIONS = 20;

// 5. Configure EJS
app.set("view engine", "ejs");

// 6. Middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For AJAX JSON requests

// ──────────────────────────────────────────────
//  HELPER: Add a city to recent searches
// ──────────────────────────────────────────────
function addRecentSearch(cityName) {
  // Remove duplicates (case-insensitive)
  const idx = recentSearches.findIndex(
    (s) => s.toLowerCase() === cityName.toLowerCase()
  );
  if (idx !== -1) recentSearches.splice(idx, 1);

  // Add to front
  recentSearches.unshift(cityName);

  // Keep only the last MAX_SUGGESTIONS
  if (recentSearches.length > MAX_SUGGESTIONS) {
    recentSearches.pop();
  }
}

// ──────────────────────────────────────────────
//  ROUTES
// ──────────────────────────────────────────────

/**
 * GET / — General View (Current Location Weather)
 * Page uses browser geolocation + client-side fetch to /api/weather-current
 */
app.get("/", (req, res) => {
  res.render("general", { activePage: "general" });
});

/**
 * GET /predict — Weather Predictor View
 * Search-based view with autocomplete, filters, and Leaflet map
 */
app.get("/predict", (req, res) => {
  res.render("predict", { activePage: "predict" });
});

/**
 * GET /apiStats — API Usage Dashboard
 */
app.get("/apiStats", (req, res) => {
  res.render("apiStats", { activePage: "apiStats" });
});

/**
 * GET /api/weather-current — JSON API for current weather by coordinates
 * Used by the General View's client-side JavaScript
 * Query params: lat, lon
 */
app.get("/api/weather-current", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude and longitude are required." });
  }

  try {
    const urlTemplate = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=__API_KEY__`;
    const cacheKey = `current_${lat}_${lon}`;
    const endpointName = "Current Weather";
    const locName = `${lat},${lon}`;

    const { isCached, data } = await makeWeatherRequest(urlTemplate, cacheKey, endpointName, locName);

    res.json({
      city: data.name,
      state: null,
      country: data.sys.country,
      temp: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s → km/h
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      conditionId: data.weather[0].id,
      main: data.weather[0].main,
      dt: data.dt,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      timezone_offset: data.timezone,
      isCached, // Flag for UI
    });
  } catch (err) {
    // Determine user error message
    let uiError = "Service currently down. Please try again later.";
    if (err.response?.status === 401) {
      uiError = "Invalid API keys. Please check your .env file.";
    } else if (err.response?.status === 429) {
      uiError = "Too many requests. Please wait and try again.";
    } else if (err.response?.status === 404) {
      uiError = "Weather data not found for this location.";
    }

    res.status(err.response?.status || 500).json({
      error: uiError,
      apiMessage: err.message || "No error message provided.",
    });
  }
});

/**
 * GET /api/suggestions — Returns recent search suggestions as JSON
 * Query param: q (search prefix)
 */
app.get("/api/suggestions", (req, res) => {
  const query = (req.query.q || "").toLowerCase().trim();

  if (!query) {
    return res.json(recentSearches.slice(0, 8));
  }

  const filtered = recentSearches.filter((s) =>
    s.toLowerCase().startsWith(query)
  );
  res.json(filtered.slice(0, 8));
});

/**
 * GET /api/stats — JSON endpoint for dashboard stats
 * Returns aggregated usage statistics and recent logs
 */
app.get("/api/stats", (req, res) => {
  const stats = getStats();
  const { logs, total } = getLogs({
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0,
    endpoint: req.query.endpoint || null,
    status: req.query.status || null,
    date: req.query.date || null,
  });

  res.json({ stats, logs, total });
});

/**
 * GET /api/logs/download — Download all logs as CSV
 */
app.get("/api/logs/download", (req, res) => {
  const csv = exportCSV();
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=api_logs.csv");
  res.send(csv);
});

/**
 * POST /weather — Process city search for the Predictor View (JSON API)
 * Uses Geocoding API → FREE 5-Day Forecast API 2.5 → tomorrow's forecast
 * Returns JSON so the frontend can update without a full page reload.
 */
app.post("/weather", async (req, res) => {
  const city = req.body.city;

  // Validate input
  if (!city || city.trim() === "") {
    return res.status(400).json({ error: "Please enter a city name." });
  }

  try {
    console.log("-> Starting /weather request for:", city);
    
    // Step 1: Geocoding — city name → lat/lon
    const geoUrlTemplate = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      city.trim()
    )}&limit=1&appid=__API_KEY__`;
    
    const { isCached: geoCached, data: geoData } = await makeWeatherRequest(
      geoUrlTemplate, 
      `geo_${city.toLowerCase().trim()}`, 
      "Geocoding", 
      city.trim()
    );

    if (!geoData || geoData.length === 0) {
      return res.status(404).json({
        error: `City "${city}" not found. Check the spelling and try again.`,
      });
    }

    const { lat, lon, name, state, country } = geoData[0];
    console.log("-> Found coords:", lat, lon);

    // Step 2: FREE 5-Day/3-Hour Forecast API → filter tomorrow's entries
    const forecastUrlTemplate = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=__API_KEY__`;
    
    const { isCached: forecastCached, data: forecastData } = await makeWeatherRequest(
      forecastUrlTemplate, 
      `forecast_${lat}_${lon}`, 
      "5-Day Forecast", 
      name
    );

    const forecastList = forecastData.list;
    console.log("-> Forecast success, items:", forecastList?.length);

    // Filter entries for tomorrow's date
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split("T")[0]; // "YYYY-MM-DD"
    console.log("-> Looking for tomorrow's date:", tomorrowDateStr);

    const tomorrowEntries = forecastList.filter((entry) =>
      entry.dt_txt.startsWith(tomorrowDateStr)
    );
    console.log("-> Tomorrow entries count:", tomorrowEntries.length);

    if (tomorrowEntries.length === 0) {
      return res.status(404).json({
        error: "Could not get tomorrow's forecast data. Please try again.",
      });
    }

    // Step 3: Aggregate tomorrow's data from 3-hour intervals
    const middayEntry = tomorrowEntries.find((e) => e.dt_txt.includes("12:00")) || tomorrowEntries[0];

    const temps = tomorrowEntries.map((e) => e.main.temp);
    const humidities = tomorrowEntries.map((e) => e.main.humidity);
    const winds = tomorrowEntries.map((e) => e.wind.speed);
    const pops = tomorrowEntries.map((e) => e.pop || 0);

    // Determine rain: check if ANY 3-hour slot has rain/thunderstorm/drizzle
    const willRain = tomorrowEntries.some((e) => {
      const id = e.weather[0].id;
      return id >= 200 && id < 600;
    });

    const condition = middayEntry.weather[0];

    // Step 4: Build result
    const weatherData = {
      city: name,
      state: state || null,
      country,
      lat,
      lon,
      willRain,
      description: condition.description,
      icon: condition.icon,
      main: condition.main,
      conditionId: condition.id,
      tempDay: Math.round(middayEntry.main.temp),
      tempMin: Math.round(Math.min(...temps)),
      tempMax: Math.round(Math.max(...temps)),
      humidity: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
      windSpeed: Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 3.6),
      pop: Math.round(Math.max(...pops) * 100),
      date: tomorrow.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      isCached: geoCached || forecastCached // Flag if either was loaded from cache
    };

    // Save to recent searches
    addRecentSearch(name);

    res.json({ weather: weatherData });
  } catch (err) {
    // Note: makeWeatherRequest already logs the definitive failure.
    // We just need to parse the message correctly for the UI.
    const apiRawError = err.response?.data || null;
    const apiMessage = apiRawError?.message || err.message || null;

    let uiError = "Service currently down. Please try again later.";
    if (err.response?.status === 401) {
      uiError = "Invalid API keys. Please check your .env file.";
    } else if (err.response?.status === 429) {
      uiError = "Too many requests. Please wait and try again.";
    } else if (err.response?.status === 404) {
      uiError = "Weather data not found for this location.";
    } else if (apiMessage) {
      uiError = `API Error: ${apiMessage}`;
    }

    res.status(err.response?.status || 500).json({ error: uiError });
  }
});

// ──────────────────────────────────────────────
//  START SERVER
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌤️  Weather app running at http://localhost:${PORT}`);
});
