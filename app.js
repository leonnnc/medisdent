/* ═══════════════════════════════════════════════
   DentalPro — app.js
   Full interactivity: carousel, calendar, booking, admin panel
═══════════════════════════════════════════════ */

import { Store, config, applyConfig } from './store.js';

// ── SECURITY: sanitize text before inserting into innerHTML ──
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

// Reset slides cache if it's an old version without imgUrl
const DATA_VERSION = '2';
if (Store.get('dataVersion') !== DATA_VERSION) {
  localStorage.removeItem('dp_slides');
  Store.set('dataVersion', DATA_VERSION);
}

// ── STATE ─────────────────────────────────────────
let slides = Store.get('slides', [
  { id: 1, type: 'image', title: 'Tu sonrisa, nuestra pasión', subtitle: 'Tratamientos dentales de vanguardia con la calidez que mereces.', bg: '#1a3a5c', imgUrl: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1600&q=80' },
  { id: 2, type: 'image', title: 'Diagnóstico digital avanzado', subtitle: 'Radiografías 3D, escáner intraoral y planificación digital.', bg: '#1a4a36', imgUrl: 'https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1600&q=80' },
  { id: 3, type: 'image', title: 'Confort y confianza', subtitle: 'Un ambiente diseñado para que te sientas seguro.', bg: '#050d18', imgUrl: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1600&q=80' },
  { id: 4, type: 'image', title: 'Sonrisas perfectas', subtitle: 'Blanqueamiento, carillas y diseño de sonrisa.', bg: '#3a1a6e', imgUrl: 'https://images.unsplash.com/photo-1588776814546-ec7e1f6b3b6a?w=1600&q=80' },
  { id: 5, type: 'image', title: 'Cuidado para toda la familia', subtitle: 'Desde los más pequeños hasta los adultos mayores.', bg: '#3d3a10', imgUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=1600&q=80' }
]);

// Appointments are loaded from Firebase Firestore (see initFirebase below)
let appointments = [];

// ── FIREBASE + SYNC QUEUE ─────────────────────────
let fbSaveAppointment   = null;
let fbFetchAppointments = null;
let fbRemoveAppointment = null;
let fbFetchPatients     = null;
let firebaseReady       = false;

const PENDING_KEY = 'pendingSync'; // localStorage key for offline queue

/** Returns pending appointments that failed to sync to Firestore */
function getPendingQueue() {
  return Store.get(PENDING_KEY, []);
}

/** Add an appointment to the pending sync queue */
function addToPendingQueue(appt) {
  const queue = getPendingQueue();
  queue.push({ ...appt, pendingId: Date.now() });
  Store.set(PENDING_KEY, queue);
}

/** Remove a successfully synced item from the queue */
function removeFromPendingQueue(pendingId) {
  const queue = getPendingQueue().filter(a => a.pendingId !== pendingId);
  Store.set(PENDING_KEY, queue);
}

/**
 * Try to flush all pending (offline) appointments to Firestore.
 * Called on page load and whenever Firebase becomes available.
 */
async function flushPendingQueue() {
  if (!fbSaveAppointment) return;
  const queue = getPendingQueue();
  if (!queue.length) return;

  let synced = 0;
  for (const appt of queue) {
    try {
      const firestoreId = await fbSaveAppointment(appt);
      appt.firestoreId = firestoreId;
      removeFromPendingQueue(appt.pendingId);
      synced++;
    } catch (e) {
      console.warn('Pending sync failed for appt', appt.pendingId, e.message);
    }
  }

  if (synced > 0) {
    appointments = await fbFetchAppointments();
    renderCalendar();
    renderAgenda();
    renderAdminAgenda();
    showNotification(`✅ ${synced} cita(s) pendiente(s) sincronizada(s) con la nube.`, 'success');
  }
}

async function initFirebase() {
  try {
    const mod = await import('./firebase.js');
    fbSaveAppointment   = mod.saveAppointment;
    fbFetchAppointments = mod.fetchAppointments;
    fbRemoveAppointment = mod.removeAppointment;
    fbFetchPatients     = mod.fetchPatients;
    firebaseReady       = true;

    // ── Config desde Firestore (fuente de verdad) ──
    const { loadConfigFromFirestore } = await import('./store.js');
    await loadConfigFromFirestore();

    // ── Slides desde Firestore ──
    const remoteSlides = await mod.fetchSlides();
    if (remoteSlides && remoteSlides.length) {
      slides.length = 0;
      slides.push(...remoteSlides);
      if (IS_SITE && typeof buildCarousel === 'function') buildCarousel();
    }

    // ── Staff desde Firestore ──
    const remoteStaff = await mod.fetchStaff();
    if (remoteStaff && remoteStaff.length) {
      staffMembers.length = 0;
      staffMembers.push(...remoteStaff);
      renderStaff();
    }

    // ── Citas desde Firestore ──
    appointments = await fbFetchAppointments();
    renderCalendar();
    renderAgenda();
    renderAdminAgenda();

    // Sincronizar citas pendientes offline
    await flushPendingQueue();
    setInterval(flushPendingQueue, 60_000);

  } catch (e) {
    // Firestore falló — mostrar error claro, reintentar en 15s
    console.error('Error conectando con Firestore:', e.message);
    showNotification('⚠️ Error conectando con la base de datos. Reintentando…', 'error');
    renderCalendar();
    renderAgenda();
    renderAdminAgenda();
    setTimeout(initFirebase, 15_000);
  }
}

// ── SITE-ONLY CODE (index.html) ───────────────────
// All code below only runs when the main site elements exist
const IS_SITE = !!document.getElementById('navbar');

if (IS_SITE) {

// ── NAVBAR ───────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 60);
});
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('mobileMenu').classList.toggle('open');
});
document.querySelectorAll('.mobile-menu a').forEach(a => {
  a.addEventListener('click', () => document.getElementById('mobileMenu').classList.remove('open'));
});

