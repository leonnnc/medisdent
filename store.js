/**
 * DentalPro — store.js
 * Config compartido — Firestore es la fuente de verdad.
 * localStorage solo se usa como caché de lectura rápida al inicio.
 */

// ── Cache local (solo lectura rápida inicial) ─────
const _cache = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem('dp_' + k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch {} }
};

// Mantenemos Store exportado para compatibilidad con código existente
export const Store = _cache;

// ── Valores por defecto ───────────────────────────
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

// Config en memoria — se llena desde Firestore al cargar
export const config = { ...DEFAULTS };

/** Aplica config al DOM y variables CSS */
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
 * Carga config desde Firestore (fuente de verdad).
 * Si Firestore no tiene datos aún, usa los DEFAULTS.
 * NO usa localStorage como fallback — lanza el error si falla.
 */
export async function loadConfigFromFirestore() {
  const { fetchSiteConfig } = await import('./firebase.js');
  const remote = await fetchSiteConfig();
  if (remote) {
    Object.assign(config, remote);
  }
  // Siempre aplica (ya sea de Firestore o defaults)
  applyConfig();
}

/**
 * Guarda config en Firestore (fuente de verdad).
 * Actualiza el objeto en memoria y el DOM inmediatamente.
 * Lanza error si Firestore falla — no silencia.
 */
export async function saveConfigToFirestore(updates) {
  Object.assign(config, updates);
  applyConfig(); // Aplica visualmente de inmediato
  const { saveSiteConfig } = await import('./firebase.js');
  await saveSiteConfig(config); // Lanza si falla
}
