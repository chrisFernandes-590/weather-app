// ──────────────────────────────────────────────
//  predict.js — Client-side logic for Predictor View
//  Handles: autocomplete, filter buttons, Leaflet map,
//           filter-based prediction questions
// ──────────────────────────────────────────────

// ═══════════════════════════════════════
//  AUTOCOMPLETE
// ═══════════════════════════════════════

const cityInput = document.getElementById("city-input");
const dropdown = document.getElementById("autocomplete-dropdown");
let debounceTimer = null;

// Get past searches from localStorage
function getLocalSearches() {
  try {
    return JSON.parse(localStorage.getItem("weatherSearches") || "[]");
  } catch {
    return [];
  }
}

// Save a search to localStorage
function saveLocalSearch(city) {
  const searches = getLocalSearches();
  const idx = searches.findIndex((s) => s.toLowerCase() === city.toLowerCase());
  if (idx !== -1) searches.splice(idx, 1);
  searches.unshift(city);
  if (searches.length > 20) searches.pop();
  localStorage.setItem("weatherSearches", JSON.stringify(searches));
}

// Fetch suggestions from server + merge with localStorage
async function fetchSuggestions(query) {
  try {
    const res = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`);
    const serverSuggestions = await res.json();

    const localSearches = getLocalSearches().filter((s) =>
      s.toLowerCase().startsWith(query.toLowerCase())
    );

    const merged = [...new Set([...localSearches, ...serverSuggestions])];
    return merged.slice(0, 8);
  } catch {
    return getLocalSearches()
      .filter((s) => s.toLowerCase().startsWith(query.toLowerCase()))
      .slice(0, 8);
  }
}

// Render the dropdown
function renderDropdown(suggestions) {
  if (suggestions.length === 0) {
    dropdown.classList.add("hidden");
    return;
  }

  dropdown.innerHTML = suggestions
    .map(
      (s) =>
        `<div class="autocomplete-item" data-city="${s}">${s}</div>`
    )
    .join("");

  dropdown.classList.remove("hidden");
}

// Input event → debounced fetch
cityInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const val = cityInput.value.trim();

  if (val.length < 2) {
    dropdown.classList.add("hidden");
    return;
  }

  debounceTimer = setTimeout(async () => {
    const suggestions = await fetchSuggestions(val);
    renderDropdown(suggestions);
  }, 250);
});

// Click on a suggestion
dropdown.addEventListener("click", (e) => {
  const item = e.target.closest(".autocomplete-item");
  if (item) {
    cityInput.value = item.dataset.city;
    dropdown.classList.add("hidden");
  }
});

// Hide dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-input-wrapper")) {
    dropdown.classList.add("hidden");
  }
});

// Show suggestions on focus if there's text
cityInput.addEventListener("focus", async () => {
  const val = cityInput.value.trim();
  if (val.length >= 2) {
    const suggestions = await fetchSuggestions(val);
    renderDropdown(suggestions);
  }
});

// ═══════════════════════════════════════
//  FILTER BUTTONS + PREDICTION QUESTION
// ═══════════════════════════════════════

const filterButtons = document.querySelectorAll(".filter-btn");
const resultCard = document.getElementById("weather-result");
const badgeInner = document.getElementById("badge-inner");
const badgeText = document.getElementById("badge-text");
const predictQuestion = document.getElementById("predict-question");
const weatherData = window.__WEATHER_DATA__;

// Filter config: label, positive/negative text, check function
const filterConfig = {
  rain: {
    question: "Will it rain tomorrow? Find out now.",
    check: (id) => id >= 200 && id < 600,
    yesText: "Yes, it will rain tomorrow!",
    noText: "No rain expected tomorrow",
    yesClass: "rain-yes",
    noClass: "rain-no",
    yesIcon: "cloud-rain",
    noIcon: "sun",
  },
  clear: {
    question: "Will it be sunny tomorrow? Find out now.",
    check: (id) => id === 800,
    yesText: "Yes, it will be sunny tomorrow!",
    noText: "No sunshine expected tomorrow",
    yesClass: "rain-no",   // sunny = yellow badge
    noClass: "rain-yes",   // not sunny = blue badge
    yesIcon: "sun",
    noIcon: "cloud",
  },
  clouds: {
    question: "Will it be cloudy tomorrow? Find out now.",
    check: (id) => id > 800,
    yesText: "Yes, it will be cloudy tomorrow!",
    noText: "No clouds expected tomorrow",
    yesClass: "badge-cloudy",
    noClass: "rain-no",
    yesIcon: "cloud",
    noIcon: "sun",
  },
  snow: {
    question: "Will it snow tomorrow? Find out now.",
    check: (id) => id >= 600 && id < 700,
    yesText: "Yes, it will snow tomorrow!",
    noText: "No snow expected tomorrow",
    yesClass: "badge-snow",
    noClass: "rain-no",
    yesIcon: "snowflake",
    noIcon: "sun",
  },
};

// Currently active filter (null = default rain)
let activeFilter = null;

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter;

    // Toggle: if clicking same filter, deactivate
    if (activeFilter === filter) {
      btn.classList.remove("filter-active");
      activeFilter = null;
    } else {
      // Deactivate all, activate this one (only one at a time)
      filterButtons.forEach((b) => b.classList.remove("filter-active"));
      btn.classList.add("filter-active");
      activeFilter = filter;
    }

    // Update the question subtitle
    updatePredictionQuestion();

    // Update the badge if there's a result
    if (weatherData && badgeInner && badgeText) {
      updateBadge();
    }
  });
});

function updatePredictionQuestion() {
  if (!predictQuestion) return;

  if (activeFilter && filterConfig[activeFilter]) {
    predictQuestion.textContent = filterConfig[activeFilter].question;
  } else {
    predictQuestion.textContent = "Will it rain tomorrow? Find out now.";
  }
}

function updateBadge() {
  const condId = weatherData.conditionId;
  const config = activeFilter ? filterConfig[activeFilter] : filterConfig.rain;
  const matches = config.check(condId);

  // Update text
  badgeText.textContent = matches ? config.yesText : config.noText;

  // Update badge classes
  badgeInner.className = "rain-badge " + (matches ? config.yesClass : config.noClass);

  // Update the icon inside the badge
  const iconEl = badgeInner.querySelector(".badge-icon");
  if (iconEl) {
    iconEl.setAttribute("data-lucide", matches ? config.yesIcon : config.noIcon);
    // Re-render Lucide icons
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
//  LEAFLET MAP
// ═══════════════════════════════════════

const mapContainer = document.getElementById("map");
const mapPlaceholder = document.getElementById("map-placeholder");

if (weatherData && weatherData.lat && weatherData.lon) {
  // Hide placeholder
  if (mapPlaceholder) mapPlaceholder.style.display = "none";

  // Initialize Leaflet map
  const map = L.map("map").setView([weatherData.lat, weatherData.lon], 11);

  // Add OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
    maxZoom: 18,
  }).addTo(map);

  // Add a marker
  const marker = L.marker([weatherData.lat, weatherData.lon]).addTo(map);
  marker.bindPopup(
    `<strong>${weatherData.city}</strong><br>${weatherData.description}`
  ).openPopup();

  // Save this search to localStorage
  saveLocalSearch(weatherData.city);
}

// ═══════════════════════════════════════
//  LOADING ANIMATION ON SUBMIT
// ═══════════════════════════════════════

const predictForm = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");

predictForm.addEventListener("submit", () => {
  submitBtn.textContent = "Searching...";
  submitBtn.disabled = true;
  submitBtn.classList.add("btn-loading");
});
