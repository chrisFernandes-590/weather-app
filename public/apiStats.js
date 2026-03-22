// ──────────────────────────────────────────────
//  apiStats.js — Client-side logic for API Stats Dashboard
//  Handles: Chart.js charts, AJAX stats refresh,
//           log table, filters, pagination
// ──────────────────────────────────────────────

// ═══════════════════════════════════════
//  STATE
// ═══════════════════════════════════════
let currentPage = 1;
const PAGE_SIZE = 20;
let dailyChart = null;
let pieChart = null;
let hourlyChart = null;

// ═══════════════════════════════════════
//  CHART.JS GLOBAL CONFIG — Neo-brutalism
// ═══════════════════════════════════════
Chart.defaults.font.family = "'Space Grotesk', sans-serif";
Chart.defaults.font.weight = 600;
Chart.defaults.color = "#1a1a1a";
Chart.defaults.plugins.legend.labels.usePointStyle = true;

const CHART_COLORS = {
  blue: "#74b9ff",
  yellow: "#ffd93d",
  red: "#ff6b6b",
  green: "#55efc4",
  purple: "#a29bfe",
  orange: "#fab1a0",
};

// ═══════════════════════════════════════
//  FETCH STATS FROM API
// ═══════════════════════════════════════
async function fetchStats() {
  const endpointFilter = document.getElementById("filter-endpoint").value;
  const statusFilter = document.getElementById("filter-status").value;
  const offset = (currentPage - 1) * PAGE_SIZE;

  let url = `/api/stats?limit=${PAGE_SIZE}&offset=${offset}`;
  if (endpointFilter) url += `&endpoint=${encodeURIComponent(endpointFilter)}`;
  if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    updateSummaryCards(data.stats);
    updateProgressBar(data.stats);
    updateCharts(data.stats);
    updateLogsTable(data.logs, data.total);
  } catch (err) {
    console.error("Failed to fetch stats:", err);
  }
}

// ═══════════════════════════════════════
//  SUMMARY CARDS
// ═══════════════════════════════════════
function updateSummaryCards(stats) {
  document.getElementById("today-count").textContent = stats.todayCount;
  document.getElementById("remaining-count").textContent = stats.remaining;
  document.getElementById("most-used").textContent = stats.mostUsed;
  document.getElementById("error-count").textContent = stats.todayErrors;

  // Color the remaining count
  const remainEl = document.getElementById("remaining-count");
  remainEl.className = "summary-value";
  if (stats.remaining < 100) {
    remainEl.classList.add("text-danger");
  } else if (stats.remaining < 300) {
    remainEl.classList.add("text-warning");
  } else {
    remainEl.classList.add("text-safe");
  }
}

// ═══════════════════════════════════════
//  PROGRESS BAR
// ═══════════════════════════════════════
function updateProgressBar(stats) {
  const pct = Math.min(100, (stats.todayCount / stats.dailyLimit) * 100);
  const fill = document.getElementById("progress-bar-fill");
  const numbers = document.getElementById("progress-numbers");
  const warning = document.getElementById("progress-warning");
  const warningText = document.getElementById("warning-text");

  fill.style.width = `${pct}%`;
  numbers.textContent = `${stats.todayCount} / ${stats.dailyLimit}`;

  // Color states
  fill.className = "progress-bar-fill";
  if (pct >= 90) {
    fill.classList.add("progress-danger");
    warning.classList.remove("hidden");
    warningText.textContent = `Critical! Only ${stats.remaining} requests remaining.`;
  } else if (pct >= 70) {
    fill.classList.add("progress-warning");
    warning.classList.remove("hidden");
    warningText.textContent = `Heads up! ${stats.remaining} requests remaining.`;
  } else {
    fill.classList.add("progress-safe");
    warning.classList.add("hidden");
  }
}

// ═══════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════
function updateCharts(stats) {
  updateDailyChart(stats.dailyCounts);
  updatePieChart(stats.allEndpointCounts);
  updateHourlyChart(stats.hourlyCounts);
}

