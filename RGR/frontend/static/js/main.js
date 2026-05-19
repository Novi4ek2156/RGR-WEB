/* main.js — home page logic */

let page = 1, loading = false, hasMore = true, currentQuery = '';

function avatarHtml(author) {
  if (author.avatar) return `<img src="${author.avatar}" alt="${author.username}">`;
  const letter = author.username ? author.username[0].toUpperCase() : '?';
  return `<span style="font-size:15px;font-weight:700;color:var(--text2)">${letter}</span>`;
}

function renderCard(v) {
  const thumb = v.thumbnail
    ? `<img class="thumb-img" src="${v.thumbnail}" alt="${v.title}" loading="lazy">`
    : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" style="opacity:.3"><path d="M8 5v14l11-7z"/></svg></div>`;

  const dur = v.duration ? `<span class="thumb-duration">${formatDuration(v.duration)}</span>` : '';

  return `
<div class="video-card" onclick="openVideo('${v.uuid}')">
  <div class="thumb-wrap">${thumb}${dur}</div>
  <div class="card-bottom">
    <div class="card-avatar">${avatarHtml(v.author)}</div>
    <div class="card-meta">
      <div class="card-title">${escHtml(v.title)}</div>
      <div class="card-channel">${escHtml(v.author.username)}</div>
      <div class="card-info">${v.views_fmt} просмотров • ${v.time_ago}</div>
    </div>
    <button class="card-options" onclick="event.stopPropagation()" title="Ещё">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    </button>
  </div>
</div>`;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function openVideo(uuid) { window.location.href = `/watch.html?v=${uuid}`; }

async function loadVideos(reset = false) {
  if (loading || (!hasMore && !reset)) return;
  loading = true;

  const loadingEl  = document.getElementById('loading');
  const noResults  = document.getElementById('noResults');
  const grid       = document.getElementById('videoGrid');
  const loadMoreW  = document.getElementById('loadMoreWrap');

  loadingEl.classList.remove('hidden');
  noResults.classList.add('hidden');

  if (reset) {
    grid.innerHTML = '';
    page = 1; hasMore = true;
  }

  const q = currentQuery ? `&q=${encodeURIComponent(currentQuery)}` : '';
  const data = await apiGet(`/api/videos?page=${page}&limit=12${q}`);

  loadingEl.classList.add('hidden');
  loading = false;

  if (!data) return;

  data.videos.forEach(v => grid.insertAdjacentHTML('beforeend', renderCard(v)));

  const loaded = (page - 1) * 12 + data.videos.length;
  hasMore = loaded < data.total;
  loadMoreW.style.display = hasMore ? 'flex' : 'none';

  if (page === 1 && data.videos.length === 0) {
    noResults.classList.remove('hidden');
  }

  page++;
}

// Upload logic
let selectedVideoFile = null;

function onFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedVideoFile = file;
  const wrap = document.getElementById('selectedFile');
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
    <span>${escHtml(file.name)}</span>
    <span style="margin-left:auto;color:var(--text3)">${(file.size/1024/1024).toFixed(1)} МБ</span>`;
}

async function doUpload() {
  const titleEl = document.getElementById('uploadTitle');
  const descEl  = document.getElementById('uploadDesc');
  const thumbEl = document.getElementById('thumbFile');
  const errEl   = document.getElementById('uploadGlobalErr');
  const titleEr = document.getElementById('uploadTitleErr');
  const btn     = document.getElementById('uploadSubmitBtn');
  const prog    = document.getElementById('uploadProgress');
  const fill    = document.getElementById('progressFill');
  const pText   = document.getElementById('progressText');

  titleEr.textContent = ''; errEl.textContent = '';

  if (!isLoggedIn()) { openModal('authModal'); closeModal('uploadModal'); return; }
  if (!selectedVideoFile) { errEl.textContent = 'Выберите файл видео'; return; }

  const title = titleEl.value.trim();
  if (!title) { titleEr.textContent = 'Укажите название'; return; }

  const fd = new FormData();
  fd.append('video', selectedVideoFile);
  fd.append('title', title);
  fd.append('description', descEl.value.trim());
  if (thumbEl.files[0]) fd.append('thumbnail', thumbEl.files[0]);

  btn.disabled = true;
  prog.classList.remove('hidden');

  try {
    const data = await apiUpload('/api/videos/upload', fd, pct => {
      const p = Math.round(pct * 100);
      fill.style.width  = p + '%';
      pText.textContent = p + '%';
    });

    if (data.error)  { errEl.textContent = data.error; btn.disabled = false; return; }
    if (data.errors) { errEl.textContent = Object.values(data.errors).join(' · '); btn.disabled = false; return; }

    closeModal('uploadModal');
    // Reset form
    titleEl.value = ''; descEl.value = '';
    document.getElementById('videoFile').value = '';
    document.getElementById('selectedFile').classList.add('hidden');
    prog.classList.add('hidden'); fill.style.width = '0'; pText.textContent = '0%';
    selectedVideoFile = null; btn.disabled = false;
    // Reload grid
    await loadVideos(true);
  } catch(e) {
    errEl.textContent = 'Ошибка загрузки: ' + e.message;
    btn.disabled = false;
  }
}

// Drag and drop
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('dropZone');
  if (dz) {
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) { document.getElementById('videoFile').files = e.dataTransfer.files; onFileSelect({ target: { files: [f] } }); }
    });
  }

  // Search
  const si  = document.getElementById('searchInput');
  const sb  = document.getElementById('searchBtn');
  const params = new URLSearchParams(location.search);
  const q  = params.get('q') || '';
  if (q) { currentQuery = q; if (si) si.value = q; }

  const doSearch = () => {
    currentQuery = si ? si.value.trim() : '';
    const url = currentQuery ? `/?q=${encodeURIComponent(currentQuery)}` : '/';
    if (location.href !== url) { history.pushState({}, '', url); }
    loadVideos(true);
  };
  si && si.addEventListener('keydown', e => e.key === 'Enter' && doSearch());
  sb && sb.addEventListener('click', doSearch);

  document.getElementById('loadMoreBtn')?.addEventListener('click', loadVideos);

  loadVideos();
});
