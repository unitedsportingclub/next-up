const nextupClient = window.nextupSupabase;
const loginPanel = document.querySelector("#admin-login-panel");
const loginForm = document.querySelector("#admin-login-form");
const dashboard = document.querySelector("#admin-dashboard");
const queue = document.querySelector("#admin-queue");
const message = document.querySelector("#admin-message");
const signOutButton = document.querySelector("#admin-signout");
const refreshButton = document.querySelector("#admin-refresh");
const statusFilter = document.querySelector("#admin-status-filter");
const inquiryFilter = document.querySelector("#admin-inquiry-filter");
const inquiryList = document.querySelector("#admin-inquiry-list");
const inquiryMessage = document.querySelector("#admin-inquiry-message");
const photoBucket = "player-images";
let queueRefreshTimer;
let queueLoading = false;
let inquiryLoading = false;
let adminUserId;

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

function addPrivateContactDetail(container, player) {
  const detail = document.createElement("div");
  detail.className = "admin-detail";
  const title = document.createElement("span");
  title.textContent = "Private contact";
  detail.append(title);
  if (!player.contact_whatsapp) {
    const text = document.createElement("strong");
    text.textContent = "Not supplied";
    detail.append(text);
  } else {
    const name = document.createElement("strong");
    name.textContent = `${player.contact_name} · ${player.contact_role.replace(/_/g, " ")}`;
    const number = document.createElement("span");
    number.className = "admin-private-number";
    number.textContent = player.contact_whatsapp;
    const link = document.createElement("a");
    link.className = "admin-private-link";
    link.href = `https://wa.me/${player.contact_whatsapp.replace(/\D/g, "")}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open WhatsApp ↗";
    detail.append(name, number, link);
  }
  container.append(detail);
}

function makePrivateContactEditor(player) {
  const disclosure = document.createElement("details");
  disclosure.className = "admin-contact-editor";
  const summary = document.createElement("summary");
  summary.textContent = player.contact_whatsapp ? "Update private contact" : "Add private contact";

  const form = document.createElement("form");
  form.className = "admin-contact-form";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.minLength = 2;
  nameInput.maxLength = 80;
  nameInput.required = true;
  nameInput.value = player.contact_name || "";

  const roleSelect = document.createElement("select");
  roleSelect.required = true;
  [
    ["player", "Player (18+)"],
    ["parent_guardian", "Parent or guardian"],
    ["manager", "Manager"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    roleSelect.append(option);
  });
  roleSelect.value = player.age < 18 ? "parent_guardian" : (player.contact_role || "player");
  roleSelect.disabled = player.age < 18;

  const phoneInput = document.createElement("input");
  phoneInput.type = "tel";
  phoneInput.inputMode = "tel";
  phoneInput.placeholder = "+233531234567";
  phoneInput.required = true;
  phoneInput.value = player.contact_whatsapp || "";

  const consentInput = document.createElement("input");
  consentInput.type = "checkbox";
  consentInput.required = true;
  consentInput.checked = Boolean(player.contact_consent);

  const addField = (labelText, control) => {
    const field = document.createElement("label");
    field.className = "admin-contact-field";
    const caption = document.createElement("span");
    caption.textContent = labelText;
    field.append(caption, control);
    form.append(field);
  };
  addField("Contact person", nameInput);
  addField("Contact role", roleSelect);
  addField("WhatsApp number", phoneInput);

  const consentLabel = document.createElement("label");
  consentLabel.className = "admin-contact-consent";
  consentLabel.append(consentInput, document.createTextNode(
    "I confirm this person has agreed to be contacted by NextUp about private introduction requests."
  ));
  form.append(consentLabel);

  const save = document.createElement("button");
  save.className = "button button-primary admin-contact-save";
  save.type = "submit";
  save.textContent = "Save private contact";
  form.append(save);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    savePrivateContact(player, {
      name: nameInput.value.trim(),
      role: roleSelect.value,
      whatsapp: phoneInput.value,
      consent: consentInput.checked
    }, save);
  });

  disclosure.append(summary, form);
  return disclosure;
}

function makeInquiryCard(inquiry, player) {
  const card = document.createElement("article");
  card.className = "admin-inquiry-card";

  const heading = document.createElement("div");
  heading.className = "admin-inquiry-card-heading";
  const title = document.createElement("h3");
  title.textContent = `Request for ${player ? player.name : "unavailable player profile"}`;
  const status = document.createElement("span");
  status.className = `admin-inquiry-status status-${inquiry.status}`;
  status.textContent = formatStatus(inquiry.status);
  heading.append(title, status);

  const requester = document.createElement("p");
  requester.className = "admin-inquiry-requester";
  requester.textContent = `${inquiry.requester_name}${inquiry.requester_organization ? ` · ${inquiry.requester_organization}` : ""}`;

  const requesterContacts = document.createElement("div");
  requesterContacts.className = "admin-inquiry-contacts";
  if (inquiry.requester_email) {
    const email = document.createElement("a");
    email.href = `mailto:${inquiry.requester_email}`;
    email.textContent = inquiry.requester_email;
    requesterContacts.append(email);
  }
  if (inquiry.requester_whatsapp) {
    const whatsapp = document.createElement("a");
    whatsapp.href = `https://wa.me/${inquiry.requester_whatsapp.replace(/\D/g, "")}`;
    whatsapp.target = "_blank";
    whatsapp.rel = "noopener noreferrer";
    whatsapp.textContent = `WhatsApp ${inquiry.requester_whatsapp} ↗`;
    requesterContacts.append(whatsapp);
  }

  const messageText = document.createElement("p");
  messageText.className = "admin-inquiry-text";
  messageText.textContent = inquiry.message;

  const playerContact = document.createElement("p");
  playerContact.className = "admin-inquiry-player-contact";
  if (player && player.contact_whatsapp) {
    playerContact.append(document.createTextNode(
      `Private player contact: ${player.contact_name} (${player.contact_role.replace(/_/g, " ")}) · ${player.contact_whatsapp} `
    ));
    const playerLink = document.createElement("a");
    playerLink.href = `https://wa.me/${player.contact_whatsapp.replace(/\D/g, "")}`;
    playerLink.target = "_blank";
    playerLink.rel = "noopener noreferrer";
    playerLink.textContent = "Open WhatsApp ↗";
    playerContact.append(playerLink);
  } else {
    playerContact.textContent = "No private player contact is available. Contact the player or guardian through NextUp.";
  }

  const metadata = document.createElement("p");
  metadata.className = "admin-inquiry-date";
  metadata.textContent = `Received ${new Date(inquiry.created_at).toLocaleString()} · Updated ${new Date(inquiry.updated_at).toLocaleString()}`;

  const actions = document.createElement("div");
  actions.className = "admin-inquiry-actions";
  if (inquiry.status === "new" || inquiry.status === "player_contacted" || inquiry.status === "closed") {
    const contacted = document.createElement("button");
    contacted.className = "button button-primary";
    contacted.type = "button";
    contacted.textContent = inquiry.status === "closed"
      ? "Reopen request"
      : inquiry.status === "new"
        ? "Mark player/guardian contacted"
        : "Mark introduction made (consent received)";
    contacted.addEventListener("click", () => updateInquiryStatus(
      inquiry,
      inquiry.status === "closed" ? "new" : inquiry.status === "new" ? "player_contacted" : "introduced",
      contacted
    ));
    actions.append(contacted);
  }
  if (inquiry.status !== "closed") {
    const close = document.createElement("button");
    close.className = "button admin-reject";
    close.type = "button";
    close.textContent = "Close request";
    close.addEventListener("click", () => updateInquiryStatus(inquiry, "closed", close));
    actions.append(close);
  }

  card.append(heading, requester, requesterContacts, messageText, playerContact, metadata, actions);
  return card;
}

