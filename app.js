const API_BASE = (window.ROCKECHO_API_BASE || 'http://localhost:3000').replace(/\/$/, '');
function apiUrl(path) { return `${API_BASE}${path}`; }
function mediaUrl(url) {
  if (!url) return url;
  if (Array.isArray(url)) return url.map(mediaUrl);
  return url.startsWith('/') ? `${API_BASE}${url}` : url;
}

const tracks = [
  { name: 'After Hours', type: 'Song', duration: '04:12', plays: 128, views: '2.4K', likes: 318, downloads: 86, date: 12, cover: 'cover-b', title: 'AFTER\n<em>hours</em>' },
  { name: 'Neon Rain', type: 'Beat', duration: '02:48', plays: 94, views: '1.8K', likes: 204, downloads: 71, date: 11, cover: 'cover-a', title: 'NEON\nRAIN' },
  { name: 'No Reply', type: 'Song', duration: '03:36', plays: 76, views: '1.2K', likes: 156, downloads: 39, date: 10, cover: 'cover-c', title: 'NO\nREPLY' },
  { name: 'Static Bloom', type: 'Beat', duration: '02:17', plays: 63, views: '986', likes: 122, downloads: 34, date: 9, cover: 'cover-d', title: 'STATIC\n<em>bloom</em>' },
  { name: 'Slow Motion', type: 'Song', duration: '03:58', plays: 51, views: '744', likes: 98, downloads: 21, date: 8, cover: 'cover-e', title: 'SLOW\nMOTION' },
  { name: 'Blue Hour', type: 'Beat', duration: '01:54', plays: 42, views: '608', likes: 74, downloads: 18, date: 7, cover: 'cover-f', title: 'BLUE\nHOUR' },
  { name: 'Open Road', type: 'Song', duration: '03:21', plays: 38, views: '492', likes: 61, downloads: 12, date: 6, cover: 'cover-a', title: 'OPEN\nROAD' },
  { name: 'Low Light', type: 'Beat', duration: '02:31', plays: 29, views: '376', likes: 48, downloads: 9, date: 5, cover: 'cover-c', title: 'LOW\nLIGHT' }
];

const grid = document.querySelector('#trackGrid');
const emptyState = document.querySelector('#emptyState');
const searchInput = document.querySelector('#searchInput');
const sortSelect = document.querySelector('#sortSelect');
const tabs = document.querySelectorAll('.tab');
const toast = document.querySelector('#toast');
let activeFilter = 'all';
let visibleTrackLimit = 8;
let playing = null;
let generatedAudio = null;
let producedTrack = null;
const defaultProfile = { username: 'MJ', email: 'updates@gmail.com', picture: '' };
const profile = JSON.parse(localStorage.getItem('launchpadProfile') || JSON.stringify(defaultProfile));

function applyProfile() {
  document.querySelector('#profileName').textContent = profile.username;
  document.querySelector('#profileUsername').value = profile.username;
  document.querySelector('#profileEmail').value = profile.email;
  document.querySelector('#accountTitle').textContent = profile.username === 'MJ' ? 'Midnight Jams' : profile.username;
  document.querySelector('#profileAvatar').textContent = profile.picture ? '' : profile.username.slice(0, 2).toUpperCase();
  document.querySelector('#accountSymbol').textContent = profile.picture ? '' : profile.username.slice(0, 2).toUpperCase();
  document.querySelectorAll('.avatar.small').forEach(item => { item.textContent = profile.username.slice(0, 2).toUpperCase(); });
  if (profile.picture) {
    document.querySelector('#profileAvatar').style.backgroundImage = `url(${profile.picture})`;
    document.querySelector('#profileAvatar').style.backgroundSize = 'cover';
    document.querySelector('#accountSymbol').style.backgroundImage = `url(${profile.picture})`;
    document.querySelector('#accountSymbol').style.backgroundSize = 'cover';
  }
}

function renderTracks() {
  const query = searchInput.value.trim().toLowerCase();
  const sorted = [...tracks].sort((a, b) => {
    if (sortSelect.value === 'az') return a.name.localeCompare(b.name);
    if (sortSelect.value === 'plays') return b.plays - a.plays;
    return b.date - a.date;
  });
  const visible = sorted.filter(track => (activeFilter === 'all' || track.type.toLowerCase() === activeFilter) && track.name.toLowerCase().includes(query));
  grid.innerHTML = visible.slice(0, visibleTrackLimit).map(track => `
    <article class="track-card">
      <div class="cover ${track.cover}"><div class="cover-title">${track.title.replace(/\n/g, '<br>')}</div></div>
      <div class="card-head"><div><div class="track-name">${track.name}</div><div class="track-kind">${track.type} · ${track.duration}</div></div><button class="play-button card-play ${playing === track.name ? 'is-playing' : ''}" data-track="${track.name}" aria-label="Play ${track.name}">${playing === track.name ? 'Ⅱ' : '▶'}</button></div>
      <div class="card-stats"><span>◉ ${track.views}</span><span>♡ ${track.likes}</span><span>⇩ ${track.downloads}</span></div><div class="card-foot"><span>${track.plays} plays</span>${track.savedId ? `<span class="card-actions"><button type="button" class="card-download" data-action="stems" data-id="${track.savedId}" title="Split into stems">≡</button><button type="button" class="card-download" data-action="extend" data-id="${track.savedId}" title="Extend length">⇥</button><a class="card-download" href="${apiUrl(`/api/tracks/${track.savedId}/download`)}" title="Download">⇩</a></span>` : ''}<span class="rights-badge">© RESERVED</span></div>
    </article>`).join('');
  emptyState.hidden = visible.length > 0;
  const loadMoreSentinel = document.querySelector('#loadMoreSentinel');
  loadMoreSentinel.hidden = visible.length <= visibleTrackLimit;
}

