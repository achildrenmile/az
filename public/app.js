// Config laden und Mandant anzeigen
let appConfig = { mandant: '' };

async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    appConfig = await response.json();

    // Mandant in allen Badges anzeigen
    document.querySelectorAll('.mandant-badge').forEach(el => {
      el.textContent = appConfig.mandant;
    });

    // Optional: Theme-Farben anwenden
    if (appConfig.theme) {
      const root = document.documentElement;
      if (appConfig.theme.primaryColor) {
        root.style.setProperty('--primary', appConfig.theme.primaryColor);
      }
      if (appConfig.theme.accentColor) {
        root.style.setProperty('--accent', appConfig.theme.accentColor);
      }
    }
  } catch (error) {
    console.error('Config laden fehlgeschlagen:', error);
  }
}

// Config sofort laden
loadConfig();

// Loading Spinner
const loadingOverlay = document.getElementById('loading-overlay');
let loadingCount = 0;

function showLoading() {
  loadingCount++;
  loadingOverlay.classList.add('active');
}

function hideLoading() {
  loadingCount--;
  if (loadingCount <= 0) {
    loadingCount = 0;
    loadingOverlay.classList.remove('active');
  }
}

// State
let sessionId = localStorage.getItem('sessionId');
let userName = localStorage.getItem('userName');
let isAdmin = localStorage.getItem('isAdmin') === 'true';

// Paging State
let historyPage = 1;
let adminPage = 1;
let mitarbeiterPage = 1;
let kundenPage = 1;
let baustellenPage = 1;
const PAGE_LIMIT = 10;

// Statistik State
let currentStatistikType = 'monate';

// Pagination rendern
function renderPagination(containerId, currentPage, totalPages, total, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<span class="pagination-info">${total} Einträge</span>`;

  // Zurück-Button
  html += `<button class="pagination-btn" onclick="${onPageChange}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo;</button>`;

  // Seitenzahlen
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    html += `<button class="pagination-btn" onclick="${onPageChange}(1)">1</button>`;
    if (startPage > 2) html += `<span class="pagination-dots">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="pagination-dots">...</span>`;
    html += `<button class="pagination-btn" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`;
  }

  // Vor-Button
  html += `<button class="pagination-btn" onclick="${onPageChange}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>`;

  container.innerHTML = html;
}

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
let editDatumPicker = null;

// DOM Elements
const views = {
  login: document.getElementById('login-view'),
  erfassung: document.getElementById('erfassung-view'),
  admin: document.getElementById('admin-view')
};

// Helper: API-Aufruf
async function api(endpoint, method = 'GET', body = null, showSpinner = true) {
  if (showSpinner) showLoading();

  try {
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
      // Bei Session-Ablauf automatisch ausloggen
      if (response.status === 401) {
        handleSessionExpired();
      }
      throw new Error(data.error || 'Fehler');
    }

    return data;
  } finally {
    if (showSpinner) hideLoading();
  }
}

