/* watch.js — video watch page logic */

const params   = new URLSearchParams(location.search);
const videoUUID = params.get('v');

let videoData    = null;
let currentUser  = null;

// ── Player ─────────────────────────────────────────────────────────────────────
const player = document.getElementById('videoPlayer');

function togglePlay() {
  if (player.paused) player.play(); else player.pause();
}

function seekRel(delta) {
  player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + delta));
}

function seekTo(e) {
  const track = document.getElementById('progressTrack');
  const rect  = track.getBoundingClientRect();
  const pct   = (e.clientX - rect.left) / rect.width;
  if (player.duration) player.currentTime = pct * player.duration;
}

function toggleMute() {
  player.muted = !player.muted;
  document.getElementById('volSlider').value = player.muted ? 0 : player.volume;
}

function setVolume(v) {
  player.volume = parseFloat(v);
  player.muted  = (parseFloat(v) === 0);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('playerContainer').requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function updateProgress() {
  if (!player.duration) return;
  const pct = player.currentTime / player.duration * 100;
  document.getElementById('progressPlayed').style.width = pct + '%';
  document.getElementById('progressThumb').style.left   = pct + '%';
  document.getElementById('timeDisplay').textContent =
    `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
}

function syncPlayIcons(paused) {
  ['playIcon','pauseIcon','playIcon2','pauseIcon2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    const shouldHide = (i % 2 === 0) ? !paused : paused;
    el.classList.toggle('hidden', shouldHide);
  });
}

player.addEventListener('timeupdate', updateProgress);
player.addEventListener('play',  () => syncPlayIcons(false));
player.addEventListener('pause', () => syncPlayIcons(true));
player.addEventListener('ended', () => syncPlayIcons(true));
player.addEventListener('click', togglePlay);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
  if (e.key === 'ArrowLeft')  seekRel(-5);
  if (e.key === 'ArrowRight') seekRel(5);
  if (e.key === 'f')          toggleFullscreen();
  if (e.key === 'm')          toggleMute();
});

// ── Load video data ────────────────────────────────────────────────────────────
async function loadVideo() {
  if (!videoUUID) { window.location.href = '/'; return; }

  const data = await apiGet(`/api/videos/${videoUUID}`);
  if (!data)    { document.getElementById('videoTitle').textContent = 'Видео не найдено'; return; }
  videoData = data;

  document.title = `${data.title} — VideoHub`;

  // Set player source
  player.src = data.stream_url;

  // Title & meta
  document.getElementById('videoTitle').textContent  = data.title;
  document.getElementById('viewsCount').textContent  = `${data.views_fmt || data.views} просмотров`;
  document.getElementById('likeCount').textContent   = data.likes;
  document.getElementById('dislikeCount').textContent = data.dislikes;

  // Description
  const desc = document.getElementById('videoDescription');
  const descBlock = document.getElementById('descriptionBlock');
  if (data.description) {
    desc.textContent = data.description;
    descBlock.style.display = 'block';
  } else {
    descBlock.style.display = 'none';
  }

  // Channel info
  document.getElementById('channelName').textContent = data.author.username;
  document.getElementById('channelSubs').textContent =
    `Канал ${fmtSubs(data.author.subscribers)} подписчиков`;

  const ca = document.getElementById('channelAvatar');
  if (data.author.avatar) {
    ca.innerHTML = `<img src="${data.author.avatar}" alt="${data.author.username}">`;
  }

  // Reactions
  updateReactionUI(data.user_reaction, data.likes, data.dislikes);

  // Subscribe button — скрываем если это своё видео
  currentUser = getUser();
  const subscribeBtn = document.getElementById('subscribeBtn');
  if (currentUser && parseInt(currentUser.id) === parseInt(data.author.id)) {
    subscribeBtn.style.display = 'none';
  } else {
    updateSubscribeUI(data.author.subscribed, data.author.subscribers);
  }

  // Comments section visibility
  if (currentUser && isLoggedIn()) {
    document.getElementById('addCommentWrap').classList.remove('hidden');
  }

  loadComments();
}

function fmtSubs(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + ' млн.';
  if (n >= 1_000)     return Math.round(n/1_000) + ' тыс.';
  return String(n);
}

// ── Reactions ──────────────────────────────────────────────────────────────────
function updateReactionUI(reaction, likes, dislikes) {
  const lb = document.getElementById('likeBtn');
  const db = document.getElementById('dislikeBtn');
  document.getElementById('likeCount').textContent    = likes;
  document.getElementById('dislikeCount').textContent = dislikes;
  lb.classList.remove('like-active', 'dislike-active');
  db.classList.remove('like-active', 'dislike-active');
  if (reaction === 'like')    lb.classList.add('like-active');
  if (reaction === 'dislike') db.classList.add('dislike-active');
}

async function toggleReaction(isLike) {
  if (!isLoggedIn()) { openModal('authModal'); return; }
  const data = await apiPost(`/api/videos/${videoUUID}/like`, { is_like: isLike });
  if (data && !data.error) {
    updateReactionUI(data.user_reaction, data.likes, data.dislikes);
  }
}

// ── Subscribe ──────────────────────────────────────────────────────────────────
function updateSubscribeUI(subscribed, count) {
  const btn = document.getElementById('subscribeBtn');
  const sub = document.getElementById('channelSubs');
  if (subscribed) {
    btn.textContent = 'Отписаться';
    btn.classList.add('subscribed');
  } else {
    btn.textContent = 'Подписаться';
    btn.classList.remove('subscribed');
  }
  sub.textContent = `Канал ${fmtSubs(count)} подписчиков`;
}

async function toggleSubscribe() {
  if (!isLoggedIn()) { openModal('authModal'); return; }
  if (!videoData) return;
  const data = await apiPost(`/api/users/${videoData.author.id}/subscribe`, {});
  if (data && !data.error) {
    videoData.author.subscribed   = data.subscribed;
    videoData.author.subscribers  = data.subscribers;
    updateSubscribeUI(data.subscribed, data.subscribers);
  }
}

// ── Comments ───────────────────────────────────────────────────────────────────
async function loadComments() {
  const data = await apiGet(`/api/videos/${videoUUID}/comments`);
  const list = document.getElementById('commentsList');
  const title = document.getElementById('commentsTitle');
  if (!data) return;
  title.textContent = `Комментарии (${data.length})`;
  list.innerHTML = data.map(c => commentHtml(c)).join('');
}

function commentHtml(c) {
  const cu = getUser();
  const canDelete = cu && parseInt(cu.id) === parseInt(c.author.id);
  const ava = c.author.avatar
    ? `<img src="${c.author.avatar}" alt="${c.author.username}">`
    : `<span style="font-size:14px;font-weight:700;color:var(--text2)">${(c.author.username||'?')[0].toUpperCase()}</span>`;
  const date = new Date(c.created_at).toLocaleDateString('ru-RU');
  return `
<div class="comment-item" id="comment-${c.id}">
  <div class="comment-avatar">${ava}</div>
  <div class="comment-body">
    <div class="comment-author">${escHtml(c.author.username)} <span class="comment-date">${date}</span></div>
    <div class="comment-text">${escHtml(c.text)}</div>
    ${canDelete ? `<div class="comment-delete" onclick="deleteComment(${c.id})">Удалить</div>` : ''}
  </div>
</div>`;
}

async function postComment() {
  if (!isLoggedIn()) { openModal('authModal'); return; }
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;
  const data = await apiPost(`/api/videos/${videoUUID}/comments`, { text });
  if (data && !data.error) {
    input.value = '';
    loadComments();
  }
}

async function deleteComment(id) {
  await apiDelete(`/api/comments/${id}`);
  const el = document.getElementById(`comment-${id}`);
  if (el) el.remove();
  loadComments();
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Enter to comment ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('commentInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') postComment();
  });
  loadVideo();
});
