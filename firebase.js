/**
 * DentalPro — firebase.js
 * Firebase Firestore: citas + historial de pacientes
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
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

// ── CITAS ─────────────────────────────────────────

/**
 * Guarda una cita y actualiza el historial del paciente.
 * Retorna el firestoreId de la cita.
 */
export async function saveAppointment(appt) {
  // 1. Save the appointment
  const docRef = await addDoc(collection(db, CITAS_COL), {
    ...appt,
    syncedAt: Timestamp.now()
  });
  const firestoreId = docRef.id;

  // 2. Upsert patient history
  await upsertPatient(appt, firestoreId);

  return firestoreId;
}

/**
 * Obtiene todas las citas ordenadas por fecha y hora.
 */
export async function fetchAppointments() {
  const q    = query(collection(db, CITAS_COL), orderBy('date'), orderBy('time'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
}

/**
 * Elimina una cita por su firestoreId.
 */
export async function removeAppointment(firestoreId) {
  await deleteDoc(doc(db, CITAS_COL, firestoreId));
}

// ── PACIENTES / HISTORIAL ─────────────────────────

/**
 * Crea o actualiza el perfil del paciente con la nueva cita.
 * La clave de identificación es el teléfono (normalizado).
 */
async function upsertPatient(appt, citaFirestoreId) {
  const phoneKey = appt.phone.replace(/\D/g, ''); // digits only
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
    // New patient
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
    // Existing patient — append cita
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

/**
 * Obtiene todos los pacientes con su historial completo.
 */
export async function fetchPatients() {
  const snap = await getDocs(collection(db, PATIENTS_COL));
  return snap.docs.map(d => ({ patientId: d.id, ...d.data() }));
}

export { db };
