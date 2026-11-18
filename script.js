const starterPlayers = [
  { name: "Jayden Mensah", position: "Forward", age: 18, location: "Brixton, London", club: "Southside United", initials: "JM" },
  { name: "Amara Khan", position: "Midfielder", age: 17, location: "Birmingham", club: "Aston Community FC", initials: "AK" },
  { name: "Tobi Okafor", position: "Defender", age: 19, location: "Manchester", club: "Moss Side Athletic", initials: "TO" },
  { name: "Luca Bennett", position: "Goalkeeper", age: 16, location: "Bristol", club: "Easton Town", initials: "LB" },
  { name: "Nia Williams", position: "Forward", age: 18, location: "Leeds", club: "Kirkstall Rovers", initials: "NW" },
  { name: "Ethan Clarke", position: "Midfielder", age: 20, location: "Nottingham", club: "Forest Fields FC", initials: "EC" }
];

const STORAGE_KEY = "nextup-player-profiles";
const grid = document.querySelector("#player-grid");
const searchInput = document.querySelector("#player-search");
const positionFilter = document.querySelector("#position-filter");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const form = document.querySelector("#profile-form");
const toast = document.querySelector("#toast");
let toastTimer;

function getPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return [...saved, ...starterPlayers];
  } catch (error) {
    console.error("Could not load saved NextUp profiles.", error);
    return starterPlayers;
  }
}

function initialsFor(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function makeCard(player, index) {
  const card = document.createElement("article");
  card.className = "player-card";
  const safeName = escapeHTML(player.name);
  const safePosition = escapeHTML(player.position);
  const safeLocation = escapeHTML(player.location);
  const safeClub = escapeHTML(player.club || "Independent");
  const initials = escapeHTML(player.initials || initialsFor(player.name));
  const tone = index % 5 ? ` tone-${index % 5}` : "";
  card.innerHTML = `
    <div class="card-top"><span class="position-badge">${safePosition}</span><span class="card-number">${String(index + 1).padStart(2, "0")}</span></div>
    <div class="card-person"><div class="player-avatar${tone}" aria-hidden="true">${initials}</div><div><h3>${safeName}</h3><p>${safeLocation}</p></div></div>
    <div class="card-details"><span><strong>${escapeHTML(String(player.age))}</strong>AGE</span><span><strong>${safePosition}</strong>POSITION</span><span class="card-club"><strong>${safeClub}</strong>CLUB</span></div>`;
  return card;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function renderPlayers() {
  const query = searchInput.value.trim().toLowerCase();
  const position = positionFilter.value;
  const matches = getPlayers().filter((player) => {
    const matchesQuery = `${player.name} ${player.location} ${player.club || ""}`.toLowerCase().includes(query);
    return matchesQuery && (position === "all" || player.position === position);
  });
  grid.replaceChildren(...matches.map(makeCard));
  resultsCount.textContent = `${matches.length} ${matches.length === 1 ? "player" : "players"}`;
  emptyState.hidden = matches.length > 0;
  document.querySelector("#player-count").textContent = `${(1240 + getSavedPlayers().length).toLocaleString()}+`;
}

function getSavedPlayers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    console.error("Could not read saved NextUp profiles.", error);
    return [];
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4000);
}

searchInput.addEventListener("input", renderPlayers);
positionFilter.addEventListener("change", renderPlayers);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const player = {
    name: data.get("name").trim(),
    position: data.get("position"),
    age: Number(data.get("age")),
    location: data.get("location").trim(),
    club: data.get("club").trim(),
    initials: initialsFor(data.get("name"))
  };
  const saved = getSavedPlayers();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([player, ...saved]));
  } catch (error) {
    console.error("Could not save your NextUp profile.", error);
    showToast("Your profile couldn't be saved in this browser. Please try again.");
    return;
  }

  form.reset();
  searchInput.value = "";
  positionFilter.value = "all";
  renderPlayers();
  document.querySelector("#players").scrollIntoView({ behavior: "smooth" });
  showToast(`You're on the board, ${player.name.split(" ")[0]}! Your player card is live.`);
});

renderPlayers();