// Session abgelaufen - zum Login weiterleiten
function handleSessionExpired() {
  sessionId = null;
  userName = null;
  isAdmin = false;
  localStorage.removeItem('sessionId');
  localStorage.removeItem('userName');
  localStorage.removeItem('isAdmin');
  showView('login');
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
  const password = document.getElementById('password').value;

  try {
    const result = await api('/login', 'POST', { mitarbeiter_nr, password });
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

// Kundenliste für Dropdown laden
async function loadKundenListe() {
  try {
    const result = await api('/kunden');
    const kunden = result.data || result;
    const datalist = document.getElementById('kunden-liste');
    datalist.innerHTML = kunden.map(k => `<option value="${k.name}">`).join('');
  } catch (error) {
    console.error('Kunden laden fehlgeschlagen:', error);
  }
}

// Baustellenliste für Dropdown laden
async function loadBaustellenListe() {
  try {
    const result = await api('/baustellen');
    const baustellen = result.data || result;
    const datalist = document.getElementById('baustellen-liste');
    datalist.innerHTML = baustellen.map(b => `<option value="${b.name}">`).join('');
  } catch (error) {
    console.error('Baustellen laden fehlgeschlagen:', error);
  }
}

function initErfassungView() {
  document.getElementById('user-name').textContent = `Hallo, ${userName}`;
  document.getElementById('show-admin-btn').classList.toggle('hidden', !isAdmin);

  // Datum auf heute setzen via Flatpickr
  if (datumPicker) {
    datumPicker.setDate('today');
  } else {
    document.getElementById('datum').value = getTodayAT();
  }

  // Listen laden
  loadKundenListe();
  loadBaustellenListe();

  // Einträge und Statistik laden
  loadHistory();
  initStatistikJahre();
  loadUserStatistik();
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

    // AZG-Validierungsmeldungen anzeigen
    if (result.validation) {
      showValidationMessages(result.validation);
    }

    // Formular zurücksetzen (außer Datum)
    document.getElementById('arbeitsbeginn').value = '';
    document.getElementById('arbeitsende').value = '';
    document.getElementById('pause_minuten').value = '30';
    document.getElementById('baustelle').value = '';
    document.getElementById('kunde').value = '';
    document.getElementById('anfahrt').value = '';
    document.getElementById('notizen').value = '';

    // History aktualisieren
    loadHistory();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

async function loadHistory(page = 1) {
  try {
    historyPage = page;
    const result = await api(`/zeiteintraege?page=${page}&limit=${PAGE_LIMIT}`);
    const { data: eintraege, total, totalPages } = result;

    const tbody = document.querySelector('#user-eintraege-table tbody');
    const emptyState = document.getElementById('history-empty');
    const tableContainer = document.getElementById('history-table-container');
    const printBtn = document.getElementById('print-user-btn');

    if (total === 0) {
      emptyState.classList.remove('hidden');
      tableContainer.classList.add('hidden');
      printBtn.classList.add('hidden');
      renderPagination('history-pagination', 1, 1, 0, 'goToHistoryPage');
      return;
    }

    emptyState.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    printBtn.classList.remove('hidden');

    tbody.innerHTML = eintraege.map(e => `
      <tr>
        <td>${formatDate(e.datum)}</td>
        <td>${e.arbeitsbeginn}</td>
        <td>${e.arbeitsende}</td>
        <td>${e.pause_minuten} Min.</td>
        <td>${calculateNetto(e.arbeitsbeginn, e.arbeitsende, e.pause_minuten)}</td>
        <td>${e.baustelle || '-'}</td>
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="printEinzelnerEintrag(${e.id})" title="Drucken">🖨</button>
          <button class="btn btn-small btn-icon" onclick="openEditModal(${e.id})" title="Bearbeiten">✎</button>
          <button class="btn btn-small btn-danger btn-icon" onclick="deleteEintragUser(${e.id})" title="Löschen">✕</button>
        </td>
      </tr>
    `).join('');

    renderPagination('history-pagination', page, totalPages, total, 'goToHistoryPage');
  } catch (error) {
    console.error(error);
  }
}

// Paging-Funktion für History
window.goToHistoryPage = function(page) {
  loadHistory(page);
};

// Edit Modal öffnen
window.openEditModal = async (id) => {
  try {
    const eintrag = await api(`/zeiteintraege/${id}`);

    document.getElementById('edit-id').value = id;
    document.getElementById('edit-datum').value = formatDate(eintrag.datum);
    document.getElementById('edit-beginn').value = eintrag.arbeitsbeginn;
    document.getElementById('edit-ende').value = eintrag.arbeitsende;
    document.getElementById('edit-pause').value = eintrag.pause_minuten || 0;
    document.getElementById('edit-baustelle').value = eintrag.baustelle || '';
    document.getElementById('edit-kunde').value = eintrag.kunde || '';
    document.getElementById('edit-anfahrt').value = eintrag.anfahrt || '';
    document.getElementById('edit-notizen').value = eintrag.notizen || '';

    // Datepicker für Modal initialisieren
    if (!editDatumPicker) {
      editDatumPicker = flatpickr('#edit-datum', {
        ...flatpickrConfig
      });
    }
    editDatumPicker.setDate(eintrag.datum);

    document.getElementById('edit-message').textContent = '';
    document.getElementById('edit-modal').classList.remove('hidden');
  } catch (error) {
    alert('Fehler beim Laden: ' + error.message);
  }
};

// Edit Modal schließen
window.closeEditModal = () => {
  document.getElementById('edit-modal').classList.add('hidden');
};

// Edit Form Submit
document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('edit-message');
  messageEl.textContent = '';

  const id = document.getElementById('edit-id').value;
  const data = {
    datum: parseATDate(document.getElementById('edit-datum').value),
    arbeitsbeginn: document.getElementById('edit-beginn').value,
    arbeitsende: document.getElementById('edit-ende').value,
    pause_minuten: parseInt(document.getElementById('edit-pause').value) || 0,
    baustelle: document.getElementById('edit-baustelle').value,
    kunde: document.getElementById('edit-kunde').value,
    anfahrt: document.getElementById('edit-anfahrt').value,
    notizen: document.getElementById('edit-notizen').value
  };

  try {
    await api(`/zeiteintraege/${id}`, 'PUT', data);
    closeEditModal();
    loadHistory();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

// Eintrag löschen (User)
window.deleteEintragUser = async (id) => {
  if (!confirm('Eintrag wirklich löschen?')) return;

  try {
    await api(`/zeiteintraege/${id}`, 'DELETE');
    loadHistory();
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
};

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
  document.getElementById('password').value = '';
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
  await Promise.all([loadFilterOptions(), loadEintraege(), loadMitarbeiter(), loadKunden(), loadBaustellen()]);
}

// Filter-Dropdowns befüllen
async function loadFilterOptions() {
  try {
    const [maResult, bsResult, kdResult] = await Promise.all([
      api('/admin/mitarbeiter?limit=1000'),
      api('/admin/baustellen?limit=1000'),
      api('/admin/kunden?limit=1000')
    ]);

    const mitarbeiter = maResult.data || maResult;
    const baustellen = bsResult.data || bsResult;
    const kunden = kdResult.data || kdResult;

    // Mitarbeiter-Dropdown
    const maSelect = document.getElementById('filter-mitarbeiter');
    maSelect.innerHTML = '<option value="">Alle</option>' +
      mitarbeiter.filter(m => m.aktiv).map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    // Baustellen-Dropdown
    const bsSelect = document.getElementById('filter-baustelle');
    bsSelect.innerHTML = '<option value="">Alle</option>' +
      baustellen.filter(b => b.aktiv).map(b => `<option value="${b.name}">${b.name}</option>`).join('');

    // Kunden-Dropdown
    const kdSelect = document.getElementById('filter-kunde');
    kdSelect.innerHTML = '<option value="">Alle</option>' +
      kunden.filter(k => k.aktiv).map(k => `<option value="${k.name}">${k.name}</option>`).join('');
  } catch (error) {
    console.error('Filter-Optionen laden fehlgeschlagen:', error);
  }
}

async function loadEintraege(page = 1) {
  adminPage = page;

  const vonAT = document.getElementById('filter-von').value;
  const bisAT = document.getElementById('filter-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);
  const mitarbeiterId = document.getElementById('filter-mitarbeiter').value;
  const baustelle = document.getElementById('filter-baustelle').value;
  const kunde = document.getElementById('filter-kunde').value;

  let url = '/admin/zeiteintraege';
  const params = [`page=${page}`, `limit=${PAGE_LIMIT}`];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (mitarbeiterId) params.push(`mitarbeiter=${mitarbeiterId}`);
  if (baustelle) params.push(`baustelle=${encodeURIComponent(baustelle)}`);
  if (kunde) params.push(`kunde=${encodeURIComponent(kunde)}`);
  url += '?' + params.join('&');

  try {
    const result = await api(url);
    const { data: eintraege, total, totalPages } = result;

    const tbody = document.querySelector('#eintraege-table tbody');

    if (eintraege.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:40px;">Keine Einträge gefunden</td></tr>';
      renderPagination('admin-pagination', 1, 1, 0, 'goToAdminPage');
      return;
    }

    tbody.innerHTML = eintraege.map(e => `
      <tr>
        <td>${formatDate(e.datum)}</td>
        <td title="${e.mitarbeiter_name} (${e.mitarbeiter_nr})">${e.mitarbeiter_name}</td>
        <td>${e.arbeitsbeginn}</td>
        <td>${e.arbeitsende}</td>
        <td>${e.pause_minuten}</td>
        <td>${calculateNetto(e.arbeitsbeginn, e.arbeitsende, e.pause_minuten)}</td>
        <td title="${e.baustelle || '-'}">${e.baustelle || '-'}</td>
        <td title="${e.kunde || '-'}">${e.kunde || '-'}</td>
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="printEinzelnerEintrag(${e.id})" title="Drucken">🖨</button>
          <button class="btn btn-small btn-danger btn-icon" onclick="deleteEintrag(${e.id})" title="Löschen">✕</button>
        </td>
      </tr>
    `).join('');

    renderPagination('admin-pagination', page, totalPages, total, 'goToAdminPage');
  } catch (error) {
    console.error(error);
  }
}

// Paging-Funktion für Admin
window.goToAdminPage = function(page) {
  loadEintraege(page);
};

async function loadMitarbeiter(page = 1) {
  try {
    mitarbeiterPage = page;
    const result = await api(`/admin/mitarbeiter?page=${page}&limit=${PAGE_LIMIT}`);
    const { data: mitarbeiter, total, totalPages } = result;
    const tbody = document.querySelector('#mitarbeiter-table tbody');

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Mitarbeiter gefunden</td></tr>';
      renderPagination('mitarbeiter-pagination', 1, 1, 0, 'goToMitarbeiterPage');
      return;
    }

    tbody.innerHTML = mitarbeiter.map(m => `
      <tr>
        <td>${m.mitarbeiter_nr}</td>
        <td>${m.name}</td>
        <td>${m.ist_admin ? 'Ja' : 'Nein'}</td>
        <td>${m.aktiv ? 'Aktiv' : 'Inaktiv'}</td>
        <td>
          <button class="btn btn-small" onclick="resetPassword(${m.id}, '${m.name}')">Passwort ändern</button>
          ${!m.ist_admin ? `<button class="btn btn-small" onclick="toggleAktiv(${m.id}, ${m.aktiv})">${m.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>` : ''}
        </td>
      </tr>
    `).join('');

    renderPagination('mitarbeiter-pagination', page, totalPages, total, 'goToMitarbeiterPage');
  } catch (error) {
    console.error(error);
  }
}

window.goToMitarbeiterPage = function(page) {
  loadMitarbeiter(page);
};

async function loadKunden(page = 1) {
  try {
    kundenPage = page;
    const result = await api(`/admin/kunden?page=${page}&limit=${PAGE_LIMIT}`);
    const { data: kunden, total, totalPages } = result;
    const tbody = document.querySelector('#kunden-table tbody');

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Noch keine Kunden angelegt.</td></tr>';
      renderPagination('kunden-pagination', 1, 1, 0, 'goToKundenPage');
      return;
    }

    tbody.innerHTML = kunden.map(k => `
      <tr>
        <td>${k.name}</td>
        <td>${k.ansprechpartner || '-'}</td>
        <td>${k.ort || '-'}</td>
        <td>${k.telefon || '-'}</td>
        <td>${k.aktiv ? 'Aktiv' : 'Inaktiv'}</td>
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="openKundeModal(${k.id})" title="Bearbeiten">✎</button>
          <button class="btn btn-small btn-icon" onclick="toggleKundeAktiv(${k.id}, ${k.aktiv})" title="${k.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${k.aktiv ? '⏸' : '▶'}</button>
        </td>
      </tr>
    `).join('');

    renderPagination('kunden-pagination', page, totalPages, total, 'goToKundenPage');
  } catch (error) {
    console.error(error);
  }
}

window.goToKundenPage = function(page) {
  loadKunden(page);
};

async function loadBaustellen(page = 1) {
  try {
    baustellenPage = page;
    const result = await api(`/admin/baustellen?page=${page}&limit=${PAGE_LIMIT}`);
    const { data: baustellen, total, totalPages } = result;
    const tbody = document.querySelector('#baustellen-table tbody');

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-secondary)">Noch keine Baustellen angelegt.</td></tr>';
      renderPagination('baustellen-pagination', 1, 1, 0, 'goToBaustellenPage');
      return;
    }

    tbody.innerHTML = baustellen.map(b => `
      <tr>
        <td>${b.name}</td>
        <td>${b.kunde || '-'}</td>
        <td>${b.adresse || '-'}</td>
        <td>${b.aktiv ? 'Aktiv' : 'Inaktiv'}</td>
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="openBaustelleModal(${b.id})" title="Bearbeiten">✎</button>
          <button class="btn btn-small btn-icon" onclick="toggleBaustelleAktiv(${b.id}, ${b.aktiv})" title="${b.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${b.aktiv ? '⏸' : '▶'}</button>
        </td>
      </tr>
    `).join('');

    renderPagination('baustellen-pagination', page, totalPages, total, 'goToBaustellenPage');
  } catch (error) {
    console.error(error);
  }
}

window.goToBaustellenPage = function(page) {
  loadBaustellen(page);
};

// Filter
document.getElementById('filter-btn').addEventListener('click', loadEintraege);

// Export - jetzt über Modal (export-dialog-btn)

// Zeitnachweis drucken (Admin)
document.getElementById('print-btn').addEventListener('click', async () => {
  const vonAT = document.getElementById('filter-von').value;
  const bisAT = document.getElementById('filter-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);
  const mitarbeiterId = document.getElementById('filter-mitarbeiter').value;
  const mitarbeiterName = document.getElementById('filter-mitarbeiter').selectedOptions[0]?.text;
  const baustelle = document.getElementById('filter-baustelle').value;
  const kunde = document.getElementById('filter-kunde').value;

  let url = '/admin/zeiteintraege?limit=10000';
  const params = [];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (mitarbeiterId) params.push(`mitarbeiter=${mitarbeiterId}`);
  if (baustelle) params.push(`baustelle=${encodeURIComponent(baustelle)}`);
  if (kunde) params.push(`kunde=${encodeURIComponent(kunde)}`);
  if (params.length) url += '&' + params.join('&');

  try {
    const result = await api(url);
    let eintraege = result.data || result;

    // Filter-Info für Druckansicht
    const filterInfo = {
      mitarbeiter: mitarbeiterId ? mitarbeiterName : null,
      baustelle: baustelle || null,
      kunde: kunde || null
    };

    printZeitnachweis(eintraege, vonAT, bisAT, filterInfo);
  } catch (error) {
    alert('Fehler beim Laden: ' + error.message);
  }
});

// Zeitnachweis drucken (User)
document.getElementById('print-user-btn').addEventListener('click', async () => {
  try {
    const result = await api('/zeiteintraege?limit=10000');
    const eintraege = result.data || result;
    printZeitnachweis(eintraege, null, null, userName);
  } catch (error) {
    alert('Fehler beim Laden: ' + error.message);
  }
});

// Druckfunktion
function printZeitnachweis(eintraege, vonAT, bisAT, filterInfo) {
  if (eintraege.length === 0) {
    alert('Keine Einträge zum Drucken vorhanden.');
    return;
  }

  // filterInfo kann ein String (User-Ansicht) oder Objekt (Admin-Ansicht) sein
  const isUserPrint = typeof filterInfo === 'string';
  const mitarbeiterFilter = isUserPrint ? filterInfo : (filterInfo?.mitarbeiter || null);
  const baustelleFilter = isUserPrint ? null : (filterInfo?.baustelle || null);
  const kundeFilter = isUserPrint ? null : (filterInfo?.kunde || null);

  // Zeitraum bestimmen
  let zeitraum = '';
  if (vonAT && bisAT) {
    zeitraum = `${vonAT} - ${bisAT}`;
  } else if (vonAT) {
    zeitraum = `ab ${vonAT}`;
  } else if (bisAT) {
    zeitraum = `bis ${bisAT}`;
  } else {
    // Automatisch aus Daten ermitteln
    const daten = eintraege.map(e => e.datum).sort();
    zeitraum = `${formatDate(daten[0])} - ${formatDate(daten[daten.length - 1])}`;
  }

  // Gesamtstunden berechnen
  let gesamtMinuten = 0;
  eintraege.forEach(e => {
    const [bH, bM] = e.arbeitsbeginn.split(':').map(Number);
    const [eH, eM] = e.arbeitsende.split(':').map(Number);
    gesamtMinuten += (eH * 60 + eM) - (bH * 60 + bM) - e.pause_minuten;
  });
  const gesamtStunden = (gesamtMinuten / 60).toFixed(2).replace('.', ',');

  // Spalten basierend auf Filter ein-/ausblenden
  const showMitarbeiterCol = !mitarbeiterFilter;
  const showBaustelleCol = !baustelleFilter;
  const showKundeCol = !kundeFilter;

  // Tabellenzeilen erstellen
  const zeilen = eintraege.map(e => {
    const netto = calculateNetto(e.arbeitsbeginn, e.arbeitsende, e.pause_minuten);
    return `
      <tr>
        <td>${formatDate(e.datum)}</td>
        ${showMitarbeiterCol ? `<td>${e.mitarbeiter_name || ''}</td>` : ''}
        <td>${e.arbeitsbeginn}</td>
        <td>${e.arbeitsende}</td>
        <td style="text-align:center">${e.pause_minuten}</td>
        <td style="text-align:right">${netto}</td>
        ${showBaustelleCol ? `<td>${e.baustelle || ''}</td>` : ''}
        ${showKundeCol ? `<td>${e.kunde || ''}</td>` : ''}
      </tr>
    `;
  }).join('');

  // Filter-Info Zeilen erstellen
  let filterInfoHtml = '';
  if (mitarbeiterFilter) {
    filterInfoHtml += `<div class="info-row"><strong>Mitarbeiter:</strong> ${mitarbeiterFilter}</div>`;
  }
  if (baustelleFilter) {
    filterInfoHtml += `<div class="info-row"><strong>Baustelle:</strong> ${baustelleFilter}</div>`;
  }
  if (kundeFilter) {
    filterInfoHtml += `<div class="info-row"><strong>Kunde:</strong> ${kundeFilter}</div>`;
  }

  // HTML für Druckansicht
  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Zeitnachweis</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      padding: 20mm;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #333;
    }
    .header h1 {
      font-size: 18pt;
      margin-bottom: 5px;
    }
    .header .zeitraum {
      font-size: 12pt;
      color: #666;
    }
    .info {
      margin-bottom: 15px;
      font-size: 10pt;
    }
    .info-row {
      margin-bottom: 3px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
      font-size: 9pt;
    }
    th {
      background: #f0f0f0;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background: #fafafa;
    }
    .summary {
      margin-top: 20px;
      padding: 15px;
      background: #f5f5f5;
      border: 1px solid #ddd;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    .summary-row:last-child {
      margin-bottom: 0;
      font-weight: bold;
      font-size: 12pt;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
    }
    .signature {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
    }
    .signature-line {
      width: 200px;
      border-top: 1px solid #333;
      padding-top: 5px;
      text-align: center;
      font-size: 9pt;
    }
    @media print {
      body { padding: 15mm; }
      @page { margin: 0; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Zeitnachweis</h1>
    <div class="zeitraum">${zeitraum}</div>
  </div>

  ${filterInfoHtml ? `<div class="info">${filterInfoHtml}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>Datum</th>
        ${showMitarbeiterCol ? '<th>Mitarbeiter</th>' : ''}
        <th>Beginn</th>
        <th>Ende</th>
        <th>Pause (Min)</th>
        <th>Netto</th>
        ${showBaustelleCol ? '<th>Baustelle</th>' : ''}
        ${showKundeCol ? '<th>Kunde</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${zeilen}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span>Anzahl Einträge:</span>
      <span>${eintraege.length}</span>
    </div>
    <div class="summary-row">
      <span>Gesamtstunden:</span>
      <span>${gesamtStunden} Std.</span>
    </div>
  </div>

  <div class="footer">
    <div class="signature">
      <div class="signature-line">Datum</div>
      <div class="signature-line">Unterschrift Mitarbeiter</div>
      <div class="signature-line">Unterschrift Arbeitgeber</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>
  `;

  // Neues Fenster öffnen und drucken
  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
}

// Einzelnen Eintrag drucken
window.printEinzelnerEintrag = async (id) => {
  try {
    const eintrag = await api(`/zeiteintraege/${id}`);
    const netto = calculateNetto(eintrag.arbeitsbeginn, eintrag.arbeitsende, eintrag.pause_minuten);

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Arbeitsnachweis</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      padding: 20mm;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 2px solid #333;
    }
    .header h1 { font-size: 20pt; margin-bottom: 5px; }
    .header .datum { font-size: 14pt; color: #666; }
    .details {
      max-width: 500px;
      margin: 0 auto 30px;
    }
    .row {
      display: flex;
      border-bottom: 1px solid #ddd;
      padding: 10px 0;
    }
    .row:last-child { border-bottom: none; }
    .label {
      width: 150px;
      font-weight: bold;
      color: #555;
    }
    .value { flex: 1; }
    .summary {
      margin-top: 30px;
      padding: 20px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      text-align: center;
    }
    .summary .total {
      font-size: 18pt;
      font-weight: bold;
      color: #2c3e50;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
    }
    .signature {
      display: flex;
      justify-content: space-between;
      margin-top: 50px;
    }
    .signature-line {
      width: 200px;
      border-top: 1px solid #333;
      padding-top: 5px;
      text-align: center;
      font-size: 9pt;
    }
    @media print {
      body { padding: 15mm; }
      @page { margin: 0; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Arbeitsnachweis</h1>
    <div class="datum">${formatDate(eintrag.datum)}</div>
  </div>

  <div class="details">
    <div class="row">
      <div class="label">Arbeitsbeginn:</div>
      <div class="value">${eintrag.arbeitsbeginn} Uhr</div>
    </div>
    <div class="row">
      <div class="label">Arbeitsende:</div>
      <div class="value">${eintrag.arbeitsende} Uhr</div>
    </div>
    <div class="row">
      <div class="label">Pause:</div>
      <div class="value">${eintrag.pause_minuten} Minuten</div>
    </div>
    ${eintrag.baustelle ? `
    <div class="row">
      <div class="label">Baustelle:</div>
      <div class="value">${eintrag.baustelle}</div>
    </div>` : ''}
    ${eintrag.kunde ? `
    <div class="row">
      <div class="label">Kunde:</div>
      <div class="value">${eintrag.kunde}</div>
    </div>` : ''}
    ${eintrag.anfahrt ? `
    <div class="row">
      <div class="label">Anfahrt:</div>
      <div class="value">${eintrag.anfahrt}</div>
    </div>` : ''}
    ${eintrag.notizen ? `
    <div class="row">
      <div class="label">Notizen:</div>
      <div class="value">${eintrag.notizen}</div>
    </div>` : ''}
  </div>

  <div class="summary">
    <div>Nettoarbeitszeit</div>
    <div class="total">${netto}</div>
  </div>

  <div class="footer">
    <div class="signature">
      <div class="signature-line">Datum</div>
      <div class="signature-line">Unterschrift Mitarbeiter</div>
      <div class="signature-line">Unterschrift Arbeitgeber</div>
    </div>
  </div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
  } catch (error) {
    alert('Fehler beim Laden: ' + error.message);
  }
};

// Neuer Mitarbeiter
document.getElementById('new-mitarbeiter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('new-ma-message');
  messageEl.textContent = '';

  const data = {
    mitarbeiter_nr: document.getElementById('new-ma-nr').value,
    name: document.getElementById('new-ma-name').value,
    password: document.getElementById('new-ma-password').value
  };

  try {
    await api('/admin/mitarbeiter', 'POST', data);
    messageEl.textContent = 'Mitarbeiter angelegt!';
    messageEl.className = 'message success';

    document.getElementById('new-ma-nr').value = '';
    document.getElementById('new-ma-name').value = '';
    document.getElementById('new-ma-password').value = '';

    loadMitarbeiter();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

// Kunde Modal öffnen
window.openKundeModal = async (id = null) => {
  const modal = document.getElementById('kunde-modal');
  const title = document.getElementById('kunde-modal-title');
  const form = document.getElementById('kunde-form');

  // Formular zurücksetzen
  form.reset();
  document.getElementById('kunde-id').value = '';
  document.getElementById('kunde-form-message').textContent = '';

  if (id) {
    // Bearbeiten - Daten laden
    title.textContent = 'Kunde bearbeiten';
    try {
      const kunde = await api(`/admin/kunden/${id}`);
      document.getElementById('kunde-id').value = kunde.id;
      document.getElementById('kunde-name').value = kunde.name || '';
      document.getElementById('kunde-ansprechpartner').value = kunde.ansprechpartner || '';
      document.getElementById('kunde-strasse').value = kunde.strasse || '';
      document.getElementById('kunde-plz').value = kunde.plz || '';
      document.getElementById('kunde-ort').value = kunde.ort || '';
      document.getElementById('kunde-telefon').value = kunde.telefon || '';
      document.getElementById('kunde-email').value = kunde.email || '';
      document.getElementById('kunde-notizen').value = kunde.notizen || '';
    } catch (error) {
      alert('Fehler beim Laden: ' + error.message);
      return;
    }
  } else {
    title.textContent = 'Neuer Kunde';
  }

  modal.classList.remove('hidden');
};

window.closeKundeModal = () => {
  document.getElementById('kunde-modal').classList.add('hidden');
};

// Kunde Formular absenden
document.getElementById('kunde-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('kunde-form-message');
  messageEl.textContent = '';

  const id = document.getElementById('kunde-id').value;
  const data = {
    name: document.getElementById('kunde-name').value,
    ansprechpartner: document.getElementById('kunde-ansprechpartner').value,
    strasse: document.getElementById('kunde-strasse').value,
    plz: document.getElementById('kunde-plz').value,
    ort: document.getElementById('kunde-ort').value,
    telefon: document.getElementById('kunde-telefon').value,
    email: document.getElementById('kunde-email').value,
    notizen: document.getElementById('kunde-notizen').value,
    aktiv: true
  };

  try {
    if (id) {
      await api(`/admin/kunden/${id}`, 'PUT', data);
    } else {
      await api('/admin/kunden', 'POST', data);
    }
    closeKundeModal();
    loadKunden();
    loadKundenListe();
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

window.resetPassword = async (id, name) => {
  const newPassword = prompt(`Neues Passwort für ${name}:\n\nAnforderungen:\n• Mindestens 8 Zeichen\n• Groß- und Kleinbuchstaben\n• Mindestens eine Zahl\n• Mindestens ein Sonderzeichen`);
  if (!newPassword) return;

  try {
    await api(`/admin/mitarbeiter/${id}`, 'PUT', { password: newPassword });
    alert('Passwort geändert!');
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

window.toggleKundeAktiv = async (id, currentStatus) => {
  try {
    const kunde = await api(`/admin/kunden/${id}`);
    if (!kunde) return;

    await api(`/admin/kunden/${id}`, 'PUT', {
      ...kunde,
      aktiv: !currentStatus
    });
    loadKunden();
    loadKundenListe();
  } catch (error) {
    alert(error.message);
  }
};

// Baustelle Modal öffnen
window.openBaustelleModal = async (id = null) => {
  const modal = document.getElementById('baustelle-modal');
  const title = document.getElementById('baustelle-modal-title');
  const form = document.getElementById('baustelle-form');

  // Formular zurücksetzen
  form.reset();
  document.getElementById('baustelle-id').value = '';
  document.getElementById('baustelle-form-message').textContent = '';

  if (id) {
    // Bearbeiten - Daten laden
    title.textContent = 'Baustelle bearbeiten';
    try {
      const baustelle = await api(`/admin/baustellen/${id}`);
      document.getElementById('baustelle-id').value = baustelle.id;
      document.getElementById('baustelle-name').value = baustelle.name || '';
      document.getElementById('baustelle-kunde').value = baustelle.kunde || '';
      document.getElementById('baustelle-adresse').value = baustelle.adresse || '';
      document.getElementById('baustelle-notizen').value = baustelle.notizen || '';
    } catch (error) {
      alert('Fehler beim Laden: ' + error.message);
      return;
    }
  } else {
    title.textContent = 'Neue Baustelle';
  }

  modal.classList.remove('hidden');
};

window.closeBaustelleModal = () => {
  document.getElementById('baustelle-modal').classList.add('hidden');
};

// Baustelle Formular absenden
document.getElementById('baustelle-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageEl = document.getElementById('baustelle-form-message');
  messageEl.textContent = '';

  const id = document.getElementById('baustelle-id').value;
  const data = {
    name: document.getElementById('baustelle-name').value,
    kunde: document.getElementById('baustelle-kunde').value,
    adresse: document.getElementById('baustelle-adresse').value,
    notizen: document.getElementById('baustelle-notizen').value,
    aktiv: true
  };

  try {
    if (id) {
      await api(`/admin/baustellen/${id}`, 'PUT', data);
    } else {
      await api('/admin/baustellen', 'POST', data);
    }
    closeBaustelleModal();
    loadBaustellen();
    loadBaustellenListe();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

window.toggleBaustelleAktiv = async (id, currentStatus) => {
  try {
    const baustelle = await api(`/admin/baustellen/${id}`);
    if (!baustelle) return;

    await api(`/admin/baustellen/${id}`, 'PUT', {
      ...baustelle,
      aktiv: !currentStatus
    });
    loadBaustellen();
    loadBaustellenListe();
  } catch (error) {
    alert(error.message);
  }
};

// ==================== INIT ====================

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

// Datepickers initialisieren
initDatepickers();

// Session beim Start validieren
async function validateSession() {
  if (!sessionId) {
    showView('login');
    return;
  }

  try {
    const result = await api('/session');
    if (result.valid) {
      userName = result.name;
      isAdmin = result.ist_admin;
      localStorage.setItem('userName', userName);
      localStorage.setItem('isAdmin', isAdmin);
      initErfassungView();
      showView('erfassung');
    }
  } catch (error) {
    // Session ungültig - Login anzeigen
    showView('login');
  }
}

// Beim Laden Session validieren
validateSession();

// ==================== STATISTIK ====================

// Jahre-Dropdown initialisieren
function initStatistikJahre() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }

  // User Statistik
  const userSelect = document.getElementById('statistik-jahr');
  if (userSelect) {
    userSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  }

  // Admin Statistik
  const adminSelect = document.getElementById('admin-statistik-jahr');
  if (adminSelect) {
    adminSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  }

  // Aktuellen Monat vorauswählen
  const adminMonat = document.getElementById('admin-statistik-monat');
  if (adminMonat) {
    adminMonat.value = new Date().getMonth() + 1;
  }
}

// User Statistik laden
async function loadUserStatistik() {
  const jahr = document.getElementById('statistik-jahr')?.value || new Date().getFullYear();
  const endpoint = currentStatistikType === 'wochen' ? '/statistik/wochen' : '/statistik/monate';

  try {
    const data = await api(`${endpoint}?jahr=${jahr}`);
    const tbody = document.querySelector('#statistik-table tbody');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Daten für diesen Zeitraum</td></tr>';
      document.getElementById('statistik-total').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(row => {
      const zeitraum = currentStatistikType === 'wochen'
        ? `KW ${row.kalenderwoche}`
        : row.monatName;

      // Überstunden/Minderstunden Anzeige
      let diffHtml = '';
      if (row.ueberstunden > 0) {
        diffHtml = `<span class="stunden-ueber">+${row.ueberstunden.toFixed(2)} h</span>`;
      } else if (row.minderstunden > 0) {
        diffHtml = `<span class="stunden-minder">-${row.minderstunden.toFixed(2)} h</span>`;
      } else {
        diffHtml = `<span class="stunden-detail">±0 h</span>`;
      }

      return `
        <tr>
          <td>${zeitraum}</td>
          <td>${row.tage}</td>
          <td>
            <div class="stunden-cell">
              <span class="stunden-normal">${row.stunden.toFixed(2)} h</span>
              <span class="stunden-detail">Soll: ${row.sollstunden} h</span>
            </div>
          </td>
          <td>${(row.normalstunden || 0).toFixed(2)} h</td>
          <td>${diffHtml}</td>
        </tr>
      `;
    }).join('');

    // Totals berechnen
    const totalTage = data.reduce((sum, r) => sum + (r.tage || 0), 0);
    const totalStunden = data.reduce((sum, r) => sum + (r.stunden || 0), 0);
    const totalNormalstunden = data.reduce((sum, r) => sum + (r.normalstunden || 0), 0);
    const totalUeberstunden = data.reduce((sum, r) => sum + (r.ueberstunden || 0), 0);
    const totalMinderstunden = data.reduce((sum, r) => sum + (r.minderstunden || 0), 0);
    const totalSoll = data.reduce((sum, r) => sum + (r.sollstunden || 0), 0);

    // Netto Über-/Minderstunden
    const nettoDiff = totalUeberstunden - totalMinderstunden;
    const diffClass = nettoDiff >= 0 ? 'positive' : 'negative';
    const diffPrefix = nettoDiff >= 0 ? '+' : '';

    document.getElementById('statistik-total').innerHTML = `
      <div class="statistik-total-item">
        <span class="statistik-total-label">Arbeitstage</span>
        <span class="statistik-total-value">${totalTage}</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Gesamtstunden</span>
        <span class="statistik-total-value">${totalStunden.toFixed(2)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Soll-Stunden</span>
        <span class="statistik-total-value">${totalSoll.toFixed(0)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Normalstunden</span>
        <span class="statistik-total-value">${totalNormalstunden.toFixed(2)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Bilanz</span>
        <span class="statistik-total-value ${diffClass}">${diffPrefix}${nettoDiff.toFixed(2)} h</span>
      </div>
    `;
  } catch (error) {
    console.error('Statistik laden fehlgeschlagen:', error);
  }
}

// Admin Statistik laden
async function loadAdminStatistik() {
  const jahr = document.getElementById('admin-statistik-jahr')?.value || new Date().getFullYear();
  const monat = document.getElementById('admin-statistik-monat')?.value || new Date().getMonth() + 1;

  try {
    const data = await api(`/admin/statistik/uebersicht?jahr=${jahr}&monat=${monat}`);
    const tbody = document.querySelector('#admin-statistik-table tbody');

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Daten für diesen Zeitraum</td></tr>';
      document.getElementById('admin-statistik-total').innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(row => {
      // Überstunden/Minderstunden Anzeige
      let diffHtml = '';
      if (row.ueberstunden > 0) {
        diffHtml = `<span class="stunden-ueber">+${row.ueberstunden.toFixed(2)} h</span>`;
      } else if (row.minderstunden > 0) {
        diffHtml = `<span class="stunden-minder">-${row.minderstunden.toFixed(2)} h</span>`;
      } else {
        diffHtml = `<span class="stunden-detail">±0 h</span>`;
      }

      return `
        <tr>
          <td>${row.mitarbeiter_name}</td>
          <td>${row.mitarbeiter_nr}</td>
          <td>${row.tage}</td>
          <td>${row.stunden.toFixed(2)} h</td>
          <td>${row.sollstunden || 173} h</td>
          <td>${(row.normalstunden || 0).toFixed(2)} h</td>
          <td>${diffHtml}</td>
        </tr>
      `;
    }).join('');

    // Totals
    const totalTage = data.reduce((sum, r) => sum + (r.tage || 0), 0);
    const totalStunden = data.reduce((sum, r) => sum + (r.stunden || 0), 0);
    const totalNormalstunden = data.reduce((sum, r) => sum + (r.normalstunden || 0), 0);
    const totalUeberstunden = data.reduce((sum, r) => sum + (r.ueberstunden || 0), 0);
    const totalMinderstunden = data.reduce((sum, r) => sum + (r.minderstunden || 0), 0);
    const totalSoll = data.reduce((sum, r) => sum + (r.sollstunden || 173), 0);

    // Netto Über-/Minderstunden
    const nettoDiff = totalUeberstunden - totalMinderstunden;
    const diffClass = nettoDiff >= 0 ? 'positive' : 'negative';
    const diffPrefix = nettoDiff >= 0 ? '+' : '';

    document.getElementById('admin-statistik-total').innerHTML = `
      <div class="statistik-total-item">
        <span class="statistik-total-label">Mitarbeiter</span>
        <span class="statistik-total-value">${data.length}</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Arbeitstage gesamt</span>
        <span class="statistik-total-value">${totalTage}</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Stunden gesamt</span>
        <span class="statistik-total-value">${totalStunden.toFixed(2)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Soll gesamt</span>
        <span class="statistik-total-value">${totalSoll.toFixed(0)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Normalstunden</span>
        <span class="statistik-total-value">${totalNormalstunden.toFixed(2)} h</span>
      </div>
      <div class="statistik-total-item">
        <span class="statistik-total-label">Bilanz</span>
        <span class="statistik-total-value ${diffClass}">${diffPrefix}${nettoDiff.toFixed(2)} h</span>
      </div>
    `;
  } catch (error) {
    console.error('Admin Statistik laden fehlgeschlagen:', error);
  }
}

// Event Listeners für Statistik
document.addEventListener('DOMContentLoaded', () => {
  initStatistikJahre();

  // User Statistik Tab-Wechsel
  document.querySelectorAll('.statistik-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.statistik-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatistikType = btn.dataset.type;
      loadUserStatistik();
    });
  });

  // User Statistik Jahr-Wechsel
  document.getElementById('statistik-jahr')?.addEventListener('change', loadUserStatistik);

  // Admin Statistik Button
  document.getElementById('admin-statistik-btn')?.addEventListener('click', loadAdminStatistik);
});

// Statistik bei Tab-Wechsel laden
const originalTabHandler = document.querySelectorAll('.tab');
originalTabHandler.forEach(tab => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'statistik') {
      loadAdminStatistik();
    }
  });
});

// ==================== EXPORT FUNKTIONEN ====================

let exportFormat = 'pdf';
let exportDatepickerVon = null;
let exportDatepickerBis = null;

function openExportModal() {
  const modal = document.getElementById('export-modal');
  modal.classList.remove('hidden');

  // Mitarbeiter-Dropdown befüllen
  const select = document.getElementById('export-mitarbeiter');
  api('/admin/mitarbeiter?limit=1000').then(result => {
    const mitarbeiter = result.data || result;
    select.innerHTML = '<option value="">Alle Mitarbeiter</option>' +
      mitarbeiter.filter(m => m.aktiv).map(m => `<option value="${m.id}">${m.name} (${m.mitarbeiter_nr})</option>`).join('');
  });

  // Standard-Zeitraum: Aktueller Monat
  const heute = new Date();
  const ersterTag = new Date(heute.getFullYear(), heute.getMonth(), 1);
  const letzterTag = new Date(heute.getFullYear(), heute.getMonth() + 1, 0);

  // Datepicker initialisieren
  if (exportDatepickerVon) exportDatepickerVon.destroy();
  if (exportDatepickerBis) exportDatepickerBis.destroy();

  exportDatepickerVon = flatpickr('#export-von', {
    locale: 'de',
    dateFormat: 'd.m.Y',
    defaultDate: ersterTag
  });

  exportDatepickerBis = flatpickr('#export-bis', {
    locale: 'de',
    dateFormat: 'd.m.Y',
    defaultDate: letzterTag
  });

  // Preview zurücksetzen
  document.getElementById('export-preview').classList.add('hidden');
  document.getElementById('export-message').innerHTML = '';
}

function closeExportModal() {
  document.getElementById('export-modal').classList.add('hidden');
}

// Format-Buttons - im DOMContentLoaded initialisieren
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.export-format').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.export-format').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      exportFormat = btn.dataset.format;
    });
  });
});

