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

// State
let sessionId = localStorage.getItem('sessionId');
let userName = localStorage.getItem('userName');
let isAdmin = localStorage.getItem('isAdmin') === 'true';

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
    // Bei Session-Ablauf automatisch ausloggen
    if (response.status === 401) {
      handleSessionExpired();
    }
    throw new Error(data.error || 'Fehler');
  }

  return data;
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

// Kundenliste für Dropdown laden
async function loadKundenListe() {
  try {
    const kunden = await api('/kunden');
    const datalist = document.getElementById('kunden-liste');
    datalist.innerHTML = kunden.map(k => `<option value="${k.name}">`).join('');
  } catch (error) {
    console.error('Kunden laden fehlgeschlagen:', error);
  }
}

// Baustellenliste für Dropdown laden
async function loadBaustellenListe() {
  try {
    const baustellen = await api('/baustellen');
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

  // Einträge immer laden
  loadHistory();
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

    // History aktualisieren
    loadHistory();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.className = 'message error';
  }
});

async function loadHistory() {
  try {
    const eintraege = await api('/zeiteintraege');
    const tbody = document.querySelector('#user-eintraege-table tbody');
    const emptyState = document.getElementById('history-empty');
    const tableContainer = document.getElementById('history-table-container');
    const printBtn = document.getElementById('print-user-btn');

    if (eintraege.length === 0) {
      emptyState.classList.remove('hidden');
      tableContainer.classList.add('hidden');
      printBtn.classList.add('hidden');
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
  } catch (error) {
    console.error(error);
  }
}

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
  await Promise.all([loadFilterOptions(), loadEintraege(), loadMitarbeiter(), loadKunden(), loadBaustellen()]);
}

// Filter-Dropdowns befüllen
async function loadFilterOptions() {
  try {
    const [mitarbeiter, baustellen, kunden] = await Promise.all([
      api('/admin/mitarbeiter'),
      api('/admin/baustellen'),
      api('/admin/kunden')
    ]);

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

async function loadEintraege() {
  const vonAT = document.getElementById('filter-von').value;
  const bisAT = document.getElementById('filter-bis').value;
  const von = parseATDate(vonAT);
  const bis = parseATDate(bisAT);
  const mitarbeiterId = document.getElementById('filter-mitarbeiter').value;
  const baustelle = document.getElementById('filter-baustelle').value;
  const kunde = document.getElementById('filter-kunde').value;

  let url = '/admin/zeiteintraege';
  const params = [];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (params.length) url += '?' + params.join('&');

  try {
    let eintraege = await api(url);

    // Client-seitig nach Mitarbeiter, Baustelle, Kunde filtern
    if (mitarbeiterId) {
      eintraege = eintraege.filter(e => e.mitarbeiter_id == mitarbeiterId);
    }
    if (baustelle) {
      eintraege = eintraege.filter(e => e.baustelle === baustelle);
    }
    if (kunde) {
      eintraege = eintraege.filter(e => e.kunde === kunde);
    }

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
        <td class="action-btns">
          <button class="btn btn-small btn-icon" onclick="printEinzelnerEintrag(${e.id})" title="Drucken">🖨</button>
          <button class="btn btn-small btn-danger btn-icon" onclick="deleteEintrag(${e.id})" title="Löschen">✕</button>
        </td>
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

async function loadKunden() {
  try {
    const kunden = await api('/admin/kunden');
    const tbody = document.querySelector('#kunden-table tbody');

    if (kunden.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Noch keine Kunden angelegt.</td></tr>';
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
  } catch (error) {
    console.error(error);
  }
}

async function loadBaustellen() {
  try {
    const baustellen = await api('/admin/baustellen');
    const tbody = document.querySelector('#baustellen-table tbody');

    if (baustellen.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Noch keine Baustellen angelegt.</td></tr>';
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

  let url = '/admin/zeiteintraege';
  const params = [];
  if (von) params.push(`von=${von}`);
  if (bis) params.push(`bis=${bis}`);
  if (params.length) url += '?' + params.join('&');

  try {
    let eintraege = await api(url);

    // Client-seitig filtern
    if (mitarbeiterId) {
      eintraege = eintraege.filter(e => e.mitarbeiter_id == mitarbeiterId);
    }
    if (baustelle) {
      eintraege = eintraege.filter(e => e.baustelle === baustelle);
    }
    if (kunde) {
      eintraege = eintraege.filter(e => e.kunde === kunde);
    }

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
    const eintraege = await api('/zeiteintraege');
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
