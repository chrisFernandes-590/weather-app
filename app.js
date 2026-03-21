// ──────────────────────────────────────────────
//  Weather App — Full-Stack Upgrade
//  Node.js + Express + EJS + OpenWeatherMap API
//  Features: Geolocation, Predictor, Leaflet Map
// ──────────────────────────────────────────────

// 1. Load environment variables
require("dotenv").config();

// 2. Import packages
const express = require("express");
const axios = require("axios");

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
  res.render("predict", {
    activePage: "predict",
    weather: null,
    error: null,
  });
});

/**
 * GET /api/weather-current — JSON API for current weather by coordinates
 * Used by the General View's client-side JavaScript
 * Query params: lat, lon
 */
app.get("/api/weather-current", async (req, res) => {
  const { lat, lon } = req.query;
  const API_KEY = process.env.API_KEY;

  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude and longitude are required." });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "API key is missing on the server." });
  }

  try {
    // Reverse geocoding to get the city name from coordinates
    const geoUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
    const geoResponse = await axios.get(geoUrl);

    let cityName = "Unknown Location";
    let state = null;
    let country = "";
    if (geoResponse.data && geoResponse.data.length > 0) {
      cityName = geoResponse.data[0].name;
      state = geoResponse.data[0].state || null;
      country = geoResponse.data[0].country;
    }

    // Current weather + daily forecast using One Call API 3.0
    const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&units=metric&appid=${API_KEY}`;
    const weatherResponse = await axios.get(weatherUrl);
    const current = weatherResponse.data.current;

    res.json({
      city: cityName,
      state,
      country,
      temp: Math.round(current.temp),
      feelsLike: Math.round(current.feels_like),
      humidity: current.humidity,
      windSpeed: Math.round(current.wind_speed * 3.6), // m/s → km/h
      description: current.weather[0].description,
      icon: current.weather[0].icon,
      conditionId: current.weather[0].id,
      main: current.weather[0].main,
      dt: current.dt,
      sunrise: current.sunrise,
      sunset: current.sunset,
      timezone_offset: weatherResponse.data.timezone_offset,
    });
  } catch (err) {
    // Log the raw API failure message to the console
    const apiRawError = err.response?.data || null;
    const apiMessage = apiRawError?.message || err.message || null;
    console.error("──── API Error (current) ────");
    console.error("Status:", err.response?.status || "No response");
    console.error("API Message:", apiMessage);
    console.error("Full Response:", JSON.stringify(apiRawError, null, 2));
    console.error("─────────────────────────────");

    // Build user-friendly UI error based on the API's message
    let uiError = "Service currently down. Please try again later.";
    if (err.response?.status === 401) {
      uiError = "Invalid API key. Please check your .env file.";
    } else if (err.response?.status === 429) {
      uiError = "Too many requests. Please wait and try again.";
    } else if (err.response?.status === 404) {
      uiError = "Weather data not found for this location.";
    } else if (apiMessage) {
      uiError = `API Error: ${apiMessage}`;
    }

    res.status(err.response?.status || 500).json({
      error: uiError,
      apiMessage: apiMessage || "No error message provided by the API.",
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
 * POST /weather — Process city search for the Predictor View
 * Uses Geocoding API → One Call API 3.0 → tomorrow's forecast
 */
app.post("/weather", async (req, res) => {
  const city = req.body.city;
  const API_KEY = process.env.API_KEY;

  // Validate input
  if (!city || city.trim() === "") {
    return res.render("predict", {
      activePage: "predict",
      weather: null,
      error: "Please enter a city name.",
    });
  }

  if (!API_KEY) {
    return res.render("predict", {
      activePage: "predict",
      weather: null,
      error: "API key is missing. Please add it to your .env file.",
    });
  }

  try {
    // Step 1: Geocoding — city name → lat/lon
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      city.trim()
    )}&limit=1&appid=${API_KEY}`;

    const geoResponse = await axios.get(geoUrl);

    if (!geoResponse.data || geoResponse.data.length === 0) {
      return res.render("predict", {
        activePage: "predict",
        weather: null,
        error: `City "${city}" not found. Check the spelling and try again.`,
      });
    }

    const { lat, lon, name, state, country } = geoResponse.data[0];

    // Step 2: One Call API → daily forecast
    const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&appid=${API_KEY}`;
    const weatherResponse = await axios.get(weatherUrl);
    const tomorrow = weatherResponse.data.daily[1]; // daily[1] = tomorrow

    // Step 3: Determine rain
    const condition = tomorrow.weather[0];
    const conditionId = condition.id;
    const willRain = conditionId >= 200 && conditionId < 600;

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
      conditionId,
      tempDay: Math.round(tomorrow.temp.day),
      tempMin: Math.round(tomorrow.temp.min),
      tempMax: Math.round(tomorrow.temp.max),
      humidity: tomorrow.humidity,
      windSpeed: Math.round(tomorrow.wind_speed * 3.6),
      pop: Math.round((tomorrow.pop || 0) * 100),
      date: new Date(tomorrow.dt * 1000).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    // Save to recent searches
    addRecentSearch(name);

    res.render("predict", {
      activePage: "predict",
      weather: weatherData,
      error: null,
    });
  } catch (err) {
    // Log the raw API failure message to the console
    const apiRawError = err.response?.data || null;
    const apiMessage = apiRawError?.message || err.message || null;
    console.error("──── API Error (predict) ────");
    console.error("Status:", err.response?.status || "No response");
    console.error("API Message:", apiMessage);
    console.error("Full Response:", JSON.stringify(apiRawError, null, 2));
    console.error("─────────────────────────────");

    // Build user-friendly UI error based on the API's message
    let uiError = "Service currently down. Please try again later.";
    if (err.response?.status === 401) {
      uiError = "Invalid API key. Please check your .env file.";
    } else if (err.response?.status === 429) {
      uiError = "Too many requests. Please wait and try again.";
    } else if (err.response?.status === 404) {
      uiError = "Weather data not found for this location.";
    } else if (apiMessage) {
      uiError = `API Error: ${apiMessage}`;
    }

    res.render("predict", {
      activePage: "predict",
      weather: null,
      error: uiError,
    });
  }
});

// ──────────────────────────────────────────────
//  START SERVER
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌤️  Weather app running at http://localhost:${PORT}`);
});
