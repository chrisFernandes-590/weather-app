// ──────────────────────────────────────────────
//  predict.js — Client-side logic for Predictor View
//  Handles: AJAX search, autocomplete, filter buttons,
//           Leaflet map, dynamic result rendering
// ──────────────────────────────────────────────

// ═══════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════
const cityInput = document.getElementById("city-input");
const dropdown = document.getElementById("autocomplete-dropdown");
const predictForm = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const errorBox = document.getElementById("error-box");
const errorMessage = document.getElementById("error-message");
const resultCard = document.getElementById("weather-result");
const predictQuestion = document.getElementById("predict-question");
const mapPlaceholder = document.getElementById("map-placeholder");

// Result elements
const resultCity = document.getElementById("result-city");
const resultDate = document.getElementById("result-date");
const badgeInner = document.getElementById("badge-inner");
const badgeText = document.getElementById("badge-text");
const resultIcon = document.getElementById("result-icon");
const resultDesc = document.getElementById("result-desc");
const resultTemp = document.getElementById("result-temp");
const resultHigh = document.getElementById("result-high");
const resultLow = document.getElementById("result-low");
const resultHumidity = document.getElementById("result-humidity");
const resultWind = document.getElementById("result-wind");
const resultPop = document.getElementById("result-pop");

let debounceTimer = null;
let weatherData = null; // Stored after search
let predictMap = null;
let predictMarker = null;

// ═══════════════════════════════════════
//  AUTOCOMPLETE
// ═══════════════════════════════════════

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
//  FORM SUBMISSION — AJAX (no page reload)
// ═══════════════════════════════════════
predictForm.addEventListener("submit", async (e) => {
  e.preventDefault(); // ← Prevents browser from navigating away

  const city = cityInput.value.trim();
  if (!city) return;

  // Show loading state
  submitBtn.innerHTML = '<i data-lucide="loader" class="btn-icon spin"></i> Searching...';
  submitBtn.disabled = true;
  submitBtn.classList.add("btn-loading");
  errorBox.classList.add("hidden");
  lucide.createIcons();

  try {
    const res = await fetch("/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || "Something went wrong. Please try again.");
      return;
    }

    // Success — display the result
    weatherData = data.weather;
    displayResult(weatherData);
    saveLocalSearch(weatherData.city);
    initMap(weatherData.lat, weatherData.lon, weatherData);
  } catch (err) {
    console.error("Fetch error:", err);
    showError("Network error. Please check your connection and try again.");
  } finally {
    // Reset button
    submitBtn.innerHTML = '<i data-lucide="search" class="btn-icon"></i> Search';
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loading");
    lucide.createIcons();
  }
});

// ═══════════════════════════════════════
//  DISPLAY RESULT
// ═══════════════════════════════════════
function displayResult(data) {
  // Location
  let cityText = data.city;
  if (data.state) cityText += `, ${data.state}`;
  cityText += `, ${data.country}`;
  resultCity.textContent = cityText;
  resultDate.textContent = data.date;

  // Cache Indicator
  const cacheIndicator = document.getElementById("cache-indicator-predict");
  if (cacheIndicator) {
    if (data.isCached) {
      cacheIndicator.style.display = "inline-block";
      cacheIndicator.textContent = "Cached 3h";
      cacheIndicator.style.backgroundColor = "var(--brutal-yellow)";
    } else {
      cacheIndicator.style.display = "inline-block";
      cacheIndicator.textContent = "Live Source";
      cacheIndicator.style.backgroundColor = "var(--brutal-green)";
    }
  }

  // Icon + description
  resultIcon.src = `https://openweathermap.org/img/wn/${data.icon}@4x.png`;
  resultIcon.alt = data.description;
  resultDesc.textContent = data.description;

  // Stats
  resultTemp.textContent = `${data.tempDay}°C`;
  resultHigh.textContent = `${data.tempMax}°C`;
  resultLow.textContent = `${data.tempMin}°C`;
  resultHumidity.textContent = `${data.humidity}%`;
  resultWind.textContent = `${data.windSpeed} km/h`;
  resultPop.textContent = `${data.pop}%`;

  // Store data attributes for filter logic
  resultCard.dataset.condition = data.main.toLowerCase();
  resultCard.dataset.conditionId = data.conditionId;
  resultCard.dataset.willRain = data.willRain;

  // Update badge based on active filter
  updateBadge();

  // Show result, hide error
  errorBox.classList.add("hidden");
  resultCard.classList.remove("hidden");

  // Animate the result card in
  resultCard.style.animation = "none";
  resultCard.offsetHeight; // Trigger reflow
  resultCard.style.animation = "cardSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both";

  // Re-render icons
  lucide.createIcons();
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBox.classList.remove("hidden");
  resultCard.classList.add("hidden");
  lucide.createIcons();
}

// ═══════════════════════════════════════
//  FILTER BUTTONS + PREDICTION QUESTION
// ═══════════════════════════════════════

const filterButtons = document.querySelectorAll(".filter-btn");

// Filter config
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
    yesClass: "rain-no",
    noClass: "rain-yes",
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

let activeFilter = null;

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter;

    if (activeFilter === filter) {
      btn.classList.remove("filter-active");
      activeFilter = null;
    } else {
      filterButtons.forEach((b) => b.classList.remove("filter-active"));
      btn.classList.add("filter-active");
      activeFilter = filter;
    }

    updatePredictionQuestion();

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
  if (!weatherData) return;

  const condId = weatherData.conditionId;
  const config = activeFilter ? filterConfig[activeFilter] : filterConfig.rain;
  const matches = config.check(condId);

  badgeText.textContent = matches ? config.yesText : config.noText;
  badgeInner.className = "rain-badge " + (matches ? config.yesClass : config.noClass);

  const iconEl = badgeInner.querySelector(".badge-icon");
  if (iconEl) {
    iconEl.setAttribute("data-lucide", matches ? config.yesIcon : config.noIcon);
    lucide.createIcons();
  }
}

// ═══════════════════════════════════════
//  LEAFLET MAP
// ═══════════════════════════════════════
function initMap(lat, lon, data) {
  // Hide placeholder
  if (mapPlaceholder) mapPlaceholder.style.display = "none";

  // Destroy existing map
  if (predictMap) {
    predictMap.remove();
    predictMap = null;
  }

  predictMap = L.map("map").setView([lat, lon], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
    maxZoom: 18,
  }).addTo(predictMap);

  predictMarker = L.marker([lat, lon]).addTo(predictMap);
  predictMarker.bindPopup(
    `<strong>${data.city}</strong><br>${data.description}`
  ).openPopup();

  setTimeout(() => {
    predictMap.invalidateSize();
  }, 300);
}