const loadMoreObserver = new IntersectionObserver(entries => {
  if (!entries[0].isIntersecting) return;
  visibleTrackLimit += 8;
  renderTracks();
}, { rootMargin: '240px' });
loadMoreObserver.observe(document.querySelector('#loadMoreSentinel'));

async function loadSavedTracks() {
  try {
    const owner = encodeURIComponent(profile.login || profile.username);
    const response = await fetch(apiUrl(`/api/tracks?owner=${owner}`));
    if (!response.ok) return;
    const saved = await response.json();
    saved.tracks.filter(track => track.status === 'ready' && track.audioUrl).reverse().forEach(track => {
      if (tracks.some(item => item.savedId === track.id)) return;
      tracks.unshift({ name: track.title, type: 'Song', duration: '00:30', plays: 0, views: '0', likes: 0, downloads: 0, date: 14, cover: 'cover-d', title: 'SAVED\n<em>draft</em>', audioUrl: mediaUrl(track.audioUrl), savedId: track.id });
    });
    renderTracks();
  } catch (error) {
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeCommunityText(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function playTrack(name) {
  playing = playing === name ? null : name;
  const track = tracks.find(item => item.name === name);
  if (generatedAudio) { generatedAudio.pause(); generatedAudio = null; }
  if (playing && track && track.audioUrl) { generatedAudio = new Audio(track.audioUrl); generatedAudio.play().catch(() => showToast('Press play to preview your launched song')); }
  document.querySelector('#nowTitle').textContent = playing ? name : 'After Hours';
  document.querySelector('#nowType').textContent = playing && track ? `${track.type} · ${track.duration}` : 'Song · 04:12';
  document.querySelector('#playerPlay').textContent = playing ? 'Ⅱ' : '▶';
  renderTracks();
  if (playing) showToast(`Playing ${name}`); else showToast('Playback paused');
}

grid.addEventListener('click', async event => {
  const button = event.target.closest('[data-track]');
  if (button) { playTrack(button.dataset.track); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const trackId = actionButton.dataset.id;
  if (actionButton.dataset.action === 'stems') {
    actionButton.disabled = true;
    actionButton.textContent = '...';
    try {
      const response = await fetch(apiUrl(`/api/tracks/${trackId}/stems`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stems: ['vocals', 'drums', 'bass', 'other'] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Stem separation failed');
      result.stems.forEach(stem => tracks.unshift({ name: stem.title, type: 'Beat', duration: '00:00', plays: 0, views: '0', likes: 0, downloads: 0, date: 15, cover: 'cover-e', title: 'STEM\n<em>split</em>', audioUrl: mediaUrl(stem.audioUrl), savedId: stem.id }));
      renderTracks();
      showToast(`Split into ${result.stems.length} stems`);
    } catch (error) {
      showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
    } finally {
      actionButton.disabled = false;
      actionButton.textContent = '≡';
    }
    return;
  }
  if (actionButton.dataset.action === 'extend') {
    const extraSeconds = Number(window.prompt('Extend by how many seconds (added to the end)?', '30'));
    if (!extraSeconds || extraSeconds <= 0) return;
    actionButton.disabled = true;
    actionButton.textContent = '...';
    try {
      const response = await fetch(apiUrl(`/api/tracks/${trackId}/extend`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extendAfter: extraSeconds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Extending this track failed');
      tracks.unshift({ name: result.track.title, type: 'Song', duration: '00:00', plays: 0, views: '0', likes: 0, downloads: 0, date: 15, cover: 'cover-f', title: 'EXT\n<em>ended</em>', audioUrl: mediaUrl(result.track.audioUrl), savedId: result.track.id });
      renderTracks();
      showToast('Extended version added to your library');
    } catch (error) {
      showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
    } finally {
      actionButton.disabled = false;
      actionButton.textContent = '⇥';
    }
  }
});
searchInput.addEventListener('input', () => { visibleTrackLimit = 8; renderTracks(); });
sortSelect.addEventListener('change', () => { visibleTrackLimit = 8; renderTracks(); });
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  activeFilter = tab.dataset.filter;
  visibleTrackLimit = 8;
  renderTracks();
}));
document.querySelector('#playerPlay').addEventListener('click', () => playTrack(playing || 'After Hours'));
document.querySelector('.play-button.large').addEventListener('click', event => playTrack(event.currentTarget.dataset.track));

theRightsModal();
function theRightsModal() {
  const modal = document.querySelector('#rightsModal');
  document.querySelector('#rightsButton').addEventListener('click', () => { modal.hidden = false; });
  document.querySelector('#closeModal').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
  document.querySelector('#copyId').addEventListener('click', async () => {
    const releaseId = document.querySelector('#rightsReleaseId').textContent;
    try { await navigator.clipboard.writeText(releaseId); showToast('Release ID copied'); }
    catch { showToast(`Release ID: ${releaseId}`); }
  });
}
async function showRightsCertificate(trackId, fallbackTitle) {
  if (!trackId) return;
  try {
    const response = await fetch(apiUrl(`/api/tracks/${trackId}/rights`));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load the rights record');
    const record = result.track;
    const registeredDate = record.registeredAt ? new Date(record.registeredAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'just now';
    document.querySelector('#rightsEyebrow').textContent = `RIGHTS VAULT / ${record.rightsId}`;
    document.querySelector('#rightsTitle').textContent = record.title || fallbackTitle || 'Untitled';
    document.querySelector('#rightsVerifiedLine').textContent = `Copyright auto-issued · ${registeredDate}`;
    document.querySelector('#rightsCopyrightOwner').textContent = record.copyrightOwner || record.owner;
    document.querySelector('#rightsWriter').textContent = record.owner;
    document.querySelector('#rightsReleaseId').textContent = record.rightsId;
    document.querySelector('#rightsUsage').textContent = record.rightsStatus;
    document.querySelector('#rightsModal').hidden = false;
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  }
}
document.querySelector('#uploadButton').addEventListener('click', () => { const ownerField = document.querySelector('#uploadCopyrightOwner'); if (!ownerField.value.trim()) ownerField.value = profile.login || profile.username; uploadModal.hidden = false; });
const accountModal = document.querySelector('#accountModal');
document.querySelector('#profileButton').addEventListener('click', () => { accountModal.hidden = false; });
document.querySelector('#closeAccount').addEventListener('click', () => { accountModal.hidden = true; });
accountModal.addEventListener('click', event => { if (event.target === accountModal) accountModal.hidden = true; });
document.querySelector('#accountAction').addEventListener('click', () => { accountModal.hidden = true; document.querySelector('#profileModal').hidden = false; });
document.querySelector('#signOut').addEventListener('click', async () => { 
  accountModal.hidden = true; 
  localStorage.removeItem('launchpadSignedIn'); 
  sessionStorage.removeItem('launchpadSignedIn');
  localStorage.removeItem('launchpadProfile');
  profile.username = 'Guest';
  profile.email = '';
  profile.login = '';
  applyProfile();
  try { await fetch(apiUrl('/api/auth/logout'), { method: 'POST' }); } catch {} 
  switchToSignin();
  document.querySelector('#signinModal').hidden = false; 
  showToast('Signed out successfully');
});
document.querySelector('#dashboardRights').addEventListener('click', () => { document.querySelector('#rightsModal').hidden = false; });
const helpModal = document.querySelector('#helpModal');
const communityModal = document.querySelector('#communityModal');
const termsModal = document.querySelector('#termsModal');
document.querySelector('#helpButton').addEventListener('click', () => { helpModal.hidden = false; });
document.querySelector('#closeHelp').addEventListener('click', () => { helpModal.hidden = true; });
helpModal.addEventListener('click', event => { if (event.target === helpModal) helpModal.hidden = true; });
document.querySelector('#helpSearch').addEventListener('input', event => { const query = event.target.value.toLowerCase(); document.querySelectorAll('.help-topic').forEach(topic => { topic.hidden = !topic.textContent.toLowerCase().includes(query); }); });
document.querySelector('#communityButton').addEventListener('click', () => { communityModal.hidden = false; });
document.querySelector('#closeCommunity').addEventListener('click', () => { communityModal.hidden = true; });
communityModal.addEventListener('click', event => { if (event.target === communityModal) communityModal.hidden = true; });
document.querySelector('#termsButton').addEventListener('click', () => { termsModal.hidden = false; });
document.querySelector('#closeTerms').addEventListener('click', () => { termsModal.hidden = true; });
termsModal.addEventListener('click', event => { if (event.target === termsModal) termsModal.hidden = true; });
document.querySelector('#termsAccepted').addEventListener('change', event => { document.querySelector('#acceptTerms').disabled = !event.target.checked; });
document.querySelector('#acceptTerms').addEventListener('click', () => { localStorage.setItem('rockechoTermsAccepted', 'true'); termsModal.hidden = true; showToast('Terms accepted'); });
document.querySelectorAll('.community-tab').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.community-tab').forEach(item => item.classList.remove('active')); tab.classList.add('active'); const filter = tab.dataset.communityFilter; document.querySelectorAll('.discussion').forEach(post => { post.hidden = filter !== 'all' && post.dataset.category !== filter; }); }));
document.querySelector('#newDiscussion').addEventListener('click', () => { document.querySelector('#discussionForm').hidden = false; document.querySelector('#discussionTitle').focus(); });
document.querySelector('#discussionForm').addEventListener('submit', event => { event.preventDefault(); const title = escapeCommunityText(document.querySelector('#discussionTitle').value.trim()); const details = escapeCommunityText(document.querySelector('#discussionDetails').value.trim()); const category = document.querySelector('#discussionCategory').value; const username = escapeCommunityText(profile.username || 'MJ'); const post = document.createElement('article'); post.className = 'discussion'; post.dataset.category = category; post.innerHTML = `<span class="discussion-avatar navy-avatar">${username.slice(0, 2).toUpperCase()}</span><div><div class="discussion-meta"><strong>${username}</strong><span>${category[0].toUpperCase() + category.slice(1)} · just now</span></div><h3>${title}</h3><p>${details}</p><div class="discussion-foot"><span>0 replies</span><button class="discussion-action">♡ 0</button><button class="discussion-action">Follow</button></div></div>`; document.querySelector('#discussionList').prepend(post); event.target.reset(); event.target.hidden = true; showToast('Discussion posted to Rockecho'); });
const publicModal = document.querySelector('#publicModal');
document.querySelector('#publicButton').addEventListener('click', () => { publicModal.hidden = false; });
document.querySelector('#closePublic').addEventListener('click', () => { publicModal.hidden = true; });
publicModal.addEventListener('click', event => { if (event.target === publicModal) publicModal.hidden = true; });
document.querySelector('#copyPublicLink').addEventListener('click', async () => { const link = 'https://rockecho.fm/midnight-jams/after-hours'; try { await navigator.clipboard.writeText(link); showToast('Public link copied'); } catch { showToast(link); } });
const videoModal = document.querySelector('#videoModal');
const videoDropzone = document.querySelector('#videoDropzone');
const videoFile = document.querySelector('#videoFile');
let sourceImageFile = null;
function loadVideoImage(file) {
  if (!file || !file.type.startsWith('image/')) { showToast('Choose a PNG or JPG image'); return; }
  if (file.size > 12 * 1024 * 1024) { showToast('Images must be under 12 MB'); return; }
  sourceImageFile = file;
  const preview = document.querySelector('#videoImagePreview');
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  videoDropzone.classList.add('has-file');
  videoDropzone.querySelector('strong').textContent = file.name;
  showToast('Starting image added');
}
document.querySelector('#videoStudioButton').addEventListener('click', () => { videoModal.hidden = false; });
document.querySelector('#closeVideoStudio').addEventListener('click', () => { videoModal.hidden = true; });
videoModal.addEventListener('click', event => { if (event.target === videoModal) videoModal.hidden = true; });
document.querySelector('#chooseVideo').addEventListener('click', () => videoFile.click());
videoFile.addEventListener('change', event => loadVideoImage(event.target.files[0]));
['dragenter', 'dragover'].forEach(name => videoDropzone.addEventListener(name, event => { event.preventDefault(); videoDropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => videoDropzone.addEventListener(name, event => { event.preventDefault(); videoDropzone.classList.remove('dragging'); }));
videoDropzone.addEventListener('drop', event => loadVideoImage(event.dataTransfer.files[0]));
document.querySelector('#generateVideo').addEventListener('click', async () => {
  const prompt = document.querySelector('#videoPrompt').value.trim();
  if (!prompt) { showToast('Describe the scene before generating'); return; }
  const button = document.querySelector('#generateVideo');
  button.disabled = true;
  button.innerHTML = 'Generating anime clip...';
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('negativePrompt', document.querySelector('#videoNegativePrompt').value.trim());
  formData.append('duration', document.querySelector('#videoDuration').value);
  formData.append('owner', profile.login || profile.username);
  if (sourceImageFile) formData.append('image', sourceImageFile, sourceImageFile.name);
  try {
    const response = await fetch(apiUrl('/api/video/generate'), { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Video generation failed');
    document.querySelector('#videoResultTitle').textContent = 'Your anime clip is being generated';
    document.querySelector('#videoResultMessage').textContent = 'The visual AI is working from your scene description.';
    document.querySelector('#videoResult').hidden = false;
    if (result.status === 'succeeded' && result.output) {
      showGeneratedVideo(result.output);
    } else {
      await pollVideo(result.id);
    }
  } catch (error) {
    button.disabled = false;
    button.innerHTML = 'Generate anime clip <span>↗</span>';
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  }
});
function showGeneratedVideo(output) {
  const preview = document.querySelector('#generatedVideoPreview');
  preview.src = mediaUrl(Array.isArray(output) ? output[0] : output);
  preview.hidden = false;
  document.querySelector('#videoResultTitle').textContent = 'Your anime clip is ready';
  document.querySelector('#videoResultMessage').textContent = 'Preview complete. Attach this visual to your song release.';
  document.querySelector('#generateVideo').disabled = false;
  document.querySelector('#generateVideo').innerHTML = 'Generate another <span>↗</span>';
  showToast('Anime clip generated');
}
async function pollVideo(jobId) {
  const response = await fetch(apiUrl(`/api/video/${encodeURIComponent(jobId)}`));
  const result = await response.json();
  if (result.status === 'succeeded' && result.output) { showGeneratedVideo(result.output); return; }
  if (result.status === 'failed' || result.status === 'canceled') throw new Error(result.error || 'Video generation did not finish');
  window.setTimeout(() => pollVideo(jobId), 3000);
}
const studioModal = document.querySelector('#studioModal');
let studioMode = 'simple';
let instrumentalOn = false;

function updateStudioFieldVisibility() {
  document.querySelector('#simplePromptField').hidden = studioMode !== 'simple';
  document.querySelector('#songDescription').required = studioMode === 'simple' && !instrumentalOn;
  document.querySelector('#customLyricsField').hidden = studioMode !== 'custom' || instrumentalOn;
  document.querySelector('#songDescription').closest('label').classList.toggle('is-disabled', instrumentalOn && studioMode === 'simple');
}
document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.mode-tab').forEach(item => item.classList.remove('active'));
  tab.classList.add('active');
  studioMode = tab.dataset.mode;
  updateStudioFieldVisibility();
}));
document.querySelector('#instrumentalToggle').addEventListener('change', event => {
  instrumentalOn = event.target.checked;
  updateStudioFieldVisibility();
});
const durationInput = document.querySelector('#songDuration');
const durationLabel = document.querySelector('#songLengthLabel');
function formatDuration(seconds) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
durationInput.addEventListener('input', () => { durationLabel.textContent = formatDuration(Number(durationInput.value)); });
document.querySelector('#writeLyricsButton').addEventListener('click', async () => {
  const prompt = document.querySelector('#songDescription').value.trim();
  if (!prompt) { showToast('Describe the song first so lyrics can match it'); return; }
  const button = document.querySelector('#writeLyricsButton');
  button.disabled = true;
  button.textContent = 'Writing lyrics...';
  try {
    const response = await fetch(apiUrl('/api/lyrics/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, tags: document.querySelector('#songStyle').value.trim() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not write lyrics');
    document.querySelector('#songLyrics').value = result.lyrics;
    showToast('Draft lyrics added — edit as you like');
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  } finally {
    button.disabled = false;
    button.textContent = '✎ Write lyrics for me';
  }
});
async function populatePersonaSelect() {
  const select = document.querySelector('#personaSelect');
  select.innerHTML = '<option value="">No persona</option>';
  try {
    const response = await fetch(apiUrl(`/api/personas?owner=${encodeURIComponent(profile.login || profile.username)}`));
    const result = await response.json();
    (result.personas || []).forEach(persona => {
      const option = document.createElement('option');
      option.value = persona.tags;
      option.textContent = persona.name;
      select.appendChild(option);
    });
  } catch { /* Personas are optional — leave the default option if the backend isn't running */ }
}
document.querySelector('#personaSelect').addEventListener('change', event => {
  if (event.target.value) document.querySelector('#songStyle').value = event.target.value;
});
document.querySelector('#savePersonaButton').addEventListener('click', async () => {
  const tags = document.querySelector('#songStyle').value.trim();
  if (!tags) { showToast('Add some style tags first'); return; }
  const name = window.prompt('Name this persona (e.g. "Late-night R&B voice"):', '');
  if (!name) return;
  try {
    const response = await fetch(apiUrl('/api/personas'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: profile.login || profile.username, name, tags })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save this persona');
    populatePersonaSelect();
    showToast(`Persona "${name}" saved`);
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  }
});
document.querySelector('#createSongButton').addEventListener('click', () => { populatePersonaSelect(); studioModal.hidden = false; });
document.querySelector('#closeStudio').addEventListener('click', () => { studioModal.hidden = true; });
studioModal.addEventListener('click', event => { if (event.target === studioModal) studioModal.hidden = true; });

function renderVariationCard(variation, title) {
  const card = document.createElement('div');
  card.className = 'variation-card';
  card.dataset.variation = variation;
  card.innerHTML = `<div class="variation-head"><strong>Take ${variation}</strong><span class="variation-status">Producing...</span></div><audio controls preload="none" hidden></audio><div class="variation-actions"><button type="button" class="secondary-button launch-variation" disabled>Launch to library</button><button type="button" class="secondary-button publish-variation" hidden>Publish</button></div>`;
  return card;
}

document.querySelector('#studioForm').addEventListener('submit', async event => {
  event.preventDefault();
  const produceButton = document.querySelector('#produceButton');
  produceButton.disabled = true;
  produceButton.innerHTML = 'Sending to producer...';
  const payload = {
    title: document.querySelector('#songTitle').value.trim(),
    prompt: document.querySelector('#songDescription').value.trim(),
    lyrics: document.querySelector('#songLyrics').value.trim(),
    tags: document.querySelector('#songStyle').value.trim(),
    mode: studioMode,
    instrumental: instrumentalOn,
    duration: Number(durationInput.value),
    owner: profile.login || profile.username,
    rightsBasis: document.querySelector('#rightsBasis').value
  };
  try {
    const response = await fetch(apiUrl('/api/produce'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Production request failed');
    const lyricsPreview = document.querySelector('#lyricsPreview');
    if (job.lyrics && job.lyrics !== '[instrumental]') {
      lyricsPreview.textContent = job.lyrics;
      lyricsPreview.hidden = false;
    } else {
      lyricsPreview.hidden = true;
    }
    const grid = document.querySelector('#variationGrid');
    grid.innerHTML = '';
    job.jobs.forEach(item => grid.appendChild(renderVariationCard(item.variation, job.title)));
    document.querySelector('#productionResults').hidden = false;
    showToast('Producing two takes — this can take a minute');
    await Promise.all(job.jobs.map(item => pollProduction(item.id, item.variation, job.title || document.querySelector('#songTitle').value.trim() || 'Untitled')));
    produceButton.disabled = false;
    produceButton.innerHTML = 'Create another <span>↗</span>';
  } catch (error) {
    produceButton.disabled = false;
    produceButton.innerHTML = 'Create song <span>↗</span>';
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  }
});

async function pollProduction(jobId, variation, title) {
  const response = await fetch(apiUrl(`/api/produce/${encodeURIComponent(jobId)}`));
  const job = await response.json();
  const card = document.querySelector(`.variation-card[data-variation="${variation}"]`);
  if (job.status === 'succeeded' && job.output) {
    const audioUrl = mediaUrl(Array.isArray(job.output) ? job.output[0] : job.output);
    if (card) {
      card.querySelector('.variation-status').textContent = 'Ready';
      const audioEl = card.querySelector('audio');
      audioEl.src = audioUrl;
      audioEl.hidden = false;
      const launchButton = card.querySelector('.launch-variation');
      launchButton.disabled = false;
      const savedId = job.track && job.track.id;
      launchButton.addEventListener('click', () => {
        const newTrack = { name: `${title} (Take ${variation})`, type: 'Song', duration: formatDuration(Number(durationInput.value)), plays: 0, views: '0', likes: 0, downloads: 0, date: 13, cover: 'cover-d', title: 'NEW\n<em>draft</em>', audioUrl: mediaUrl(audioUrl), savedId };
        if (!tracks.some(t => t.savedId === savedId)) tracks.unshift(newTrack);
        renderTracks();
        launchButton.textContent = 'In library';
        launchButton.disabled = true;
        card.querySelector('.publish-variation').hidden = false;
        document.querySelector('#library').scrollIntoView({ behavior: 'smooth' });
        showToast(`${newTrack.name} launched in your library`);
        showRightsCertificate(savedId, newTrack.name);
      });
      card.querySelector('.publish-variation').addEventListener('click', async () => {
        if (!savedId) { showToast('Start the backend before publishing'); return; }
        try {
          const publishResponse = await fetch(apiUrl(`/api/tracks/${savedId}/publish`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: `${title}-${variation}` }) });
          const result = await publishResponse.json();
          if (!publishResponse.ok) throw new Error(result.error || 'Publishing failed');
          card.querySelector('.publish-variation').textContent = 'Published';
          card.querySelector('.publish-variation').disabled = true;
          document.querySelector('#publicUrl').textContent = `${API_BASE.replace(/^https?:\/\//, '')}${result.publicUrl}`;
          publicModal.hidden = false;
          showToast('Song published to the web');
        } catch (error) {
          showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
        }
      });
    }
    return;
  }
  if (job.status === 'failed' || job.status === 'canceled') {
    if (card) card.querySelector('.variation-status').textContent = 'Failed';
    return;
  }
  await new Promise(resolve => window.setTimeout(resolve, 2500));
  return pollProduction(jobId, variation, title);
}
document.querySelector('#closeStudioResult').addEventListener('click', () => { studioModal.hidden = true; });
const signinModal = document.querySelector('#signinModal');
const signinCopy = document.querySelector('#signinCopy');
const signupCopy = document.querySelector('#signupCopy');
const forgotCopy = document.querySelector('#forgotCopy');
const resetCopy = document.querySelector('#resetCopy');
const authViews = { signin: signinCopy, signup: signupCopy, forgot: forgotCopy, reset: resetCopy };
const signinForm = document.querySelector('#signinForm');
const signupForm = document.querySelector('#signupForm');
const signinError = document.querySelector('#signinError');
const signupError = document.querySelector('#signupError');

document.querySelector('#dashboardLogin').addEventListener('click', () => { signinModal.hidden = false; });

function showAuthView(name) {
  Object.entries(authViews).forEach(([key, element]) => { element.hidden = key !== name; });
  document.querySelectorAll('.auth-error').forEach(element => { element.hidden = true; });
}
function switchToSignup() { showAuthView('signup'); signupForm.reset(); }
function switchToSignin() { showAuthView('signin'); signinForm.reset(); }

document.querySelector('#createAccount').addEventListener('click', switchToSignup);
document.querySelector('#backToSignIn2').addEventListener('click', switchToSignin);

signinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signinError.hidden = true;
  
  const identifier = document.querySelector('#signinEmail').value.trim();
  const password = document.querySelector('#signinPassword').value;
  
  if (!identifier || !password) {
    signinError.textContent = 'Please enter username/email and password.';
    signinError.hidden = false;
    return;
  }

  try {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      signinError.textContent = result.error || 'Sign in failed.';
      signinError.hidden = false;
      return;
    }

    // Store user profile
    profile.username = result.user.username;
    profile.email = result.user.email;
    profile.login = result.user.username;
    localStorage.setItem('launchpadProfile', JSON.stringify(profile));
    
    const remember = document.querySelector('#rememberAccount').checked;
    localStorage.removeItem('launchpadSignedIn');
    sessionStorage.removeItem('launchpadSignedIn');
    (remember ? localStorage : sessionStorage).setItem('launchpadSignedIn', 'true');
    
    signinModal.hidden = true;
    applyProfile();
    showToast('Welcome back, ' + result.user.username + '!');
  } catch (error) {
    signinError.textContent = 'Connection error. Please try again.';
    signinError.hidden = false;
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signupError.hidden = true;
  
  const username = document.querySelector('#signupUsername').value.trim();
  const email = document.querySelector('#signupEmail').value.trim();
  const password = document.querySelector('#signupPassword').value;
  const confirmPassword = document.querySelector('#signupConfirmPassword').value;
  
  if (!username || !email || !password || !confirmPassword) {
    signupError.textContent = 'Please fill in all fields.';
    signupError.hidden = false;
    return;
  }
  
  if (username.length < 3 || username.length > 30) {
    signupError.textContent = 'Username must be 3-30 characters.';
    signupError.hidden = false;
    return;
  }
  
  if (!email.includes('@')) {
    signupError.textContent = 'Please enter a valid email address.';
    signupError.hidden = false;
    return;
  }
  
  if (password.length < 6) {
    signupError.textContent = 'Password must be at least 6 characters.';
    signupError.hidden = false;
    return;
  }
  
  if (password !== confirmPassword) {
    signupError.textContent = 'Passwords do not match.';
    signupError.hidden = false;
    return;
  }

  try {
    const response = await fetch(apiUrl('/api/auth/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      signupError.textContent = result.error || 'Sign up failed.';
      signupError.hidden = false;
      return;
    }

    // Success! Show message and switch back to signin
    showToast('Account created! You can now sign in.');
    switchToSignin();
    document.querySelector('#signinEmail').value = username;
    document.querySelector('#signinEmail').focus();
  } catch (error) {
    signupError.textContent = 'Connection error. Please try again.';
    signupError.hidden = false;
  }
});

const profileModal = document.querySelector('#profileModal');
document.querySelector('#closeProfile').addEventListener('click', () => { profileModal.hidden = true; });
profileModal.addEventListener('click', event => { if (event.target === profileModal) profileModal.hidden = true; });
document.querySelector('#profilePicture').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.addEventListener('load', () => { profile.picture = reader.result; applyProfile(); }); reader.readAsDataURL(file); });
document.querySelector('#profileForm').addEventListener('submit', event => { event.preventDefault(); profile.username = document.querySelector('#profileUsername').value.trim(); profile.email = document.querySelector('#profileEmail').value.trim(); localStorage.setItem('launchpadProfile', JSON.stringify(profile)); profileModal.hidden = true; applyProfile(); showToast('Profile changes saved'); });
document.querySelector('#forgotPassword').addEventListener('click', () => { showAuthView('forgot'); document.querySelector('#forgotSentMessage').hidden = true; document.querySelector('#forgotForm').hidden = false; document.querySelector('#forgotForm').reset(); });
document.querySelector('#backToSignInFromForgot').addEventListener('click', switchToSignin);
document.querySelector('#backToSignInFromReset').addEventListener('click', switchToSignin);
document.querySelector('#forgotForm').addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.querySelector('#forgotEmail').value.trim();
  const errorEl = document.querySelector('#forgotError');
  errorEl.hidden = true;
  try {
    const response = await fetch(apiUrl('/api/auth/forgot'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not send a reset link');
    document.querySelector('#forgotForm').hidden = true;
    document.querySelector('#forgotSentMessage').textContent = `Check ${email} for a link to reset your password. It expires in 30 minutes.`;
    document.querySelector('#forgotSentMessage').hidden = false;
  } catch (error) {
    errorEl.textContent = error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message;
    errorEl.hidden = false;
  }
});
let activeResetToken = '';
document.querySelector('#resetForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.querySelector('#resetPasswordInput').value;
  const confirmPassword = document.querySelector('#resetPasswordConfirm').value;
  const errorEl = document.querySelector('#resetError');
  errorEl.hidden = true;
  if (password !== confirmPassword) { errorEl.textContent = 'Passwords do not match'; errorEl.hidden = false; return; }
  try {
    const response = await fetch(apiUrl('/api/auth/reset'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: activeResetToken, password }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not reset the password');
    history.replaceState(null, '', location.pathname);
    switchToSignin();
    showToast('Password updated — sign in with your new password');
  } catch (error) {
    errorEl.textContent = error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message;
    errorEl.hidden = false;
  }
});
(function checkForResetLink() {
  const match = location.hash.match(/^#reset\?token=(.+)$/);
  if (!match) return;
  activeResetToken = decodeURIComponent(match[1]);
  signinModal.hidden = false;
  showAuthView('reset');
})();
if (localStorage.getItem('launchpadSignedIn') === 'true' || sessionStorage.getItem('launchpadSignedIn') === 'true') signinModal.hidden = true;
applyProfile();
loadSavedTracks();
renderTracks();

// --- Record Studio: sing over a beat, mix mic + beat client-side, save the take ---
const recordModal = document.querySelector('#recordModal');
const beatSelect = document.querySelector('#beatSelect');
const micRecordButton = document.querySelector('#micRecordButton');
let micRecorder = null;
let micChunks = [];
let mixedRecordingBlob = null;
let micSeconds = 0;
let micInterval = null;
let audioContext = null;

async function populateBeatSelect() {
  beatSelect.innerHTML = '<option value="">No beat — a cappella</option>';
  const readyTracks = tracks.filter(track => track.audioUrl);
  readyTracks.forEach(track => {
    const option = document.createElement('option');
    option.value = track.audioUrl;
    option.textContent = track.name;
    beatSelect.appendChild(option);
  });
}
document.querySelector('#openRecordStudio').addEventListener('click', () => { populateBeatSelect(); const ownerField = document.querySelector('#recordCopyrightOwner'); if (!ownerField.value.trim()) ownerField.value = profile.login || profile.username; recordModal.hidden = false; });
document.querySelector('#closeRecord').addEventListener('click', () => { recordModal.hidden = true; });
recordModal.addEventListener('click', event => { if (event.target === recordModal) recordModal.hidden = true; });

micRecordButton.addEventListener('click', async () => {
  if (micRecorder && micRecorder.state === 'recording') { micRecorder.stop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.querySelector('#micRecordingNote').textContent = 'Microphone recording needs a secure hosted page (https or localhost).';
    return;
  }
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(micStream).connect(destination);
    let beatElement = null;
    const beatUrl = beatSelect.value;
    if (beatUrl) {
      beatElement = new Audio(beatUrl);
      beatElement.crossOrigin = 'anonymous';
      try {
        const beatSource = audioContext.createMediaElementSource(beatElement);
        beatSource.connect(destination);
        beatSource.connect(audioContext.destination);
      } catch (error) {
        showToast('Could not route this beat into the mix — recording vocals only');
      }
      beatElement.currentTime = 0;
      await beatElement.play().catch(() => {});
    }
    micChunks = [];
    micRecorder = new MediaRecorder(destination.stream);
    micRecorder.addEventListener('dataavailable', event => micChunks.push(event.data));
    micRecorder.addEventListener('stop', () => {
      micStream.getTracks().forEach(track => track.stop());
      if (beatElement) beatElement.pause();
      window.clearInterval(micInterval);
      mixedRecordingBlob = new Blob(micChunks, { type: 'audio/webm' });
      const preview = document.querySelector('#micRecordingPreview');
      preview.src = URL.createObjectURL(mixedRecordingBlob);
      preview.hidden = false;
      micRecordButton.classList.remove('recording');
      document.querySelector('#micRecordLabel').textContent = 'Take recorded';
      document.querySelector('#saveRecordingButton').disabled = false;
    });
    micRecorder.start();
    micSeconds = 0;
    micRecordButton.classList.add('recording');
    document.querySelector('#micRecordLabel').textContent = 'Recording... press to stop';
    micInterval = window.setInterval(() => {
      micSeconds += 1;
      document.querySelector('#micRecordTimer').textContent = formatDuration(micSeconds);
      if (micSeconds >= 240) micRecorder.stop();
    }, 1000);
  } catch (error) {
    document.querySelector('#micRecordingNote').textContent = 'Microphone permission was not granted. Check your browser settings and try again.';
  }
});

document.querySelector('#recordForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!mixedRecordingBlob) { showToast('Record a take before saving'); return; }
  const button = document.querySelector('#saveRecordingButton');
  button.disabled = true;
  button.innerHTML = 'Saving...';
  const formData = new FormData();
  formData.append('audio', mixedRecordingBlob, 'take.webm');
  formData.append('title', document.querySelector('#recordTitle').value.trim());
  formData.append('tags', document.querySelector('#recordTags').value.trim());
  formData.append('copyrightOwner', document.querySelector('#recordCopyrightOwner').value.trim());
  formData.append('rightsBasis', document.querySelector('#recordRightsBasis').value);
  formData.append('owner', profile.login || profile.username);
  formData.append('source', 'recorded');
  formData.append('durationSeconds', String(micSeconds));
  formData.append('isPublic', String(document.querySelector('#recordPublicToggle').checked));
  try {
    const response = await fetch(apiUrl('/api/tracks/save'), { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save this recording');
    const savedTrack = { name: result.track.title, type: 'Song', duration: formatDuration(micSeconds), plays: 0, views: '0', likes: 0, downloads: 0, date: 14, cover: 'cover-b', title: 'LIVE\n<em>take</em>', audioUrl: mediaUrl(result.track.audioUrl), savedId: result.track.id };
    tracks.unshift(savedTrack);
    renderTracks();
    document.querySelector('#recordSaveMessage').textContent = result.publicUrl ? `Published at ${API_BASE.replace(/^https?:\/\//, '')}${result.publicUrl}` : 'Saved to your library, rights reserved.';
    document.querySelector('#recordSaveResult').hidden = false;
    showToast('Recording saved to your library');
    showRightsCertificate(result.track.id, result.track.title);
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save recording <span>↗</span>';
  }
});
document.querySelector('#closeRecordResult').addEventListener('click', () => { recordModal.hidden = true; });

// --- Upload: add a finished song/beat you already have ---
const uploadModal = document.querySelector('#uploadModal');
const uploadDropzone = document.querySelector('#uploadDropzone');
const uploadAudioFile = document.querySelector('#uploadAudioFile');
let selectedUploadFile = null;
function loadUploadFile(file) {
  if (!file || !file.type.startsWith('audio/')) { showToast('Choose an audio file'); return; }
  if (file.size > 25 * 1024 * 1024) { showToast('Audio files must be under 25 MB'); return; }
  selectedUploadFile = file;
  uploadDropzone.classList.add('has-file');
  uploadDropzone.querySelector('strong').textContent = file.name;
  document.querySelector('#uploadSubmitButton').disabled = false;
  if (!document.querySelector('#uploadTitle').value.trim()) {
    document.querySelector('#uploadTitle').value = file.name.replace(/\.[^.]+$/, '');
  }
}
document.querySelector('#closeUpload').addEventListener('click', () => { uploadModal.hidden = true; });
uploadModal.addEventListener('click', event => { if (event.target === uploadModal) uploadModal.hidden = true; });
document.querySelector('#chooseUploadAudio').addEventListener('click', () => uploadAudioFile.click());
uploadAudioFile.addEventListener('change', event => loadUploadFile(event.target.files[0]));
['dragenter', 'dragover'].forEach(name => uploadDropzone.addEventListener(name, event => { event.preventDefault(); uploadDropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => uploadDropzone.addEventListener(name, event => { event.preventDefault(); uploadDropzone.classList.remove('dragging'); }));
uploadDropzone.addEventListener('drop', event => loadUploadFile(event.dataTransfer.files[0]));

document.querySelector('#uploadForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedUploadFile) { showToast('Choose an audio file first'); return; }
  const button = document.querySelector('#uploadSubmitButton');
  button.disabled = true;
  button.innerHTML = 'Uploading...';
  const formData = new FormData();
  formData.append('audio', selectedUploadFile, selectedUploadFile.name);
  formData.append('title', document.querySelector('#uploadTitle').value.trim());
  formData.append('tags', document.querySelector('#uploadTags').value.trim());
  formData.append('copyrightOwner', document.querySelector('#uploadCopyrightOwner').value.trim());
  formData.append('rightsBasis', document.querySelector('#uploadRightsBasis').value);
  formData.append('owner', profile.login || profile.username);
  formData.append('source', 'uploaded');
  formData.append('isPublic', String(document.querySelector('#uploadPublicToggle').checked));
  try {
    const response = await fetch(apiUrl('/api/tracks/save'), { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    const savedTrack = { name: result.track.title, type: 'Song', duration: '00:00', plays: 0, views: '0', likes: 0, downloads: 0, date: 14, cover: 'cover-c', title: 'ADDED\n<em>track</em>', audioUrl: mediaUrl(result.track.audioUrl), savedId: result.track.id };
    tracks.unshift(savedTrack);
    renderTracks();
    document.querySelector('#uploadSaveMessage').textContent = result.publicUrl ? `Published at ${API_BASE.replace(/^https?:\/\//, '')}${result.publicUrl}` : 'Saved to your library, rights reserved.';
    document.querySelector('#uploadSaveResult').hidden = false;
    showToast('Track added to your library');
    showRightsCertificate(result.track.id, result.track.title);
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Add track <span>↗</span>';
  }
});
document.querySelector('#closeUploadResult').addEventListener('click', () => { uploadModal.hidden = true; });

// --- Explore: browse every public release, lazy-loaded a page at a time ---
const exploreModal = document.querySelector('#exploreModal');
const EXPLORE_PAGE_SIZE = 12;
let exploreOffset = 0;
let exploreHasMore = true;
let exploreLoading = false;
async function loadExplorePage(reset) {
  if (reset) {
    exploreOffset = 0;
    exploreHasMore = true;
    document.querySelector('#exploreList').querySelectorAll('.explore-item').forEach(item => item.remove());
  }
  if (exploreLoading || !exploreHasMore) return;
  exploreLoading = true;
  const list = document.querySelector('#exploreList');
  try {
    const response = await fetch(apiUrl(`/api/public/tracks?limit=${EXPLORE_PAGE_SIZE}&offset=${exploreOffset}`));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load public releases');
    const publicTracks = result.tracks || [];
    exploreHasMore = Boolean(result.hasMore);
    exploreOffset += publicTracks.length;
    document.querySelector('#exploreEmpty').hidden = exploreOffset > 0;
    publicTracks.forEach(track => {
      const item = document.createElement('article');
      item.className = 'explore-item';
      item.innerHTML = `<div class="explore-info"><strong>${escapeCommunityText(track.title)}</strong><span>${escapeCommunityText(track.owner)} · ${escapeCommunityText(track.copyrightOwner || track.rightsStatus)}</span></div><audio controls preload="none" src="${mediaUrl(track.audioUrl)}"></audio><a class="secondary-button explore-download" href="${apiUrl(`/api/tracks/${track.id}/download`)}">⇩ Download</a>`;
      list.appendChild(item);
    });
  } catch (error) {
    showToast(error.message.includes('Failed to fetch') ? 'Start the backend with npm start first' : error.message);
  } finally {
    exploreLoading = false;
  }
}
const exploreObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !exploreModal.hidden) loadExplorePage(false);
}, { rootMargin: '200px' });
exploreObserver.observe(document.querySelector('#exploreLoadMore'));
document.querySelector('#exploreButton').addEventListener('click', event => { event.preventDefault(); loadExplorePage(true); exploreModal.hidden = false; });
document.querySelector('#closeExplore').addEventListener('click', () => { exploreModal.hidden = true; });
exploreModal.addEventListener('click', event => { if (event.target === exploreModal) exploreModal.hidden = true; });