// ── CAROUSEL ─────────────────────────────────────
let currentSlide = 0;
let autoSlide;
const track = document.getElementById('carouselTrack');
const dotsContainer = document.getElementById('carouselDots');
const progressBar = document.getElementById('progressBar');

function buildCarousel() {
  track.innerHTML = '';
  dotsContainer.innerHTML = '';

  slides.forEach((slide, i) => {
    const div = document.createElement('div');
    div.className = 'carousel-slide';
    div.dataset.type = slide.type;

    if (slide.type === 'video') {
      // FIX: sanitize title/subtitle to prevent XSS from admin-stored data
      // FIX: only render <source> when videoUrl is non-empty to avoid broken video element
      div.innerHTML = `
        <div class="slide-bg" style="background:${sanitize(slide.bg)}"></div>
        <video class="slide-video" muted loop playsinline preload="none"
               poster="https://images.unsplash.com/photo-1609840114035-3c981b782dfe?w=1600&q=80">
          ${slide.videoUrl ? `<source src="${sanitize(slide.videoUrl)}" type="video/mp4"/>` : ''}
        </video>
        <div class="video-overlay"></div>
        <div class="slide-content">
          <h1>${sanitize(slide.title)}</h1>
          <p>${sanitize(slide.subtitle)}</p>
          <a href="#calendar" class="btn-hero">Reservar cita</a>
        </div>`;
    } else {
      // FIX: sanitize all user-controlled fields
      const bgStyle = slide.imgUrl
        ? `background-image:url('${sanitize(slide.imgUrl)}'); background-size:cover; background-position:center;`
        : `background:linear-gradient(135deg,${sanitize(slide.bg)} 0%,${sanitize(slide.bg)}cc 100%)`;
      div.innerHTML = `
        <div class="slide-bg" style="${bgStyle}"></div>
        <div class="slide-overlay"></div>
        <div class="slide-content">
          <h1>${sanitize(slide.title)}</h1>
          <p>${sanitize(slide.subtitle)}</p>
          <a href="#calendar" class="btn-hero">Reservar cita</a>
        </div>
        <div class="slide-deco"></div>`;
    }
    track.appendChild(div);

    const dot = document.createElement('div');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
  });

  goToSlide(0);
}

function goToSlide(n) {
  currentSlide = (n + slides.length) % slides.length;
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === currentSlide));

  // play/pause video
  document.querySelectorAll('.carousel-slide').forEach((sl, i) => {
    const vid = sl.querySelector('video');
    if (vid) { i === currentSlide ? vid.play().catch(() => {}) : vid.pause(); }
  });

  // progress bar
  progressBar.style.transition = 'none';
  progressBar.style.width = '0%';
  setTimeout(() => {
    progressBar.style.transition = 'width 5s linear';
    progressBar.style.width = '100%';
  }, 30);

  resetAutoSlide();
}

function resetAutoSlide() {
  clearInterval(autoSlide);
  autoSlide = setInterval(() => goToSlide(currentSlide + 1), 5000);
}

document.getElementById('prevBtn').addEventListener('click', () => goToSlide(currentSlide - 1));
document.getElementById('nextBtn').addEventListener('click', () => goToSlide(currentSlide + 1));

// drag/swipe on hero
let dragStart = 0;
track.addEventListener('mousedown', e => { dragStart = e.clientX; });
track.addEventListener('mouseup', e => { if (e.clientX - dragStart < -50) goToSlide(currentSlide + 1); else if (e.clientX - dragStart > 50) goToSlide(currentSlide - 1); });
track.addEventListener('touchstart', e => { dragStart = e.touches[0].clientX; }, { passive: true });
track.addEventListener('touchend', e => { const diff = e.changedTouches[0].clientX - dragStart; if (Math.abs(diff) > 40) goToSlide(currentSlide + (diff < 0 ? 1 : -1)); });

