/* Line-art SVG icon set — replaces emoji across the app. */

const ICONS = {
  utensils: `<path d="M6.5 3v4.5a2.5 2.5 0 0 0 5 0V3"/><path d="M9 10v11"/><path d="M17.2 3c1.9 2.3 1.9 6.6 0 9.5h-1.4V3z"/><path d="M16.4 12.5V21"/>`,
  bowl: `<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M9 8c0-1.8 1.8-1.8 1.8-3.8M14 8c0-1.8 1.8-1.8 1.8-3.8"/>`,
  coffee: `<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9.5h1.6a2.5 2.5 0 0 1 0 5H17"/><path d="M7 3v2M11 3v2M15 3v2"/>`,
  cup: `<path d="M6.5 9h11l-1 10.4a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8z"/><path d="M6.5 9a5.5 5.5 0 0 1 11 0"/><path d="m14.6 5.2 1.9-3.4"/>`,
  beer: `<path d="M5 6h11v13.5A1.5 1.5 0 0 1 14.5 21h-8A1.5 1.5 0 0 1 5 19.5z"/><path d="M16 9.5h2.5A2.5 2.5 0 0 1 21 12v2a2.5 2.5 0 0 1-2.5 2.5H16"/><path d="M5 10h11"/>`,
  apple: `<path d="M12 7.5c-1-1.6-2.9-2.6-4.5-1.9C5.2 6.5 4 8.8 4 11.3c0 4.4 3 8.7 5.4 8.7.9 0 1.7-.5 2.6-.5s1.7.5 2.6.5c2.4 0 5.4-4.3 5.4-8.7 0-2.5-1.2-4.8-3.5-5.7-1.6-.7-3.5.3-4.5 1.9z"/><path d="M12 7.5V5a2.5 2.5 0 0 1 2.5-2.5"/>`,
  cart: `<circle cx="9.5" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/><path d="M2.5 3.5H5l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6"/>`,
  bottle: `<path d="M10 2.5h4v3h-4z"/><path d="M9.2 5.5h5.6a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H9.2a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3z"/><path d="M6.2 11h11.6"/>`,
  home: `<path d="M3 10.6 12 3l9 7.6"/><path d="M5.5 9.4V20.5h13V9.4"/><path d="M9.5 20.5V14h5v6.5"/>`,
  bus: `<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16"/><path d="M7 17v3M17 17v3"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>`,
  car: `<path d="m5 11 1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6.5 17v2.5M17.5 17v2.5"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>`,
  plane: `<path d="M21.5 2.5 2.5 10.2l7 2.9 2.9 7z"/><path d="m9.5 13.1 12-10.6"/>`,
  phone: `<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 5.5h3"/><circle cx="12" cy="18" r="1"/>`,
  game: `<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="15.8" cy="11" r="1"/><circle cx="18.3" cy="13.5" r="1"/>`,
  movie: `<path d="M2.5 8.6h19v10.4a2.4 2.4 0 0 1-2.4 2.4H4.9a2.4 2.4 0 0 1-2.4-2.4z"/><path d="M2.9 8.6 4.3 3.2l17 1.7-.7 3.7z"/><path d="m8.7 3.7-1.1 4.6M14.2 4.3l-1.1 4.4"/>`,
  book: `<path d="M4 3.5h5.5A2.5 2.5 0 0 1 12 6v14a2.5 2.5 0 0 0-2.5-1.6H4z"/><path d="M20 3.5h-5.5A2.5 2.5 0 0 0 12 6v14a2.5 2.5 0 0 1 2.5-1.6H20z"/>`,
  school: `<path d="M2.5 8.5 12 4.2l9.5 4.3L12 12.8z"/><path d="M6.8 10.6V16c0 1.6 2.3 2.8 5.2 2.8s5.2-1.2 5.2-2.8v-5.4"/><path d="M21.5 8.5V15"/>`,
  dumbbell: `<path d="M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12"/>`,
  pill: `<path d="M10.6 3.4 3.4 10.6a5.1 5.1 0 0 0 7.2 7.2l7.2-7.2a5.1 5.1 0 0 0-7.2-7.2z"/><path d="m7 7 7 7"/>`,
  paw: `<ellipse cx="7" cy="8.5" rx="1.9" ry="2.3"/><ellipse cx="12" cy="6.5" rx="1.9" ry="2.3"/><ellipse cx="17" cy="8.5" rx="1.9" ry="2.3"/><path d="M12 11.5c3 0 5.4 2.4 5.4 4.9A2.8 2.8 0 0 1 13.8 19a5.8 5.8 0 0 0-3.6 0 2.8 2.8 0 0 1-3.6-2.6c0-2.5 2.4-4.9 5.4-4.9z"/>`,
  gift: `<rect x="3" y="8" width="18" height="4" rx="1.2"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8v13"/><path d="M12 8S10.6 3 8.2 3a2.5 2.5 0 0 0 0 5zM12 8s1.4-5 3.8-5a2.5 2.5 0 0 1 0 5z"/>`,
  shirt: `<path d="M8.6 3 12 5.4 15.4 3 21 6l-2.4 4-2.1-1.2V21h-9V8.8L5.4 10 3 6z"/>`,
  scissors: `<circle cx="6.5" cy="18" r="2.4"/><circle cx="17.5" cy="18" r="2.4"/><path d="M8.4 16.4 18 3M15.6 16.4 6 3"/>`,
  tools: `<path d="M17.4 6.6a4.6 4.6 0 0 1-5.8 5.8l-6 6a2.3 2.3 0 0 1-3.2-3.2l6-6a4.6 4.6 0 0 1 5.8-5.8l-2.8 2.8 2.4 2.4z"/><path d="m15 15 5.5 5.5"/>`,
  leaf: `<path d="M20.5 3.5c0 9.4-5.2 14.6-11.5 14.6a5 5 0 0 1-5-5c0-6.3 5.2-9.6 16.5-9.6z"/><path d="M15 9 4 20"/>`,
  money: `<path d="M12 2.5v19"/><path d="M16.5 6.8H9.9a3.3 3.3 0 0 0 0 6.6h4.2a3.3 3.3 0 0 1 0 6.6H7"/>`,
  receipt: `<path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z"/><path d="M9 8h6M9 12h6"/>`,
  tag: `<path d="M3 11.6V4.4a1.4 1.4 0 0 1 1.4-1.4h7.2a1.4 1.4 0 0 1 1 .4l8 8a1.4 1.4 0 0 1 0 2l-7.2 7.2a1.4 1.4 0 0 1-2 0l-8-8a1.4 1.4 0 0 1-.4-1z"/><circle cx="7.6" cy="7.6" r="1.4"/>`,

  /* UI icons */
  pencil: `<path d="M4 20.2h4L20 8.2a2.8 2.8 0 0 0-4-4L4 16.2z"/><path d="m14.6 5.6 3.8 3.8"/>`,
  list: `<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>`,
  star: `<path d="m12 3.6 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6-4.4-4.3 6.1-.9z"/>`,
  chart: `<path d="M3 21h18"/><path d="M6.5 21v-8M11.5 21V5M16.5 21v-5M21 21v-9"/>`,
  sliders: `<path d="M5 21V14M5 10V3M12 21v-9M12 8V3M19 21v-5M19 12V3"/><path d="M2.5 14h5M9.5 12h5M16.5 16h5"/>`,
  users: `<circle cx="9" cy="8" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M16.2 5.2a3.3 3.3 0 0 1 0 6"/><path d="M17.8 14.4a6.2 6.2 0 0 1 3.9 5.1"/>`,
  search: `<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  chevronRight: `<path d="m9.5 4.5 7.5 7.5-7.5 7.5"/>`,
  chevronLeft: `<path d="M14.5 4.5 7 12l7.5 7.5"/>`,
  download: `<path d="M12 3.5v11.5"/><path d="m7 10.5 5 5 5-5"/><path d="M4 20h16"/>`,
  upload: `<path d="M12 16V4.5"/><path d="m7 9.5 5-5 5 5"/><path d="M4 20h16"/>`,
  sheet: `<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M9 9.5V20M15 9.5V20"/>`,
  wallet: `<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v2.5"/><rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><circle cx="16.8" cy="14" r="1.3"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>`,
  inbox: `<path d="M3.5 13.5 6 5.2A2 2 0 0 1 7.9 3.8h8.2A2 2 0 0 1 18 5.2l2.5 8.3"/><path d="M3.5 13.5h4.2l1.2 2.6h6.2l1.2-2.6h4.2v4.7a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/>`,
};

