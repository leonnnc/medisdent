/**
 * firebase.js
 * Firebase Firestore: citas + historial de pacientes + config del sitio
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  setDoc,
  getDoc,
  doc,
  query,
  orderBy,
  where,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCtmPx9ee1t0prF3FZxPF38tgTRYNfUT6I",
  authDomain:        "medisdent-c1285.firebaseapp.com",
  projectId:         "medisdent-c1285",
  storageBucket:     "medisdent-c1285.firebasestorage.app",
  messagingSenderId: "735775868889",
  appId:             "1:735775868889:web:dd58f12f1c7132594afbc8"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

const CITAS_COL    = 'citas';
const PATIENTS_COL = 'pacientes';
const SITE_DOC     = 'siteData';   // single document in 'settings' collection
const SETTINGS_COL = 'settings';

// ── SITE CONFIG ───────────────────────────────────

/**
 * Fetch site config from Firestore.
 * Returns null if not found (use localStorage defaults).
 */
export async function fetchSiteConfig() {
  const snap = await getDoc(doc(db, SETTINGS_COL, SITE_DOC));
  return snap.exists() ? snap.data() : null;
}

/**
 * Save site config to Firestore (merges with existing).
 */
export async function saveSiteConfig(configData) {
  await setDoc(doc(db, SETTINGS_COL, SITE_DOC), {
    ...configData,
    updatedAt: Timestamp.now()
  });
}

// ── SLIDES ────────────────────────────────────────

export async function fetchSlides() {
  const snap = await getDoc(doc(db, SETTINGS_COL, 'slides'));
  return snap.exists() ? snap.data().slides : null;
}

export async function saveSlides(slides) {
  await setDoc(doc(db, SETTINGS_COL, 'slides'), {
    slides,
    updatedAt: Timestamp.now()
  });
}

// ── STAFF ─────────────────────────────────────────

export async function fetchStaff() {
  const snap = await getDoc(doc(db, SETTINGS_COL, 'staff'));
  return snap.exists() ? snap.data().members : null;
}

export async function saveStaff(members) {
  await setDoc(doc(db, SETTINGS_COL, 'staff'), {
    members,
    updatedAt: Timestamp.now()
  });
}

// ── CITAS ─────────────────────────────────────────

/**
 * Guarda una cita y actualiza el historial del paciente.
 */
export async function saveAppointment(appt) {
  const docRef = await addDoc(collection(db, CITAS_COL), {
    ...appt,
    syncedAt: Timestamp.now()
  });
  const firestoreId = docRef.id;
  await upsertPatient(appt, firestoreId);
  return firestoreId;
}

export async function fetchAppointments() {
  const q    = query(collection(db, CITAS_COL), orderBy('date'), orderBy('time'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
}

export async function removeAppointment(firestoreId) {
  await deleteDoc(doc(db, CITAS_COL, firestoreId));
}

// ── PACIENTES / HISTORIAL ─────────────────────────

async function upsertPatient(appt, citaFirestoreId) {
  const phoneKey = appt.phone.replace(/\D/g, '');
  const q = query(
    collection(db, PATIENTS_COL),
    where('phoneKey', '==', phoneKey)
  );
  const snap = await getDocs(q);

  const citaEntry = {
    firestoreId: citaFirestoreId,
    date:        appt.date,
    time:        appt.time,
    service:     appt.service,
    duration:    appt.duration,
    notes:       appt.notes || '',
    createdAt:   appt.createdAt
  };

  if (snap.empty) {
    await addDoc(collection(db, PATIENTS_COL), {
      name:      appt.name,
      phone:     appt.phone,
      phoneKey,
      email:     appt.email || '',
      citas:     [citaEntry],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  } else {
    const patDoc  = snap.docs[0];
    const patData = patDoc.data();
    const citas   = patData.citas || [];
    citas.push(citaEntry);
    await updateDoc(doc(db, PATIENTS_COL, patDoc.id), {
      citas,
      email:     appt.email || patData.email,
      updatedAt: Timestamp.now()
    });
  }
}

export async function fetchPatients() {
  const snap = await getDocs(collection(db, PATIENTS_COL));
  return snap.docs.map(d => ({ patientId: d.id, ...d.data() }));
}

export { db };