// Vorschau laden
async function previewExport() {
  const vonAT = document.getElementById('export-von').value;
  const bisAT = document.getElementById('export-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);
  const mitarbeiter = document.getElementById('export-mitarbeiter').value;

  if (!von || !bis) {
    document.getElementById('export-message').innerHTML = '<span class="error">Bitte Zeitraum auswählen</span>';
    return;
  }

  try {
    const verstoesse = await api(`/admin/verstoesse?von=${von}&bis=${bis}${mitarbeiter ? '&mitarbeiter=' + mitarbeiter : ''}`);

    const previewDiv = document.getElementById('export-preview');
    const contentDiv = document.getElementById('export-preview-content');

    let html = `<p><strong>Zeitraum:</strong> ${vonAT} - ${bisAT}</p>`;

    if (verstoesse.length > 0) {
      html += `<p style="color: var(--danger);"><strong>AZG-Verstöße gefunden: ${verstoesse.length}</strong></p>`;
      html += '<ul style="margin: 10px 0; padding-left: 20px;">';
      verstoesse.slice(0, 5).forEach(v => {
        html += `<li>${v.beschreibung} - ${v.mitarbeiter} (${v.kalenderwoche || formatDate(v.datum)})</li>`;
      });
      if (verstoesse.length > 5) {
        html += `<li>... und ${verstoesse.length - 5} weitere</li>`;
      }
      html += '</ul>';
    } else {
      html += '<p style="color: var(--success);"><strong>Keine AZG-Verstöße im Zeitraum</strong></p>';
    }

    contentDiv.innerHTML = html;
    previewDiv.classList.remove('hidden');
  } catch (error) {
    document.getElementById('export-message').innerHTML = '<span class="error">Fehler beim Laden der Vorschau</span>';
  }
}

// Export-Form absenden - im DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('export-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const vonAT = document.getElementById('export-von').value;
    const bisAT = document.getElementById('export-bis').value;
    const von = parseATDate(vonAT);
    const bis = parseATDate(bisAT);
    const mitarbeiter = document.getElementById('export-mitarbeiter').value;

    if (!von || !bis) {
      document.getElementById('export-message').innerHTML = '<span class="error">Bitte Zeitraum auswählen</span>';
      return;
    }

    // Download starten
    let url = `/api/admin/export/${exportFormat}?von=${von}&bis=${bis}`;
    if (mitarbeiter) url += `&mitarbeiter=${mitarbeiter}`;

    // Session-Header für Download
    const link = document.createElement('a');
    link.href = url;
    link.download = `arbeitszeit_export_${von}_${bis}.${exportFormat}`;

    // Fetch mit Session-Header für PDF/CSV
    try {
      showLoading();
      const response = await fetch(url, {
        headers: { 'X-Session-Id': sessionId }
      });

      if (!response.ok) {
        // Versuche JSON zu parsen, falls Fehler
        const text = await response.text();
        let errorMsg = 'Export fehlgeschlagen';
        try {
          const error = JSON.parse(text);
          errorMsg = error.error || errorMsg;
        } catch (e) {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      link.href = downloadUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      closeExportModal();
    } catch (error) {
      document.getElementById('export-message').innerHTML = `<span class="error">${error.message}</span>`;
    } finally {
      hideLoading();
    }
  });
});

