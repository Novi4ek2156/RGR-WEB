/* upload.js */

let selectedVideo = null;
let selectedThumb = null;

// ── Auth check ─────────────────────────────────────────────────────────────────
function checkAuth() {
  if (isLoggedIn()) {
    document.getElementById('authGuard').classList.add('hidden');
    document.getElementById('uploadPage').classList.remove('hidden');
  } else {
    document.getElementById('authGuard').classList.remove('hidden');
    document.getElementById('uploadPage').classList.add('hidden');
  }
}

// ── File selection ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  const videoInput = document.getElementById('videoFile');
  const dropZone   = document.getElementById('dropZone');
  const titleInput = document.getElementById('uploadTitle');

  videoInput.addEventListener('change', e => handleVideoFile(e.target.files[0]));

  // char counter
  titleInput.addEventListener('input', () => {
    document.getElementById('titleCount').textContent = titleInput.value.length;
  });

  // drag & drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleVideoFile(f);
  });
  dropZone.addEventListener('click', e => {
    if (e.target.tagName !== 'INPUT') videoInput.click();
  });

  // wire up upload btn from header if exists
  document.getElementById('uploadBtn')?.addEventListener('click', () => {
    window.location.href = '/upload.html';
  });
});

function handleVideoFile(file) {
  if (!file) return;
  const allowed = ['video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/x-matroska','video/avi'];
  const byExt   = /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file.name);
  if (!allowed.includes(file.type) && !byExt) {
    setGlobalErr('Недопустимый формат. Используйте MP4, WebM, OGG, MOV, AVI или MKV.');
    return;
  }
  selectedVideo = file;
  // Show file card
  document.getElementById('fileCard').classList.remove('hidden');
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileMeta').textContent = `${(file.size/1024/1024).toFixed(1)} МБ · ${file.type || 'видео'}`;
  // Style drop zone
  const dz = document.getElementById('dropZone');
  dz.classList.add('has-file');
  document.getElementById('dropZoneInner').innerHTML = `
    <div style="color:#4caf50;margin-bottom:12px">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    </div>
    <p style="font-weight:600;font-size:16px">Файл выбран</p>
    <p style="color:var(--text3);font-size:13px;margin-top:6px">${escHtml(file.name)}</p>`;
  setGlobalErr('');
}

function removeFile() {
  selectedVideo = null;
  document.getElementById('videoFile').value = '';
  document.getElementById('fileCard').classList.add('hidden');
  const dz = document.getElementById('dropZone');
  dz.classList.remove('has-file');
  document.getElementById('dropZoneInner').innerHTML = `
    <div class="drop-icon"><svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg></div>
    <h2>Перетащите файл сюда</h2>
    <p class="drop-sub">или</p>
    <label class="btn-red" style="cursor:pointer;display:inline-block">
      Выбрать файл
      <input type="file" id="videoFile" accept="video/*" style="display:none">
    </label>
    <p class="drop-hint">MP4, WebM, OGG, MOV, AVI, MKV — до 4 ГБ</p>`;
  document.getElementById('videoFile').addEventListener('change', e => handleVideoFile(e.target.files[0]));
}

// ── Thumbnail ──────────────────────────────────────────────────────────────────
function onThumbSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedThumb = file;
  const preview = document.getElementById('thumbPreview');
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="Превью">`;
  document.getElementById('thumbRemoveBtn').classList.remove('hidden');
}

function removeThumb() {
  selectedThumb = null;
  document.getElementById('thumbFile').value = '';
  document.getElementById('thumbPreview').innerHTML = `
    <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" style="opacity:.3"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
    <span>Нет обложки</span>`;
  document.getElementById('thumbRemoveBtn').classList.add('hidden');
}

// ── Upload ─────────────────────────────────────────────────────────────────────
async function doUpload() {
  setGlobalErr('');
  document.getElementById('uploadTitleErr').textContent = '';

  if (!selectedVideo) { setGlobalErr('Выберите файл видео'); return; }
  const title = document.getElementById('uploadTitle').value.trim();
  if (!title) { document.getElementById('uploadTitleErr').textContent = 'Укажите название'; return; }

  const btn = document.getElementById('publishBtn');
  const prog = document.getElementById('upProgress');
  const fill = document.getElementById('upProgressFill');
  const pct  = document.getElementById('upProgressPct');
  const lbl  = document.getElementById('upProgressLabel');

  btn.disabled = true;
  prog.classList.remove('hidden');

  const fd = new FormData();
  fd.append('video',       selectedVideo);
  fd.append('title',       title);
  fd.append('description', document.getElementById('uploadDesc').value.trim());
  if (selectedThumb) fd.append('thumbnail', selectedThumb);

  try {
    const data = await apiUpload('/api/videos/upload', fd, p => {
      const v = Math.round(p * 100);
      fill.style.width = v + '%';
      pct.textContent  = v + '%';
      lbl.textContent  = v < 100 ? 'Загрузка...' : 'Обработка...';
    });

    if (data.error || data.errors) {
      const msg = data.error || Object.values(data.errors).join(' · ');
      setGlobalErr(msg);
      btn.disabled = false;
      return;
    }

    // Success!
    document.getElementById('uploadPage').classList.add('hidden');
    const suc = document.getElementById('uploadSuccess');
    suc.classList.remove('hidden');
    document.getElementById('successTitle').textContent = `«${data.title}»`;
    document.getElementById('watchLink').href = `/watch.html?v=${data.uuid}`;

  } catch(e) {
    setGlobalErr('Ошибка загрузки: ' + e.message);
    btn.disabled = false;
  }
}

function resetUpload() {
  selectedVideo = null; selectedThumb = null;
  document.getElementById('uploadSuccess').classList.add('hidden');
  document.getElementById('uploadPage').classList.remove('hidden');
  document.getElementById('uploadTitle').value = '';
  document.getElementById('uploadDesc').value  = '';
  document.getElementById('titleCount').textContent = '0';
  document.getElementById('upProgress').classList.add('hidden');
  document.getElementById('upProgressFill').style.width = '0';
  document.getElementById('publishBtn').disabled = false;
  removeFile(); removeThumb();
}

function setGlobalErr(msg) {
  document.getElementById('uploadGlobalErr').textContent = msg;
}
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