buildCarousel();

// ── GALLERY ───────────────────────────────────────
// Shows 3 cards on desktop, 2 on mobile.
// Prev/Next buttons advance exactly 1 card at a time.
(function () {
  const wrap    = document.querySelector('.gallery-track-wrap');
  const track   = document.getElementById('galleryTrack');
  const prevBtn = document.getElementById('gallPrev');
  const nextBtn = document.getElementById('gallNext');
  if (!wrap || !track || !prevBtn || !nextBtn) return;

  const VISIBLE_DESKTOP = 3;
  const VISIBLE_MOBILE  = 2;
  let currentIndex = 0;

  function visibleCount() {
    return window.innerWidth <= 768 ? VISIBLE_MOBILE : VISIBLE_DESKTOP;
  }

  function cardWidth() {
    const item = track.querySelector('.gallery-item');
    if (!item) return 0;
    const gap = window.innerWidth <= 768 ? 16 : 24;
    return item.offsetWidth + gap;
  }

  function totalCards() {
    return track.querySelectorAll('.gallery-item').length;
  }

  function maxIndex() {
    return Math.max(0, totalCards() - visibleCount());
  }

  function goTo(index) {
    currentIndex = Math.max(0, Math.min(index, maxIndex()));
    track.style.transform = `translateX(-${currentIndex * cardWidth()}px)`;
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= maxIndex();
  }

  prevBtn.addEventListener('click', () => goTo(currentIndex - 1));
  nextBtn.addEventListener('click', () => goTo(currentIndex + 1));

  // Reset on resize
  window.addEventListener('resize', () => goTo(Math.min(currentIndex, maxIndex())));

  // Init
  goTo(0);
})();

// ── TESTIMONIALS ──────────────────────────────────
const testimonialTrack = document.getElementById('testimonialTrack');
const testDots = document.getElementById('testDots');
let testimonialIdx = 0;
const totalTestimonials = testimonialTrack.children.length;

function buildTestDots() {
  testDots.innerHTML = '';
  for (let i = 0; i < totalTestimonials; i++) {
    const d = document.createElement('div');
    d.className = 't-dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goToTestimonial(i));
    testDots.appendChild(d);
  }
}
function goToTestimonial(n) {
  testimonialIdx = (n + totalTestimonials) % totalTestimonials;
  testimonialTrack.style.transform = `translateX(-${testimonialIdx * 100}%)`;
  document.querySelectorAll('.t-dot').forEach((d, i) => d.classList.toggle('active', i === testimonialIdx));
}
document.getElementById('testPrev').addEventListener('click', () => goToTestimonial(testimonialIdx - 1));
document.getElementById('testNext').addEventListener('click', () => goToTestimonial(testimonialIdx + 1));
buildTestDots();
setInterval(() => goToTestimonial(testimonialIdx + 1), 7000);

} // end IS_SITE (navbar, carousel, gallery, testimonials)

// ── CALENDAR ─────────────────────────────────────
let calDate = new Date();
let selectedDay = null;
let selectedTime = null;

function getSlots() {
  const slots = [];
  const [fH, fM] = config.firstSlot.split(':').map(Number);
  const [lH, lM] = config.lastSlot.split(':').map(Number);
  const dur = config.appointmentDuration;
  let cursor = fH * 60 + fM;
  const end = lH * 60 + lM;
  while (cursor + dur <= end) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    cursor += dur;
  }
  return slots;
}

function isAvailableDay(date) {
  return config.availableDays.includes(date.getDay());
}

function getApptFor(dateStr) {
  return appointments.filter(a => a.date === dateStr);
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  const label = document.getElementById('calMonthYear');
  grid.innerHTML = '';

  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (label) label.textContent = `${months[m]} ${y}`;

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEl = document.createElement('div');
    dayEl.textContent = d;
    dayEl.className = 'cal-day';

    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isAvail = isAvailableDay(date);
    const appts = getApptFor(dateStr);

    if (isPast || !isAvail) { dayEl.classList.add('disabled'); }
    else {
      dayEl.classList.add('available');
      if (appts.length > 0) dayEl.classList.add('has-appointments');
      if (selectedDay === dateStr) dayEl.classList.add('selected');
      dayEl.addEventListener('click', () => selectDay(dateStr, d));
    }
    if (date.toDateString() === today.toDateString()) dayEl.classList.add('today');
    grid.appendChild(dayEl);
  }
}