// Export-Dialog Button Event - im DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('export-dialog-btn')?.addEventListener('click', openExportModal);
});

// Verstöße Modal
function openVerstoesseModal(verstoesse) {
  const modal = document.getElementById('verstoesse-modal');
  const content = document.getElementById('verstoesse-content');

  if (verstoesse.length === 0) {
    content.innerHTML = '<p style="color: var(--success);">Keine AZG-Verstöße im gewählten Zeitraum.</p>';
  } else {
    let html = `<p style="margin-bottom: 16px;"><strong>${verstoesse.length} Verstöße gefunden:</strong></p>`;
    html += '<div class="table-container"><table><thead><tr><th>Typ</th><th>Mitarbeiter</th><th>Datum</th><th>Ist</th><th>Grenzwert</th></tr></thead><tbody>';
    verstoesse.forEach(v => {
      html += `<tr>
        <td style="color: var(--danger);">${v.typ}</td>
        <td>${v.mitarbeiter} (${v.mitarbeiter_nr})</td>
        <td>${v.kalenderwoche || formatDate(v.datum)}</td>
        <td><strong>${v.wert} ${v.einheit}</strong></td>
        <td>${v.grenzwert} ${v.einheit}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    content.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

function closeVerstoesseModal() {
  document.getElementById('verstoesse-modal').classList.add('hidden');
}

// Verstöße prüfen Button in Statistik
async function checkVerstoesse() {
  const jahr = document.getElementById('admin-statistik-jahr')?.value || new Date().getFullYear();
  const monat = document.getElementById('admin-statistik-monat')?.value || (new Date().getMonth() + 1);

  const von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
  const bis = `${jahr}-${String(monat).padStart(2, '0')}-31`;

  try {
    const verstoesse = await api(`/admin/verstoesse?von=${von}&bis=${bis}`);
    openVerstoesseModal(verstoesse);
  } catch (error) {
    console.error('Verstöße laden fehlgeschlagen:', error);
  }
}

// ==================== PAUSENREGELN ====================

async function loadPausenregeln() {
  try {
    const regeln = await api('/admin/pausenregeln');
    const tbody = document.querySelector('#pausenregeln-table tbody');

    if (regeln.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Pausenregeln definiert</td></tr>';
      return;
    }

    tbody.innerHTML = regeln.map(r => `
      <tr>
        <td>${r.name}</td>
        <td>${(r.min_arbeitszeit_minuten / 60).toFixed(1)} h</td>
        <td>${r.min_pause_minuten} Min</td>
        <td title="${r.warnung_text || '-'}">${(r.warnung_text || '-').substring(0, 30)}${(r.warnung_text || '').length > 30 ? '...' : ''}</td>
        <td>${r.aktiv ? '<span style="color:var(--success)">Aktiv</span>' : '<span style="color:var(--text-secondary)">Inaktiv</span>'}</td>
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="openPausenregelModal(${r.id})" title="Bearbeiten">✎</button>
          <button class="btn btn-small btn-icon" onclick="togglePausenregelAktiv(${r.id}, ${r.aktiv})" title="${r.aktiv ? 'Deaktivieren' : 'Aktivieren'}">${r.aktiv ? '⏸' : '▶'}</button>
          <button class="btn btn-small btn-danger btn-icon" onclick="deletePausenregel(${r.id})" title="Löschen">✕</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Pausenregeln laden fehlgeschlagen:', error);
  }
}

async function openPausenregelModal(id = null) {
  const modal = document.getElementById('pausenregel-modal');
  const title = document.getElementById('pausenregel-modal-title');
  const form = document.getElementById('pausenregel-form');

  form.reset();
  document.getElementById('pausenregel-id').value = '';
  document.getElementById('pausenregel-aktiv').checked = true;
  document.getElementById('pausenregel-form-message').innerHTML = '';

  if (id) {
    title.textContent = 'Pausenregel bearbeiten';
    try {
      const regel = await api(`/admin/pausenregeln/${id}`);
      document.getElementById('pausenregel-id').value = regel.id;
      document.getElementById('pausenregel-name').value = regel.name;
      document.getElementById('pausenregel-arbeitszeit').value = regel.min_arbeitszeit_minuten / 60;
      document.getElementById('pausenregel-pause').value = regel.min_pause_minuten;
      document.getElementById('pausenregel-warnung').value = regel.warnung_text || '';
      document.getElementById('pausenregel-aktiv').checked = regel.aktiv === 1;
    } catch (error) {
      console.error('Pausenregel laden fehlgeschlagen:', error);
    }
  } else {
    title.textContent = 'Neue Pausenregel';
  }

  modal.classList.remove('hidden');
}

function closePausenregelModal() {
  document.getElementById('pausenregel-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pausenregel-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('pausenregel-form-message');
    messageEl.innerHTML = '';

    const id = document.getElementById('pausenregel-id').value;
    const data = {
      name: document.getElementById('pausenregel-name').value,
      min_arbeitszeit_minuten: Math.round(parseFloat(document.getElementById('pausenregel-arbeitszeit').value) * 60),
      min_pause_minuten: parseInt(document.getElementById('pausenregel-pause').value),
      warnung_text: document.getElementById('pausenregel-warnung').value,
      aktiv: document.getElementById('pausenregel-aktiv').checked
    };

    try {
      if (id) {
        await api(`/admin/pausenregeln/${id}`, 'PUT', data);
      } else {
        await api('/admin/pausenregeln', 'POST', data);
      }
      closePausenregelModal();
      loadPausenregeln();
    } catch (error) {
      messageEl.innerHTML = `<span class="error">${error.message}</span>`;
    }
  });
});

