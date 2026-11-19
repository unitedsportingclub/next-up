const starterPlayers = [
  { name: "Jayden Mensah", position: "Forward", age: 18, location: "Brixton, London", club: "Southside United", initials: "JM" },
  { name: "Amara Khan", position: "Midfielder", age: 17, location: "Birmingham", club: "Aston Community FC", initials: "AK" },
  { name: "Tobi Okafor", position: "Defender", age: 19, location: "Manchester", club: "Moss Side Athletic", initials: "TO" },
  { name: "Luca Bennett", position: "Goalkeeper", age: 16, location: "Bristol", club: "Easton Town", initials: "LB" },
  { name: "Nia Williams", position: "Forward", age: 18, location: "Leeds", club: "Kirkstall Rovers", initials: "NW" },
  { name: "Ethan Clarke", position: "Midfielder", age: 20, location: "Nottingham", club: "Forest Fields FC", initials: "EC" }
];

const supabase = window.nextupSupabase;
const grid = document.querySelector("#player-grid");
const searchInput = document.querySelector("#player-search");
const positionFilter = document.querySelector("#position-filter");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const form = document.querySelector("#profile-form");
const toast = document.querySelector("#toast");
const photoInput = document.querySelector("#player-photo");
const photoPreview = document.querySelector("#photo-preview");
const photoPreviewImage = document.querySelector("#photo-preview-image");
const videoInput = document.querySelector("#player-video");
let toastTimer;
let photoPreviewUrl;

const PHOTO_BUCKET = "player-images";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function getSupabasePlayers() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("approved_player_profiles")
    .select("name, position, age, location, club, profile_image_path, highlight_video_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load approved NextUp profiles.", error);
    showToast("Profiles could not be loaded from the server.");
    return [];
  }

  return data.map((player) => {
    const imageUrl = player.profile_image_path
      ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(player.profile_image_path).data.publicUrl
      : "";
    return {
      ...player,
      imageUrl,
      initials: initialsFor(player.name)
    };
  });
}

function getPlayers() {
  return starterPlayers;
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
  const imageUrl = player.imageUrl ? escapeHTML(player.imageUrl) : "";
  const highlightUrl = normalizeHighlightUrl(player.highlight_video_url);
  card.innerHTML = `
    <div class="card-top"><span class="position-badge">${safePosition}</span><span class="card-number">${String(index + 1).padStart(2, "0")}</span></div>
    <div class="card-person"><div class="player-avatar${tone}" aria-hidden="true">${imageUrl ? '<img alt="" loading="lazy">' : initials}</div><div class="card-person-copy"><h3>${safeName}</h3><p>${safeLocation}</p></div></div>
    <div class="card-details"><span><strong>${escapeHTML(String(player.age))}</strong>AGE</span><span><strong>${safePosition}</strong>POSITION</span><span class="card-club"><strong>${safeClub}</strong>CLUB</span></div>
    ${highlightUrl ? `<a class="highlight-link" href="${escapeHTML(highlightUrl)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span> Watch highlights <span aria-hidden="true">↗</span></a>` : ""}`;
  const photo = card.querySelector(".player-avatar img");
  if (photo) {
    photo.addEventListener("error", () => {
      photo.parentElement.textContent = initials;
    }, { once: true });
    photo.src = imageUrl;
  }
  return card;
}

function normalizeHighlightUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const videoId = url.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : "";
    }
    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      const videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
      return /^[\w-]{11}$/.test(videoId || "") ? `https://www.youtube.com/watch?v=${videoId}` : "";
    }
    if (host === "vimeo.com" || host === "www.vimeo.com") {
      const videoId = url.pathname.match(/^\/(\d+)\/?$/)?.[1];
      return videoId ? `https://vimeo.com/${videoId}` : "";
    }
  } catch (error) {
    return "";
  }
  return "";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

let renderedServerPlayers = [];

async function renderPlayers() {
  const query = searchInput.value.trim().toLowerCase();
  const position = positionFilter.value;
  const matches = [...renderedServerPlayers, ...getPlayers()].filter((player) => {
    const matchesQuery = `${player.name} ${player.location} ${player.club || ""}`.toLowerCase().includes(query);
    return matchesQuery && (position === "all" || player.position === position);
  });
  grid.replaceChildren(...matches.map(makeCard));
  resultsCount.textContent = `${matches.length} ${matches.length === 1 ? "player" : "players"}`;
  emptyState.hidden = matches.length > 0;
  document.querySelector("#player-count").textContent = `${(1240 + renderedServerPlayers.length).toLocaleString()}+`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4000);
}

searchInput.addEventListener("input", renderPlayers);
positionFilter.addEventListener("change", renderPlayers);

photoInput.addEventListener("change", () => {
  const photo = photoInput.files[0];
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreview.hidden = true;
  photoPreviewUrl = undefined;

  if (!photo) return;
  if (!allowedPhotoTypes.has(photo.type) || photo.size > MAX_PHOTO_BYTES) {
    photoInput.value = "";
    showToast("Choose a JPG, PNG or WebP photo under 5 MB.");
    return;
  }

  photoPreviewUrl = URL.createObjectURL(photo);
  photoPreviewImage.src = photoPreviewUrl;
  photoPreview.hidden = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const videoUrl = data.get("video_url").trim();
  const highlightVideoUrl = videoUrl ? normalizeHighlightUrl(videoUrl) : "";
  if (videoUrl && !highlightVideoUrl) {
    videoInput.setCustomValidity("Enter a valid public YouTube or Vimeo video link.");
    videoInput.reportValidity();
    videoInput.setCustomValidity("");
    return;
  }

  if (!supabase) {
    showToast("The submission service is unavailable. Please try again later.");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  const photo = photoInput.files[0];
  let photoPath = null;
  try {
    if (photo) {
      const extension = photo.type === "image/jpeg" ? "jpg" : photo.type.split("/")[1];
      photoPath = `profiles/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(photoPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
    }

    const { error } = await supabase.from("player_profiles").insert({
      name: data.get("name").trim(),
      position: data.get("position"),
      age: Number(data.get("age")),
      location: data.get("location").trim(),
      club: data.get("club").trim(),
      payment_reference: data.get("payment_reference").trim(),
      profile_image_path: photoPath,
      highlight_video_url: highlightVideoUrl || null,
      status: "pending"
    });
    if (error) throw error;
  } catch (error) {
    console.error("Could not submit your NextUp profile.", error);
    showToast("Your profile could not be submitted. Please try again.");
    return;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit for payment approval <span aria-hidden="true">↗</span>';
  }

  form.reset();
  photoPreview.hidden = true;
  photoPreviewImage.removeAttribute("src");
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = undefined;
  document.querySelector("#players").scrollIntoView({ behavior: "smooth" });
  showToast("Payment details submitted. Your profile will go live after approval.");
});

async function loadPlayers() {
  renderedServerPlayers = await getSupabasePlayers();
  await renderPlayers();
}

loadPlayers();
