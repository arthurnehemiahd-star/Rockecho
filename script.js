// Sample catalog. Swap `src` for real audio URLs / a real API when ready.
const SAMPLE_TRACKS = [
  { id: 1, title: "Midnight Static", artist: "The Feedback Loop", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: 2, title: "Analog Heart", artist: "Coastline Radio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: 3, title: "Fault Lines", artist: "Rockecho Sessions", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: 4, title: "Slow Burn", artist: "Nine Rivers", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { id: 5, title: "Glass Horizon", artist: "The Feedback Loop", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" },
  { id: 6, title: "Paper Moon", artist: "Coastline Radio", src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3" },
];

const resultsEl = document.getElementById("results");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const navLinks = document.querySelectorAll(".nav-link");

const playerTitle = document.getElementById("player-title");
const playerArtist = document.getElementById("player-artist");
const playBtn = document.getElementById("play-btn");
const seek = document.getElementById("seek");
const volume = document.getElementById("volume");
const timeElapsed = document.getElementById("time-elapsed");
const timeTotal = document.getElementById("time-total");
const audioEl = document.getElementById("audio-el");

let currentView = "discover";
let currentTrack = null;
let library = JSON.parse(localStorage.getItem("rockecho-library") || "[]");

function saveLibrary() {
  localStorage.setItem("rockecho-library", JSON.stringify(library));
}

function isSaved(id) {
  return library.includes(id);
}

function toggleSave(id) {
  if (isSaved(id)) {
    library = library.filter((x) => x !== id);
  } else {
    library.push(id);
  }
  saveLibrary();
  renderCurrentView();
}

function formatTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function trackCard(track) {
  const card = document.createElement("div");
  card.className = "track-card" + (currentTrack && currentTrack.id === track.id ? " playing" : "");
  card.innerHTML = `
    <button class="save-btn ${isSaved(track.id) ? "saved" : ""}" title="Save to library">${isSaved(track.id) ? "★" : "☆"}</button>
    <div class="track-title">${track.title}</div>
    <div class="track-artist">${track.artist}</div>
  `;
  card.querySelector(".save-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSave(track.id);
  });
  card.addEventListener("click", () => selectTrack(track));
  return card;
}

function renderTracks(tracks) {
  resultsEl.innerHTML = "";
  if (tracks.length === 0) {
    resultsEl.innerHTML = `<p class="empty-state">${currentView === "library" ? "Your library is empty — save tracks from Discover." : "No tracks found."}</p>`;
    return;
  }
  tracks.forEach((track) => resultsEl.appendChild(trackCard(track)));
}

function renderCurrentView() {
  if (currentView === "library") {
    renderTracks(SAMPLE_TRACKS.filter((t) => isSaved(t.id)));
  } else {
    search();
  }
}

function selectTrack(track) {
  currentTrack = track;
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  audioEl.src = track.src;
  audioEl.play().catch(() => {
    // Autoplay might be blocked until user interacts; button still lets them press play.
  });
  playBtn.textContent = "⏸";
  renderCurrentView();
}

function search() {
  const query = searchInput.value.trim().toLowerCase();
  const source = SAMPLE_TRACKS;
  const filtered = query
    ? source.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.artist.toLowerCase().includes(query)
      )
    : source;
  renderTracks(filtered);
}

searchBtn.addEventListener("click", search);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search();
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    currentView = link.dataset.view;
    searchInput.value = "";
    renderCurrentView();
  });
});

playBtn.addEventListener("click", () => {
  if (!currentTrack) return;
  if (audioEl.paused) {
    audioEl.play();
    playBtn.textContent = "⏸";
  } else {
    audioEl.pause();
    playBtn.textContent = "▶";
  }
});

audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration) return;
  seek.value = (audioEl.currentTime / audioEl.duration) * 100;
  timeElapsed.textContent = formatTime(audioEl.currentTime);
  timeTotal.textContent = formatTime(audioEl.duration);
});

audioEl.addEventListener("ended", () => {
  playBtn.textContent = "▶";
});

seek.addEventListener("input", () => {
  if (!audioEl.duration) return;
  audioEl.currentTime = (seek.value / 100) * audioEl.duration;
});

volume.addEventListener("input", () => {
  audioEl.volume = volume.value / 100;
});
audioEl.volume = volume.value / 100;

// Initial render
renderTracks(SAMPLE_TRACKS);
