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
  // Prevent multiple redirects
  if (!sessionId && views.login && !views.login.classList.contains('hidden')) {
    return;
  }

  // Stop session heartbeat
  if (typeof sessionCheckTimer !== 'undefined' && sessionCheckTimer) {
    clearInterval(sessionCheckTimer);
    sessionCheckTimer = null;
  }

  sessionId = null;
  userName = null;
  isAdmin = false;
  localStorage.removeItem('sessionId');
  localStorage.removeItem('userName');
  localStorage.removeItem('isAdmin');

  // Show login view
  showView('login');

  // Show session expired message
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';
    errorEl.style.color = 'var(--warning, #f59e0b)';
  }
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

    // Clear any session expired message
    errorEl.textContent = '';
    errorEl.style.color = '';

    // Start session heartbeat
    if (typeof startSessionHeartbeat === 'function') {
      startSessionHeartbeat();
    }

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

// Arbeitstypenliste für Dropdowns laden
async function loadArbeitstypListe() {
  try {
    const arbeitstypen = await api('/arbeitstypen');
    const selectMain = document.getElementById('arbeitstyp');
    const selectEdit = document.getElementById('edit-arbeitstyp');

    const options = '<option value="">-- Auswählen --</option>' +
      arbeitstypen.map(a => `<option value="${a.name}" style="color: ${a.farbe}">${a.name}</option>`).join('');

    if (selectMain) selectMain.innerHTML = options;
    if (selectEdit) selectEdit.innerHTML = options;
  } catch (error) {
    console.error('Arbeitstypen laden fehlgeschlagen:', error);
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
  loadArbeitstypListe();

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
    standort: document.getElementById('standort').value,
    arbeitstyp: document.getElementById('arbeitstyp').value,
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
    document.getElementById('standort').value = '';
    document.getElementById('arbeitstyp').value = '';
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
        <td>${e.standort || '-'}</td>
        <td>${e.arbeitstyp || '-'}</td>
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
    document.getElementById('edit-standort').value = eintrag.standort || '';
    document.getElementById('edit-arbeitstyp').value = eintrag.arbeitstyp || '';
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
    standort: document.getElementById('edit-standort').value,
    arbeitstyp: document.getElementById('edit-arbeitstyp').value,
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

  // Stop session heartbeat
  if (sessionCheckTimer) {
    clearInterval(sessionCheckTimer);
    sessionCheckTimer = null;
  }

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

// Admin Navigation - Grouped
const adminNav = document.getElementById('admin-nav');
const adminMenuToggle = document.getElementById('admin-menu-toggle');
const menuCurrentTab = document.getElementById('menu-current-tab');

// Mobile menu toggle
adminMenuToggle?.addEventListener('click', () => {
  adminNav.classList.toggle('open');
});

// Close mobile menu when clicking backdrop
adminNav?.addEventListener('click', (e) => {
  if (e.target === adminNav) {
    adminNav.classList.remove('open');
  }
});

// Group header click - toggle group expansion
document.querySelectorAll('.nav-group-header').forEach(header => {
  header.addEventListener('click', (e) => {
    const group = header.closest('.nav-group');
    const items = group.querySelector('.nav-group-items');
    const arrow = header.querySelector('.nav-group-arrow');
    const isMobile = window.innerWidth <= 768;

    // On mobile, toggle current group; on desktop, close others first
    if (!isMobile) {
      // Close all other groups
      document.querySelectorAll('.nav-group-items.open').forEach(openItems => {
        if (openItems !== items) {
          openItems.classList.remove('open');
          const otherArrow = openItems.closest('.nav-group').querySelector('.nav-group-arrow');
          if (otherArrow) otherArrow.textContent = '▸';
        }
      });
    }

    // Toggle current group
    items.classList.toggle('open');
    arrow.textContent = items.classList.contains('open') ? '▾' : '▸';
  });
});

// Tab click - switch content
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active from all tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    // Set active tab
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');

    // Update group header active states
    document.querySelectorAll('.nav-group-header').forEach(h => h.classList.remove('active'));
    const parentGroup = tab.closest('.nav-group');
    if (parentGroup) {
      parentGroup.querySelector('.nav-group-header').classList.add('active');
    }

    // Update mobile menu current tab label
    if (menuCurrentTab) {
      menuCurrentTab.textContent = tab.textContent;
    }

    // Close mobile menu after selection
    if (window.innerWidth <= 768 && adminNav) {
      adminNav.classList.remove('open');
    }

    // Collapse all menu groups after selection (desktop and mobile)
    document.querySelectorAll('.nav-group-items.open').forEach(items => {
      items.classList.remove('open');
      const arrow = items.closest('.nav-group').querySelector('.nav-group-arrow');
      if (arrow) arrow.textContent = '▸';
    });

    // Leistungsnachweise-spezifische Initialisierung
    const tabName = tab.dataset.tab;
    if (tabName === 'leistungsnachweise' || tabName === 'leistungsnachweis-neu') {
      if (typeof initLeistungsnachweisForm === 'function') {
        initLeistungsnachweisForm();
      }
      if (tabName === 'leistungsnachweise' && typeof loadLeistungsnachweise === 'function') {
        loadLeistungsnachweise();
      }
    }
  });
});

