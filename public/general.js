// ──────────────────────────────────────────────
//  general.js — Client-side logic for General View
//  Handles: geolocation, weather fetch, dynamic backgrounds,
//           animated effects, Leaflet map, theme blending
// ──────────────────────────────────────────────

// DOM references
const body = document.getElementById("app-body");
const navbar = document.getElementById("navbar");
const footer = document.getElementById("app-footer");
const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const weatherDisplay = document.getElementById("weather-display");
const errorMessage = document.getElementById("error-message");
const effectsContainer = document.getElementById("weather-effects");

// Weather display elements
const cityName = document.getElementById("city-name");
const tempValue = document.getElementById("temp-value");
const weatherDesc = document.getElementById("weather-desc");
const weatherIcon = document.getElementById("weather-icon");
const conditionBadge = document.getElementById("condition-badge");
const humidityValue = document.getElementById("humidity-value");
const windValue = document.getElementById("wind-value");
const feelsLikeValue = document.getElementById("feels-like-value");

// Map reference
let generalMap = null;
let generalMarker = null;

// Refresh interval: 3 hours in milliseconds
const REFRESH_INTERVAL = 3 * 60 * 60 * 1000;

// User coordinates for map
let userLat = null;
let userLon = null;

// ──────────────────────────────────────────────
//  Show / Hide states
// ──────────────────────────────────────────────
function showLoading() {
  loadingState.classList.remove("hidden");
  errorState.classList.add("hidden");
  weatherDisplay.classList.add("hidden");
}

function showError(msg) {
  errorMessage.textContent = msg;
  loadingState.classList.add("hidden");
  errorState.classList.remove("hidden");
  weatherDisplay.classList.add("hidden");
}

function showWeather() {
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  weatherDisplay.classList.remove("hidden");
}

// ──────────────────────────────────────────────
//  Get weather using browser geolocation
// ──────────────────────────────────────────────
function getWeatherByLocation() {
  showLoading();

  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userLat = position.coords.latitude;
      userLon = position.coords.longitude;
      await fetchWeather(userLat, userLon);
    },
    (err) => {
      let msg = "Unable to get your location.";
      if (err.code === 1) msg = "Location access denied. Please allow location access and try again.";
      if (err.code === 2) msg = "Location unavailable. Please try again.";
      if (err.code === 3) msg = "Location request timed out. Please try again.";
      showError(msg);
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}

// ──────────────────────────────────────────────
//  Fetch current weather from our API
// ──────────────────────────────────────────────
async function fetchWeather(lat, lon) {
  try {
    const res = await fetch(`/api/weather-current?lat=${lat}&lon=${lon}`);
    const data = await res.json();

    if (!res.ok) {
      // Log the raw API error message in the browser console
      console.error("──── Weather API Error ────");
      console.error("Status:", res.status);
      console.error("API Message:", data.apiMessage || "No message from API");
      console.error("UI Error:", data.error);
      console.error("───────────────────────────");

      // Show user-friendly error in the UI
      showError(data.error || "Service currently down. Please try again later.");
      return;
    }

    updateUI(data);
    showWeather();
    initMap(lat, lon, data);
    // Re-render Lucide icons for dynamically shown content
    lucide.createIcons();
  } catch (err) {
    // Network-level failure (no response at all)
    console.error("──── Network Error ────");
    console.error("Error:", err.message);
    console.error("───────────────────────");
    showError("Service currently down. Please check your connection.");
  }
}

// ──────────────────────────────────────────────
//  Update the DOM with weather data
// ──────────────────────────────────────────────
function updateUI(data) {
  cityName.textContent = data.state
    ? `${data.city}, ${data.state}`
    : `${data.city}, ${data.country}`;

  tempValue.textContent = data.temp;
  weatherDesc.textContent = data.description;
  weatherIcon.src = `https://openweathermap.org/img/wn/${data.icon}@4x.png`;
  weatherIcon.alt = data.description;
  conditionBadge.textContent = data.main;
  humidityValue.textContent = `${data.humidity}%`;
  windValue.textContent = `${data.windSpeed} km/h`;
  feelsLikeValue.textContent = `${data.feelsLike}°C`;

  // Apply dynamic background + theme blending
  applyDynamicBackground(data);
}

