/* ─────────────────────────────────────────────────────────────────
   Plain Text Editor — app.js
   ───────────────────────────────────────────────────────────────── */

'use strict';

// ── Constants ──────────────────────────────────────────────────────
const API = 'api.php';

const LS_THEME = 'pte_theme';
const LS_LINE_NUMBERS = 'pte_line_numbers';
const LS_RULED = 'pte_ruled';

// ── Element refs ───────────────────────────────────────────────────
const appEl = document.getElementById('app');
const editor = document.getElementById('editor');
const filenameInput = document.getElementById('filename-input');
const fileInput = document.getElementById('file-input');

const btnNew = document.getElementById('btn-new');
const btnOpenDevice = document.getElementById('btn-open-device');
const btnOpenServer = document.getElementById('btn-open-server');
const btnSaveServer = document.getElementById('btn-save-server');
const btnDownload = document.getElementById('btn-download');
const btnTheme = document.getElementById('btn-theme');
const btnLineNumbers = document.getElementById('btn-line-numbers');
const btnRuled = document.getElementById('btn-ruled');

const editorWrap = document.querySelector('.editor-wrap');
const lineNumbers = document.getElementById('line-numbers');

const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const btnSidebarClose = document.getElementById('btn-sidebar-close');
const fileList = document.getElementById('file-list');
const fileListEmpty = document.getElementById('file-list-empty');

const statusWords = document.getElementById('status-words');
const statusChars = document.getElementById('status-chars');
const statusSave = document.getElementById('status-save');
const metaThemeColor = document.getElementById('meta-theme-color');
const toast = document.getElementById('toast');

// ── State ──────────────────────────────────────────────────────────
let localFileHandle = null;

// ── Boot ───────────────────────────────────────────────────────────
(function init() {
  applyTheme(localStorage.getItem(LS_THEME) || 'light');
  applyLineNumbers(localStorage.getItem(LS_LINE_NUMBERS) === 'true');
  applyRuled(localStorage.getItem(LS_RULED) === 'true');
  showApp();
  registerServiceWorker();
})();

// ── App ───────────────────────────────────────────────────────────
function showApp() {
  appEl.hidden = false;
  updateCounts();
  // Only auto-focus on desktop — on mobile this would immediately open the keyboard
  if (!('ontouchstart' in window)) editor.focus();
}

// ── New Document ───────────────────────────────────────────────────
btnNew.addEventListener('click', () => {
  if (editor.value.trim() && !confirm('Discard current document and start new?')) return;
  editor.value = '';
  filenameInput.value = 'untitled.txt';
  localFileHandle = null;
  updateCounts();
  setStatus('New document');
  editor.focus();
});

// ── Open from Device ───────────────────────────────────────────────
btnOpenDevice.addEventListener('click', async () => {
  // Prefer File System Access API on supporting browsers (Chromium desktop)
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Text files', accept: { 'text/plain': ['.txt'] } }],
        multiple: false,
      });
      localFileHandle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      editor.value = text;
      filenameInput.value = sanitizeFilename(file.name);
      updateCounts();
      updateLineNumbers();
      setStatus(`Opened "${file.name}" from device`);
      editor.focus();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // user cancelled
      // Fall through to classic input
    }
  }
  // Fallback: classic <input type="file">
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // reset so same file can be re-opened
  const text = await file.text();
  editor.value = text;
  filenameInput.value = sanitizeFilename(file.name);
  localFileHandle = null;
  updateCounts();
  updateLineNumbers();
  setStatus(`Opened "${file.name}" from device`);
  editor.focus();
});

// ── Save to Server ─────────────────────────────────────────────────
btnSaveServer.addEventListener('click', saveToServer);

async function saveToServer() {
  const filename = normalizeFilename(filenameInput.value.trim());
  filenameInput.value = filename;

  btnSaveServer.disabled = true;
  btnSaveServer.textContent = 'Saving…';
  setStatus('Saving…');
  try {
    const res = await apiFetch('save', { filename, content: editor.value });
    if (res.ok) {
      showToast(`✓ Saved "${filename}"`, 'success');
      setStatus(`Saved "${filename}" to server`);
    } else {
      showToast(`✕ Save failed: ${res.message || 'unknown error'}`, 'error');
      setStatus(`Error: ${res.message || 'Save failed'}`, true);
    }
  } catch {
    showToast('✕ Network error — could not save', 'error');
    setStatus('Network error — could not save to server', true);
  } finally {
    btnSaveServer.disabled = false;
    btnSaveServer.textContent = 'Save';
  }
}

// ── Download to Device ─────────────────────────────────────────────
btnDownload.addEventListener('click', async () => {
  const filename = normalizeFilename(filenameInput.value.trim());
  filenameInput.value = filename;

  // Try save-back to original local file (Chromium desktop only)
  if (localFileHandle) {
    try {
      const writable = await localFileHandle.createWritable();
      await writable.write(editor.value);
      await writable.close();
      setStatus(`Saved back to "${filename}" on device`);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Fall through to download
    }
  }

  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus(`Downloaded "${filename}"`);
});

