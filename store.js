/**
 * DentalPro — store.js
 * Shared config — loads from Firestore, falls back to localStorage.
 * Imported by both app.js and cpanel.js
 */

// ── localStorage fallback ─────────────────────────
export const Store = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem('dp_' + k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch {} }
};

// ── Default config values ─────────────────────────
const DEFAULTS = {
  clinicName:          'DentalPro',
  slogan:              'Tu sonrisa, nuestra pasión',
  phone:               '+51 1 234-5678',
  email:               'info@dentalpro.pe',
  address:             'Av. Javier Prado Este 4200, Surco',
  primaryColor:        '#1a6ebf',
  accentColor:         '#c9a84c',
  appointmentDuration: 90,
  firstSlot:           '08:00',
  lastSlot:            '19:00',
  availableDays:       [1, 2, 3, 4, 5, 6]
};

// Start with localStorage (instant, no async wait)
export const config = Store.get('config', { ...DEFAULTS });

/** Apply config to all [data-config] elements and CSS variables */
export function applyConfig() {
  document.documentElement.style.setProperty('--primary', config.primaryColor);
  document.documentElement.style.setProperty('--accent',  config.accentColor);
  document.querySelectorAll('[data-config]').forEach(el => {
    const key = el.dataset.config;
    if (config[key] !== undefined) el.textContent = config[key];
  });
  if (config.clinicName) {
    document.title = config.clinicName + ' — Clínica Dental de Excelencia';
  }
}

/**
 * Load config from Firestore and merge into the shared config object.
 * Called once on page load. Updates the DOM after loading.
 */
export async function loadConfigFromFirestore() {
  try {
    const { fetchSiteConfig } = await import('./firebase.js');
    const remote = await fetchSiteConfig();
    if (remote) {
      // Merge remote values into the shared config object (mutate in place)
      Object.assign(config, remote);
      // Also cache locally for offline use
      Store.set('config', config);
      applyConfig();
    }
  } catch (e) {
    console.warn('Could not load config from Firestore, using local:', e.message);
  }
}

/**
 * Save config to both Firestore and localStorage.
 */
export async function saveConfigToFirestore(updates) {
  Object.assign(config, updates);
  Store.set('config', config);
  applyConfig();
  try {
    const { saveSiteConfig } = await import('./firebase.js');
    await saveSiteConfig(config);
  } catch (e) {
    console.warn('Could not save config to Firestore:', e.message);
  }
}