async function togglePausenregelAktiv(id, currentAktiv) {
  try {
    const regel = await api(`/admin/pausenregeln/${id}`);
    await api(`/admin/pausenregeln/${id}`, 'PUT', {
      ...regel,
      aktiv: !currentAktiv
    });
    loadPausenregeln();
  } catch (error) {
    console.error('Status ändern fehlgeschlagen:', error);
  }
}

async function deletePausenregel(id) {
  if (!confirm('Pausenregel wirklich löschen?')) return;

  try {
    await api(`/admin/pausenregeln/${id}`, 'DELETE');
    loadPausenregeln();
  } catch (error) {
    alert('Fehler beim Löschen: ' + error.message);
  }
}

// ==================== EINSTELLUNGEN FUNKTIONEN ====================

async function loadEinstellungen() {
  try {
    const konfig = await api('/einstellungen/arbeitszeit');

    document.getElementById('setting-wochenstunden').value = konfig.standardWochenstunden || 40;
    document.getElementById('setting-monatsstunden').value = konfig.standardMonatsstunden || 173;
    document.getElementById('setting-max-tag').value = konfig.maxTagesstunden || 10;
    document.getElementById('setting-max-woche').value = konfig.maxWochenstunden || 50;
  } catch (error) {
    console.error('Einstellungen laden fehlgeschlagen:', error);
    showMessage('einstellungen-message', 'Einstellungen konnten nicht geladen werden', 'error');
  }
}