async function savePrivateContact(player, contact, button) {
  if (contact.name.length < 2 || contact.name.length > 80) {
    showMessage("Enter the contact person's name (2 to 80 characters).", "error");
    return;
  }
  const whatsapp = contact.whatsapp.trim().replace(/[()\s.-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) {
    showMessage("Enter the private WhatsApp number with its +country code.", "error");
    button.disabled = false;
    return;
  }
  if (!contact.consent) {
    showMessage("Confirm that the contact person agreed before saving the number.", "error");
    button.disabled = false;
    return;
  }

  button.disabled = true;
  showMessage("Saving private contact...");
  try {
    const { data, error } = await nextupClient
      .from("player_profiles")
      .update({
        contact_name: contact.name,
        contact_role: contact.role,
        contact_whatsapp: whatsapp,
        contact_consent: true
      })
      .eq("id", player.id)
      .eq("contact_whatsapp", player.contact_whatsapp || "")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      showMessage("This contact was updated elsewhere. Refreshing profiles.", "error");
      await loadProfiles();
      return;
    }

    await Promise.all([loadProfiles(), loadInquiries()]);
    showMessage("Private contact saved. It is not shown on the public profile.");
  } catch (error) {
    console.error("Could not save private player contact.", error);
    showMessage("Could not save the private contact. Check admin permissions and Supabase setup.", "error");
    button.disabled = false;
  }
}