function selectDay(dateStr, dayNum) {
  selectedDay = dateStr;
  selectedTime = null;
  renderCalendar();
  renderTimeSlots();
  const bf = document.getElementById('bookingForm');
  if (bf) bf.style.display = 'none';
  const d = new Date(dateStr + 'T00:00:00');
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const lbl = document.getElementById('selectedDateLabel');
  if (lbl) lbl.textContent = d.toLocaleDateString('es-PE', opts);
}

function renderTimeSlots() {
  const container = document.getElementById('timeSlots');
  if (!container) return;
  container.innerHTML = '';
  if (!selectedDay) return;

  const slots = getSlots();
  const existing = getApptFor(selectedDay);

  slots.forEach(time => {
    const btn = document.createElement('button');
    btn.className = 'time-slot';
    btn.type = 'button';
    btn.textContent = time;

    const isBooked = existing.some(a => a.time === time);
    if (isBooked) {
      btn.classList.add('booked');
      btn.disabled = true;
      btn.setAttribute('aria-label', `${time} — ocupado`);
    } else {
      btn.setAttribute('aria-label', `Seleccionar horario ${time}`);
      if (selectedTime === time) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        selectedTime = time;
        document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
        btn.classList.add('selected');
        const bf = document.getElementById('bookingForm');
        if (bf) { bf.style.display = 'flex'; bf.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      });
    }
    container.appendChild(btn);
  });
}