async function saveEinstellungen(event) {
  event.preventDefault();

  const wochenstunden = parseFloat(document.getElementById('setting-wochenstunden').value);
  const monatsstunden = parseFloat(document.getElementById('setting-monatsstunden').value);
  const maxTag = parseFloat(document.getElementById('setting-max-tag').value);
  const maxWoche = parseFloat(document.getElementById('setting-max-woche').value);

  // Validierung
  if (wochenstunden < 1 || wochenstunden > 60) {
    showMessage('einstellungen-message', 'Wochenstunden müssen zwischen 1 und 60 liegen', 'error');
    return;
  }
  if (monatsstunden < 1 || monatsstunden > 260) {
    showMessage('einstellungen-message', 'Monatsstunden müssen zwischen 1 und 260 liegen', 'error');
    return;
  }
  if (maxTag < 1 || maxTag > 16) {
    showMessage('einstellungen-message', 'Max. Tagesstunden müssen zwischen 1 und 16 liegen', 'error');
    return;
  }
  if (maxWoche < 1 || maxWoche > 72) {
    showMessage('einstellungen-message', 'Max. Wochenstunden müssen zwischen 1 und 72 liegen', 'error');
    return;
  }

  try {
    await api('/admin/einstellungen', {
      method: 'PUT',
      body: JSON.stringify({
        standard_wochenstunden: wochenstunden.toString(),
        standard_monatsstunden: monatsstunden.toString(),
        max_tagesstunden: maxTag.toString(),
        max_wochenstunden: maxWoche.toString()
      })
    });

    showMessage('einstellungen-message', 'Einstellungen gespeichert', 'success');
  } catch (error) {
    showMessage('einstellungen-message', 'Fehler beim Speichern: ' + error.message, 'error');
  }
}