function formatStatus(value) {
  return value.replace(/_/g, " ");
}

function formatReviewDate(value, reviewerId) {
  if (!value) return "Not reviewed";
  const reviewer = reviewerId ? ` · Admin ${reviewerId.slice(0, 8)}` : "";
  return `${new Date(value).toLocaleString()}${reviewer}`;
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
  subtitle.textContent = `${player.position} · Age ${player.age} · ${player.public_region || player.location}`;
  nameBlock.append(name, subtitle);
  heading.append(avatar, nameBlock);

  const details = document.createElement("div");
  details.className = "admin-player-details";
  addDetail(details, "Profile review", formatStatus(player.status));
  addDetail(details, "Payment review", formatStatus(player.payment_status));
  addDetail(details, "Public listing", player.status === "approved" && player.payment_status === "verified"
    ? "Published"
    : "Hidden until both approvals");
  addDetail(details, "Club", player.club);
  addDetail(details, "Payment reference", player.payment_reference);
  addDetail(details, "Submitted", new Date(player.created_at).toLocaleString());
  addDetail(details, "Payment decision recorded", formatReviewDate(player.payment_reviewed_at, player.payment_reviewed_by));
  addDetail(details, "Profile decision recorded", formatReviewDate(player.profile_reviewed_at, player.profile_reviewed_by));
  addDetail(details, "Private contact permission", player.contact_consent ? "Confirmed" : "Not recorded");
  if (player.age < 18) {
    addDetail(details, "Guardian approval", player.guardian_consent ? "Confirmed" : "Not recorded");
  }
  addPrivateContactDetail(details, player);

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

  card.append(makePrivateContactEditor(player));

  const actions = document.createElement("div");
  actions.className = "admin-player-actions";
  const paymentActions = document.createElement("div");
  paymentActions.className = "admin-review-group";
  const paymentLabel = document.createElement("span");
  paymentLabel.className = "admin-review-label";
  paymentLabel.textContent = "PAYMENT";
  paymentActions.append(paymentLabel);
  if (player.payment_status !== "verified") {
    const verifyPayment = document.createElement("button");
    verifyPayment.className = "button button-primary";
    verifyPayment.type = "button";
    verifyPayment.textContent = "Verify payment";
    verifyPayment.addEventListener("click", () => updateReview(player, "payment_status", "verified", actions));
    paymentActions.append(verifyPayment);
  }

  if (player.payment_status !== "issue") {
    const flagPayment = document.createElement("button");
    flagPayment.className = "button admin-reject";
    flagPayment.type = "button";
    flagPayment.textContent = "Flag payment issue";
    flagPayment.addEventListener("click", () => updateReview(player, "payment_status", "issue", actions));
    paymentActions.append(flagPayment);
  }

  const profileActions = document.createElement("div");
  profileActions.className = "admin-review-group";
  const profileLabel = document.createElement("span");
  profileLabel.className = "admin-review-label";
  profileLabel.textContent = "PROFILE";
  profileActions.append(profileLabel);
  if (player.status !== "approved") {
    const approve = document.createElement("button");
    approve.className = "button button-primary";
    approve.type = "button";
    approve.textContent = "Approve profile";
    approve.addEventListener("click", () => updateReview(player, "status", "approved", actions));
    profileActions.append(approve);
  }

  if (player.status !== "rejected") {
    const reject = document.createElement("button");
    reject.className = "button admin-reject";
    reject.type = "button";
    reject.textContent = "Reject profile";
    reject.addEventListener("click", () => updateReview(player, "status", "rejected", actions));
    profileActions.append(reject);
  }
  actions.append(paymentActions, profileActions);

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
  const filter = statusFilter.value;
  const filterLabel = statusFilter.selectedOptions[0].textContent.toLowerCase();
  queue.replaceChildren();
  showMessage(filter === "all" ? "Loading all profiles..." : `Loading ${filterLabel}...`);

  try {
    let profilesQuery = nextupClient
      .from("player_profiles")
      .select("id, name, position, age, location, public_region, contact_name, contact_role, contact_whatsapp, contact_consent, guardian_consent, club, payment_reference, status, payment_status, payment_reviewed_at, payment_reviewed_by, profile_reviewed_at, profile_reviewed_by, created_at, profile_image_path, highlight_video_url");
    if (filter === "attention") {
      profilesQuery = profilesQuery.or("status.eq.pending,payment_status.neq.verified");
    } else if (filter === "published") {
      profilesQuery = profilesQuery.eq("status", "approved").eq("payment_status", "verified");
    } else if (filter === "rejected") {
      profilesQuery = profilesQuery.eq("status", "rejected");
    }
    const { data, error } = await profilesQuery.order("created_at", { ascending: filter === "attention" });
    if (error) throw error;

    if (!data.length) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = filter === "all" ? "No player profiles found." : `No profiles in ${filterLabel}.`;
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
    const profileMessage = filter === "attention"
      ? `${profileCount} need attention.`
      : `${profileCount} ${filter === "all" ? "across all review states." : `in ${filterLabel}.`}`;
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

async function loadInquiries() {
  if (inquiryLoading) return false;
  inquiryLoading = true;
  const status = inquiryFilter.value;
  const statusLabel = inquiryFilter.selectedOptions[0].textContent.toLowerCase();
  inquiryList.replaceChildren();
  inquiryMessage.textContent = "Loading introduction requests...";
  delete inquiryMessage.dataset.tone;

  try {
    let inquiriesQuery = nextupClient
      .from("scouting_inquiries")
      .select("id, player_profile_id, requester_name, requester_organization, requester_email, requester_whatsapp, message, status, created_at, updated_at");
    if (status !== "all") inquiriesQuery = inquiriesQuery.eq("status", status);
    const { data: inquiries, error } = await inquiriesQuery.order("created_at", { ascending: false });
    if (error) throw error;

    if (!inquiries.length) {
      inquiryMessage.textContent = status === "all" ? "No introduction requests yet." : `No ${statusLabel}.`;
      return true;
    }

    const playerIds = [...new Set(inquiries.map((inquiry) => inquiry.player_profile_id))];
    const { data: players, error: playersError } = await nextupClient
      .from("player_profiles")
      .select("id, name, age, contact_name, contact_role, contact_whatsapp, contact_consent, guardian_consent")
      .in("id", playerIds);
    if (playersError) throw playersError;
    const playersById = new Map((players || []).map((player) => [player.id, player]));

    inquiryList.replaceChildren(...inquiries.map((inquiry) => makeInquiryCard(
      inquiry,
      playersById.get(inquiry.player_profile_id)
    )));
    inquiryMessage.textContent = `${inquiries.length} ${inquiries.length === 1 ? "request" : "requests"} ${status === "all" ? "across all statuses." : `in ${statusLabel}.`}`;
    return true;
  } catch (error) {
    console.error("Could not load scouting introduction requests.", error);
    inquiryMessage.textContent = `Could not load introduction requests: ${error.message || "check the Supabase setup."}`;
    inquiryMessage.dataset.tone = "error";
    return false;
  } finally {
    inquiryLoading = false;
  }
}

async function updateInquiryStatus(inquiry, status, button) {
  button.disabled = true;
  try {
    const { data, error } = await nextupClient
      .from("scouting_inquiries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", inquiry.id)
      .eq("status", inquiry.status)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      inquiryMessage.textContent = "This request changed elsewhere. Refreshing the list.";
      await loadInquiries();
      return;
    }
    await loadInquiries();
  } catch (error) {
    console.error("Could not update scouting inquiry status.", error);
    inquiryMessage.textContent = "Could not update this request. Check your admin permissions and try again.";
    inquiryMessage.dataset.tone = "error";
    button.disabled = false;
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
  await loadInquiries();
  if (photoCleanupError) {
    showMessage("Profile deleted, but its photo could not be removed from storage.", "error");
  } else {
    showMessage(player.profile_image_path ? "Player profile and photo deleted." : "Player profile deleted.");
  }
}

async function updateReview(player, field, value, actions) {
  const isPaymentReview = field === "payment_status";
  const label = isPaymentReview ? "payment" : "profile";
  const isRemovingFromPublic = (player.status === "approved" && value === "rejected")
    || (player.payment_status === "verified" && value === "issue");
  if (isRemovingFromPublic && !window.confirm(
    `This will remove ${player.name}'s profile from the public board until both reviews are approved. Continue?`
  )) return;

  const buttons = actions.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  const decision = isPaymentReview
    ? (value === "verified" ? "Verifying payment..." : "Flagging payment issue...")
    : (value === "approved" ? "Approving profile..." : "Rejecting profile...");
  showMessage(decision);
  const reviewedAt = new Date().toISOString();
  const update = isPaymentReview
    ? { payment_status: value, payment_reviewed_at: reviewedAt, payment_reviewed_by: adminUserId }
    : { status: value, profile_reviewed_at: reviewedAt, profile_reviewed_by: adminUserId };

  try {
    const { data, error } = await nextupClient
      .from("player_profiles")
      .update(update)
      .eq("id", player.id)
      .eq(field, player[field])
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      showMessage(`The ${label} status changed elsewhere. Refreshing profiles.`, "error");
      await loadProfiles();
      return;
    }

    const profilesLoaded = await loadProfiles();
    if (!profilesLoaded) return;
    const published = (value === "approved" && player.payment_status === "verified")
      || (value === "verified" && player.status === "approved");
    showMessage(published
      ? "Both reviews are approved. The player is on the public board."
      : `${label === "payment" ? "Payment" : "Profile"} review updated. The player appears publicly only after both reviews are approved.`);
  } catch (error) {
    console.error(`Could not update ${label} review.`, error);
    showMessage(`Could not update ${label} review. Check your admin permissions and Supabase setup.`, "error");
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
    adminUserId = user.id;
    await Promise.all([loadProfiles(), loadInquiries()]);
    window.clearInterval(queueRefreshTimer);
    queueRefreshTimer = window.setInterval(() => {
      if (!dashboard.hidden) {
        loadProfiles();
        loadInquiries();
      }
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
inquiryFilter.addEventListener("change", loadInquiries);

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await Promise.all([loadProfiles(), loadInquiries()]);
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
    adminUserId = undefined;
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