// Close dropdowns when clicking outside (desktop)
document.addEventListener('click', (e) => {
  if (window.innerWidth > 768 && !e.target.closest('.admin-nav')) {
    document.querySelectorAll('.nav-group-items.open').forEach(items => {
      // Keep the active group open
      const group = items.closest('.nav-group');
      if (!group.querySelector('.tab.active')) {
        items.classList.remove('open');
        const arrow = group.querySelector('.nav-group-arrow');
        if (arrow) arrow.textContent = '▸';
      }
    });
  }
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
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:40px;">Keine Einträge gefunden</td></tr>';
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
        <td title="${e.standort || '-'}">${e.standort || '-'}</td>
        <td title="${e.arbeitstyp || '-'}">${e.arbeitstyp || '-'}</td>
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
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-secondary)">Noch keine Projekte / Baustellen angelegt.</td></tr>';
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
    filterInfoHtml += `<div class="info-row"><strong>Projekt / Baustelle:</strong> ${baustelleFilter}</div>`;
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
        ${showBaustelleCol ? '<th>Projekt / Baustelle</th>' : ''}
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
      <div class="label">Projekt / Baustelle:</div>
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
    title.textContent = 'Projekt / Baustelle bearbeiten';
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
    title.textContent = 'Neues Projekt / Baustelle';
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

// Session-Heartbeat: Periodisch prüfen ob Session noch gültig ist
const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 Minuten
let sessionCheckTimer = null;

function startSessionHeartbeat() {
  // Stop any existing timer
  if (sessionCheckTimer) {
    clearInterval(sessionCheckTimer);
  }

  sessionCheckTimer = setInterval(async () => {
    // Only check if we have a session and are not on login page
    if (!sessionId || (views.login && !views.login.classList.contains('hidden'))) {
      return;
    }

    try {
      // Silent session check (no loading spinner)
      await api('/session', 'GET', null, false);
    } catch (error) {
      // Session invalid - api() already calls handleSessionExpired() for 401
    }
  }, SESSION_CHECK_INTERVAL);
}

// Start heartbeat when page loads (if session exists)
if (sessionId) {
  startSessionHeartbeat();
}

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

      // Handle session expiry
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }

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

    // Inspektions-Code laden
    const einstellungen = await api('/admin/einstellungen');
    const inspektionCode = einstellungen.find(e => e.schluessel === 'inspektion_code');
    document.getElementById('setting-inspektion-code').value = inspektionCode?.wert || '';
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

  const inspektionCode = document.getElementById('setting-inspektion-code').value.trim();

  try {
    await api('/admin/einstellungen', {
      method: 'PUT',
      body: JSON.stringify({
        standard_wochenstunden: wochenstunden.toString(),
        standard_monatsstunden: monatsstunden.toString(),
        max_tagesstunden: maxTag.toString(),
        max_wochenstunden: maxWoche.toString(),
        inspektion_code: inspektionCode
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
      if (tab.dataset.tab === 'retention') {
        loadRetentionKonfig();
        loadRetentionAnalyse();
        loadLoeschprotokoll();
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

// ==================== MONATSABRECHNUNG FUNKTIONEN ====================

let currentMonatsabrechnung = null;

function openMonatsabrechnungModal() {
  const modal = document.getElementById('monatsabrechnung-modal');
  const jahrSelect = document.getElementById('ma-jahr');
  const monatSelect = document.getElementById('ma-monat');

  // Jahre befüllen
  const currentYear = new Date().getFullYear();
  jahrSelect.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    jahrSelect.appendChild(opt);
  }

  // Aktuellen Monat vorauswählen
  monatSelect.value = new Date().getMonth() + 1;

  modal.classList.remove('hidden');
  loadMonatsabrechnung();
}

function closeMonatsabrechnungModal() {
  document.getElementById('monatsabrechnung-modal').classList.add('hidden');
  currentMonatsabrechnung = null;
}

async function loadMonatsabrechnung() {
  const jahr = document.getElementById('ma-jahr').value;
  const monat = document.getElementById('ma-monat').value;
  const contentEl = document.getElementById('ma-content');

  contentEl.innerHTML = '<p style="text-align:center; padding:40px;">Lade...</p>';

  try {
    const data = await api(`/monatsabrechnung?jahr=${jahr}&monat=${monat}`);
    currentMonatsabrechnung = data;

    const monatsNamen = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    if (!data.eintraege || data.eintraege.length === 0) {
      contentEl.innerHTML = `
        <p style="text-align:center; color:var(--text-secondary); padding:40px;">
          Keine Einträge für ${monatsNamen[parseInt(monat)]} ${jahr} vorhanden.
        </p>
      `;
      return;
    }

    // Übersicht
    const differenzClass = data.berechnung.differenz >= 0 ? 'success' : 'danger';
    const differenzPrefix = data.berechnung.differenz >= 0 ? '+' : '';

    let html = `
      <div class="ma-summary" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:15px; margin-bottom:25px;">
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.8rem; color:var(--primary);">${data.summen.arbeitstage}</div>
          <div class="stat-label">Arbeitstage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.8rem; color:var(--primary);">${data.summen.nettoStunden.replace('.', ',')}h</div>
          <div class="stat-label">Ist-Stunden</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.8rem; color:var(--text-secondary);">${data.soll.monatStunden}h</div>
          <div class="stat-label">Soll-Stunden</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.8rem; color:var(--${differenzClass});">${differenzPrefix}${data.berechnung.differenz.toFixed(1).replace('.', ',')}h</div>
          <div class="stat-label">${data.berechnung.differenz >= 0 ? 'Überstunden' : 'Minderstunden'}</div>
        </div>
      </div>`;

    // Gleitzeit-Saldo anzeigen (wenn aktiviert)
    if (data.gleitzeit && data.gleitzeit.aktiv) {
      const saldo = parseFloat(data.gleitzeit.saldoStunden || 0);
      const saldoClass = saldo >= 0 ? 'success' : 'danger';
      const saldoPrefix = saldo >= 0 ? '+' : '';
      const uebertrag = parseFloat(data.gleitzeit.uebertragStunden || 0);
      const uebertragPrefix = uebertrag >= 0 ? '+' : '';

      html += `
      <div class="gleitzeit-info">
        <h4>Gleitzeit-Saldo (Periode: ${formatDatum(data.gleitzeit.periode.start)} - ${formatDatum(data.gleitzeit.periode.ende)})</h4>
        <div class="gleitzeit-info-grid">
          <div class="gleitzeit-info-item">
            <span class="label">Übertrag Vorperiode:</span>
            <span class="value">${uebertragPrefix}${uebertrag.toFixed(2).replace('.', ',')}h</span>
          </div>
          <div class="gleitzeit-info-item">
            <span class="label">Aktueller Saldo:</span>
            <span class="value" style="color:var(--${saldoClass}); font-size:1.1em;">${saldoPrefix}${saldo.toFixed(2).replace('.', ',')}h</span>
          </div>
          <div class="gleitzeit-info-item">
            <span class="label">Limit:</span>
            <span class="value">+${data.gleitzeit.limits.maxPlus}h / -${data.gleitzeit.limits.maxMinus}h</span>
          </div>
        </div>
      </div>`;
    }

    html += `

      <h3 style="margin:20px 0 10px;">Tagesübersicht</h3>
      <div class="table-container">
        <table class="ma-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Beginn</th>
              <th>Ende</th>
              <th>Pause</th>
              <th>Netto</th>
              <th>Projekt / Baustelle / Kunde</th>
            </tr>
          </thead>
          <tbody>
    `;

    data.eintraege.forEach(e => {
      const nettoStd = (e.netto_minuten / 60).toFixed(2).replace('.', ',');
      const ort = [e.baustelle, e.kunde].filter(Boolean).join(' / ') || '-';
      html += `
        <tr>
          <td>${formatDatum(e.datum)}</td>
          <td>${e.arbeitsbeginn}</td>
          <td>${e.arbeitsende}</td>
          <td style="text-align:center">${e.pause_minuten} min</td>
          <td style="text-align:right"><strong>${nettoStd}h</strong></td>
          <td style="font-size:0.85em; color:var(--text-secondary)">${ort}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
          <tfoot>
            <tr style="font-weight:600; background:var(--bg-light);">
              <td colspan="4">Gesamt</td>
              <td style="text-align:right">${data.summen.nettoStunden.replace('.', ',')}h</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // Wochenübersicht
    if (data.wochen && data.wochen.length > 0) {
      html += `<h3 style="margin:25px 0 10px;">Wochenübersicht</h3>
        <div class="table-container">
          <table class="ma-table">
            <thead>
              <tr>
                <th>KW</th>
                <th>Zeitraum</th>
                <th>Tage</th>
                <th>Stunden</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.wochen.forEach(w => {
        const std = (w.netto_minuten / 60).toFixed(2).replace('.', ',');
        html += `
          <tr>
            <td>KW ${w.kalenderwoche}</td>
            <td>${formatDatum(w.woche_start)} - ${formatDatum(w.woche_ende)}</td>
            <td style="text-align:center">${w.tage}</td>
            <td style="text-align:right"><strong>${std}h</strong></td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
    }

    contentEl.innerHTML = html;

    // Bestätigungsbereich anzeigen
    updateBestaetigungsAnzeige(data);

  } catch (error) {
    contentEl.innerHTML = `<p style="text-align:center; color:var(--danger); padding:40px;">Fehler: ${error.message}</p>`;
  }
}

// Bestätigungsanzeige in Monatsabrechnung aktualisieren
function updateBestaetigungsAnzeige(data) {
  const container = document.getElementById('ma-bestaetigung');
  const contentEl = document.getElementById('ma-bestaetigung-content');

  if (!container || !contentEl) return;

  container.style.display = 'block';

  if (data.bestaetigung && data.bestaetigung.bestaetigt) {
    // Bereits bestätigt
    const datum = new Date(data.bestaetigung.bestaetigt_am.replace(' ', 'T'));
    const formatiert = datum.toLocaleString('de-AT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    contentEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:15px;">
        <span style="font-size:2rem; color:var(--success);">&#10003;</span>
        <div>
          <strong style="color:var(--success);">Monat bestätigt</strong><br>
          <span style="color:var(--text-secondary); font-size:0.9rem;">Bestätigt am ${formatiert}</span>
        </div>
      </div>
    `;
    container.style.background = '#ecfdf5';
    container.style.borderColor = '#a7f3d0';
  } else if (data.eintraege && data.eintraege.length > 0) {
    // Noch nicht bestätigt - Button anzeigen
    contentEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
        <div>
          <strong>Monat noch nicht bestätigt</strong><br>
          <span style="color:var(--text-secondary); font-size:0.9rem;">
            Bitte prüfe deine Einträge und bestätige die Richtigkeit.
          </span>
        </div>
        <button class="btn btn-primary" onclick="bestaetigeMonat()">
          Monat bestätigen
        </button>
      </div>
    `;
    container.style.background = '#fffbeb';
    container.style.borderColor = '#fde68a';
  } else {
    // Keine Einträge
    container.style.display = 'none';
  }
}

// Monat bestätigen
async function bestaetigeMonat() {
  const jahr = document.getElementById('ma-jahr').value;
  const monat = document.getElementById('ma-monat').value;

  if (!confirm(`Möchtest du den ${getMonatsName(parseInt(monat))} ${jahr} wirklich bestätigen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
    return;
  }

  try {
    const result = await api('/monatsbestaetigung', 'POST', { jahr: parseInt(jahr), monat: parseInt(monat) });

    if (result.success) {
      // Aktualisiere currentMonatsabrechnung
      currentMonatsabrechnung.bestaetigung = {
        bestaetigt: true,
        bestaetigt_am: result.bestaetigt_am
      };
      updateBestaetigungsAnzeige(currentMonatsabrechnung);
      showMessage('ma-bestaetigung-content', 'Monat erfolgreich bestätigt!', 'success');
    }
  } catch (error) {
    if (error.message.includes('bereits bestätigt')) {
      loadMonatsabrechnung(); // Neu laden
    } else {
      alert('Fehler beim Bestätigen: ' + error.message);
    }
  }
}

function getMonatsName(monat) {
  const namen = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return namen[monat] || '';
}

function printMonatsabrechnung() {
  if (!currentMonatsabrechnung) {
    alert('Bitte zuerst eine Monatsabrechnung laden.');
    return;
  }

  const data = currentMonatsabrechnung;
  const monatsNamen = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  const differenzPrefix = data.berechnung.differenz >= 0 ? '+' : '';
  const differenzText = data.berechnung.differenz >= 0 ? 'Überstunden' : 'Minderstunden';

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Monatsabrechnung ${monatsNamen[data.zeitraum.monat]} ${data.zeitraum.jahr}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; padding: 20mm; }
        h1 { font-size: 18pt; margin-bottom: 5mm; color: #059669; }
        h2 { font-size: 12pt; margin: 8mm 0 3mm; border-bottom: 1px solid #ccc; padding-bottom: 2mm; }
        .header { display: flex; justify-content: space-between; margin-bottom: 10mm; }
        .header-left { }
        .header-right { text-align: right; font-size: 10pt; color: #666; }
        .summary { display: flex; gap: 10mm; margin: 8mm 0; padding: 5mm; background: #f5f5f5; border-radius: 3mm; }
        .summary-item { flex: 1; text-align: center; }
        .summary-value { font-size: 16pt; font-weight: bold; color: #059669; }
        .summary-label { font-size: 9pt; color: #666; margin-top: 1mm; }
        table { width: 100%; border-collapse: collapse; font-size: 10pt; }
        th, td { border: 1px solid #ddd; padding: 2mm 3mm; }
        th { background: #f0f0f0; font-weight: 600; text-align: left; }
        td.right, th.right { text-align: right; }
        td.center, th.center { text-align: center; }
        tfoot td { font-weight: 600; background: #f5f5f5; }
        .footer { margin-top: 15mm; padding-top: 5mm; border-top: 1px solid #ccc; }
        .signatures { display: flex; justify-content: space-between; margin-top: 20mm; }
        .signature { width: 45%; text-align: center; }
        .signature-line { border-top: 1px solid #333; margin-top: 15mm; padding-top: 2mm; font-size: 9pt; }
        @media print {
          body { padding: 10mm; }
          @page { margin: 15mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>Monatsabrechnung</h1>
          <p><strong>${data.mitarbeiter.name}</strong> (${data.mitarbeiter.mitarbeiter_nr})</p>
        </div>
        <div class="header-right">
          <p><strong>${monatsNamen[data.zeitraum.monat]} ${data.zeitraum.jahr}</strong></p>
          <p>Erstellt: ${new Date().toLocaleDateString('de-AT')}</p>
        </div>
      </div>

      <div class="summary">
        <div class="summary-item">
          <div class="summary-value">${data.summen.arbeitstage}</div>
          <div class="summary-label">Arbeitstage</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${data.summen.nettoStunden.replace('.', ',')}h</div>
          <div class="summary-label">Ist-Stunden</div>
        </div>
        <div class="summary-item">
          <div class="summary-value">${data.soll.monatStunden}h</div>
          <div class="summary-label">Soll-Stunden</div>
        </div>
        <div class="summary-item">
          <div class="summary-value" style="color: ${data.berechnung.differenz >= 0 ? '#059669' : '#dc2626'}">${differenzPrefix}${data.berechnung.differenz.toFixed(1).replace('.', ',')}h</div>
          <div class="summary-label">${differenzText}</div>
        </div>
      </div>

      <h2>Tagesübersicht</h2>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Beginn</th>
            <th>Ende</th>
            <th class="center">Pause</th>
            <th class="right">Netto</th>
            <th>Projekt / Baustelle / Kunde</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.eintraege.forEach(e => {
    const nettoStd = (e.netto_minuten / 60).toFixed(2).replace('.', ',');
    const ort = [e.baustelle, e.kunde].filter(Boolean).join(' / ') || '-';
    html += `
      <tr>
        <td>${formatDatum(e.datum)}</td>
        <td>${e.arbeitsbeginn}</td>
        <td>${e.arbeitsende}</td>
        <td class="center">${e.pause_minuten} min</td>
        <td class="right">${nettoStd}h</td>
        <td>${ort}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">Gesamt</td>
            <td class="right">${data.summen.nettoStunden.replace('.', ',')}h</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <p style="font-size: 9pt; color: #666;">
          Diese Monatsabrechnung wurde automatisch aus den erfassten Arbeitszeiten erstellt.
        </p>
      </div>

      <div class="signatures">
        <div class="signature">
          <div class="signature-line">Mitarbeiter/in</div>
        </div>
        <div class="signature">
          <div class="signature-line">Arbeitgeber</div>
        </div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

// Event Listener für Monatsabrechnung Button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('monatsabrechnung-btn')?.addEventListener('click', openMonatsabrechnungModal);
});

// ==================== GLEITZEIT FUNKTIONEN ====================

let gleitzeitKonfig = null;

// Gleitzeit-Jahre-Dropdown initialisieren
function initGleitzeitJahre() {
  const select = document.getElementById('gleitzeit-jahr');
  if (!select) return;

  const currentYear = new Date().getFullYear();
  select.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }

  // Aktuellen Monat vorauswählen
  const monatSelect = document.getElementById('gleitzeit-monat');
  if (monatSelect) {
    monatSelect.value = new Date().getMonth() + 1;
  }
}

// Gleitzeit-Konfiguration laden
async function loadGleitzeitKonfig() {
  try {
    gleitzeitKonfig = await api('/admin/gleitzeit/konfig');

    document.getElementById('gleitzeit-aktiv').checked = gleitzeitKonfig.aktiv;
    document.getElementById('gleitzeit-durchrechnung').value = gleitzeitKonfig.durchrechnungszeitraum;
    document.getElementById('gleitzeit-max-plus').value = gleitzeitKonfig.maxPlus;
    document.getElementById('gleitzeit-max-minus').value = gleitzeitKonfig.maxMinus;
    document.getElementById('gleitzeit-uebertrag').value = gleitzeitKonfig.uebertragMax;

    return gleitzeitKonfig;
  } catch (error) {
    console.error('Gleitzeit-Konfiguration laden fehlgeschlagen:', error);
  }
}

// Gleitzeit-Konfiguration speichern
async function saveGleitzeitKonfig(event) {
  event.preventDefault();
  const messageEl = document.getElementById('gleitzeit-konfig-message');

  try {
    await api('/admin/gleitzeit/konfig', 'PUT', {
      gleitzeit_aktiv: document.getElementById('gleitzeit-aktiv').checked,
      gleitzeit_durchrechnungszeitraum: parseInt(document.getElementById('gleitzeit-durchrechnung').value),
      gleitzeit_max_plus: parseFloat(document.getElementById('gleitzeit-max-plus').value),
      gleitzeit_max_minus: parseFloat(document.getElementById('gleitzeit-max-minus').value),
      gleitzeit_uebertrag_max: parseFloat(document.getElementById('gleitzeit-uebertrag').value)
    });

    showMessage('gleitzeit-konfig-message', 'Einstellungen gespeichert', 'success');
    loadGleitzeitUebersicht();
  } catch (error) {
    showMessage('gleitzeit-konfig-message', 'Fehler: ' + error.message, 'error');
  }
}

// Gleitzeit-Übersicht laden
async function loadGleitzeitUebersicht() {
  const jahr = document.getElementById('gleitzeit-jahr')?.value || new Date().getFullYear();
  const monat = document.getElementById('gleitzeit-monat')?.value || (new Date().getMonth() + 1);

  try {
    const data = await api(`/admin/gleitzeit/uebersicht?jahr=${jahr}&monat=${monat}`);

    const tbody = document.querySelector('#gleitzeit-table tbody');
    const statusEl = document.getElementById('gleitzeit-status');
    const inactiveMsg = document.getElementById('gleitzeit-inactive-msg');
    const tableContainer = document.getElementById('gleitzeit-table-container');

    if (!data.aktiv) {
      statusEl.style.display = 'none';
      tableContainer.style.display = 'none';
      inactiveMsg.style.display = 'block';
      return;
    }

    inactiveMsg.style.display = 'none';
    tableContainer.style.display = 'block';
    statusEl.style.display = 'flex';

    // Status-Karten aktualisieren
    document.getElementById('gleitzeit-periode').textContent =
      `${formatDatum(data.periode.start)} - ${formatDatum(data.periode.ende)}`;

    const zeitraumText = {
      1: '1 Monat',
      3: '3 Monate (Quartal)',
      6: '6 Monate (Halbjahr)',
      12: '12 Monate (Jahr)'
    };
    document.getElementById('gleitzeit-zeitraum').textContent =
      zeitraumText[data.periode.durchrechnungszeitraum] || data.periode.durchrechnungszeitraum + ' Monate';

    // Tabelle befüllen
    if (!data.mitarbeiter || data.mitarbeiter.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Mitarbeiter gefunden</td></tr>';
      return;
    }

    tbody.innerHTML = data.mitarbeiter.map(m => {
      const saldo = parseFloat(m.saldoStunden || 0);
      const saldoClass = saldo >= 0 ? 'positive' : 'negative';
      const saldoPrefix = saldo >= 0 ? '+' : '';

      // Status ermitteln
      let statusHtml = '<span class="status-badge ok">OK</span>';
      if (saldo >= m.limits?.maxPlus) {
        statusHtml = '<span class="status-badge warning">Max. erreicht</span>';
      } else if (saldo <= -m.limits?.maxMinus) {
        statusHtml = '<span class="status-badge danger">Limit überschritten</span>';
      } else if (saldo >= m.limits?.maxPlus * 0.8) {
        statusHtml = '<span class="status-badge info">Fast voll</span>';
      }

      const uebertrag = parseFloat(m.uebertragStunden || 0);
      const uebertragPrefix = uebertrag >= 0 ? '+' : '';

      return `
        <tr>
          <td>${m.name}</td>
          <td>${m.mitarbeiter_nr}</td>
          <td style="text-align:right">${m.sollStunden?.replace('.', ',') || '0,00'}h</td>
          <td style="text-align:right">${m.istStunden?.replace('.', ',') || '0,00'}h</td>
          <td style="text-align:right; color:var(--text-secondary)">${uebertragPrefix}${uebertrag.toFixed(2).replace('.', ',')}h</td>
          <td style="text-align:right; font-weight:600;" class="${saldoClass}">
            ${saldoPrefix}${saldo.toFixed(2).replace('.', ',')}h
          </td>
          <td>${statusHtml}</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Gleitzeit-Übersicht laden fehlgeschlagen:', error);
  }
}

// Gleitzeit Tab-Wechsel Handler
document.addEventListener('DOMContentLoaded', () => {
  initGleitzeitJahre();

  // Tab-Wechsel
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'gleitzeit') {
        loadGleitzeitKonfig();
        loadGleitzeitUebersicht();
      }
    });
  });

  // Konfig-Formular
  document.getElementById('gleitzeit-konfig-form')?.addEventListener('submit', saveGleitzeitKonfig);
});

// ==================== BESTÄTIGUNGEN FUNKTIONEN (Admin) ====================

// Jahre-Dropdown für Bestätigungen initialisieren
function initBestaetigungJahre() {
  const select = document.getElementById('bestaetigung-jahr');
  if (!select) return;

  const currentYear = new Date().getFullYear();
  select.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  }

  // Aktuellen Monat vorauswählen
  const monatSelect = document.getElementById('bestaetigung-monat');
  if (monatSelect) {
    monatSelect.value = new Date().getMonth() + 1;
  }
}

// Bestätigungsübersicht laden (Admin)
async function loadBestaetigungsUebersicht() {
  const jahr = document.getElementById('bestaetigung-jahr')?.value || new Date().getFullYear();
  const monat = document.getElementById('bestaetigung-monat')?.value || (new Date().getMonth() + 1);

  try {
    const data = await api(`/admin/monatsbestaetigung/uebersicht?jahr=${jahr}&monat=${monat}`);

    // Statistik aktualisieren
    document.getElementById('bestaetigung-stat-gesamt').textContent = data.statistik.gesamt;
    document.getElementById('bestaetigung-stat-bestaetigt').textContent = data.statistik.bestaetigt;
    document.getElementById('bestaetigung-stat-offen').textContent = data.statistik.offen;

    // Tabelle befüllen
    const tbody = document.querySelector('#bestaetigungen-table tbody');

    if (!data.mitarbeiter || data.mitarbeiter.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Mitarbeiter gefunden</td></tr>';
      return;
    }

    tbody.innerHTML = data.mitarbeiter.map(m => {
      let statusHtml;
      if (m.bestaetigt) {
        statusHtml = '<span class="status-badge ok">Bestätigt</span>';
      } else if (m.eintraege > 0) {
        statusHtml = '<span class="status-badge warning">Offen</span>';
      } else {
        statusHtml = '<span class="status-badge" style="background:#f3f4f6;color:var(--text-secondary);">Keine Einträge</span>';
      }

      let bestaetigtAm = '-';
      if (m.bestaetigt_am) {
        const datum = new Date(m.bestaetigt_am.replace(' ', 'T'));
        bestaetigtAm = datum.toLocaleString('de-AT', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
      }

      return `
        <tr>
          <td>${m.name}</td>
          <td>${m.mitarbeiter_nr}</td>
          <td style="text-align:center">${m.eintraege}</td>
          <td style="text-align:right">${m.stunden.replace('.', ',')}h</td>
          <td>${statusHtml}</td>
          <td style="font-size:0.85em; color:var(--text-secondary)">${bestaetigtAm}</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Bestätigungsübersicht laden fehlgeschlagen:', error);
  }
}

// Tab-Wechsel Handler für Bestätigungen
document.addEventListener('DOMContentLoaded', () => {
  initBestaetigungJahre();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'bestaetigungen') {
        loadBestaetigungsUebersicht();
      }
      if (tab.dataset.tab === 'kollektivvertrag') {
        loadKollektivvertraege();
      }
    });
  });
});

// ==================== KOLLEKTIVVERTRAG (KV) FUNKTIONEN ====================

let currentKVId = null;

async function loadKollektivvertraege() {
  try {
    const kvs = await api('/admin/kv?alle=true');
    const tbody = document.querySelector('#kv-table tbody');

    if (!kvs || kvs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Keine Kollektivverträge vorhanden</td></tr>';
      return;
    }

    tbody.innerHTML = kvs.map(kv => `
      <tr>
        <td><strong>${escapeHtml(kv.name)}</strong></td>
        <td>${escapeHtml(kv.branche || '-')}</td>
        <td style="text-align:center">${kv.gruppen_anzahl}</td>
        <td style="text-align:center">${kv.regeln_anzahl}</td>
        <td>${kv.aktiv ? '<span class="status-badge ok">Aktiv</span>' : '<span class="status-badge" style="background:#f3f4f6">Inaktiv</span>'}</td>
        <td>
          <button class="btn-icon" onclick="showKVDetails(${kv.id})" title="Details">📋</button>
          <button class="btn-icon" onclick="editKV(${kv.id})" title="Bearbeiten">✏️</button>
          <button class="btn-icon danger" onclick="deleteKV(${kv.id})" title="Löschen">🗑️</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('KV laden fehlgeschlagen:', error);
    showMessage('kv-message', 'Fehler beim Laden der Kollektivverträge', 'error');
  }
}

function openKVModal(kv = null) {
  document.getElementById('kv-modal').classList.remove('hidden');
  document.getElementById('kv-modal-title').textContent = kv ? 'Kollektivvertrag bearbeiten' : 'Neuer Kollektivvertrag';
  document.getElementById('kv-id').value = kv?.id || '';
  document.getElementById('kv-name').value = kv?.name || '';
  document.getElementById('kv-branche').value = kv?.branche || '';
  document.getElementById('kv-beschreibung').value = kv?.beschreibung || '';
  document.getElementById('kv-gueltig-ab').value = kv?.gueltig_ab ? formatDateForInput(kv.gueltig_ab) : '';
  document.getElementById('kv-gueltig-bis').value = kv?.gueltig_bis ? formatDateForInput(kv.gueltig_bis) : '';
}

function closeKVModal() {
  document.getElementById('kv-modal').classList.add('hidden');
  document.getElementById('kv-form').reset();
}

async function editKV(id) {
  try {
    const kv = await api(`/admin/kv/${id}`);
    openKVModal(kv);
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function saveKV(event) {
  event.preventDefault();
  const id = document.getElementById('kv-id').value;

  const data = {
    name: document.getElementById('kv-name').value,
    branche: document.getElementById('kv-branche').value,
    beschreibung: document.getElementById('kv-beschreibung').value,
    gueltig_ab: parseDateInput(document.getElementById('kv-gueltig-ab').value),
    gueltig_bis: parseDateInput(document.getElementById('kv-gueltig-bis').value)
  };

  try {
    if (id) {
      await api(`/admin/kv/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api('/admin/kv', { method: 'POST', body: JSON.stringify(data) });
    }
    closeKVModal();
    loadKollektivvertraege();
    showMessage('kv-message', 'Kollektivvertrag gespeichert', 'success');
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function deleteKV(id) {
  if (!confirm('Kollektivvertrag wirklich löschen? Alle zugehörigen Gruppen und Regeln werden ebenfalls gelöscht.')) return;

  try {
    await api(`/admin/kv/${id}`, { method: 'DELETE' });
    loadKollektivvertraege();
    closeKVDetails();
    showMessage('kv-message', 'Kollektivvertrag gelöscht', 'success');
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function showKVDetails(id) {
  currentKVId = id;

  try {
    const kv = await api(`/admin/kv/${id}`);
    document.getElementById('kv-details-title').textContent = `${kv.name} - Details`;
    document.getElementById('kv-details').classList.remove('hidden');

    await Promise.all([loadKVGruppen(id), loadKVRegeln(id)]);
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

function closeKVDetails() {
  document.getElementById('kv-details').classList.add('hidden');
  currentKVId = null;
}

// KV-Gruppen
async function loadKVGruppen(kvId) {
  try {
    const gruppen = await api(`/admin/kv/${kvId}/gruppen?alle=true`);
    const tbody = document.querySelector('#kv-gruppen-table tbody');

    if (!gruppen || gruppen.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary)">Keine Gruppen vorhanden</td></tr>';
      return;
    }

    tbody.innerHTML = gruppen.map(g => `
      <tr>
        <td><strong>${escapeHtml(g.name)}</strong></td>
        <td style="text-align:center">${g.standard_wochenstunden}h</td>
        <td style="text-align:center">${g.standard_monatsstunden}h</td>
        <td style="text-align:center">${g.mitarbeiter_anzahl}</td>
        <td>${g.aktiv ? '<span class="status-badge ok">Aktiv</span>' : '<span class="status-badge">Inaktiv</span>'}</td>
        <td>
          <button class="btn-icon" onclick="editKVGruppe(${g.id})" title="Bearbeiten">✏️</button>
          <button class="btn-icon danger" onclick="deleteKVGruppe(${g.id})" title="Löschen">🗑️</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('KV-Gruppen laden fehlgeschlagen:', error);
  }
}

function openKVGruppeModal(gruppe = null) {
  document.getElementById('kv-gruppe-modal').classList.remove('hidden');
  document.getElementById('kv-gruppe-modal-title').textContent = gruppe ? 'Gruppe bearbeiten' : 'Neue Mitarbeiter-Gruppe';
  document.getElementById('kv-gruppe-id').value = gruppe?.id || '';
  document.getElementById('kv-gruppe-name').value = gruppe?.name || '';
  document.getElementById('kv-gruppe-beschreibung').value = gruppe?.beschreibung || '';
  document.getElementById('kv-gruppe-wochenstunden').value = gruppe?.standard_wochenstunden || 40;
  document.getElementById('kv-gruppe-monatsstunden').value = gruppe?.standard_monatsstunden || 173;
}

function closeKVGruppeModal() {
  document.getElementById('kv-gruppe-modal').classList.add('hidden');
  document.getElementById('kv-gruppe-form').reset();
}

async function editKVGruppe(id) {
  try {
    const gruppen = await api(`/admin/kv/${currentKVId}/gruppen?alle=true`);
    const gruppe = gruppen.find(g => g.id === id);
    if (gruppe) openKVGruppeModal(gruppe);
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function saveKVGruppe(event) {
  event.preventDefault();
  const id = document.getElementById('kv-gruppe-id').value;

  const data = {
    name: document.getElementById('kv-gruppe-name').value,
    beschreibung: document.getElementById('kv-gruppe-beschreibung').value,
    standard_wochenstunden: parseFloat(document.getElementById('kv-gruppe-wochenstunden').value),
    standard_monatsstunden: parseFloat(document.getElementById('kv-gruppe-monatsstunden').value)
  };

  try {
    if (id) {
      await api(`/admin/kv-gruppen/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api(`/admin/kv/${currentKVId}/gruppen`, { method: 'POST', body: JSON.stringify(data) });
    }
    closeKVGruppeModal();
    loadKVGruppen(currentKVId);
    loadKollektivvertraege();
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function deleteKVGruppe(id) {
  if (!confirm('Gruppe wirklich löschen? Mitarbeiter werden von dieser Gruppe getrennt.')) return;

  try {
    await api(`/admin/kv-gruppen/${id}`, { method: 'DELETE' });
    loadKVGruppen(currentKVId);
    loadKollektivvertraege();
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

// KV-Regeln
async function loadKVRegeln(kvId) {
  try {
    const regeln = await api(`/admin/kv/${kvId}/regeln?alle=true`);
    const tbody = document.querySelector('#kv-regeln-table tbody');

    if (!regeln || regeln.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-secondary)">Keine Regeln vorhanden</td></tr>';
      return;
    }

    const regelTypLabels = {
      'UEBERSTUNDEN': 'Überstunden',
      'ZUSCHLAG_NACHT': 'Nachtarbeit',
      'ZUSCHLAG_SAMSTAG': 'Samstag',
      'ZUSCHLAG_SONNTAG': 'Sonntag',
      'ZUSCHLAG_FEIERTAG': 'Feiertag'
    };

    tbody.innerHTML = regeln.map(r => {
      let bedingungText = '-';
      if (r.bedingung) {
        try {
          const bed = JSON.parse(r.bedingung);
          if (bed.nach_stunden) bedingungText = `Nach ${bed.nach_stunden}h`;
          if (bed.von_uhrzeit && bed.bis_uhrzeit) bedingungText = `${bed.von_uhrzeit}-${bed.bis_uhrzeit}`;
        } catch (e) {}
      }

      return `
        <tr>
          <td>${regelTypLabels[r.regel_typ] || r.regel_typ}</td>
          <td><strong>${escapeHtml(r.name)}</strong></td>
          <td style="text-align:right">${r.wert}${r.einheit === 'PROZENT' ? '%' : 'h'}</td>
          <td>${bedingungText}</td>
          <td>${r.aktiv ? '<span class="status-badge ok">Aktiv</span>' : '<span class="status-badge">Inaktiv</span>'}</td>
          <td>
            <button class="btn-icon" onclick="editKVRegel(${r.id})" title="Bearbeiten">✏️</button>
            <button class="btn-icon danger" onclick="deleteKVRegel(${r.id})" title="Löschen">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('KV-Regeln laden fehlgeschlagen:', error);
  }
}

function openKVRegelModal(regel = null) {
  document.getElementById('kv-regel-modal').classList.remove('hidden');
  document.getElementById('kv-regel-modal-title').textContent = regel ? 'Regel bearbeiten' : 'Neue Regel';
  document.getElementById('kv-regel-id').value = regel?.id || '';
  document.getElementById('kv-regel-typ').value = regel?.regel_typ || '';
  document.getElementById('kv-regel-name').value = regel?.name || '';
  document.getElementById('kv-regel-wert').value = regel?.wert || '';
  document.getElementById('kv-regel-einheit').value = regel?.einheit || 'PROZENT';
  document.getElementById('kv-regel-prioritaet').value = regel?.prioritaet || 0;

  updateKVRegelBedingung();

  if (regel?.bedingung) {
    try {
      const bed = JSON.parse(regel.bedingung);
      if (bed.nach_stunden) {
        document.getElementById('kv-regel-nach-stunden').value = bed.nach_stunden;
      }
      if (bed.von_uhrzeit) {
        document.getElementById('kv-regel-von-uhrzeit').value = bed.von_uhrzeit;
      }
      if (bed.bis_uhrzeit) {
        document.getElementById('kv-regel-bis-uhrzeit').value = bed.bis_uhrzeit;
      }
    } catch (e) {}
  }
}

function closeKVRegelModal() {
  document.getElementById('kv-regel-modal').classList.add('hidden');
  document.getElementById('kv-regel-form').reset();
}

function updateKVRegelBedingung() {
  const typ = document.getElementById('kv-regel-typ').value;
  const container = document.getElementById('kv-regel-bedingung-container');
  const fields = document.getElementById('kv-regel-bedingung-fields');

  if (typ === 'UEBERSTUNDEN') {
    container.classList.remove('hidden');
    fields.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label for="kv-regel-nach-stunden">Nach Stunden pro Tag</label>
          <input type="number" id="kv-regel-nach-stunden" value="8" step="0.5" min="1" max="16">
        </div>
      </div>
    `;
  } else if (typ === 'ZUSCHLAG_NACHT') {
    container.classList.remove('hidden');
    fields.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label for="kv-regel-von-uhrzeit">Von Uhrzeit</label>
          <input type="text" id="kv-regel-von-uhrzeit" value="22:00" placeholder="HH:MM">
        </div>
        <div class="form-group">
          <label for="kv-regel-bis-uhrzeit">Bis Uhrzeit</label>
          <input type="text" id="kv-regel-bis-uhrzeit" value="06:00" placeholder="HH:MM">
        </div>
      </div>
    `;
  } else {
    container.classList.add('hidden');
    fields.innerHTML = '';
  }
}

async function editKVRegel(id) {
  try {
    const regeln = await api(`/admin/kv/${currentKVId}/regeln?alle=true`);
    const regel = regeln.find(r => r.id === id);
    if (regel) openKVRegelModal(regel);
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function saveKVRegel(event) {
  event.preventDefault();
  const id = document.getElementById('kv-regel-id').value;
  const typ = document.getElementById('kv-regel-typ').value;

  let bedingung = null;
  if (typ === 'UEBERSTUNDEN') {
    const nachStunden = document.getElementById('kv-regel-nach-stunden')?.value;
    if (nachStunden) bedingung = { nach_stunden: parseFloat(nachStunden) };
  } else if (typ === 'ZUSCHLAG_NACHT') {
    const vonUhrzeit = document.getElementById('kv-regel-von-uhrzeit')?.value;
    const bisUhrzeit = document.getElementById('kv-regel-bis-uhrzeit')?.value;
    if (vonUhrzeit && bisUhrzeit) bedingung = { von_uhrzeit: vonUhrzeit, bis_uhrzeit: bisUhrzeit };
  }

  const data = {
    regel_typ: typ,
    name: document.getElementById('kv-regel-name').value,
    wert: parseFloat(document.getElementById('kv-regel-wert').value),
    einheit: document.getElementById('kv-regel-einheit').value,
    prioritaet: parseInt(document.getElementById('kv-regel-prioritaet').value),
    bedingung
  };

  try {
    if (id) {
      await api(`/admin/kv-regeln/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await api(`/admin/kv/${currentKVId}/regeln`, { method: 'POST', body: JSON.stringify(data) });
    }
    closeKVRegelModal();
    loadKVRegeln(currentKVId);
    loadKollektivvertraege();
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

async function deleteKVRegel(id) {
  if (!confirm('Regel wirklich löschen?')) return;

  try {
    await api(`/admin/kv-regeln/${id}`, { method: 'DELETE' });
    loadKVRegeln(currentKVId);
    loadKollektivvertraege();
  } catch (error) {
    alert('Fehler: ' + error.message);
  }
}

// Helper: Format date for input (YYYY-MM-DD -> DD.MM.YYYY)
function formatDateForInput(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Helper: Parse date input (DD.MM.YYYY -> YYYY-MM-DD)
function parseDateInput(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// ========================================
// DATENAUFBEWAHRUNG (RETENTION) FUNKTIONEN
// ========================================

async function loadRetentionKonfig() {
  try {
    const konfig = await api('/admin/retention/konfig');
    document.getElementById('retention-zeiteintraege').value = konfig.zeiteintraege_monate || 84;
    document.getElementById('retention-audit').value = konfig.audit_monate || 120;
    document.getElementById('retention-warnung').value = konfig.warnung_tage || 30;
    document.getElementById('retention-auto').checked = konfig.auto_loeschen === '1' || konfig.auto_loeschen === 1;
  } catch (error) {
    console.error('Retention-Konfiguration laden fehlgeschlagen:', error);
  }
}

async function saveRetentionKonfig(event) {
  event.preventDefault();

  const data = {
    zeiteintraege_monate: parseInt(document.getElementById('retention-zeiteintraege').value) || 84,
    audit_monate: parseInt(document.getElementById('retention-audit').value) || 120,
    warnung_tage: parseInt(document.getElementById('retention-warnung').value) || 30,
    auto_loeschen: document.getElementById('retention-auto').checked ? '1' : '0'
  };

  try {
    await api('/admin/einstellungen', {
      method: 'PUT',
      body: JSON.stringify({
        retention_zeiteintraege_monate: String(data.zeiteintraege_monate),
        retention_audit_monate: String(data.audit_monate),
        retention_warnung_tage: String(data.warnung_tage),
        retention_auto_loeschen: data.auto_loeschen
      })
    });
    showMessage('retention-message', 'Einstellungen gespeichert', 'success');
    loadRetentionAnalyse();
  } catch (error) {
    showMessage('retention-message', 'Fehler: ' + error.message, 'error');
  }
}

async function loadRetentionAnalyse() {
  const loadingEl = document.getElementById('retention-analyse-loading');
  const detailsEl = document.getElementById('retention-details');

  try {
    loadingEl.classList.remove('hidden');

    const analyse = await api('/admin/retention/analyse');

    // Zeiteinträge
    document.getElementById('retention-total-zeiteintraege').textContent = analyse.zeiteintraege.gesamt;
    document.getElementById('retention-loeschbar-zeiteintraege').textContent = analyse.zeiteintraege.loeschbar;

    // Audit
    document.getElementById('retention-total-audit').textContent = analyse.audit.gesamt;
    document.getElementById('retention-loeschbar-audit').textContent = analyse.audit.loeschbar;

    // Details
    if (analyse.zeiteintraege.aeltester || analyse.audit.aeltester) {
      detailsEl.classList.remove('hidden');
      document.getElementById('retention-aeltester-ze').textContent = analyse.zeiteintraege.aeltester
        ? `Ältester Zeiteintrag: ${formatDateDisplay(analyse.zeiteintraege.aeltester)}`
        : 'Keine Zeiteinträge vorhanden';
      document.getElementById('retention-aeltester-audit').textContent = analyse.audit.aeltester
        ? `Ältester Audit-Eintrag: ${formatDateTimeDisplay(analyse.audit.aeltester)}`
        : 'Keine Audit-Einträge vorhanden';
    } else {
      detailsEl.classList.add('hidden');
    }

    // Löschbuttons aktivieren/deaktivieren
    document.getElementById('btn-loeschen-zeiteintraege').disabled = analyse.zeiteintraege.loeschbar === 0;
    document.getElementById('btn-loeschen-audit').disabled = analyse.audit.loeschbar === 0;

  } catch (error) {
    console.error('Retention-Analyse fehlgeschlagen:', error);
  } finally {
    loadingEl.classList.add('hidden');
  }
}

async function executeRetention(tabelle) {
  const tabelleLabel = tabelle === 'zeiteintraege' ? 'Zeiteinträge' : 'Audit-Einträge';

  if (!confirm(`Möchten Sie wirklich alte ${tabelleLabel} löschen?\n\nDieser Vorgang kann NICHT rückgängig gemacht werden!`)) {
    return;
  }

  const messageEl = document.getElementById('retention-execute-message');

  try {
    const result = await api('/admin/retention/execute', {
      method: 'POST',
      body: JSON.stringify({ tabelle })
    });

    if (result.geloescht > 0) {
      showMessage('retention-execute-message', `${result.geloescht} ${tabelleLabel} wurden gelöscht.`, 'success');
    } else {
      showMessage('retention-execute-message', 'Keine Einträge zum Löschen gefunden.', 'success');
    }

    // Analyse und Protokoll neu laden
    loadRetentionAnalyse();
    loadLoeschprotokoll();

  } catch (error) {
    showMessage('retention-execute-message', 'Fehler: ' + error.message, 'error');
  }
}

async function loadLoeschprotokoll() {
  try {
    const protokoll = await api('/admin/retention/protokoll');
    const tbody = document.querySelector('#loeschprotokoll-table tbody');
    const emptyEl = document.getElementById('loeschprotokoll-empty');

    if (!protokoll || protokoll.length === 0) {
      tbody.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    tbody.innerHTML = protokoll.map(p => {
      const tabelleLabel = p.tabelle === 'zeiteintraege' ? 'Zeiteinträge' :
                           p.tabelle === 'audit_log' ? 'Audit-Log' : p.tabelle;
      return `
        <tr>
          <td>${formatDateTimeDisplay(p.ausgefuehrt_am)}</td>
          <td>${escapeHtml(tabelleLabel)}</td>
          <td style="text-align:right"><strong>${p.anzahl_geloescht}</strong></td>
          <td>${p.aeltester_eintrag ? formatDateDisplay(p.aeltester_eintrag) : '-'}</td>
          <td>${escapeHtml(p.loeschgrund || '-')}</td>
          <td>${escapeHtml(p.ausgefuehrt_von || '-')}</td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Löschprotokoll laden fehlgeschlagen:', error);
  }
}

function formatDateTimeDisplay(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Event-Listener für Retention-Form
document.getElementById('retention-form')?.addEventListener('submit', saveRetentionKonfig);

// Globale switchTab Funktion für programmatischen Tab-Wechsel
function switchTab(tabName) {
  // Remove active from all tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  // Set active tab content
  const tabContent = document.getElementById('tab-' + tabName);
  if (tabContent) {
    tabContent.classList.remove('hidden');
  }

  // Set active tab button
  const tabButton = document.querySelector('[data-tab="' + tabName + '"]');
  if (tabButton) {
    tabButton.classList.add('active');

    // Update group header
    document.querySelectorAll('.nav-group-header').forEach(h => h.classList.remove('active'));
    const parentGroup = tabButton.closest('.nav-group');
    if (parentGroup) {
      parentGroup.querySelector('.nav-group-header').classList.add('active');
    }

    // Collapse all menu groups after selection
    document.querySelectorAll('.nav-group-items.open').forEach(items => {
      items.classList.remove('open');
      const arrow = items.closest('.nav-group').querySelector('.nav-group-arrow');
      if (arrow) arrow.textContent = '▸';
    });
  }

  // Leistungsnachweise-spezifische Initialisierung
  if (tabName === 'leistungsnachweise' || tabName === 'leistungsnachweis-neu' || tabName === 'leistungsnachweis-detail') {
    if (typeof initLeistungsnachweisForm === 'function') {
      initLeistungsnachweisForm();
    }
    if (tabName === 'leistungsnachweise' && typeof loadLeistungsnachweise === 'function') {
      loadLeistungsnachweise();
    }
  }

  // BUAK-spezifische Initialisierung
  if (tabName === 'buak-config') {
    if (typeof initBuakModule === 'function') {
      initBuakModule();
    }
  }
  if (tabName === 'buak-schlechtwetter') {
    if (typeof loadSchlechtwetterList === 'function') {
      loadSchlechtwetterList();
    }
  }
}

// ==================== LEISTUNGSNACHWEISE ====================

let currentLeistungsnachweisId = null;
let isDrawing = false;

// Leistungsnachweise laden
async function loadLeistungsnachweise(page = 1) {
  try {
    const params = new URLSearchParams();
    params.append('page', page);

    const filterVon = document.getElementById('ln-filter-von')?.value;
    const filterBis = document.getElementById('ln-filter-bis')?.value;
    const filterStatus = document.getElementById('ln-filter-status')?.value;
    const filterKunde = document.getElementById('ln-filter-kunde')?.value;

    if (filterVon) params.append('datum_von', formatDateForAPI(filterVon));
    if (filterBis) params.append('datum_bis', formatDateForAPI(filterBis));
    if (filterStatus) params.append('status', filterStatus);
    if (filterKunde) params.append('kunde_id', filterKunde);

    const result = await api('/leistungsnachweise?' + params.toString(), 'GET', null, false);

    const tbody = document.querySelector('#leistungsnachweise-table tbody');
    const emptyMsg = document.getElementById('ln-empty');

    if (result.data && result.data.length > 0) {
      emptyMsg.classList.add('hidden');
      tbody.innerHTML = result.data.map(function(ln) {
        const nr = 'LN-' + String(ln.id).padStart(6, '0');
        const statusClass = 'status-badge status-' + ln.status;
        let actions = '<button class="btn btn-secondary btn-sm" onclick="viewLeistungsnachweis(' + ln.id + ')">Ansehen</button>';
        if (ln.status === 'entwurf') {
          actions += ' <button class="btn btn-primary btn-sm" onclick="editLeistungsnachweis(' + ln.id + ')">Bearbeiten</button>';
        }
        return '<tr>' +
          '<td>' + nr + '</td>' +
          '<td>' + formatDateDisplay(ln.datum) + '</td>' +
          '<td>' + (ln.kunde_name || ln.kunde_freitext || '-') + '</td>' +
          '<td>' + (ln.baustelle_name || ln.baustelle_freitext || '-') + '</td>' +
          '<td>' + (ln.mitarbeiter_namen || '-') + '</td>' +
          '<td><span class="' + statusClass + '">' + ln.status + '</span></td>' +
          '<td>' + actions + '</td>' +
          '</tr>';
      }).join('');

      renderLnPagination('ln-pagination', result.page, result.totalPages);
    } else {
      tbody.innerHTML = '';
      emptyMsg.classList.remove('hidden');
      document.getElementById('ln-pagination').innerHTML = '';
    }
  } catch (error) {
    console.error('Leistungsnachweise laden fehlgeschlagen:', error);
  }
}

// Pagination rendern
function renderLnPagination(containerId, currentPage, totalPages) {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';
  html += '<button ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="loadLeistungsnachweise(' + (currentPage - 1) + ')">Zurück</button>';

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += '<button class="' + (i === currentPage ? 'active' : '') + '" onclick="loadLeistungsnachweise(' + i + ')">' + i + '</button>';
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span style="padding:8px;">...</span>';
    }
  }

  html += '<button ' + (currentPage === totalPages ? 'disabled' : '') + ' onclick="loadLeistungsnachweise(' + (currentPage + 1) + ')">Weiter</button>';

  container.innerHTML = html;
}

// Leistungsnachweis-Form initialisieren
async function initLeistungsnachweisForm() {
  try {
    // Kunden laden (bestehender Endpunkt)
    const kundenData = await api('/kunden', 'GET', null, false);
    const kundeSelect = document.getElementById('ln-kunde-select');
    const filterKunde = document.getElementById('ln-filter-kunde');

    // Handle both array and {data: []} response formats
    const kunden = Array.isArray(kundenData) ? kundenData : (kundenData.data || []);
    if (kunden.length > 0) {
      const options = kunden.filter(k => k.aktiv !== 0).map(function(k) {
        return '<option value="' + k.id + '">' + k.name + '</option>';
      }).join('');
      if (kundeSelect) kundeSelect.innerHTML = '<option value="">-- Auswählen --</option>' + options;
      if (filterKunde) filterKunde.innerHTML = '<option value="">Alle</option>' + options;
    }

    // Baustellen laden (bestehender Endpunkt)
    const baustellenData = await api('/baustellen', 'GET', null, false);
    const baustelleSelect = document.getElementById('ln-baustelle-select');

    const baustellen = Array.isArray(baustellenData) ? baustellenData : (baustellenData.data || []);
    if (baustellen.length > 0 && baustelleSelect) {
      baustelleSelect.innerHTML = '<option value="">-- Auswählen --</option>' +
        baustellen.filter(b => b.aktiv !== 0).map(function(b) {
          return '<option value="' + b.id + '">' + b.name + '</option>';
        }).join('');
    }

    // Mitarbeiter laden (Admin-Endpunkt)
    const mitarbeiterData = await api('/admin/mitarbeiter?limit=100', 'GET', null, false);
    const checkboxContainer = document.getElementById('ln-mitarbeiter-checkboxes');

    const mitarbeiter = Array.isArray(mitarbeiterData) ? mitarbeiterData : (mitarbeiterData.data || []);
    if (mitarbeiter.length > 0 && checkboxContainer) {
      checkboxContainer.innerHTML = mitarbeiter.filter(m => m.aktiv !== 0).map(function(m) {
        return '<label><input type="checkbox" name="ln-mitarbeiter" value="' + m.id + '"><span>' + m.name + '</span></label>';
      }).join('');
    }

    // Datepicker initialisieren
    if (typeof flatpickr !== 'undefined') {
      flatpickr('#ln-datum', { dateFormat: 'd.m.Y', locale: 'de', defaultDate: new Date() });
      flatpickr('#ln-filter-von', { dateFormat: 'd.m.Y', locale: 'de' });
      flatpickr('#ln-filter-bis', { dateFormat: 'd.m.Y', locale: 'de' });
    }
  } catch (error) {
    console.error('Formular initialisieren fehlgeschlagen:', error);
  }
}

// Leistungsnachweis-Formular absenden
document.getElementById('leistungsnachweis-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const editId = document.getElementById('ln-edit-id')?.value;
  const mitarbeiterCheckboxes = document.querySelectorAll('input[name="ln-mitarbeiter"]:checked');
  const mitarbeiterIds = Array.from(mitarbeiterCheckboxes).map(function(cb) { return parseInt(cb.value); });

  const data = {
    datum: formatDateForAPI(document.getElementById('ln-datum').value),
    kunde_id: document.getElementById('ln-kunde-select').value || null,
    kunde_freitext: document.getElementById('ln-kunde-freitext').value || null,
    baustelle_id: document.getElementById('ln-baustelle-select').value || null,
    baustelle_freitext: document.getElementById('ln-baustelle-freitext').value || null,
    leistungszeit_von: document.getElementById('ln-zeit-von').value || null,
    leistungszeit_bis: document.getElementById('ln-zeit-bis').value || null,
    leistungsdauer_minuten: document.getElementById('ln-dauer').value || null,
    beschreibung: document.getElementById('ln-beschreibung').value,
    notizen: document.getElementById('ln-notizen').value || null,
    mitarbeiter_ids: mitarbeiterIds
  };

  try {
    const endpoint = editId ? '/leistungsnachweise/' + editId : '/leistungsnachweise';
    const method = editId ? 'PUT' : 'POST';

    const result = await api(endpoint, method, data, false);

    if (result.success || result.id) {
      showLnMessage('ln-form-message', editId ? 'Leistungsnachweis aktualisiert!' : 'Leistungsnachweis erstellt!', 'success');
      setTimeout(function() {
        resetLeistungsnachweisForm();
        switchTab('leistungsnachweise');
        loadLeistungsnachweise();
      }, 1000);
    } else {
      showLnMessage('ln-form-message', result.error || 'Fehler beim Speichern', 'error');
    }
  } catch (error) {
    console.error('Speichern fehlgeschlagen:', error);
    showLnMessage('ln-form-message', 'Fehler beim Speichern', 'error');
  }
});

// Formular zurücksetzen
function resetLeistungsnachweisForm() {
  const form = document.getElementById('leistungsnachweis-form');
  if (form) form.reset();
  const editIdField = document.getElementById('ln-edit-id');
  if (editIdField) editIdField.value = '';
  const titleField = document.getElementById('ln-form-title');
  if (titleField) titleField.textContent = 'Neuen Leistungsnachweis erstellen';
  document.querySelectorAll('input[name="ln-mitarbeiter"]').forEach(function(cb) { cb.checked = false; });
}

// Leistungsnachweis bearbeiten
async function editLeistungsnachweis(id) {
  try {
    const ln = await api('/leistungsnachweise/' + id, 'GET', null, false);

    if (ln.status !== 'entwurf') {
      alert('Nur Entwürfe können bearbeitet werden.');
      return;
    }

    document.getElementById('ln-edit-id').value = ln.id;
    document.getElementById('ln-form-title').textContent = 'Leistungsnachweis bearbeiten';
    document.getElementById('ln-datum').value = formatDateForDisplay(ln.datum);
    document.getElementById('ln-kunde-select').value = ln.kunde_id || '';
    document.getElementById('ln-kunde-freitext').value = ln.kunde_freitext || '';
    document.getElementById('ln-baustelle-select').value = ln.baustelle_id || '';
    document.getElementById('ln-baustelle-freitext').value = ln.baustelle_freitext || '';
    document.getElementById('ln-zeit-von').value = ln.leistungszeit_von || '';
    document.getElementById('ln-zeit-bis').value = ln.leistungszeit_bis || '';
    document.getElementById('ln-dauer').value = ln.leistungsdauer_minuten || '';
    document.getElementById('ln-beschreibung').value = ln.beschreibung || '';
    document.getElementById('ln-notizen').value = ln.notizen || '';

    // Mitarbeiter-Checkboxen setzen
    document.querySelectorAll('input[name="ln-mitarbeiter"]').forEach(function(cb) {
      cb.checked = ln.mitarbeiter && ln.mitarbeiter.some(function(m) { return m.id === parseInt(cb.value); });
    });

    switchTab('leistungsnachweis-neu');
  } catch (error) {
    console.error('Leistungsnachweis laden fehlgeschlagen:', error);
  }
}

// Leistungsnachweis ansehen
async function viewLeistungsnachweis(id) {
  try {
    const ln = await api('/leistungsnachweise/' + id, 'GET', null, false);

    currentLeistungsnachweisId = id;

    // Detail-Inhalt rendern
    let html = '';
    html += '<div class="ln-detail-row"><div class="ln-detail-label">Status:</div><div class="ln-detail-value"><span class="status-badge status-' + ln.status + '">' + ln.status.toUpperCase() + '</span></div></div>';
    html += '<div class="ln-detail-row"><div class="ln-detail-label">Nachweis-Nr:</div><div class="ln-detail-value">LN-' + String(ln.id).padStart(6, '0') + '</div></div>';
    html += '<div class="ln-detail-row"><div class="ln-detail-label">Datum:</div><div class="ln-detail-value">' + formatDateDisplay(ln.datum) + '</div></div>';
    html += '<div class="ln-detail-row"><div class="ln-detail-label">Kunde:</div><div class="ln-detail-value">' + (ln.kunde_name || ln.kunde_freitext || '-') + '</div></div>';
    html += '<div class="ln-detail-row"><div class="ln-detail-label">Projekt/Baustelle:</div><div class="ln-detail-value">' + (ln.baustelle_name || ln.baustelle_freitext || '-') + '</div></div>';

    if (ln.leistungszeit_von && ln.leistungszeit_bis) {
      html += '<div class="ln-detail-row"><div class="ln-detail-label">Leistungszeit:</div><div class="ln-detail-value">' + ln.leistungszeit_von + ' - ' + ln.leistungszeit_bis + '</div></div>';
    } else if (ln.leistungsdauer_minuten) {
      html += '<div class="ln-detail-row"><div class="ln-detail-label">Leistungsdauer:</div><div class="ln-detail-value">' + Math.floor(ln.leistungsdauer_minuten / 60) + 'h ' + (ln.leistungsdauer_minuten % 60) + 'min</div></div>';
    }

    if (ln.mitarbeiter && ln.mitarbeiter.length > 0) {
      html += '<div class="ln-detail-row"><div class="ln-detail-label">Mitarbeiter:</div><div class="ln-detail-value">' + ln.mitarbeiter.map(function(m) { return m.name; }).join(', ') + '</div></div>';
    }

    html += '<div class="ln-detail-row"><div class="ln-detail-label">Beschreibung:</div><div class="ln-detail-value">' + ln.beschreibung + '</div></div>';

    if (ln.notizen) {
      html += '<div class="ln-detail-row"><div class="ln-detail-label">Notizen:</div><div class="ln-detail-value">' + ln.notizen + '</div></div>';
    }

    html += '<div class="ln-detail-row"><div class="ln-detail-label">Erstellt von:</div><div class="ln-detail-value">' + ln.ersteller_name + ' am ' + formatDateTimeDisplay(ln.erstellt_am) + '</div></div>';

    // Unterschrift anzeigen wenn vorhanden
    if (ln.status === 'unterschrieben' && ln.unterschrift_daten) {
      html += '<div class="signature-display"><h4>Kundenunterschrift</h4><img src="' + ln.unterschrift_daten + '" alt="Unterschrift"><div class="signature-info"><strong>' + ln.unterschrift_name + '</strong><br>' + formatDateTimeDisplay(ln.unterschrift_zeitpunkt) + '</div></div>';
    }

    // Storno-Info anzeigen wenn storniert
    if (ln.status === 'storniert') {
      html += '<div class="storno-section" style="margin-top:20px;"><h4>Storniert</h4><p>Storniert am: ' + formatDateTimeDisplay(ln.storniert_am) + '</p>';
      if (ln.storniert_von_name) html += '<p>Storniert von: ' + ln.storniert_von_name + '</p>';
      if (ln.storno_grund) html += '<p>Grund: ' + ln.storno_grund + '</p>';
      html += '</div>';
    }

    document.getElementById('ln-detail-content').innerHTML = html;
    document.getElementById('ln-detail-title').textContent = 'Leistungsnachweis LN-' + String(ln.id).padStart(6, '0');

    // Unterschrift-Bereich anzeigen wenn Entwurf
    const signatureSection = document.getElementById('ln-signature-section');
    const stornoSection = document.getElementById('ln-storno-section');

    if (ln.status === 'entwurf') {
      signatureSection.classList.remove('hidden');
      stornoSection.classList.add('hidden');
      initSignaturePad();
    } else if (ln.status === 'unterschrieben') {
      signatureSection.classList.add('hidden');
      stornoSection.classList.remove('hidden');
    } else {
      signatureSection.classList.add('hidden');
      stornoSection.classList.add('hidden');
    }

    switchTab('leistungsnachweis-detail');
  } catch (error) {
    console.error('Leistungsnachweis laden fehlgeschlagen:', error);
  }
}

// Signature Pad initialisieren
function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Canvas leeren
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Event-Listener für Touch und Maus
  let lastX = 0, lastY = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // Entferne vorherige Event-Listener (falls vorhanden)
  canvas.replaceWith(canvas.cloneNode(true));
  const newCanvas = document.getElementById('signature-canvas');
  const newCtx = newCanvas.getContext('2d');
  newCtx.fillStyle = 'white';
  newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);

  // Maus-Events
  newCanvas.addEventListener('mousedown', startDrawing);
  newCanvas.addEventListener('mousemove', draw);
  newCanvas.addEventListener('mouseup', stopDrawing);
  newCanvas.addEventListener('mouseout', stopDrawing);

  // Touch-Events
  newCanvas.addEventListener('touchstart', startDrawing, { passive: false });
  newCanvas.addEventListener('touchmove', draw, { passive: false });
  newCanvas.addEventListener('touchend', stopDrawing);
}

// Unterschrift löschen
function clearSignature() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Unterschrift prüfen ob leer
function isSignatureEmpty() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return true;

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
      return false;
    }
  }
  return true;
}

// Unterschrift absenden
async function submitSignature() {
  const unterschriftName = document.getElementById('ln-unterschrift-name').value.trim();

  if (!unterschriftName) {
    alert('Bitte geben Sie den Namen des Unterzeichners ein.');
    return;
  }

  if (isSignatureEmpty()) {
    alert('Bitte unterschreiben Sie im Unterschriftsfeld.');
    return;
  }

  const canvas = document.getElementById('signature-canvas');
  const unterschriftDaten = canvas.toDataURL('image/png');

  try {
    const result = await api('/leistungsnachweise/' + currentLeistungsnachweisId + '/unterschreiben', 'POST',
      { unterschrift_daten: unterschriftDaten, unterschrift_name: unterschriftName }, false);

    if (result.success) {
      alert('Leistungsnachweis erfolgreich unterschrieben!');
      viewLeistungsnachweis(currentLeistungsnachweisId);
    } else {
      alert(result.error || 'Fehler beim Unterschreiben');
    }
  } catch (error) {
    console.error('Unterschreiben fehlgeschlagen:', error);
    alert('Fehler beim Unterschreiben');
  }
}

// Leistungsnachweis stornieren
async function storniereLeistungsnachweis() {
  if (!confirm('Möchten Sie diesen Leistungsnachweis wirklich stornieren?')) {
    return;
  }

  const grundField = document.getElementById('ln-storno-grund');
  const grund = grundField ? grundField.value : '';

  try {
    const result = await api('/leistungsnachweise/' + currentLeistungsnachweisId + '/stornieren', 'POST',
      { grund: grund }, false);

    if (result.success) {
      alert('Leistungsnachweis storniert.');
      viewLeistungsnachweis(currentLeistungsnachweisId);
    } else {
      alert(result.error || 'Fehler beim Stornieren');
    }
  } catch (error) {
    console.error('Stornieren fehlgeschlagen:', error);
    alert('Fehler beim Stornieren');
  }
}

// PDF herunterladen
function downloadLeistungsnachweisePDF() {
  if (!currentLeistungsnachweisId) return;
  window.open('/api/leistungsnachweise/' + currentLeistungsnachweisId + '/pdf', '_blank');
}

// Datum formatieren für API (DD.MM.YYYY -> YYYY-MM-DD)
function formatDateForAPI(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0');
}

// Datum formatieren für Anzeige (YYYY-MM-DD -> DD.MM.YYYY)
function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

// Message anzeigen für Leistungsnachweise
function showLnMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.textContent = message;
  el.className = 'message ' + type;
  el.classList.remove('hidden');

  setTimeout(function() {
    el.classList.add('hidden');
  }, 5000);
}

// ==================== BUAK COMPLIANCE SUPPORT MODULE ====================

var buakConfig = null;
var schlechtwetterPage = 1;

// BUAK-Modul initialisieren
async function initBuakModule() {
  try {
    buakConfig = await api('/buak/config', 'GET', null, false);

    var checkbox = document.getElementById('buak-modul-aktiv');
    if (checkbox) {
      checkbox.checked = buakConfig.aktiv;
      checkbox.onchange = toggleBuakModul;
    }

    updateBuakConfigContent();
  } catch (error) {
    console.error('BUAK Config Fehler:', error);
  }
}

// BUAK-Modul aktivieren/deaktivieren
async function toggleBuakModul() {
  var checkbox = document.getElementById('buak-modul-aktiv');
  var aktiv = checkbox.checked;

  try {
    await api('/buak/config/aktiv', 'PUT', { aktiv: aktiv }, false);
    buakConfig.aktiv = aktiv;
    updateBuakConfigContent();
  } catch (error) {
    console.error('BUAK Toggle Fehler:', error);
    checkbox.checked = !aktiv;
  }
}

// BUAK Config Content anzeigen/verbergen
function updateBuakConfigContent() {
  var content = document.getElementById('buak-config-content');
  if (!content) return;

  if (buakConfig && buakConfig.aktiv) {
    content.style.display = 'block';
    renderBuakBaustellen();
    renderBuakMitarbeiter();
  } else {
    content.style.display = 'none';
  }
}

// BUAK-Baustellen rendern
function renderBuakBaustellen() {
  var container = document.getElementById('buak-baustellen-list');
  if (!container || !buakConfig) return;

  if (!buakConfig.baustellen || buakConfig.baustellen.length === 0) {
    container.innerHTML = '<p class="text-secondary">Keine Baustellen vorhanden.</p>';
    return;
  }

  container.innerHTML = buakConfig.baustellen.map(function(b) {
    var isActive = b.buak_relevant === 1;
    return '<div class="buak-list-item' + (isActive ? ' buak-active' : '') + '">' +
      '<div class="buak-list-item-info">' +
        '<span class="buak-list-item-name">' + escapeHtml(b.name) + '</span>' +
        (b.kunde ? '<span class="buak-list-item-detail">' + escapeHtml(b.kunde) + '</span>' : '') +
      '</div>' +
      '<label class="buak-toggle">' +
        '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' onchange="toggleBaustelleBuak(' + b.id + ', this.checked)">' +
        '<span class="buak-toggle-slider"></span>' +
      '</label>' +
    '</div>';
  }).join('');
}

// BUAK-Mitarbeiter rendern
function renderBuakMitarbeiter() {
  var container = document.getElementById('buak-mitarbeiter-list');
  if (!container || !buakConfig) return;

  if (!buakConfig.mitarbeiter || buakConfig.mitarbeiter.length === 0) {
    container.innerHTML = '<p class="text-secondary">Keine Mitarbeiter vorhanden.</p>';
    return;
  }

  container.innerHTML = buakConfig.mitarbeiter.map(function(m) {
    var isActive = m.buak_relevant === 1;
    return '<div class="buak-list-item' + (isActive ? ' buak-active' : '') + '">' +
      '<div class="buak-list-item-info">' +
        '<span class="buak-list-item-name">' + escapeHtml(m.name) + '</span>' +
        '<span class="buak-list-item-detail">Nr. ' + escapeHtml(m.mitarbeiter_nr) + '</span>' +
      '</div>' +
      '<label class="buak-toggle">' +
        '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' onchange="toggleMitarbeiterBuak(' + m.id + ', this.checked)">' +
        '<span class="buak-toggle-slider"></span>' +
      '</label>' +
    '</div>';
  }).join('');
}

// Baustelle BUAK-Relevanz umschalten
async function toggleBaustelleBuak(id, relevant) {
  try {
    await api('/buak/baustellen/' + id + '/relevant', 'PUT', { buak_relevant: relevant }, false);
    var b = buakConfig.baustellen.find(function(x) { return x.id === id; });
    if (b) b.buak_relevant = relevant ? 1 : 0;
    renderBuakBaustellen();
  } catch (error) {
    console.error('Fehler:', error);
    alert('Fehler beim Speichern');
  }
}

// Mitarbeiter BUAK-Relevanz umschalten
async function toggleMitarbeiterBuak(id, relevant) {
  try {
    await api('/buak/mitarbeiter/' + id + '/relevant', 'PUT', { buak_relevant: relevant }, false);
    var m = buakConfig.mitarbeiter.find(function(x) { return x.id === id; });
    if (m) m.buak_relevant = relevant ? 1 : 0;
    renderBuakMitarbeiter();
  } catch (error) {
    console.error('Fehler:', error);
    alert('Fehler beim Speichern');
  }
}

// Schlechtwetter-Liste laden
async function loadSchlechtwetterList(page) {
  if (page) schlechtwetterPage = page;

  var filter = {
    page: schlechtwetterPage,
    limit: 20
  };

  var vonEl = document.getElementById('sw-filter-von');
  var bisEl = document.getElementById('sw-filter-bis');
  var grundEl = document.getElementById('sw-filter-grund');

  if (vonEl && vonEl.value) filter.datum_von = formatDateForAPI(vonEl.value);
  if (bisEl && bisEl.value) filter.datum_bis = formatDateForAPI(bisEl.value);
  if (grundEl && grundEl.value) filter.grund = grundEl.value;

  try {
    var queryParams = Object.keys(filter).map(function(k) {
      return k + '=' + encodeURIComponent(filter[k]);
    }).join('&');

    var result = await api('/buak/schlechtwetter?' + queryParams, 'GET', null, false);
    renderSchlechtwetterTable(result);
  } catch (error) {
    console.error('Schlechtwetter laden fehlgeschlagen:', error);
  }
}

// Schlechtwetter-Tabelle rendern
function renderSchlechtwetterTable(result) {
  var tbody = document.getElementById('schlechtwetter-table-body');
  if (!tbody) return;

  if (!result.data || result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Keine Einträge vorhanden</td></tr>';
    document.getElementById('schlechtwetter-pagination').innerHTML = '';
    return;
  }

  var grundLabels = {
    'regen': 'Regen',
    'schnee': 'Schnee',
    'frost': 'Frost',
    'hitze': 'Hitze',
    'sturm': 'Sturm',
    'sonstiges': 'Sonstiges'
  };

  tbody.innerHTML = result.data.map(function(sw) {
    var dauer = sw.dauer_minuten ? Math.floor(sw.dauer_minuten / 60) + 'h ' + (sw.dauer_minuten % 60) + 'min' : '-';
    var grund = grundLabels[sw.grund] || sw.grund;

    return '<tr>' +
      '<td>' + formatDateForDisplay(sw.datum) + '</td>' +
      '<td>' + escapeHtml(sw.baustelle_name || sw.baustelle_freitext || '-') + '</td>' +
      '<td><span class="grund-badge grund-' + sw.grund + '">' + grund + '</span></td>' +
      '<td>' + dauer + '</td>' +
      '<td>' + escapeHtml(sw.mitarbeiter_namen || '-') + '</td>' +
      '<td>' +
        '<button class="btn btn-sm" onclick="editSchlechtwetter(' + sw.id + ')">Bearbeiten</button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteSchlechtwetter(' + sw.id + ')">Löschen</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var paginationEl = document.getElementById('schlechtwetter-pagination');
  if (result.totalPages > 1) {
    var buttons = [];
    for (var i = 1; i <= result.totalPages; i++) {
      buttons.push('<button class="' + (i === result.page ? 'active' : '') + '" onclick="loadSchlechtwetterList(' + i + ')">' + i + '</button>');
    }
    paginationEl.innerHTML = buttons.join('');
  } else {
    paginationEl.innerHTML = '';
  }
}

// Schlechtwetter Modal öffnen
async function openSchlechtwetterModal(id) {
  document.getElementById('schlechtwetter-id').value = id || '';
  document.getElementById('schlechtwetter-modal-title').textContent = id ? 'Schlechtwetter bearbeiten' : 'Schlechtwetter-Ereignis erfassen';

  var baustellenSelect = document.getElementById('sw-baustelle');
  try {
    var baustellen = await api('/baustellen', 'GET', null, false);
    baustellenSelect.innerHTML = '<option value="">Bitte wählen...</option>' +
      (Array.isArray(baustellen) ? baustellen : (baustellen.data || [])).map(function(b) {
        return '<option value="' + b.id + '">' + escapeHtml(b.name) + '</option>';
      }).join('');
  } catch (e) {}

  var checkboxContainer = document.getElementById('sw-mitarbeiter-checkboxes');
  try {
    var mitarbeiterData = await api('/admin/mitarbeiter?limit=100', 'GET', null, false);
    var mitarbeiter = Array.isArray(mitarbeiterData) ? mitarbeiterData : (mitarbeiterData.data || []);
    checkboxContainer.innerHTML = mitarbeiter.map(function(m) {
      return '<label><input type="checkbox" name="sw-ma" value="' + m.id + '"> ' + escapeHtml(m.name) + '</label>';
    }).join('');
  } catch (e) {}

  if (id) {
    try {
      var sw = await api('/buak/schlechtwetter/' + id, 'GET', null, false);
      document.getElementById('sw-datum').value = formatDateForDisplay(sw.datum);
      document.getElementById('sw-grund').value = sw.grund;
      document.getElementById('sw-grund-details').value = sw.grund_details || '';
      document.getElementById('sw-baustelle').value = sw.baustelle_id || '';
      document.getElementById('sw-beginn').value = sw.beginn || '';
      document.getElementById('sw-ende').value = sw.ende || '';
      document.getElementById('sw-dauer').value = sw.dauer_minuten || '';
      document.getElementById('sw-notizen').value = sw.notizen || '';

      if (sw.mitarbeiter) {
        sw.mitarbeiter.forEach(function(m) {
          var cb = document.querySelector('input[name="sw-ma"][value="' + m.id + '"]');
          if (cb) cb.checked = true;
        });
      }
    } catch (e) {
      console.error('Fehler beim Laden:', e);
    }
  } else {
    document.getElementById('schlechtwetter-form').reset();
    var today = new Date();
    document.getElementById('sw-datum').value = today.getDate().toString().padStart(2, '0') + '.' +
      (today.getMonth() + 1).toString().padStart(2, '0') + '.' + today.getFullYear();
  }

  if (typeof flatpickr !== 'undefined') {
    flatpickr('#sw-datum', { dateFormat: 'd.m.Y', locale: 'de', allowInput: true });
  }

  document.getElementById('schlechtwetter-modal').classList.remove('hidden');
}

function closeSchlechtwetterModal() {
  document.getElementById('schlechtwetter-modal').classList.add('hidden');
}

function editSchlechtwetter(id) {
  openSchlechtwetterModal(id);
}

async function deleteSchlechtwetter(id) {
  if (!confirm('Schlechtwetter-Ereignis wirklich löschen?')) return;

  try {
    await api('/buak/schlechtwetter/' + id, 'DELETE', null, false);
    loadSchlechtwetterList();
  } catch (error) {
    console.error('Löschen fehlgeschlagen:', error);
    alert('Fehler beim Löschen');
  }
}

// Schlechtwetter speichern
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('schlechtwetter-form');
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      var id = document.getElementById('schlechtwetter-id').value;
      var mitarbeiterIds = [];
      document.querySelectorAll('input[name="sw-ma"]:checked').forEach(function(cb) {
        mitarbeiterIds.push(parseInt(cb.value));
      });

      var data = {
        datum: formatDateForAPI(document.getElementById('sw-datum').value),
        grund: document.getElementById('sw-grund').value,
        grund_details: document.getElementById('sw-grund-details').value,
        baustelle_id: document.getElementById('sw-baustelle').value ? parseInt(document.getElementById('sw-baustelle').value) : null,
        beginn: document.getElementById('sw-beginn').value || null,
        ende: document.getElementById('sw-ende').value || null,
        dauer_minuten: document.getElementById('sw-dauer').value ? parseInt(document.getElementById('sw-dauer').value) : null,
        notizen: document.getElementById('sw-notizen').value,
        mitarbeiter_ids: mitarbeiterIds
      };

      if (!data.dauer_minuten && data.beginn && data.ende) {
        var beginn = data.beginn.split(':');
        var ende = data.ende.split(':');
        data.dauer_minuten = (parseInt(ende[0]) * 60 + parseInt(ende[1])) - (parseInt(beginn[0]) * 60 + parseInt(beginn[1]));
      }

      try {
        if (id) {
          await api('/buak/schlechtwetter/' + id, 'PUT', data, false);
        } else {
          await api('/buak/schlechtwetter', 'POST', data, false);
        }
        closeSchlechtwetterModal();
        loadSchlechtwetterList();
      } catch (error) {
        console.error('Speichern fehlgeschlagen:', error);
        alert('Fehler beim Speichern');
      }
    });
  }
});

// BUAK Report laden
async function loadBuakReport() {
  var vonEl = document.getElementById('buak-report-von');
  var bisEl = document.getElementById('buak-report-bis');

  if (!vonEl.value || !bisEl.value) {
    alert('Bitte Zeitraum angeben');
    return;
  }

  var datumVon = formatDateForAPI(vonEl.value);
  var datumBis = formatDateForAPI(bisEl.value);

  try {
    var report = await api('/buak/report?datum_von=' + datumVon + '&datum_bis=' + datumBis, 'GET', null, false);
    renderBuakReport(report);
    document.getElementById('buak-report-content').style.display = 'block';
  } catch (error) {
    console.error('Report laden fehlgeschlagen:', error);
    alert('Fehler beim Laden des Reports');
  }
}

// BUAK Report rendern
function renderBuakReport(report) {
  var arbeitszeitBody = document.getElementById('buak-report-arbeitszeit');
  var arbeitszeitTotal = document.getElementById('buak-report-arbeitszeit-total');

  if (report.mitarbeiter.length === 0) {
    arbeitszeitBody.innerHTML = '<tr><td colspan="4" class="text-center">Keine BUAK-relevanten Zeiteinträge</td></tr>';
    arbeitszeitTotal.innerHTML = '';
  } else {
    var totalMinuten = 0;
    var totalTage = 0;
    arbeitszeitBody.innerHTML = report.mitarbeiter.map(function(m) {
      var stunden = m.gesamt_minuten ? (m.gesamt_minuten / 60).toFixed(2) : '0.00';
      totalMinuten += m.gesamt_minuten || 0;
      totalTage += m.tage || 0;
      return '<tr><td>' + escapeHtml(m.mitarbeiter_nr) + '</td><td>' + escapeHtml(m.name) + '</td><td>' + m.tage + '</td><td>' + stunden + '</td></tr>';
    }).join('');
    arbeitszeitTotal.innerHTML = '<tr><th colspan="2">Gesamt</th><th>' + totalTage + '</th><th>' + (totalMinuten / 60).toFixed(2) + '</th></tr>';
  }

  var swBody = document.getElementById('buak-report-schlechtwetter');
  if (report.schlechtwetter.length === 0) {
    swBody.innerHTML = '<tr><td colspan="4" class="text-center">Keine Schlechtwetter-Ereignisse</td></tr>';
  } else {
    swBody.innerHTML = report.schlechtwetter.map(function(s) {
      var stunden = s.gesamt_minuten ? (s.gesamt_minuten / 60).toFixed(2) : '0.00';
      return '<tr><td>' + escapeHtml(s.mitarbeiter_nr) + '</td><td>' + escapeHtml(s.name) + '</td><td>' + s.ereignisse + '</td><td>' + stunden + '</td></tr>';
    }).join('');
  }

  var baustellenBody = document.getElementById('buak-report-baustellen');
  if (report.baustellen.length === 0) {
    baustellenBody.innerHTML = '<tr><td colspan="4" class="text-center">Keine Baustellen-Daten</td></tr>';
  } else {
    baustellenBody.innerHTML = report.baustellen.map(function(b) {
      var stunden = b.gesamt_minuten ? (b.gesamt_minuten / 60).toFixed(2) : '0.00';
      return '<tr><td>' + escapeHtml(b.baustelle) + '</td><td>' + b.mitarbeiter_anzahl + '</td><td>' + b.tage + '</td><td>' + stunden + '</td></tr>';
    }).join('');
  }
}

function exportBuakCsv() {
  var datumVon = formatDateForAPI(document.getElementById('buak-report-von').value);
  var datumBis = formatDateForAPI(document.getElementById('buak-report-bis').value);
  window.open('/api/buak/export/csv?datum_von=' + datumVon + '&datum_bis=' + datumBis, '_blank');
}

function exportBuakPdf() {
  var datumVon = formatDateForAPI(document.getElementById('buak-report-von').value);
  var datumBis = formatDateForAPI(document.getElementById('buak-report-bis').value);
  window.open('/api/buak/export/pdf?datum_von=' + datumVon + '&datum_bis=' + datumBis, '_blank');
}