// ── File Browser (Sidebar) ─────────────────────────────────────────
btnOpenServer.addEventListener('click', openSidebar);
btnSidebarClose.addEventListener('click', closeSidebar);
sidebarBackdrop.addEventListener('click', closeSidebar);

function openSidebar() {
  sidebar.hidden = false;
  sidebarBackdrop.hidden = false;
  // Trigger CSS transition
  requestAnimationFrame(() => {
    sidebar.classList.add('open');
  });
  loadFileList();
}

function closeSidebar() {
  sidebar.classList.remove('open');
  // Use a fallback timeout in case transitionend never fires (no CSS transition)
  const hide = () => {
    sidebar.hidden = true;
    sidebarBackdrop.hidden = true;
  };
  const t = setTimeout(hide, 400);
  sidebar.addEventListener('transitionend', () => { clearTimeout(t); hide(); }, { once: true });
}

async function loadFileList() {
  fileList.innerHTML = '';
  fileListEmpty.hidden = true;

  try {
    const res = await apiFetch('list', {});
    if (!res.ok) { setStatus(`Error listing files: ${res.message}`, true); return; }

    const files = res.data?.files || [];
    if (files.length === 0) { fileListEmpty.hidden = false; return; }

    const fragment = document.createDocumentFragment();
    files.forEach(name => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      const btnRen = document.createElement('button');
      const btnDel = document.createElement('button');

      span.textContent = name;
      span.className = 'file-name';
      span.title = name;
      span.addEventListener('click', () => openFromServer(name));

      btnRen.textContent = '✎';
      btnRen.className = 'btn-rename';
      btnRen.title = `Rename ${name}`;
      btnRen.addEventListener('click', e => { e.stopPropagation(); renameOnServer(name); });

      btnDel.textContent = '✕';
      btnDel.className = 'btn-delete';
      btnDel.title = `Delete ${name}`;
      btnDel.addEventListener('click', e => { e.stopPropagation(); deleteFromServer(name, li); });

      li.appendChild(span);
      li.appendChild(btnRen);
      li.appendChild(btnDel);
      fragment.appendChild(li);
    });
    fileList.appendChild(fragment);
  } catch {
    setStatus('Network error — could not list files', true);
  }
}

async function openFromServer(filename) {
  setStatus(`Loading "${filename}"…`);
  try {
    const res = await apiFetch('load', { filename });
    if (res.ok) {
      editor.value = res.data?.content ?? '';
      filenameInput.value = filename;
      localFileHandle = null;
      updateCounts();
      updateLineNumbers();
      setStatus(`Opened "${filename}" from server`);
      closeSidebar();
      editor.focus();
    } else {
      setStatus(`Error: ${res.message || 'Load failed'}`, true);
    }
  } catch {
    setStatus('Network error — could not load file', true);
  }
}

async function renameOnServer(oldName) {
  const base = oldName.replace(/\.txt$/i, '');
  const input = prompt(`Rename "${oldName}" to:`, base);
  if (input === null) return; // cancelled
  const newName = normalizeFilename(input.trim());
  if (newName === oldName) return;
  try {
    const res = await apiFetch('rename', { oldFilename: oldName, newFilename: newName });
    if (res.ok) {
      if (filenameInput.value === oldName) filenameInput.value = newName;
      setStatus(`Renamed "${oldName}" to "${newName}"`);
      loadFileList();
    } else {
      setStatus(`Error: ${res.message || 'Rename failed'}`, true);
    }
  } catch {
    setStatus('Network error — could not rename file', true);
  }
}

async function deleteFromServer(filename, liEl) {
  if (!confirm(`Delete "${filename}" from server? This cannot be undone.`)) return;
  try {
    const res = await apiFetch('delete', { filename });
    if (res.ok) {
      liEl.remove();
      if (fileList.children.length === 0) fileListEmpty.hidden = false;
      setStatus(`Deleted "${filename}" from server`);
    } else {
      setStatus(`Error: ${res.message || 'Delete failed'}`, true);
    }
  } catch {
    setStatus('Network error — could not delete file', true);
  }
}

// ── Auto-save (word/char count on input) ──────────────────────────
editor.addEventListener('input', () => {
  updateCounts();
  updateLineNumbers();
});

editor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = editor.scrollTop;
  syncRuledBackground();
});

function syncRuledBackground() {
  if (!editorWrap.classList.contains('show-ruled')) return;
  const lh = parseFloat(getComputedStyle(editor).lineHeight);
  const offset = (24 - editor.scrollTop) % lh;
  editor.style.backgroundPositionY = (offset <= 0 ? offset + lh : offset) + 'px';
}

