// State
let sessionId = localStorage.getItem('sessionId');
let userName = localStorage.getItem('userName');
let isAdmin = localStorage.getItem('isAdmin') === 'true';

// DOM Elements
const views = {
  login: document.getElementById('login-view'),
  erfassung: document.getElementById('erfassung-view'),
  admin: document.getElementById('admin-view')
};

// Helper: API-Aufruf
async function api(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (sessionId) {
    options.headers['X-Session-ID'] = sessionId;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch('/api' + endpoint, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Fehler');
  }

  return data;
}

// Helper: View wechseln
function showView(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
}

// Helper: Formatierung (Österreich)

// DD.MM.YYYY -> YYYY-MM-DD (für API)
function parseATDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// YYYY-MM-DD -> DD.MM.YYYY (für Anzeige)
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Heutiges Datum im AT-Format
function getTodayAT() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatTime(timeStr) {
  return timeStr + ' Uhr';
}

function calculateNetto(beginn, ende, pause) {
  const [bH, bM] = beginn.split(':').map(Number);
  const [eH, eM] = ende.split(':').map(Number);
  const minuten = (eH * 60 + eM) - (bH * 60 + bM) - pause;
  const stunden = Math.floor(minuten / 60);
  const restMin = minuten % 60;
  return `${stunden}:${String(restMin).padStart(2, '0')} Std`;
}

function formatNettoDecimal(beginn, ende, pause) {
  const [bH, bM] = beginn.split(':').map(Number);
  const [eH, eM] = ende.split(':').map(Number);
  const minuten = (eH * 60 + eM) - (bH * 60 + bM) - pause;
  return (minuten / 60).toFixed(2).replace('.', ',');
}

// ==================== LOGIN ====================

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  const mitarbeiter_nr = document.getElementById('mitarbeiter_nr').value;
  const pin = document.getElementById('pin').value;

  try {
    const result = await api('/login', 'POST', { mitarbeiter_nr, pin });
    sessionId = result.sessionId;
    userName = result.name;
    isAdmin = result.ist_admin;

    localStorage.setItem('sessionId', sessionId);
    localStorage.setItem('userName', userName);
    localStorage.setItem('isAdmin', isAdmin);

    initErfassungView();
    showView('erfassung');
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

// ==================== ERFASSUNG ====================

function initErfassungView() {
  document.getElementById('user-name').textContent = `Hallo, ${userName}`;
  document.getElementById('show-admin-btn').classList.toggle('hidden', !isAdmin);

  // Datum auf heute setzen via Flatpickr
  if (datumPicker) {
    datumPicker.setDate('today');
  } else {
    document.getElementById('datum').value = getTodayAT();
  }
}

document.getElementById('zeit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('zeit-message');
  messageEl.textContent = '';
  messageEl.className = 'message';

  const data = {
    datum: parseATDate(document.getElementById('datum').value),
    arbeitsbeginn: document.getElementById('arbeitsbeginn').value,
    arbeitsende: document.getElementById('arbeitsende').value,
    pause_minuten: parseInt(document.getElementById('pause_minuten').value) || 0,
    baustelle: document.getElementById('baustelle').value,
    kunde: document.getElementById('kunde').value,
    anfahrt: document.getElementById('anfahrt').value,
    notizen: document.getElementById('notizen').value
  };

  try {
    const result = await api('/zeiteintraege', 'POST', data);
    messageEl.textContent = 'Eintrag gespeichert!';
    messageEl.className = 'message success';

    if (result.warnung) {
      messageEl.textContent += ' ' + result.warnung;
      messageEl.className = 'message warning';
    }

    // Formular zurücksetzen (außer Datum)
    document.getElementById('arbeitsbeginn').value = '';
    document.getElementById('arbeitsende').value = '';
    document.getElementById('pause_minuten').value = '30';
    document.getElementById('baustelle').value = '';
    document.getElementById('kunde').value = '';
    document.getElementById('anfahrt').value = '';
    document.getElementById('notizen').value = '';

    // History aktualisieren falls sichtbar
    if (!document.getElementById('history-section').classList.contains('hidden')) {
      loadHistory();
    }
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

// History anzeigen
document.getElementById('show-history-btn').addEventListener('click', async () => {
  const section = document.getElementById('history-section');
  section.classList.toggle('hidden');

  if (!section.classList.contains('hidden')) {
    await loadHistory();
  }
});

async function loadHistory() {
  try {
    const eintraege = await api('/zeiteintraege');
    const listEl = document.getElementById('history-list');

    if (eintraege.length === 0) {
      listEl.innerHTML = '<p>Noch keine Einträge vorhanden.</p>';
      return;
    }

    listEl.innerHTML = eintraege.map(e => `
      <div class="history-item">
        <div class="history-date">${formatDate(e.datum)}</div>
        <div class="history-time">
          ${e.arbeitsbeginn} Uhr - ${e.arbeitsende} Uhr
          (Pause: ${e.pause_minuten} Min., Netto: ${calculateNetto(e.arbeitsbeginn, e.arbeitsende, e.pause_minuten)})
        </div>
        ${e.baustelle ? `<div class="history-detail"><strong>Baustelle:</strong> ${e.baustelle}</div>` : ''}
        ${e.kunde ? `<div class="history-detail"><strong>Kunde:</strong> ${e.kunde}</div>` : ''}
        ${e.anfahrt ? `<div class="history-detail"><strong>Anfahrt:</strong> ${e.anfahrt}</div>` : ''}
        ${e.notizen ? `<div class="history-detail"><strong>Notizen:</strong> ${e.notizen}</div>` : ''}
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

// Admin-Button
document.getElementById('show-admin-btn').addEventListener('click', () => {
  showView('admin');
  loadAdminData();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('admin-logout-btn').addEventListener('click', logout);

async function logout() {
  try {
    await api('/logout', 'POST');
  } catch (e) {}

  sessionId = null;
  userName = null;
  isAdmin = false;
  localStorage.removeItem('sessionId');
  localStorage.removeItem('userName');
  localStorage.removeItem('isAdmin');

  document.getElementById('mitarbeiter_nr').value = '';
  document.getElementById('pin').value = '';
  showView('login');
}

// ==================== ADMIN ====================

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
  });
});

// Zurück zur Erfassung
document.getElementById('back-to-erfassung-btn').addEventListener('click', () => {
  showView('erfassung');
});

async function loadAdminData() {
  await Promise.all([loadEintraege(), loadMitarbeiter()]);
}

async function loadEintraege() {
  const vonAT = document.getElementById('filter-von').value;
  const bisAT = document.getElementById('filter-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);

  let url = '/admin/zeiteintraege';
  const params = [];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (params.length) url += '?' + params.join('&');

  try {
    const eintraege = await api(url);
    const tbody = document.querySelector('#eintraege-table tbody');

    tbody.innerHTML = eintraege.map(e => `
      <tr>
        <td>${formatDate(e.datum)}</td>
        <td>${e.mitarbeiter_name} (${e.mitarbeiter_nr})</td>
        <td>${e.arbeitsbeginn} Uhr</td>
        <td>${e.arbeitsende} Uhr</td>
        <td>${e.pause_minuten} Min.</td>
        <td>${calculateNetto(e.arbeitsbeginn, e.arbeitsende, e.pause_minuten)}</td>
        <td>${e.baustelle || '-'}</td>
        <td>${e.kunde || '-'}</td>
        <td><button class="btn btn-small btn-danger" onclick="deleteEintrag(${e.id})">X</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

async function loadMitarbeiter() {
  try {
    const mitarbeiter = await api('/admin/mitarbeiter');
    const tbody = document.querySelector('#mitarbeiter-table tbody');

    tbody.innerHTML = mitarbeiter.map(m => `
      <tr>
        <td>${m.mitarbeiter_nr}</td>
        <td>${m.name}</td>
        <td>${m.ist_admin ? 'Ja' : 'Nein'}</td>
        <td>${m.aktiv ? 'Aktiv' : 'Inaktiv'}</td>
        <td>
          <button class="btn btn-small" onclick="resetPin(${m.id}, '${m.name}')">PIN ändern</button>
          ${!m.ist_admin ? `<button class="btn btn-small" onclick="toggleAktiv(${m.id}, ${m.aktiv})">${m.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

// Filter
document.getElementById('filter-btn').addEventListener('click', loadEintraege);

// Export
document.getElementById('export-btn').addEventListener('click', () => {
  const vonAT = document.getElementById('filter-von').value;
  const bisAT = document.getElementById('filter-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);

  let url = '/api/admin/export';
  const params = [];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (params.length) url += '?' + params.join('&');

  // Session-ID als URL-Parameter (für Download)
  url += (params.length ? '&' : '?') + `session=${sessionId}`;

  // Workaround: Fetch mit Header
  fetch(url, {
    headers: { 'X-Session-ID': sessionId }
  })
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `arbeitszeiten_${von || 'alle'}_${bis || 'alle'}.csv`;
      a.click();
    });
});

// Neuer Mitarbeiter
document.getElementById('new-mitarbeiter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('new-ma-message');
  messageEl.textContent = '';

  const data = {
    mitarbeiter_nr: document.getElementById('new-ma-nr').value,
    name: document.getElementById('new-ma-name').value,
    pin: document.getElementById('new-ma-pin').value
  };

  try {
    await api('/admin/mitarbeiter', 'POST', data);
    messageEl.textContent = 'Mitarbeiter angelegt!';
    messageEl.className = 'message success';

    document.getElementById('new-ma-nr').value = '';
    document.getElementById('new-ma-name').value = '';
    document.getElementById('new-ma-pin').value = '';

    loadMitarbeiter();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

// Globale Funktionen für onclick
window.deleteEintrag = async (id) => {
  if (!confirm('Eintrag wirklich löschen?')) return;

  try {
    await api(`/admin/zeiteintraege/${id}`, 'DELETE');
    loadEintraege();
  } catch (error) {
    alert(error.message);
  }
};

window.resetPin = async (id, name) => {
  const newPin = prompt(`Neuer PIN für ${name} (min. 4 Zeichen):`);
  if (!newPin) return;

  try {
    await api(`/admin/mitarbeiter/${id}`, 'PUT', { pin: newPin });
    alert('PIN geändert!');
  } catch (error) {
    alert(error.message);
  }
};

window.toggleAktiv = async (id, currentStatus) => {
  try {
    await api(`/admin/mitarbeiter/${id}`, 'PUT', { aktiv: !currentStatus });
    loadMitarbeiter();
  } catch (error) {
    alert(error.message);
  }
};

// ==================== INIT ====================

// Flatpickr Konfiguration (österreichisches Format)
const flatpickrConfig = {
  locale: 'de',
  dateFormat: 'd.m.Y',
  allowInput: true,
  clickOpens: true
};

// Datepicker Instanzen
let datumPicker = null;
let filterVonPicker = null;
let filterBisPicker = null;

// Datepicker initialisieren
function initDatepickers() {
  // Hauptformular Datum
  if (document.getElementById('datum')) {
    datumPicker = flatpickr('#datum', {
      ...flatpickrConfig,
      defaultDate: 'today'
    });
  }

  // Admin Filter
  if (document.getElementById('filter-von')) {
    filterVonPicker = flatpickr('#filter-von', flatpickrConfig);
  }
  if (document.getElementById('filter-bis')) {
    filterBisPicker = flatpickr('#filter-bis', flatpickrConfig);
  }
}

// Beim Laden prüfen ob bereits eingeloggt
if (sessionId && userName) {
  initErfassungView();
  showView('erfassung');
} else {
  showView('login');
}

// Datepickers initialisieren wenn DOM bereit
document.addEventListener('DOMContentLoaded', initDatepickers);
// Falls DOM bereits geladen
if (document.readyState !== 'loading') {
  initDatepickers();
}