function renderAgenda() {
  const list = document.getElementById('agendaList');
  if (!list) return;
  const month = `${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,'0')}`;
  const monthly = appointments
    .filter(a => a.date && a.date.startsWith(month))
    .sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  if (monthly.length === 0) {
    list.innerHTML = '<p class="agenda-empty">No hay citas este mes.</p>';
    return;
  }

  list.innerHTML = monthly.map(a => {
    const sessionLabel = a.sessionNum ? `Cita #${a.sessionNum}` : 'Cita';
    const syncBadge    = a.syncStatus === 'pending'
      ? `<span class="sync-badge pending">⏳ Pendiente</span>`
      : `<span class="sync-badge synced">☁️ Nube</span>`;
    return `
    <div class="agenda-item">
      <button class="ai-delete" data-id="${a.id}" data-fsid="${a.firestoreId || ''}" title="Eliminar">✕</button>
      <div class="ai-session">${sanitize(sessionLabel)} ${syncBadge}</div>
      <div class="ai-date">${sanitize(a.date)} · ${sanitize(a.time)}</div>
      <div class="ai-name">${sanitize(a.name)}</div>
      <div class="ai-service">${sanitize(a.service)}</div>
      <span class="ai-duration">⏱ ${sanitize(String(a.duration))} min</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.ai-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteAppointment(Number(btn.dataset.id), btn.dataset.fsid));
  });
}

async function deleteAppointment(id, firestoreId) {
  try {
    if (fbRemoveAppointment && firestoreId) {
      await fbRemoveAppointment(firestoreId);
      appointments = await fbFetchAppointments();
    } else {
      appointments = appointments.filter(a => a.id !== id);
      Store.set('appointments', appointments);
    }
  } catch (e) {
    console.error('Error eliminando cita:', e);
    showNotification('❌ Error al eliminar la cita.', 'error');
    return;
  }
  renderCalendar();
  renderAgenda();
  renderAdminAgenda();
  showNotification('Cita eliminada.', 'success');
}

// ── CALENDAR EVENT LISTENERS (site only) ─────────
if (IS_SITE) {
  const calPrevBtn = document.getElementById('calPrev');
  const calNextBtn = document.getElementById('calNext');
  const confirmBtn = document.getElementById('confirmBtn');

  if (calPrevBtn) calPrevBtn.addEventListener('click', () => {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
    renderCalendar(); renderAgenda();
  });
  if (calNextBtn) calNextBtn.addEventListener('click', () => {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
    renderCalendar(); renderAgenda();
  });

  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    const name    = document.getElementById('bName').value.trim();
    const phone   = document.getElementById('bPhone').value.trim();
    const email   = document.getElementById('bEmail').value.trim();
    const service = document.getElementById('bService').value;

    if (!name || !phone || !service || !selectedDay || !selectedTime) {
      showNotification('Por favor completa todos los campos requeridos.', 'error');
      return;
    }

    const existingForPhone = appointments.filter(a =>
      a.phone.replace(/\D/g,'') === phone.replace(/\D/g,'')
    );
    const sessionNum = existingForPhone.length + 1;

    const appt = {
      id: Date.now(), sessionNum,
      date: selectedDay, time: selectedTime,
      name, phone, email, service,
      duration:   config.appointmentDuration,
      notes:      document.getElementById('bNotes').value.trim(),
      createdAt:  new Date().toISOString(),
      syncStatus: 'pending'
    };

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Guardando…';

    if (fbSaveAppointment) {
      try {
        const firestoreId = await fbSaveAppointment(appt);
        appt.firestoreId = firestoreId;
        appt.syncStatus  = 'synced';
        appointments = await fbFetchAppointments();
        showNotification(`✅ Cita ${sessionNum} confirmada para ${selectedDay} a las ${appt.time}`, 'success');
      } catch (e) {
        appt.syncStatus = 'pending';
        addToPendingQueue(appt);
        appointments.push(appt);
        Store.set('appointments', appointments);
        showNotification(`⚠️ Cita guardada localmente. Se sincronizará pronto.`, 'success');
      }
    } else {
      appt.syncStatus = 'pending';
      addToPendingQueue(appt);
      appointments.push(appt);
      Store.set('appointments', appointments);
      showNotification(`⚠️ Cita guardada localmente. Se sincronizará pronto.`, 'success');
    }

    ['bName','bPhone','bEmail','bService','bNotes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('bookingForm').style.display = 'none';
    selectedTime = null;
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirmar Reserva';

    renderCalendar(); renderTimeSlots(); renderAgenda(); renderAdminAgenda();
  });

  renderCalendar();
} // end IS_SITE calendar listeners

// ── STAFF DATA ────────────────────────────────────
let staffMembers = Store.get('staff', [
  { id: 1, name: 'Dr. Alejandro Ríos',   role: 'Odontólogo General & Implantólogo', badge: 'Director',    desc: '15 años de experiencia. Especialista en implantes y rehabilitación oral por la UPCH. Certificado en Implantología Avanzada — ICOI.', tags: ['Implantes','Cirugía','Estética'],   photo: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80' },
  { id: 2, name: 'Dra. Valeria Soto',    role: 'Ortodoncista',                       badge: 'Especialista', desc: 'Especialista en Ortodoncia por la PUCP. Certificada en alineadores Invisalign y técnica de arco recto prescripción MBT.',           tags: ['Ortodoncia','Invisalign'],          photo: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&q=80' },
  { id: 3, name: 'Dr. Carlos Menéndez',  role: 'Endodoncista',                       badge: 'Especialista', desc: 'Posgrado en Endodoncia, UNMSM. Tratamiento de conductos con tecnología rotativa de última generación.',                           tags: ['Endodoncia','Dolor dental'],        photo: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=400&q=80' },
  { id: 4, name: 'Sofía Vargas',         role: 'Asistente Dental Senior',            badge: '',             desc: '8 años apoyando procedimientos clínicos. Especialista en esterilización y asistencia en cirugías implantológicas.',               tags: ['Asistencia','Esterilización'],      photo: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400&q=80' },
  { id: 5, name: 'María Torres',         role: 'Recepcionista & Coordinadora',       badge: '',             desc: 'Gestión de agenda, atención al paciente y coordinación de tratamientos con más de 5 años en la clínica.',                         tags: ['Atención','Agenda'],               photo: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&q=80' }
]);

// Render staff cards on the public page
function renderStaff() {
  const grid = document.getElementById('staffGrid');
  if (!grid) return;
  grid.innerHTML = '';
  staffMembers.forEach(m => {
    const card = document.createElement('div');
    card.className = 'staff-card' + (m.badge ? '' : ' staff-card--assistant');

    const tagsHtml = (m.tags || []).map(t => `<span>${sanitize(t)}</span>`).join('');
    card.innerHTML = `
      <div class="staff-photo-wrap">
        <img src="${sanitize(m.photo)}" alt="${sanitize(m.name)}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80'"/>
        ${m.badge ? `<div class="staff-badge">${sanitize(m.badge)}</div>` : ''}
      </div>
      <div class="staff-info">
        <h3>${sanitize(m.name)}</h3>
        <span class="staff-role">${sanitize(m.role)}</span>
        <p>${sanitize(m.desc)}</p>
        <div class="staff-tags">${tagsHtml}</div>
      </div>`;
    grid.appendChild(card);
  });

  // Re-attach scroll reveal to new cards (revealObs may not exist yet on first render)
  if (typeof revealObs !== 'undefined') {
    grid.querySelectorAll('.staff-card').forEach(el => {
      el.classList.add('reveal');
      revealObs.observe(el);
    });
  }
}

// Render staff list in admin panel
function renderAdminStaff() {
  const container = document.getElementById('staffAdminList');
  if (!container) return;
  container.innerHTML = '';

  staffMembers.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = 'staff-admin-item';
    item.innerHTML = `
      <div class="staff-admin-preview">
        <img src="${sanitize(m.photo)}" alt="${sanitize(m.name)}"
             onerror="this.src='https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80'"/>
        <div>
          <div class="staff-admin-name">${sanitize(m.name)}</div>
          <div class="staff-admin-role">${sanitize(m.role)}</div>
        </div>
      </div>
      <div class="staff-admin-actions">
        <button class="staff-edit-btn" data-idx="${idx}" title="Editar">✏️</button>
        <button class="staff-delete-btn" data-idx="${idx}" title="Eliminar">✕</button>
      </div>`;

    // Edit: expand inline form
    item.querySelector('.staff-edit-btn').addEventListener('click', () => {
      // Remove any open edit forms
      document.querySelectorAll('.staff-edit-form').forEach(f => f.remove());
      document.querySelectorAll('.staff-edit-btn').forEach(b => b.textContent = '✏️');

      const btn = item.querySelector('.staff-edit-btn');
      btn.textContent = '▲';

      const form = document.createElement('div');
      form.className = 'staff-edit-form';
      form.innerHTML = `
        <label>Nombre<input type="text" class="ef-name" value="${sanitize(m.name)}" /></label>
        <label>Rol<input type="text" class="ef-role" value="${sanitize(m.role)}" /></label>
        <label>Badge<input type="text" class="ef-badge" value="${sanitize(m.badge)}" placeholder="Director, Especialista…" /></label>
        <label>Descripción<input type="text" class="ef-desc" value="${sanitize(m.desc)}" /></label>
        <label>Tags (coma)<input type="text" class="ef-tags" value="${sanitize((m.tags||[]).join(', '))}" /></label>
        <label>URL Foto<input type="url" class="ef-photo" value="${sanitize(m.photo)}" /></label>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button class="admin-btn ef-save" style="flex:1">Guardar</button>
          <button class="admin-btn ef-cancel" style="flex:1;background:rgba(255,255,255,0.1);color:#fff">Cancelar</button>
        </div>`;

      item.appendChild(form);

      form.querySelector('.ef-cancel').addEventListener('click', () => {
        form.remove();
        btn.textContent = '✏️';
      });

      form.querySelector('.ef-save').addEventListener('click', () => {
        staffMembers[idx] = {
          ...staffMembers[idx],
          name:  form.querySelector('.ef-name').value.trim(),
          role:  form.querySelector('.ef-role').value.trim(),
          badge: form.querySelector('.ef-badge').value.trim(),
          desc:  form.querySelector('.ef-desc').value.trim(),
          tags:  form.querySelector('.ef-tags').value.split(',').map(t => t.trim()).filter(Boolean),
          photo: form.querySelector('.ef-photo').value.trim()
        };
        Store.set('staff', staffMembers);
        syncStaffToFirestore();
        renderStaff();
        renderAdminStaff();
        showNotification('✅ Miembro actualizado.', 'success');
      });
    });

    // Delete
    item.querySelector('.staff-delete-btn').addEventListener('click', () => {
      if (staffMembers.length <= 1) { showNotification('Debe haber al menos un miembro.', 'error'); return; }
      staffMembers.splice(idx, 1);
      Store.set('staff', staffMembers);
      syncStaffToFirestore();
      renderStaff();
      renderAdminStaff();
      showNotification('Miembro eliminado.', 'success');
    });

    container.appendChild(item);
  });
}

// Add new staff member — only on cpanel.html
if (document.getElementById('addStaffBtn')) {
  document.getElementById('addStaffBtn').addEventListener('click', () => {
    const name  = document.getElementById('newStaffName').value.trim();
    const role  = document.getElementById('newStaffRole').value.trim();
    const badge = document.getElementById('newStaffBadge').value.trim();
    const desc  = document.getElementById('newStaffDesc').value.trim();
    const tags  = document.getElementById('newStaffTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const photo = document.getElementById('newStaffPhoto').value.trim();

    if (!name || !role) { showNotification('Nombre y rol son requeridos.', 'error'); return; }

    staffMembers.push({ id: Date.now(), name, role, badge, desc, tags, photo: photo || 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80' });
    Store.set('staff', staffMembers);
    syncStaffToFirestore();
    renderStaff();
    renderAdminStaff();

    ['newStaffName','newStaffRole','newStaffBadge','newStaffDesc','newStaffTags','newStaffPhoto'].forEach(id => {
      document.getElementById(id).value = '';
    });
    showNotification('✅ Miembro agregado.', 'success');
  });
}

// ── SCROLL REVEAL ─────────────────────────────────
// Note: .gallery-item is excluded — it's inside overflow:hidden containers
// and the translateY reveal would clip them. They're always visible.
const revealEls = document.querySelectorAll('.service-card, .testimonial-card, .section-header, .contact-item');
revealEls.forEach(el => el.classList.add('reveal'));

const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
}, { threshold: 0.12 });
revealEls.forEach(el => revealObs.observe(el));

// Render staff now that revealObs exists so cards get scroll-reveal
renderStaff();

// ── ADMIN DATA LOADER ─────────────────────────────
// Used by cpanel.js to populate form fields
function loadAdminData() {
  const f = (id) => document.getElementById(id);
  if (!f('adClinicName')) return; // not on cpanel page
  f('adClinicName').value  = config.clinicName;
  f('adSlogan').value      = config.slogan;
  f('adPhone').value       = config.phone;
  f('adEmail').value       = config.email;
  f('adAddress').value     = config.address;
  f('adPrimaryColor').value = config.primaryColor;
  f('adAccentColor').value  = config.accentColor;
  f('adApptDuration').value = config.appointmentDuration;
  f('adFirstSlot').value   = config.firstSlot;
  f('adLastSlot').value    = config.lastSlot;
  document.querySelectorAll('#dayCheckboxes input').forEach(cb => {
    cb.checked = config.availableDays.includes(Number(cb.value));
  });
}

// Save listeners are now in cpanel.js (imported as ES module)

function renderAdminSlides() {
  const list = document.getElementById('slidesList');
  if (!list) return;
  // FIX: build DOM nodes instead of raw innerHTML to prevent XSS from stored slide data
  list.innerHTML = '';
  slides.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'slide-admin-item';

    const infoDiv = document.createElement('div');

    const badge = document.createElement('span');
    badge.className = `slide-type-badge ${s.type}`;
    badge.textContent = s.type === 'video' ? '🎥 Video' : '🖼️ Imagen';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'slide-title';
    titleDiv.style.marginTop = '4px';
    titleDiv.textContent = s.title; // safe: textContent, not innerHTML

    infoDiv.appendChild(badge);
    infoDiv.appendChild(titleDiv);

    const delBtn = document.createElement('button');
    delBtn.className = 'slide-delete-btn';
    delBtn.title = 'Eliminar slide';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      slides.splice(i, 1);
      Store.set('slides', slides);
      syncSlidesToFirestore();
      buildCarousel();
      renderAdminSlides();
      showNotification('Slide eliminado.', 'success');
    });

    item.appendChild(infoDiv);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

if (document.getElementById('newSlideType')) {
  document.getElementById('newSlideType').addEventListener('change', function() {
    document.getElementById('newSlideVideoLabel').style.display = this.value === 'video' ? 'block' : 'none';
  });
}

if (document.getElementById('addSlideBtn')) {
  document.getElementById('addSlideBtn').addEventListener('click', () => {
    const type     = document.getElementById('newSlideType').value;
    const title    = document.getElementById('newSlideTitle').value.trim();
    const subtitle = document.getElementById('newSlideSubtitle').value.trim();
    const videoUrl = document.getElementById('newSlideVideoUrl') ? document.getElementById('newSlideVideoUrl').value.trim() : '';
    const imgUrl   = document.getElementById('newSlideImgUrl')   ? document.getElementById('newSlideImgUrl').value.trim()   : '';
    const bg       = document.getElementById('newSlideBg').value;

    if (!title) { showNotification('El título es requerido.', 'error'); return; }

    slides.push({ id: Date.now(), type, title, subtitle, bg, videoUrl, imgUrl });
    Store.set('slides', slides);
    syncSlidesToFirestore();
    renderAdminSlides();
    document.getElementById('newSlideTitle').value = '';
    document.getElementById('newSlideSubtitle').value = '';
    if (document.getElementById('newSlideVideoUrl')) document.getElementById('newSlideVideoUrl').value = '';
    if (document.getElementById('newSlideImgUrl'))   document.getElementById('newSlideImgUrl').value   = '';
    showNotification('✅ Slide agregado. Recarga el sitio para verlo.', 'success');
  });
}

function renderAdminAgenda() {
  const container = document.getElementById('adminAgenda');
  if (!container) return;

  const pending = getPendingQueue();
  const pendingBanner = pending.length > 0
    ? `<div class="pending-banner">⏳ ${pending.length} cita(s) pendiente(s) de sincronizar con Firebase
       <button onclick="flushPendingQueue()" style="margin-left:0.75rem;background:var(--accent);color:var(--dark);border:none;border-radius:6px;padding:0.25rem 0.75rem;cursor:pointer;font-weight:700;font-size:0.75rem">Reintentar ahora</button>
       </div>`
    : '';

  if (appointments.length === 0 && !pending.length) {
    container.innerHTML = pendingBanner + '<p style="color:rgba(255,255,255,0.4);font-size:0.82rem">No hay citas registradas.</p>';
    return;
  }

  const sorted = [...appointments].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const rows = sorted.map(a => {
    const sessionLabel = a.sessionNum ? `#${a.sessionNum}` : '';
    const syncIcon     = a.syncStatus === 'pending' ? '⏳' : '☁️';
    return `
    <div class="admin-agenda-item">
      <div class="aai-date">${syncIcon} ${sanitize(a.date)} · ${sanitize(a.time)} · ${sanitize(String(a.duration))} min ${sessionLabel ? `· <strong>${sanitize(sessionLabel)}</strong>` : ''}</div>
      <div class="aai-name">${sanitize(a.name)} — ${sanitize(a.service)}</div>
    </div>`;
  }).join('');

  container.innerHTML = pendingBanner + rows;
}