export const CATEGORY_ICON_CHOICES = [
  "utensils", "bowl", "coffee", "cup", "beer", "apple",
  "cart", "bottle", "home", "bus", "car", "plane",
  "phone", "game", "movie", "book", "school", "dumbbell",
  "pill", "paw", "gift", "shirt", "scissors", "tools",
  "leaf", "money", "receipt", "tag",
];

/* Icons that mean "food or drink" — used to default the rating toggle on. */
export const FOOD_DRINK_ICONS = new Set(["utensils", "bowl", "coffee", "cup", "beer", "apple"]);

const EMOJI_TO_ICON = {
  "🍔": "utensils", "🍜": "bowl", "🍎": "apple", "🥤": "cup", "☕": "coffee",
  "🍺": "beer", "🧴": "bottle", "🧻": "bottle", "🛒": "cart", "🏠": "home",
  "🚌": "bus", "🚗": "car", "✈️": "plane", "📱": "phone", "🎮": "game",
  "🎬": "movie", "📚": "book", "🎓": "school", "🏋️": "dumbbell", "💊": "pill",
  "🐾": "paw", "🎁": "gift", "👕": "shirt", "💇": "scissors", "🛠️": "tools",
  "🌿": "leaf", "💰": "money", "🧾": "receipt", "🏷️": "tag",
};

export function normalizeIconName(value) {
  if (!value) return "tag";
  if (ICONS[value]) return value;
  return EMOJI_TO_ICON[value] || "tag";
}

export function icon(name, { size = 24, className = "", filled = false } = {}) {
  const body = ICONS[normalizeIconName(name)];
  const fill = filled ? "currentColor" : "none";
  const stroke = filled ? "none" : "currentColor";
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* Icon inside a soft tinted square — the emoji replacement in lists and grids. */
export function iconBadge(name, color, { size = 40, iconSize = 22 } = {}) {
  return `<span class="icon-badge" style="width:${size}px;height:${size}px;background:${tint(color, 0.14)};color:${color};">${icon(name, { size: iconSize })}</span>`;
}

export function tint(hex, alpha) {
  const h = String(hex || "#ff6b35").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
