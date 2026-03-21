// ──────────────────────────────────────────────
//  Weather App — Will it rain tomorrow?
//  Node.js + Express + EJS + OpenWeatherMap API
// ──────────────────────────────────────────────

// 1. Load environment variables from .env file
require("dotenv").config();

// 2. Import required packages
const express = require("express");
const axios = require("axios");

// 3. Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 4. Configure EJS as the template engine
app.set("view engine", "ejs");

// 5. Serve static files (CSS, images, etc.) from the "public" folder
app.use(express.static("public"));

// 6. Parse form data from POST requests
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
//  ROUTES
// ──────────────────────────────────────────────

/**
 * GET / — Homepage
 * Renders the search form. No weather data on first load.
 */
app.get("/", (req, res) => {
  res.render("index", { weather: null, error: null });
});

/**
 * POST /weather — Process the city search
 *
 * Steps:
 *  1. Get the city name from the form
 *  2. Call the Geocoding API to get lat/lon
 *  3. Call the One Call API 3.0 to get the forecast
 *  4. Extract tomorrow's forecast (daily[1])
 *  5. Determine if it will rain and render the result
 */
app.post("/weather", async (req, res) => {
  const city = req.body.city; // Get city name from form input
  const API_KEY = process.env.API_KEY; // Get API key from .env

  // Validate input
  if (!city || city.trim() === "") {
    return res.render("index", {
      weather: null,
      error: "Please enter a city name.",
    });
  }

  // Validate API key
  if (!API_KEY) {
    return res.render("index", {
      weather: null,
      error: "API key is missing. Please add it to your .env file.",
    });
  }

  try {
    // ── Step 1: Convert city name → latitude & longitude ──
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
      city.trim()
    )}&limit=1&appid=${API_KEY}`;

    const geoResponse = await axios.get(geoUrl);

    // If no results, the city name is invalid
    if (!geoResponse.data || geoResponse.data.length === 0) {
      return res.render("index", {
        weather: null,
        error: `City "${city}" not found. Please check the spelling and try again.`,
      });
    }

    const { lat, lon, name, state, country } = geoResponse.data[0];

    // ── Step 2: Get the weather forecast ──
    const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&appid=${API_KEY}`;

    const weatherResponse = await axios.get(weatherUrl);
    const tomorrow = weatherResponse.data.daily[1]; // daily[1] = tomorrow

    // ── Step 3: Determine if it will rain ──
    // The "weather" array contains condition objects.
    // Rain condition IDs are in the 2xx (thunderstorm) and 5xx (rain) ranges.
    // Drizzle is in the 3xx range.
    const weatherCondition = tomorrow.weather[0];
    const conditionId = weatherCondition.id;
    const willRain =
      conditionId >= 200 && conditionId < 600; // Thunderstorm, Drizzle, or Rain

    // ── Step 4: Build the result object ──
    const weatherData = {
      city: name,
      state: state || null,
      country: country,
      willRain: willRain,
      description: weatherCondition.description,
      icon: weatherCondition.icon,
      tempDay: Math.round(tomorrow.temp.day),
      tempMin: Math.round(tomorrow.temp.min),
      tempMax: Math.round(tomorrow.temp.max),
      humidity: tomorrow.humidity,
      windSpeed: Math.round(tomorrow.wind_speed * 3.6), // m/s → km/h
      pop: Math.round((tomorrow.pop || 0) * 100), // Probability of precipitation (%)
    };

    // Render the page with weather data
    res.render("index", { weather: weatherData, error: null });
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);

    // Handle specific API errors
    let errorMessage = "Something went wrong. Please try again later.";
    if (err.response) {
      if (err.response.status === 401) {
        errorMessage =
          "Invalid API key. Please check your .env file.";
      } else if (err.response.status === 429) {
        errorMessage = "Too many requests. Please wait and try again.";
      }
    }

    res.render("index", { weather: null, error: errorMessage });
  }
});

// ──────────────────────────────────────────────
//  START SERVER
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌤️  Weather app running at http://localhost:${PORT}`);
});