// ── Theme Toggle ───────────────────────────────────────────────────
btnTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Line Numbers Toggle ────────────────────────────────────────────
btnLineNumbers.addEventListener('click', () => {
  applyLineNumbers(!editorWrap.classList.contains('show-lines'));
});

function applyLineNumbers(on) {
  editorWrap.classList.toggle('show-lines', on);
  btnLineNumbers.setAttribute('aria-pressed', String(on));
  btnLineNumbers.style.color = on ? 'var(--accent)' : '';
  localStorage.setItem(LS_LINE_NUMBERS, String(on));
  if (on) updateLineNumbers();
}

// ── Ruled Lines Toggle ────────────────────────────────────────────
btnRuled.addEventListener('click', () => {
  applyRuled(!editorWrap.classList.contains('show-ruled'));
});

function applyRuled(on) {
  editorWrap.classList.toggle('show-ruled', on);
  btnRuled.setAttribute('aria-pressed', String(on));
  btnRuled.style.color = on ? 'var(--accent)' : '';
  localStorage.setItem(LS_RULED, String(on));
  if (on) syncRuledBackground();
  else editor.style.backgroundPositionY = '';
}

let _mirror = null;
function getMirror() {
  if (_mirror) return _mirror;
  _mirror = document.createElement('div');
  _mirror.setAttribute('aria-hidden', 'true');
  Object.assign(_mirror.style, {
    position: 'absolute', top: '-9999px', left: '-9999px',
    visibility: 'hidden', whiteSpace: 'pre-wrap',
    wordBreak: 'break-word', overflowWrap: 'break-word',
    boxSizing: 'border-box',
  });
  document.body.appendChild(_mirror);
  return _mirror;
}

function updateLineNumbers() {
  if (!editorWrap.classList.contains('show-lines')) return;

  const cs = getComputedStyle(editor);
  const lineHeight = parseFloat(cs.lineHeight);
  const contentWidth = editor.clientWidth
    - parseFloat(cs.paddingLeft)
    - parseFloat(cs.paddingRight);

  const m = getMirror();
  Object.assign(m.style, {
    width: contentWidth + 'px',
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
  });

  const lines = editor.value.split('\n');
  let lineNum = 1;
  let text = '';

  for (const line of lines) {
    m.textContent = line || '\u200b'; // zero-width space keeps empty lines measurable
    const rows = Math.max(1, Math.round(m.scrollHeight / lineHeight));
    for (let r = 0; r < rows; r++) {
      text += lineNum++ + '\n';
    }
  }

  lineNumbers.textContent = text;
  lineNumbers.scrollTop = editor.scrollTop;
}

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => updateLineNumbers()).observe(editor);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_THEME, theme);
  btnTheme.textContent = theme === 'dark' ? '🌙' : '☀️';
  if (metaThemeColor) metaThemeColor.content = theme === 'dark' ? '#1a1a1a' : '#f5f5f0';
}

// ── Word / Char Count ──────────────────────────────────────────────
function updateCounts() {
  const text = editor.value;
  const trimmed = text.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  const chars = text.length;
  statusWords.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  statusChars.textContent = `${chars} ${chars === 1 ? 'char' : 'chars'}`;
}

// ── Status Bar ─────────────────────────────────────────────────────
// setStatus(msg, isError): shows msg in status bar; auto-clears after 4s unless isError=true
let statusTimer = null;
function setStatus(msg, isError = false) {
  statusSave.textContent = msg;
  statusSave.style.color = isError ? 'var(--error)' : '';
  clearTimeout(statusTimer);
  if (!isError) {
    statusTimer = setTimeout(() => {
      statusSave.textContent = '';
      statusSave.style.color = '';
    }, 4000);
  }
}

// showToast(msg, type): prominent pop-up for save success/failure ('success' | 'error')
let toastTimer = null;
function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `show toast-${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ''; }, 3000);
}

// ── API Helper ─────────────────────────────────────────────────────
async function apiFetch(action, body) {
  const headers = { 'Content-Type': 'application/json' };

  const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return { ok: res.ok && data.ok, data: data.data, message: data.message };
}

// ── Filename Helpers ───────────────────────────────────────────────
// normalizeFilename: formats a user-typed name (strips illegal chars, ensures .txt)
function normalizeFilename(name) {
  if (!name) return 'untitled.txt';
  name = name.replace(/[\/\\:*?"<>|]/g, '-').replace(/\.{2,}/g, '.').trim();
  if (!name.toLowerCase().endsWith('.txt')) name += '.txt';
  return name || 'untitled.txt';
}

// sanitizeFilename: used for file-picker names — strips any path component first
function sanitizeFilename(name) {
  return normalizeFilename(name.split(/[/\\]/).pop() || 'untitled.txt');
}

// ── Service Worker ─────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal — PWA offline just won't work
    });
  }
}
