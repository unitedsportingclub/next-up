const nextupClient = window.nextupSupabase;
const loginPanel = document.querySelector("#admin-login-panel");
const loginForm = document.querySelector("#admin-login-form");
const dashboard = document.querySelector("#admin-dashboard");
const queue = document.querySelector("#admin-queue");
const message = document.querySelector("#admin-message");
const signOutButton = document.querySelector("#admin-signout");
const refreshButton = document.querySelector("#admin-refresh");
const statusFilter = document.querySelector("#admin-status-filter");
const photoBucket = "player-images";
let queueRefreshTimer;
let queueLoading = false;

function showMessage(text, tone) {
  message.textContent = text;
  if (tone) message.dataset.tone = tone;
  else delete message.dataset.tone;
}

function initialsFor(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function normalizeVideoUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : "";
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      const id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
      return /^[\w-]{11}$/.test(id || "") ? `https://www.youtube.com/watch?v=${id}` : "";
    }
    if (host === "vimeo.com" || host === "www.vimeo.com") {
      const id = url.pathname.match(/^\/(\d+)\/?$/)?.[1];
      return id ? `https://vimeo.com/${id}` : "";
    }
  } catch (error) {
    return "";
  }
  return "";
}

function addDetail(container, label, value) {
  const detail = document.createElement("div");
  detail.className = "admin-detail";
  const title = document.createElement("span");
  title.textContent = label;
  const text = document.createElement("strong");
  text.textContent = value || "—";
  detail.append(title, text);
  container.append(detail);
}

function makePlayerCard(player) {
  const card = document.createElement("article");
  card.className = "admin-player";

  const heading = document.createElement("div");
  heading.className = "admin-player-heading";
  const avatar = document.createElement("div");
  avatar.className = "admin-player-avatar";

  if (player.imageUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = player.imageUrl;
    image.addEventListener("error", () => {
      avatar.textContent = initialsFor(player.name);
    }, { once: true });
    avatar.append(image);
  } else {
    avatar.textContent = initialsFor(player.name);
  }

  const nameBlock = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = player.name;
  const subtitle = document.createElement("p");
  subtitle.textContent = `${player.position} · Age ${player.age} · ${player.location}`;
  nameBlock.append(name, subtitle);
  heading.append(avatar, nameBlock);

  const details = document.createElement("div");
  details.className = "admin-player-details";
  addDetail(details, "Status", player.status);
  addDetail(details, "Club", player.club);
  addDetail(details, "Payment reference", player.payment_reference);
  addDetail(details, "Submitted", new Date(player.created_at).toLocaleString());

  card.append(heading, details);

  const videoUrl = normalizeVideoUrl(player.highlight_video_url);
  if (player.imageUrl || videoUrl) {
    const media = document.createElement("div");
    media.className = "admin-player-media";
    if (player.imageUrl) {
      const image = document.createElement("img");
      image.alt = `Profile photo for ${player.name}`;
      image.loading = "lazy";
      image.src = player.imageUrl;
      media.append(image);
    }
    if (videoUrl) {
      const link = document.createElement("a");
      link.className = "admin-media-link";
      link.href = videoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Review highlight video ↗";
      media.append(link);
    }
    card.append(media);
  }

  const actions = document.createElement("div");
  actions.className = "admin-player-actions";
  if (player.status === "pending") {
    const reject = document.createElement("button");
    reject.className = "button admin-reject";
    reject.type = "button";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => updateStatus(player.id, "rejected", actions));
    const approve = document.createElement("button");
    approve.className = "button button-primary";
    approve.type = "button";
    approve.textContent = "Approve player";
    approve.addEventListener("click", () => updateStatus(player.id, "approved", actions));
    actions.append(reject, approve);
  }

  const deleteButton = document.createElement("button");
  deleteButton.className = "button admin-delete";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete profile";
  deleteButton.addEventListener("click", () => deletePlayerProfile(player, actions));
  actions.append(deleteButton);
  card.append(actions);
  return card;
}

async function loadProfiles() {
  if (queueLoading) return false;
  queueLoading = true;
  statusFilter.disabled = true;
  const status = statusFilter.value;
  queue.replaceChildren();
  showMessage(status === "all" ? "Loading all profiles..." : `Loading ${status} profiles...`);

  try {
    let profilesQuery = nextupClient
      .from("player_profiles")
      .select("id, name, position, age, location, club, payment_reference, status, created_at, profile_image_path, highlight_video_url");
    if (status !== "all") profilesQuery = profilesQuery.eq("status", status);
    const { data, error } = await profilesQuery.order("created_at", { ascending: status === "pending" });
    if (error) throw error;

    if (!data.length) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = status === "all" ? "No player profiles found." : `No ${status} profiles found.`;
      queue.append(empty);
      showMessage(empty.textContent);
      return true;
    }

    const photoPaths = [...new Set(data.map((player) => player.profile_image_path).filter(Boolean))];
    let photoUrls = new Map();
    let photoLoadError = false;
    if (photoPaths.length) {
      const { data: signedPhotos, error: photoError } = await nextupClient.storage
        .from(photoBucket)
        .createSignedUrls(photoPaths, 900);
      if (photoError) {
        photoLoadError = true;
        console.error("Could not load photos for player profiles.", photoError);
      } else {
        photoUrls = new Map((signedPhotos || [])
          .filter((photo) => photo.signedUrl)
          .map((photo) => [photo.path, photo.signedUrl]));
        photoLoadError = photoUrls.size < photoPaths.length;
      }
    }

    queue.replaceChildren(...data.map((player) => makePlayerCard({
      ...player,
      imageUrl: photoUrls.get(player.profile_image_path) || ""
    })));
    const profileCount = `${data.length} ${data.length === 1 ? "profile" : "profiles"}`;
    const profileMessage = status === "pending"
      ? `${profileCount} awaiting review.`
      : `${profileCount} ${status === "all" ? "across all statuses." : `with ${status} status.`}`;
    showMessage(photoLoadError
      ? `${profileMessage} Some profile photos could not be loaded.`
      : profileMessage, photoLoadError ? "error" : undefined);
    return true;
  } catch (error) {
    console.error("Could not load player profiles.", error);
    showMessage(`Could not load profiles: ${error.message || "check your admin access and Supabase setup."}`, "error");
    return false;
  } finally {
    queueLoading = false;
    statusFilter.disabled = false;
  }
}

