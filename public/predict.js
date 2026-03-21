// ──────────────────────────────────────────────
//  predict.js — Client-side logic for Predictor View
//  Handles: autocomplete, filter buttons, Leaflet map
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

    // Also filter local searches
    const localSearches = getLocalSearches().filter((s) =>
      s.toLowerCase().startsWith(query.toLowerCase())
    );

    // Merge, deduplicate, limit to 8
    const merged = [...new Set([...localSearches, ...serverSuggestions])];
    return merged.slice(0, 8);
  } catch {
    // Fallback to localStorage only
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
//  FILTER BUTTONS
// ═══════════════════════════════════════

const filterButtons = document.querySelectorAll(".filter-btn");
const resultCard = document.getElementById("weather-result");

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    // Toggle active class
    btn.classList.toggle("filter-active");

    // If there's a result, highlight/dim based on filter match
    if (resultCard) {
      const activeFilters = Array.from(
        document.querySelectorAll(".filter-btn.filter-active")
      ).map((b) => b.dataset.filter);

      if (activeFilters.length === 0) {
        // No filters active — show normal
        resultCard.style.opacity = "1";
        resultCard.style.transform = "none";
      } else {
        const condition = resultCard.dataset.condition;
        const matches = activeFilters.some((f) => condition.includes(f));
        resultCard.style.opacity = matches ? "1" : "0.4";
        resultCard.style.transform = matches ? "none" : "scale(0.98)";
      }
    }
  });
});

// ═══════════════════════════════════════
//  LEAFLET MAP
// ═══════════════════════════════════════

const weatherData = window.__WEATHER_DATA__;
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
