const PALETTE = [
  "#ff6b35",
  "#2ec4b6",
  "#ffbc42",
  "#8338ec",
  "#e63946",
  "#3a86ff",
  "#06d6a0",
  "#f15bb5",
  "#fb8500",
  "#118ab2",
];

export function colorForIndex(i) {
  return PALETTE[i % PALETTE.length];
}

const instances = new Map();

/* Chart.js 的預設字色／格線是給淺底用的深灰，在深夜主題上幾乎看不見。
   一次把預設值換成 CSS 變數的值，兩張圖都吃得到。 */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let defaultsApplied = false;

function applyChartDefaults() {
  if (defaultsApplied || typeof Chart === "undefined") return;
  defaultsApplied = true;
  Chart.defaults.color = cssVar("--color-text-muted");
  Chart.defaults.borderColor = cssVar("--color-border");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

function destroyIfExists(canvas) {
  const existing = instances.get(canvas);
  if (existing) {
    existing.destroy();
    instances.delete(canvas);
  }
}

export function renderCategoryPieChart(canvas, entries) {
  applyChartDefaults();
  destroyIfExists(canvas);
  if (!entries.length) return null;
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: entries.map((e) => e.name),
      datasets: [
        {
          data: entries.map((e) => e.amount),
          backgroundColor: entries.map((e) => e.color),
          /* 深底上相鄰的兩塊色會黏在一起，用底色描一圈當間隙 */
          borderColor: cssVar("--color-surface"),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: $${ctx.parsed.toLocaleString()}`,
          },
        },
      },
    },
  });
  instances.set(canvas, chart);
  return chart;
}

export function renderTrendChart(canvas, points) {
  applyChartDefaults();
  destroyIfExists(canvas);
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          data: points.map((p) => p.total),
          backgroundColor: "#ff6b35",
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `$${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: cssVar("--color-border") },
        },
      },
    },
  });
  instances.set(canvas, chart);
  return chart;
}
