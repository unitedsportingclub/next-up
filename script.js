const nextupClient = window.nextupSupabase;
const grid = document.querySelector("#player-grid");
const searchInput = document.querySelector("#player-search");
const positionFilter = document.querySelector("#position-filter");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const form = document.querySelector("#profile-form");
const toast = document.querySelector("#toast");
const confirmationDialog = document.querySelector("#submission-confirmation");
const confirmationPlayerName = document.querySelector("#confirmation-player-name");
const photoInput = document.querySelector("#player-photo");
const photoPreview = document.querySelector("#photo-preview");
const photoPreviewImage = document.querySelector("#photo-preview-image");
const videoInput = document.querySelector("#player-video");
let toastTimer;
let photoPreviewUrl;

const PHOTO_BUCKET = "player-images";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
let playerLoadState = "loading";

async function getSupabasePlayers() {
  if (!nextupClient) {
    playerLoadState = "error";
    return [];
  }

  const { data, error } = await nextupClient
    .from("approved_player_profiles")
    .select("name, position, age, location, club, profile_image_path, highlight_video_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    playerLoadState = "error";
    console.error("Could not load approved NextUp profiles.", error);
    showToast("Profiles could not be loaded from the server.");
    return [];
  }

  const photoPaths = data.map((player) => player.profile_image_path).filter(Boolean);
  let signedPhotos = [];
  if (photoPaths.length) {
    const { data: signedPhotoData, error: photoError } = await nextupClient.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(photoPaths, 3600);
    if (photoError) {
      console.error("Could not load approved player photos.", photoError);
      showToast("Player photos could not be loaded.");
    } else {
      signedPhotos = signedPhotoData || [];
    }
  }
  const photoUrls = new Map(signedPhotos.map((photo) => [photo.path, photo.signedUrl]));

  return data.map((player) => {
    return {
      ...player,
      imageUrl: photoUrls.get(player.profile_image_path) || "",
      initials: initialsFor(player.name)
    };
  });
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

function renderPlayers() {
  const playerCount = document.querySelector("#player-count");
  if (playerLoadState === "loading") {
    grid.replaceChildren();
    resultsCount.textContent = "Loading…";
    emptyState.hidden = true;
    playerCount.textContent = "—";
    return;
  }

  const query = searchInput.value.trim().toLowerCase();
  const position = positionFilter.value;
  const matches = renderedServerPlayers.filter((player) => {
    const matchesQuery = `${player.name} ${player.location} ${player.club || ""}`.toLowerCase().includes(query);
    return matchesQuery && (position === "all" || player.position === position);
  });
  grid.replaceChildren(...matches.map(makeCard));
  resultsCount.textContent = `${matches.length} ${matches.length === 1 ? "player" : "players"}`;
  emptyState.hidden = matches.length > 0;
  playerCount.textContent = renderedServerPlayers.length.toLocaleString();

  if (!matches.length) {
    if (playerLoadState === "error") {
      emptyState.textContent = "Player profiles are temporarily unavailable. Please try again later.";
    } else if (!renderedServerPlayers.length) {
      emptyState.textContent = "No approved players yet. Be the first to create a profile.";
    } else {
      emptyState.textContent = "No players match your search or position. Try another search or filter.";
    }
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
  const playerName = data.get("name").trim();
  const videoUrl = data.get("video_url").trim();
  const highlightVideoUrl = videoUrl ? normalizeHighlightUrl(videoUrl) : "";
  if (videoUrl && !highlightVideoUrl) {
    videoInput.setCustomValidity("Enter a valid public YouTube or Vimeo video link.");
    videoInput.reportValidity();
    videoInput.setCustomValidity("");
    return;
  }

  if (!nextupClient) {
    showToast("The submission service is unavailable. Please try again later.");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  const photo = photoInput.files[0];
  let photoPath = null;
  let photoUploaded = false;
  try {
    if (photo) {
      const extension = photo.type === "image/jpeg" ? "jpg" : photo.type.split("/")[1];
      photoPath = `profiles/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await nextupClient.storage
        .from(PHOTO_BUCKET)
        .upload(photoPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
      photoUploaded = true;
    }

    const { error } = await nextupClient.from("player_profiles").insert({
      name: playerName,
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
    if (photoUploaded) {
      try {
        const { error: cleanupError } = await nextupClient.storage
          .from(PHOTO_BUCKET)
          .remove([photoPath]);
        if (cleanupError) throw cleanupError;
      } catch (cleanupError) {
        console.error("Could not remove the photo after profile submission failed.", cleanupError);
      }
    }
    console.error("Could not submit your NextUp profile.", error);
    showToast(`Your profile could not be submitted: ${error.message || "please try again."}`);
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
  confirmationPlayerName.textContent = playerName.split(/\s+/)[0];
  if (typeof confirmationDialog.showModal === "function") confirmationDialog.showModal();
  else showToast("Your registration was received. Your profile will go live after payment approval.");
});

async function loadPlayers() {
  try {
    renderedServerPlayers = await getSupabasePlayers();
    if (playerLoadState === "loading") playerLoadState = "loaded";
  } catch (error) {
    playerLoadState = "error";
    console.error("Could not load approved NextUp profiles.", error);
  }

  grid.setAttribute("aria-busy", "false");
  renderPlayers();
}

renderPlayers();
loadPlayers();
