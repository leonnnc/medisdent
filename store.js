/**
 * DentalPro — store.js
 * Shared localStorage store and config — imported by both app.js and cpanel.js
 */

export const Store = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem('dp_' + k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch {} }
};

export const config = Store.get('config', {
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
});

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
