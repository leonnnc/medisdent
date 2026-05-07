/**
 * DentalPro — cpanel.js
 * Panel de control: lógica de inicialización y eventos
 */

import { config, applyConfig, saveConfigToFirestore } from './store.js';
import {
  slides, staffMembers,
  loadAdminData, renderAdminSlides, renderAdminAgenda,
  renderAdminStaff, renderPatientHistory,
  showNotification, flushPendingQueue
} from './app.js';

// Apply saved colors immediately on cpanel load
applyConfig();

// ── NAV SIDEBAR ───────────────────────────────────
document.querySelectorAll('.cpanel-nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cpanel-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cpanel-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('section-' + btn.dataset.section).classList.add('active');

    // Load historial on demand
    if (btn.dataset.section === 'historial') renderPatientHistory();
  });
});

// ── LOAD DATA ON OPEN ─────────────────────────────
loadAdminData();
renderAdminSlides();
renderAdminAgenda();
renderAdminStaff();

// ── SAVE GENERAL ──────────────────────────────────
document.getElementById('adSaveGeneral').addEventListener('click', async () => {
  const btn = document.getElementById('adSaveGeneral');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  try {
    await saveConfigToFirestore({
      clinicName: document.getElementById('adClinicName').value.trim(),
      slogan:     document.getElementById('adSlogan').value.trim(),
      phone:      document.getElementById('adPhone').value.trim(),
      email:      document.getElementById('adEmail').value.trim(),
      address:    document.getElementById('adAddress').value.trim()
    });
    showNotification('✅ Información guardada en Firestore.', 'success');
  } catch (e) {
    showNotification('❌ Error al guardar: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Guardar cambios'; btn.disabled = false;
  }
});

// ── SAVE COLORS ───────────────────────────────────
document.getElementById('adSaveColors').addEventListener('click', async () => {
  const btn = document.getElementById('adSaveColors');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  try {
    await saveConfigToFirestore({
      primaryColor: document.getElementById('adPrimaryColor').value,
      accentColor:  document.getElementById('adAccentColor').value
    });
    showNotification('✅ Colores guardados en Firestore.', 'success');
  } catch (e) {
    showNotification('❌ Error al guardar colores: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Guardar colores'; btn.disabled = false;
  }
});

// ── SAVE APPOINTMENTS CONFIG ──────────────────────
document.getElementById('adSaveAppointments').addEventListener('click', async () => {
  const btn = document.getElementById('adSaveAppointments');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  try {
    await saveConfigToFirestore({
      appointmentDuration: Number(document.getElementById('adApptDuration').value),
      firstSlot:           document.getElementById('adFirstSlot').value,
      lastSlot:            document.getElementById('adLastSlot').value,
      availableDays:       Array.from(
        document.querySelectorAll('#dayCheckboxes input:checked')
      ).map(cb => Number(cb.value))
    });
    showNotification('✅ Configuración de citas guardada en Firestore.', 'success');
  } catch (e) {
    showNotification('❌ Error al guardar citas: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Guardar configuración'; btn.disabled = false;
  }
});

// ── RETRY PENDING SYNC ────────────────────────────
window.flushPendingQueue = flushPendingQueue; // expose for inline onclick in renderAdminAgenda

// ── IMAGE UPLOAD ──────────────────────────────────
const imgFileInput = document.getElementById('imgFileInput');
const imgPreview   = document.getElementById('imgPreview');
const imgUrlResult = document.getElementById('imgUrlResult');
const uploadBtn    = document.getElementById('uploadBtn');
const uploadArea   = document.getElementById('uploadArea');
let   selectedFile = null;

uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) previewFile(file);
});

imgFileInput.addEventListener('change', () => {
  if (imgFileInput.files[0]) previewFile(imgFileInput.files[0]);
});

function previewFile(file) {
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    imgPreview.src = ev.target.result;
    imgPreview.style.display = 'block';
    imgUrlResult.style.display = 'none';
    uploadBtn.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  uploadBtn.textContent = '⏳ Subiendo…';
  uploadBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir');

    imgUrlResult.textContent = data.url;
    imgUrlResult.style.display = 'block';
    imgPreview.src = data.url;
    navigator.clipboard.writeText(data.url).catch(() => {});
    showNotification('✅ Imagen subida. URL copiada al portapapeles.', 'success');
    selectedFile = null;
    uploadBtn.style.display = 'none';
    loadImageLibrary();
  } catch (err) {
    showNotification('❌ ' + err.message, 'error');
  } finally {
    uploadBtn.textContent = '⬆️ Subir imagen';
    uploadBtn.disabled = false;
  }
});

// ── IMAGE LIBRARY ─────────────────────────────────
async function loadImageLibrary() {
  const lib = document.getElementById('imgLibrary');
  lib.innerHTML = '<p class="img-library-empty">Cargando…</p>';
  try {
    const res   = await fetch('/api/images');
    const files = await res.json();

    if (!files.length) {
      lib.innerHTML = '<p class="img-library-empty">No hay imágenes subidas aún.</p>';
      return;
    }

    lib.innerHTML = '';
    files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'img-library-item';
      item.title = 'Clic para copiar URL';
      item.innerHTML = `
        <img src="${f.url}" alt="${f.filename}" loading="lazy" />
        <button class="img-del" title="Eliminar" data-filename="${f.filename}">✕</button>`;

      item.addEventListener('click', e => {
        if (e.target.classList.contains('img-del')) return;
        navigator.clipboard.writeText(f.url).catch(() => {});
        showNotification('📋 URL copiada: ' + f.url, 'success');
      });

      item.querySelector('.img-del').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta imagen del servidor?')) return;
        await fetch('/api/images/' + f.filename, { method: 'DELETE' });
        loadImageLibrary();
        showNotification('Imagen eliminada.', 'success');
      });

      lib.appendChild(item);
    });
  } catch {
    lib.innerHTML = '<p class="img-library-empty">No se pudo conectar con el servidor.</p>';
  }
}

loadImageLibrary();