// Bar chart: Requests per day (last 7 days)
function updateDailyChart(dailyCounts) {
  const labels = Object.keys(dailyCounts).map((d) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  });
  const values = Object.values(dailyCounts);

  const data = {
    labels,
    datasets: [
      {
        label: "API Calls",
        data: values,
        backgroundColor: CHART_COLORS.blue,
        borderColor: "#1a1a1a",
        borderWidth: 3,
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  if (dailyChart) {
    dailyChart.data = data;
    dailyChart.update("none");
  } else {
    dailyChart = new Chart(document.getElementById("dailyChart"), {
      type: "bar",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { weight: 700 } },
            grid: { color: "rgba(0,0,0,0.08)" },
          },
          x: { grid: { display: false }, ticks: { font: { weight: 700 } } },
        },
      },
    });
  }
}

// Pie chart: Endpoint distribution (all time)
function updatePieChart(endpointCounts) {
  const labels = Object.keys(endpointCounts);
  const values = Object.values(endpointCounts);
  const colors = [CHART_COLORS.blue, CHART_COLORS.yellow, CHART_COLORS.green, CHART_COLORS.purple];

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: "#1a1a1a",
        borderWidth: 3,
      },
    ],
  };

  if (pieChart) {
    pieChart.data = data;
    pieChart.update("none");
  } else {
    pieChart = new Chart(document.getElementById("pieChart"), {
      type: "doughnut",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 16, font: { size: 13, weight: 700 } },
          },
        },
        cutout: "55%",
      },
    });
  }
}

// Line chart: Hourly activity (today)
function updateHourlyChart(hourlyCounts) {
  const labels = Object.keys(hourlyCounts);
  const values = Object.values(hourlyCounts);

  const data = {
    labels,
    datasets: [
      {
        label: "Requests",
        data: values,
        borderColor: CHART_COLORS.blue,
        backgroundColor: "rgba(116, 185, 255, 0.15)",
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.blue,
        pointBorderColor: "#1a1a1a",
        pointBorderWidth: 2,
      },
    ],
  };

  if (hourlyChart) {
    hourlyChart.data = data;
    hourlyChart.update("none");
  } else {
    hourlyChart = new Chart(document.getElementById("hourlyChart"), {
      type: "line",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { weight: 700 } },
            grid: { color: "rgba(0,0,0,0.08)" },
          },
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 12,
              font: { weight: 700 },
            },
          },
        },
      },
    });
  }
}

// ═══════════════════════════════════════
//  LOGS TABLE
// ═══════════════════════════════════════
function updateLogsTable(logs, total) {
  const tbody = document.getElementById("logs-tbody");
  const pageInfo = document.getElementById("page-info");
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="logs-empty">No logs found</td></tr>`;
  } else {
    tbody.innerHTML = logs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const statusClass = log.status === "success" ? "status-success" : "status-error";
        const statusLabel = log.status === "success" ? "OK" : "ERR";
        return `
          <tr class="log-row">
            <td class="log-time">${time}</td>
            <td><span class="endpoint-tag">${log.endpoint}</span></td>
            <td class="log-city">${log.city}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td class="log-code">${log.statusCode}</td>
          </tr>
        `;
      })
      .join("");
  }

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

// ═══════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════

// Refresh button
document.getElementById("refresh-btn").addEventListener("click", () => {
  currentPage = 1;
  fetchStats();
  // Re-render icons for any new dynamic content
  lucide.createIcons();
});

// Filters
document.getElementById("filter-endpoint").addEventListener("change", () => {
  currentPage = 1;
  fetchStats();
});

document.getElementById("filter-status").addEventListener("change", () => {
  currentPage = 1;
  fetchStats();
});

// Pagination
document.getElementById("prev-page").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    fetchStats();
  }
});

document.getElementById("next-page").addEventListener("click", () => {
  currentPage++;
  fetchStats();
});

// ═══════════════════════════════════════
//  INIT + AUTO-REFRESH
// ═══════════════════════════════════════
fetchStats();

// Auto-refresh every 15 seconds
setInterval(() => {
  fetchStats();
}, 15000);
