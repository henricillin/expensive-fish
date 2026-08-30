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

function destroyIfExists(canvas) {
  const existing = instances.get(canvas);
  if (existing) {
    existing.destroy();
    instances.delete(canvas);
  }
}

export function renderCategoryPieChart(canvas, entries) {
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
          borderWidth: 0,
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
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
  instances.set(canvas, chart);
  return chart;
}