async function deletePlayerProfile(player, actions) {
  const confirmed = window.confirm(
    `Permanently delete ${player.name}'s profile? This cannot be undone. Its photo will also be removed if available.`
  );
  if (!confirmed) return;

  const buttons = actions.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  showMessage("Deleting player profile...");

  try {
    const { data, error } = await nextupClient
      .from("player_profiles")
      .delete()
      .eq("id", player.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      showMessage("This profile was already deleted or could not be found.", "error");
      await loadProfiles();
      return;
    }
  } catch (error) {
    console.error("Could not delete player profile.", error);
    showMessage("Could not delete this profile. Check your admin permissions and try again.", "error");
    buttons.forEach((button) => { button.disabled = false; });
    return;
  }

  let photoCleanupError;
  if (player.profile_image_path) {
    try {
      const { error } = await nextupClient.storage
        .from(photoBucket)
        .remove([player.profile_image_path]);
      if (error) throw error;
    } catch (error) {
      photoCleanupError = error;
      console.error("Profile was deleted, but its photo could not be removed.", error);
    }
  }

  const profilesLoaded = await loadProfiles();
  if (!profilesLoaded) return;
  if (photoCleanupError) {
    showMessage("Profile deleted, but its photo could not be removed from storage.", "error");
  } else {
    showMessage(player.profile_image_path ? "Player profile and photo deleted." : "Player profile deleted.");
  }
}

async function updateStatus(playerId, status, actions) {
  const buttons = actions.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  showMessage(status === "approved" ? "Approving player..." : "Rejecting registration...");

  try {
    const { data, error } = await nextupClient
      .from("player_profiles")
      .update({ status })
      .eq("id", playerId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      showMessage("This registration was already reviewed. Refreshing the queue.", "error");
      await loadProfiles();
      return;
    }

    const profilesLoaded = await loadProfiles();
    if (!profilesLoaded) return;
    showMessage(status === "approved" ? "Player approved and added to the public board." : "Registration rejected.");
  } catch (error) {
    console.error(`Could not set player status to ${status}.`, error);
    showMessage("The status could not be updated. Check your admin permissions and try again.", "error");
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function openAdminDashboard(user) {
  try {
    const { data, error } = await nextupClient
      .from("nextup_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { error: signOutError } = await nextupClient.auth.signOut();
      if (signOutError) console.error("Could not sign out an unauthorized admin account.", signOutError);
      loginPanel.hidden = false;
      dashboard.hidden = true;
      showMessage("This account is not authorized to access the admin area.", "error");
      return;
    }

    loginPanel.hidden = true;
    dashboard.hidden = false;
    await loadProfiles();
    window.clearInterval(queueRefreshTimer);
    queueRefreshTimer = window.setInterval(() => {
      if (!dashboard.hidden) loadProfiles();
    }, 15000);
  } catch (error) {
    console.error("Could not verify the admin account.", error);
    showMessage("Could not verify admin access. Check the Supabase setup.", "error");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!nextupClient) {
    showMessage("The sign-in service is unavailable. Please try again later.", "error");
    return;
  }

  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage("Signing in...");
  try {
    const formData = new FormData(loginForm);
    const { data, error } = await nextupClient.auth.signInWithPassword({
      email: formData.get("email").trim(),
      password: formData.get("password")
    });
    if (error) throw error;
    await openAdminDashboard(data.user);
  } catch (error) {
    console.error("Admin sign-in failed.", error);
    showMessage("Sign-in failed. Check your email and password.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

statusFilter.addEventListener("change", loadProfiles);

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await loadProfiles();
  } finally {
    refreshButton.disabled = false;
  }
});

signOutButton.addEventListener("click", async () => {
  try {
    const { error } = await nextupClient.auth.signOut();
    if (error) throw error;

    dashboard.hidden = true;
    loginPanel.hidden = false;
    window.clearInterval(queueRefreshTimer);
    loginForm.reset();
    showMessage("You have signed out.");
  } catch (error) {
    console.error("Admin sign-out failed.", error);
    showMessage("Could not sign out. Please try again.", "error");
  }
});

async function restoreAdminSession() {
  if (!nextupClient) {
    showMessage("The sign-in service is unavailable. Please try again later.", "error");
    return;
  }

  const { data, error } = await nextupClient.auth.getSession();
  if (error) {
    console.error("Could not restore the admin session.", error);
    showMessage("Could not restore your sign-in. Please sign in again.", "error");
    return;
  }
  if (data.session) await openAdminDashboard(data.session.user);
}

restoreAdminSession();