// ── PATIENT HISTORY (cpanel only) ────────────────
async function renderPatientHistory() {
  const container = document.getElementById('patientHistory');
  if (!container) return;

  container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.82rem">Cargando historial…</p>';

  try {
    if (!fbFetchPatients) throw new Error('Firebase no disponible');
    const patients = await fbFetchPatients();

    if (!patients.length) {
      container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.82rem">No hay pacientes registrados aún.</p>';
      return;
    }

    container.innerHTML = '';
    patients
      .sort((a,b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))
      .forEach(p => {
        const citas = (p.citas || []).sort((a,b) => a.date.localeCompare(b.date));
        const card  = document.createElement('div');
        card.className = 'patient-card';
        card.innerHTML = `
          <div class="patient-header" onclick="this.parentElement.classList.toggle('open')">
            <div class="patient-info">
              <div class="patient-name">${sanitize(p.name)}</div>
              <div class="patient-meta">${sanitize(p.phone)} ${p.email ? '· ' + sanitize(p.email) : ''}</div>
            </div>
            <div class="patient-stats">
              <span class="cita-count">${citas.length} cita${citas.length !== 1 ? 's' : ''}</span>
              <span class="patient-chevron">▼</span>
            </div>
          </div>
          <div class="patient-citas">
            ${citas.map((c, i) => `
              <div class="patient-cita-row">
                <span class="cita-num">Cita #${i+1}</span>
                <span class="cita-date">${sanitize(c.date)} ${sanitize(c.time)}</span>
                <span class="cita-service">${sanitize(c.service)}</span>
                <span class="cita-dur">⏱ ${sanitize(String(c.duration))} min</span>
                ${c.notes ? `<span class="cita-notes">📝 ${sanitize(c.notes)}</span>` : ''}
              </div>`).join('')}
          </div>`;
        container.appendChild(card);
      });
  } catch (e) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.4);font-size:0.82rem">No se pudo cargar el historial: ${e.message}</p>`;
  }
}