// Einstellungen-Form Event-Listener
document.addEventListener('DOMContentLoaded', () => {
  const einstellungenForm = document.getElementById('einstellungen-form');
  if (einstellungenForm) {
    einstellungenForm.addEventListener('submit', saveEinstellungen);
  }
});

// Tab-Wechsel: Pausenregeln, Einstellungen und Audit laden
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'pausenregeln') {
        loadPausenregeln();
      }
      if (tab.dataset.tab === 'einstellungen') {
        loadEinstellungen();
      }
      if (tab.dataset.tab === 'audit') {
        loadAuditLog();
      }
      if (tab.dataset.tab === 'verstoesse') {
        loadVerstoesse();
      }
    });
  });
});

// ==================== AUDIT-LOG FUNKTIONEN ====================

let auditPage = 1;

async function loadAuditLog(page = 1) {
  auditPage = page;
  const tabelle = document.getElementById('audit-filter-tabelle')?.value || '';
  const aktion = document.getElementById('audit-filter-aktion')?.value || '';

  try {
    let url = `/admin/audit?page=${page}&limit=20`;
    if (tabelle) url += `&tabelle=${tabelle}`;
    if (aktion) url += `&aktion=${aktion}`;

    const result = await api(url);
    const tbody = document.querySelector('#audit-table tbody');

    if (!result.data || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Audit-Einträge gefunden</td></tr>';
      document.getElementById('audit-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = result.data.map(log => {
      const aktionClass = log.aktion.toLowerCase();
      const aktionLabel = log.aktion === 'CREATE' ? 'Erstellt' :
                          log.aktion === 'UPDATE' ? 'Geändert' :
                          log.aktion === 'DELETE' ? 'Gelöscht' : log.aktion;

      return `
        <tr>
          <td>${formatDateTime(log.zeitpunkt)}</td>
          <td>${log.mitarbeiter_name} (${log.mitarbeiter_nr})</td>
          <td><span class="audit-badge ${aktionClass}">${aktionLabel}</span></td>
          <td>${log.tabelle}</td>
          <td>${log.datensatz_id || '-'}</td>
          <td style="font-size:0.8em;color:var(--text-secondary)">${log.ip_adresse || '-'}</td>
          <td>
            <button class="audit-details-btn" onclick="showAuditDetails(${log.id}, '${log.aktion}', '${escapeHtml(log.alte_werte || '')}', '${escapeHtml(log.neue_werte || '')}', '${log.eintrag_hash || ''}')">
              Details
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Pagination
    renderPagination('audit-pagination', result.page, result.totalPages, result.total, 'loadAuditLog');

  } catch (error) {
    console.error('Audit-Log laden fehlgeschlagen:', error);
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr.replace(' ', 'T'));
  return date.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function showAuditDetails(id, aktion, alteWerte, neueWerte, hash) {
  // Parse JSON values
  let oldObj = null, newObj = null;
  try {
    if (alteWerte) oldObj = JSON.parse(alteWerte.replace(/\\'/g, "'").replace(/\\n/g, "\n"));
  } catch (e) {}
  try {
    if (neueWerte) newObj = JSON.parse(neueWerte.replace(/\\'/g, "'").replace(/\\n/g, "\n"));
  } catch (e) {}

  let content = `<div class="audit-details">`;

  if (aktion === 'UPDATE' && oldObj && newObj) {
    content += `<div class="audit-diff">
      <div class="audit-diff-col old">
        <h5>Vorher</h5>
        <pre>${JSON.stringify(oldObj, null, 2)}</pre>
      </div>
      <div class="audit-diff-col new">
        <h5>Nachher</h5>
        <pre>${JSON.stringify(newObj, null, 2)}</pre>
      </div>
    </div>`;
  } else if (aktion === 'CREATE' && newObj) {
    content += `<h5>Erstellte Daten</h5><pre>${JSON.stringify(newObj, null, 2)}</pre>`;
  } else if (aktion === 'DELETE' && oldObj) {
    content += `<h5>Gelöschte Daten</h5><pre>${JSON.stringify(oldObj, null, 2)}</pre>`;
  }

  if (hash) {
    content += `<div style="margin-top: 10px;"><strong>Hash:</strong> <span class="audit-hash">${hash}</span></div>`;
  }

  content += `</div>`;

  // Show in modal or inline
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="modal-content card" style="max-width: 700px;">
      <h2>Audit-Details #${id}</h2>
      ${content}
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function verifyAuditIntegrity() {
  try {
    const result = await api('/admin/audit/verify');
    const container = document.getElementById('audit-integrity');

    const isValid = result.invalid.length === 0 && !result.chainBroken;

    container.className = `audit-integrity ${isValid ? 'valid' : 'invalid'}`;
    container.innerHTML = `
      <h4>${isValid ? 'Integrität bestätigt' : 'Integritätsprobleme gefunden!'}</h4>
      <p><strong>Geprüfte Einträge:</strong> ${result.total}</p>
      <p><strong>Gültige Einträge:</strong> ${result.valid}</p>
      <p><strong>Hash-Kette:</strong> ${result.chainBroken ? 'UNTERBROCHEN' : 'Intakt'}</p>
      ${result.invalid.length > 0 ? `
        <p style="color: var(--danger); font-weight: bold;">
          ${result.invalid.length} ungültige Einträge gefunden!
        </p>
      ` : ''}
    `;
    container.classList.remove('hidden');

  } catch (error) {
    console.error('Integritätsprüfung fehlgeschlagen:', error);
    alert('Fehler bei der Integritätsprüfung: ' + error.message);
  }
}

function exportAuditLog() {
  const vonInput = document.getElementById('audit-export-von');
  const bisInput = document.getElementById('audit-export-bis');

  if (!vonInput.value || !bisInput.value) {
    alert('Bitte Von- und Bis-Datum auswählen');
    return;
  }

  // Konvertiere DD.MM.YYYY zu YYYY-MM-DD
  const vonParts = vonInput.value.split('.');
  const bisParts = bisInput.value.split('.');
  const von = `${vonParts[2]}-${vonParts[1]}-${vonParts[0]}`;
  const bis = `${bisParts[2]}-${bisParts[1]}-${bisParts[0]}`;

  // Download starten
  window.location.href = `/api/admin/audit/export?von=${von}&bis=${bis}`;
}

// Audit Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('audit-filter-btn')?.addEventListener('click', () => loadAuditLog(1));
  document.getElementById('audit-verify-btn')?.addEventListener('click', verifyAuditIntegrity);
  document.getElementById('audit-export-btn')?.addEventListener('click', exportAuditLog);
});

// ==================== VERSTÖSSE FUNKTIONEN ====================

async function loadVerstoesse() {
  const vonInput = document.getElementById('verstoesse-von');
  const bisInput = document.getElementById('verstoesse-bis');
  const mitarbeiterSelect = document.getElementById('verstoesse-mitarbeiter');

  // Standard: letzte 30 Tage
  const heute = new Date();
  const vor30Tagen = new Date(heute.getTime() - 30 * 24 * 60 * 60 * 1000);

  let von = vonInput?.value;
  let bis = bisInput?.value;

  // Datum konvertieren (TT.MM.JJJJ -> JJJJ-MM-TT)
  if (von && von.includes('.')) {
    const [d, m, y] = von.split('.');
    von = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else if (!von) {
    von = vor30Tagen.toISOString().split('T')[0];
  }

  if (bis && bis.includes('.')) {
    const [d, m, y] = bis.split('.');
    bis = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  } else if (!bis) {
    bis = heute.toISOString().split('T')[0];
  }

  const mitarbeiterId = mitarbeiterSelect?.value || '';

  try {
    let url = `/admin/verstoesse?von=${von}&bis=${bis}`;
    if (mitarbeiterId) url += `&mitarbeiter_id=${mitarbeiterId}`;

    const result = await api(url);

    // Statistik aktualisieren
    document.getElementById('stat-total').textContent = result.stats?.total || 0;
    document.getElementById('stat-kritisch').textContent = result.stats?.kritisch || 0;
    document.getElementById('stat-warnung').textContent = result.stats?.warnung || 0;

    const tbody = document.querySelector('#verstoesse-table tbody');
    const emptyMsg = document.getElementById('verstoesse-empty');

    if (!result.verstoesse || result.verstoesse.length === 0) {
      tbody.innerHTML = '';
      emptyMsg?.classList.remove('hidden');
      return;
    }

    emptyMsg?.classList.add('hidden');

    tbody.innerHTML = result.verstoesse.map(v => {
      const severityClass = v.schweregrad?.toLowerCase() || 'warnung';
      const severityLabel = v.schweregrad === 'KRITISCH' ? 'Kritisch' : 'Warnung';

      let typClass = 'taeglich';
      let typLabel = v.typ;
      if (v.typ?.includes('WOECHENTLICH')) {
        typClass = 'woechentlich';
        typLabel = 'Wöchentlich';
      } else if (v.typ?.includes('TAEGLICH')) {
        typClass = 'taeglich';
        typLabel = 'Täglich';
      } else if (v.typ?.includes('PAUSE')) {
        typClass = 'pause';
        typLabel = 'Pause';
      }

      const datumFormatiert = v.datum ? formatDatum(v.datum) : '-';
      const kwInfo = v.kalenderwoche ? ` (${v.kalenderwoche})` : '';

      return `
        <tr>
          <td><span class="severity-badge ${severityClass}">${severityLabel}</span></td>
          <td><span class="typ-badge ${typClass}">${typLabel}</span></td>
          <td>${v.mitarbeiter || '-'}<br><small style="color:var(--text-secondary)">${v.mitarbeiter_nr || ''}</small></td>
          <td>${datumFormatiert}${kwInfo}</td>
          <td><strong>${v.wert} ${v.einheit || 'h'}</strong></td>
          <td>${v.grenzwert} ${v.einheit || 'h'}</td>
          <td style="font-size:0.85em">${v.beschreibung || '-'}</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Verstöße laden fehlgeschlagen:', error);
  }
}

// Mitarbeiter-Dropdown für Verstöße-Filter befüllen
async function loadVerstoesseMitarbeiter() {
  const select = document.getElementById('verstoesse-mitarbeiter');
  if (!select) return;

  try {
    const result = await api('/admin/mitarbeiter?limit=100');
    if (result.data) {
      result.data.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = `${m.name} (${m.mitarbeiter_nr})`;
        select.appendChild(option);
      });
    }
  } catch (e) {
    console.error('Mitarbeiter laden fehlgeschlagen:', e);
  }
}