// ──────────────────────────────────────────────
//  Dynamic background based on weather + time
//  Also blends navbar & footer with the theme
// ──────────────────────────────────────────────
function applyDynamicBackground(data) {
  // Remove all previous weather classes from body, navbar, footer
  const weatherClasses = [
    "weather-default", "weather-clear", "weather-rain", "weather-thunderstorm",
    "weather-snow", "weather-night", "weather-clouds", "weather-mist",
    "theme-dark", "theme-rain", "theme-snow", "theme-clear", "theme-clouds", "theme-mist"
  ];

  body.classList.remove(...weatherClasses);
  navbar.classList.remove(...weatherClasses);
  footer.classList.remove(...weatherClasses);

  const condId = data.conditionId;
  const now = data.dt;
  const sunrise = data.sunrise;
  const sunset = data.sunset;
  const isNight = now < sunrise || now > sunset;

  // Determine weather class
  let weatherClass = "weather-default";
  let themeClass = "";

  if (condId >= 200 && condId < 300) {
    weatherClass = "weather-thunderstorm";
    themeClass = "theme-dark";
  } else if (condId >= 300 && condId < 600) {
    weatherClass = "weather-rain";
    themeClass = "theme-rain";
  } else if (condId >= 600 && condId < 700) {
    weatherClass = "weather-snow";
    themeClass = "theme-snow";
  } else if (condId >= 700 && condId < 800) {
    weatherClass = "weather-mist";
    themeClass = "theme-mist";
  } else if (condId === 800) {
    weatherClass = isNight ? "weather-night" : "weather-clear";
    themeClass = isNight ? "theme-dark" : "theme-clear";
  } else if (condId > 800) {
    weatherClass = isNight ? "weather-night" : "weather-clouds";
    themeClass = isNight ? "theme-dark" : "theme-clouds";
  }

  // Apply to body (background + text color)
  body.classList.add(weatherClass);

  // Apply theme class to navbar and footer for blending
  if (themeClass) {
    navbar.classList.add(themeClass);
    footer.classList.add(themeClass);
  }

  // Create animated effects
  createWeatherEffects(weatherClass);
}

// ──────────────────────────────────────────────
//  Animated weather effects (rain, snow, stars)
// ──────────────────────────────────────────────
function createWeatherEffects(weatherClass) {
  effectsContainer.innerHTML = ""; // Clear previous

  if (weatherClass === "weather-rain" || weatherClass === "weather-thunderstorm") {
    // Create rain drops
    for (let i = 0; i < 60; i++) {
      const drop = document.createElement("div");
      drop.className = "rain-drop";
      drop.style.left = `${Math.random() * 100}%`;
      drop.style.animationDuration = `${0.4 + Math.random() * 0.3}s`;
      drop.style.animationDelay = `${Math.random() * 2}s`;
      effectsContainer.appendChild(drop);
    }
  } else if (weatherClass === "weather-snow") {
    // Create snowflakes
    for (let i = 0; i < 40; i++) {
      const flake = document.createElement("div");
      flake.className = "snowflake";
      flake.textContent = "❄";
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.fontSize = `${8 + Math.random() * 14}px`;
      flake.style.animationDuration = `${3 + Math.random() * 5}s`;
      flake.style.animationDelay = `${Math.random() * 5}s`;
      effectsContainer.appendChild(flake);
    }
  } else if (weatherClass === "weather-night") {
    // Create twinkling stars
    for (let i = 0; i < 50; i++) {
      const star = document.createElement("div");
      star.className = "star";
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 60}%`;
      star.style.animationDelay = `${Math.random() * 3}s`;
      effectsContainer.appendChild(star);
    }
  } else if (weatherClass === "weather-clouds") {
    // Floating cloud shapes
    for (let i = 0; i < 5; i++) {
      const cloud = document.createElement("div");
      cloud.className = "floating-cloud";
      cloud.style.top = `${10 + Math.random() * 40}%`;
      cloud.style.animationDuration = `${20 + Math.random() * 20}s`;
      cloud.style.animationDelay = `${Math.random() * 10}s`;
      cloud.style.opacity = `${0.15 + Math.random() * 0.2}`;
      effectsContainer.appendChild(cloud);
    }
  }
}

// ──────────────────────────────────────────────
//  Leaflet Map for user's current location
// ──────────────────────────────────────────────
function initMap(lat, lon, data) {
  const mapEl = document.getElementById("general-map");
  if (!mapEl) return;

  // Destroy existing map if any
  if (generalMap) {
    generalMap.remove();
    generalMap = null;
  }

  generalMap = L.map("general-map").setView([lat, lon], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
    maxZoom: 18,
  }).addTo(generalMap);

  generalMarker = L.marker([lat, lon]).addTo(generalMap);
  generalMarker.bindPopup(
    `<strong>${data.city}, ${data.country}</strong><br>${data.description} · ${data.temp}°C`
  ).openPopup();

  // Fix map rendering (Leaflet needs a resize when container becomes visible)
  setTimeout(() => {
    generalMap.invalidateSize();
  }, 300);
}

// ──────────────────────────────────────────────
//  Retry geolocation (button click handler)
// ──────────────────────────────────────────────
function retryGeolocation() {
  getWeatherByLocation();
}

// ──────────────────────────────────────────────
//  Initialize
// ──────────────────────────────────────────────
getWeatherByLocation();

// Auto-refresh every 3 hours
setInterval(() => {
  getWeatherByLocation();
}, REFRESH_INTERVAL);