// ── NOTIFICATION ──────────────────────────────────
function showNotification(msg, type = 'success') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = 'notification ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── APPLY SAVED COLORS + CONFIG ──────────────────
// applyConfig is imported from store.js
applyConfig();

if (IS_SITE) {
  // ── SMOOTH SCROLL for anchor links ───────────────
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // ── CONTACT FORM ─────────────────────────────────
  const btnSend = document.querySelector('.btn-send');
  if (btnSend) btnSend.addEventListener('click', () => {
    const nameEl  = document.querySelector('.contact-form-mini input[type="text"]');
    const emailEl = document.querySelector('.contact-form-mini input[type="email"]');
    const msgEl   = document.querySelector('.contact-form-mini textarea');
    const name  = nameEl.value.trim();
    const email = emailEl.value.trim();
    const msg   = msgEl.value.trim();
    if (!name || !email || !msg) {
      showNotification('Por favor completa todos los campos del formulario.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showNotification('Por favor ingresa un correo electrónico válido.', 'error');
      return;
    }
    nameEl.value = ''; emailEl.value = ''; msgEl.value = '';
    showNotification('✅ Mensaje enviado. Te contactaremos pronto.', 'success');
  });
} // end IS_SITE (smooth scroll + contact form)

console.log('DentalPro loaded ✦');

// ── INIT FIREBASE (citas en la nube) ──────────────
initFirebase();

// ── FIRESTORE SYNC HELPERS ────────────────────────

/** Sync slides array to Firestore */
async function syncSlidesToFirestore() {
  try {
    const { saveSlides } = await import('./firebase.js');
    await saveSlides([...slides]);
  } catch (e) {
    console.warn('Could not sync slides to Firestore:', e.message);
  }
}

/** Sync staff array to Firestore */
async function syncStaffToFirestore() {
  try {
    const { saveStaff } = await import('./firebase.js');
    await saveStaff([...staffMembers]);
  } catch (e) {
    console.warn('Could not sync staff to Firestore:', e.message);
  }
}

// ── EXPORTS for cpanel.js ─────────────────────────
export {
  slides, staffMembers, appointments,
  loadAdminData, renderAdminSlides, renderAdminAgenda,
  renderAdminStaff, renderPatientHistory, renderStaff,
  renderCalendar, renderAgenda, showNotification,
  fbFetchPatients, flushPendingQueue, getPendingQueue,
  syncSlidesToFirestore, syncStaffToFirestore
};