// Datum formatieren (JJJJ-MM-TT -> TT.MM.JJJJ)
function formatDatum(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

// Verstöße Tab initialisieren
document.addEventListener('DOMContentLoaded', () => {
  loadVerstoesseMitarbeiter();
});

// Validierungsmeldungen nach Zeiteintrag-Speicherung anzeigen
function showValidationMessages(validation) {
  // Entferne alte Meldungen
  document.querySelectorAll('.validation-message').forEach(el => el.remove());

  if (!validation) return;

  const container = document.getElementById('erfassungs-message') || document.getElementById('zeit-message');
  if (!container) return;

  // Verletzungen anzeigen (kritisch)
  if (validation.violations && validation.violations.length > 0) {
    validation.violations.forEach(v => {
      const div = document.createElement('div');
      div.className = 'validation-message violation';
      div.innerHTML = `<strong>AZG-Verletzung:</strong> ${v.nachricht}`;
      container.after(div);
    });
  }

  // Warnungen anzeigen
  if (validation.warnings && validation.warnings.length > 0) {
    validation.warnings.forEach(w => {
      const div = document.createElement('div');
      div.className = 'validation-message warning';
      div.innerHTML = `<strong>Warnung:</strong> ${w.nachricht}`;
      container.after(div);
    });
  }

  // Zusammenfassung anzeigen
  if (validation.tagesStunden || validation.wochenStunden) {
    const summary = document.createElement('div');
    summary.className = 'validation-summary';
    summary.innerHTML = `
      <span>Tag: ${validation.tagesStunden}h</span>
      <span>Woche: ${validation.wochenStunden}h</span>
    `;
    container.after(summary);
  }
}
