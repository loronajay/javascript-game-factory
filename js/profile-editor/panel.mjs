import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { FRIEND_RAIL_SLOT_COUNT, PROFILE_UPDATED_EVENT, } from "./constants.mjs";
import { collectFriendSlotPlayerIds, collectLinkRows, } from "./form-fields.mjs";
import { buildArcadeProfileViewModel } from "./view-model.mjs";
import { persistArcadeProfileDetails } from "./persistence.mjs";
import { createMusicEditor } from "./music-editor.mjs";
function byId(doc, id) {
    return doc?.getElementById?.(id) ?? null;
}
function uploadErrorMessage(errorCode, fileLabel) {
    if (errorCode === "unauthorized")
        return `Upload failed: sign in first.`;
    if (errorCode === "upload_not_configured")
        return `Upload failed: service unavailable.`;
    if (errorCode === "file_too_large")
        return `Upload failed: ${fileLabel} is too large (max 10 MB).`;
    if (errorCode === "unsupported_file_type")
        return `Upload failed: use JPEG, PNG, or WebP.`;
    if (errorCode)
        return `Upload failed (${errorCode}).`;
    return `Upload failed. Please try a different ${fileLabel}.`;
}
function dispatchProfileUpdatedEvent(doc, action, profile) {
    if (!doc?.dispatchEvent)
        return;
    const detail = { action, profile };
    const event = typeof globalThis.CustomEvent === "function"
        ? new globalThis.CustomEvent(PROFILE_UPDATED_EVENT, { detail })
        : { type: PROFILE_UPDATED_EVENT, detail };
    doc.dispatchEvent(event);
}
function renderSelectOptions(select, options, value) {
    if (!select)
        return;
    select.innerHTML = options
        .map((option) => `<option value="${option.value}">${option.label}</option>`)
        .join("");
    select.value = value;
}
export function initProfileEditorPanel({ doc = globalThis.document, storage = getDefaultPlatformStorage(), options = {}, onSaved, } = {}) {
    const apiClient = options?.apiClient || createPlatformApiClient(options);
    const button = byId(doc, "playerProfileButton");
    const panel = byId(doc, "playerProfilePanel");
    const closeButton = byId(doc, "playerProfileClose");
    const form = byId(doc, "playerProfileForm");
    const profileNameInput = byId(doc, "playerProfileName");
    const realNameInput = byId(doc, "playerProfileRealName");
    const bioInput = byId(doc, "playerProfileBio");
    const taglineInput = byId(doc, "playerProfileTagline");
    const favoriteGameInput = byId(doc, "playerProfileFavoriteGame");
    const mainSqueezeModeInput = byId(doc, "playerProfileMainSqueezeMode");
    const mainSqueezePlayerIdInput = byId(doc, "playerProfileMainSqueezePlayerId");
    const friendRailModeInput = byId(doc, "playerProfileFriendRailMode");
    const discoverableInput = byId(doc, "playerProfileDiscoverable");
    const clearButton = byId(doc, "playerProfileClear");
    const avatarButton = byId(doc, "playerProfileAvatarButton");
    const avatarInput = byId(doc, "playerProfileAvatarInput");
    const avatarPreview = byId(doc, "playerProfileAvatarPreview");
    const avatarFallback = byId(doc, "playerProfileAvatarFallback");
    const avatarStatus = byId(doc, "playerProfileAvatarStatus");
    const bgButton = byId(doc, "playerProfileBgButton");
    const bgInput = byId(doc, "playerProfileBgInput");
    const bgPreview = byId(doc, "playerProfileBgPreview");
    const bgFallback = byId(doc, "playerProfileBgFallback");
    const bgStatus = byId(doc, "playerProfileBgStatus");
    const bgStyleInput = byId(doc, "playerProfileBgStyle");
    if (!form || !profileNameInput) {
        return null;
    }
    const musicEditor = createMusicEditor({ doc, apiClient });
    musicEditor.mount(byId(doc, "playerProfileMusicSlots"));
    let pendingAvatarAssetId = "";
    let pendingAvatarUrl = "";
    let pendingBackgroundImageUrl = "";
    function syncAvatarPreview(src, initials = "") {
        if (!avatarPreview)
            return;
        if (src) {
            avatarPreview.src = src;
            avatarPreview.hidden = false;
            if (avatarFallback)
                avatarFallback.hidden = true;
        }
        else {
            avatarPreview.hidden = true;
            if (avatarFallback) {
                avatarFallback.textContent = initials;
                avatarFallback.hidden = false;
            }
        }
    }
    function setAvatarStatus(text) {
        if (avatarStatus)
            avatarStatus.textContent = text;
    }
    function syncBgPreview(src) {
        if (!bgPreview)
            return;
        if (src) {
            bgPreview.src = src;
            bgPreview.hidden = false;
            if (bgFallback)
                bgFallback.hidden = true;
        }
        else {
            bgPreview.hidden = true;
            if (bgFallback)
                bgFallback.hidden = false;
        }
    }
    function setBgStatus(text) {
        if (bgStatus)
            bgStatus.textContent = text;
    }
    if (avatarButton && avatarInput) {
        avatarButton.addEventListener("click", () => avatarInput.click());
        avatarInput.addEventListener("change", async () => {
            const file = avatarInput.files?.[0];
            if (!file)
                return;
            const localUrl = URL.createObjectURL(file);
            syncAvatarPreview(localUrl);
            setAvatarStatus("Uploading...");
            if (!apiClient?.isConfigured || typeof apiClient.uploadAvatar !== "function") {
                setAvatarStatus("Upload not available - API not connected.");
                return;
            }
            const result = await apiClient.uploadAvatar(file);
            URL.revokeObjectURL(localUrl);
            if (!result?.assetId || !result?.url) {
                const msg = uploadErrorMessage(result?.uploadError, "photo");
                setAvatarStatus(msg);
                syncAvatarPreview("", "");
                return;
            }
            pendingAvatarAssetId = result.assetId;
            pendingAvatarUrl = result.url;
            syncAvatarPreview(result.url);
            setAvatarStatus("Photo ready - save your profile to apply it.");
        });
    }
    if (bgButton && bgInput) {
        bgButton.addEventListener("click", () => bgInput.click());
        bgInput.addEventListener("change", async () => {
            const file = bgInput.files?.[0];
            if (!file)
                return;
            const localUrl = URL.createObjectURL(file);
            syncBgPreview(localUrl);
            setBgStatus("Uploading...");
            if (!apiClient?.isConfigured || typeof apiClient.uploadBackground !== "function") {
                setBgStatus("Upload not available - API not connected.");
                return;
            }
            const result = await apiClient.uploadBackground(file);
            URL.revokeObjectURL(localUrl);
            if (!result?.url) {
                const msg = uploadErrorMessage(result?.uploadError, "image");
                setBgStatus(msg);
                syncBgPreview("");
                return;
            }
            pendingBackgroundImageUrl = result.url;
            syncBgPreview(result.url);
            setBgStatus("Background ready - save your profile to apply it.");
        });
    }
    const summary = byId(doc, "playerProfileSummary");
    const defaultName = byId(doc, "playerProfileDefault");
    const status = byId(doc, "playerProfileStatus");
    const playerId = byId(doc, "playerProfileId");
    const helper = byId(doc, "playerProfileHint");
    const flash = byId(doc, "playerProfileFlash");
    const saveLabel = byId(doc, "playerProfileSaveLabel");
    const friendSlotInputs = Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => (byId(doc, `playerProfileFriendSlot${index + 1}`)));
    function syncRelationshipInputState() {
        const isManualMainSqueeze = mainSqueezeModeInput?.value === "manual";
        const isManualFriendRail = friendRailModeInput?.value === "manual";
        if (mainSqueezePlayerIdInput) {
            mainSqueezePlayerIdInput.disabled = !isManualMainSqueeze;
        }
        friendSlotInputs.forEach((input) => {
            if (!input)
                return;
            input.disabled = !isManualFriendRail;
        });
    }
    function render(flashMessage = "") {
        const profile = loadFactoryProfile(storage, options);
        const relationshipsRecord = loadProfileRelationshipsRecord(profile.playerId, storage);
        const model = buildArcadeProfileViewModel(profile, { flashMessage, relationshipsRecord });
        const displayAvatarSrc = pendingAvatarUrl || profile.avatarUrl || "";
        const displayInitials = (profile.profileName || "?").slice(0, 2).toUpperCase();
        syncAvatarPreview(displayAvatarSrc, displayInitials);
        syncBgPreview(pendingBackgroundImageUrl || profile.backgroundImageUrl || "");
        if (bgStyleInput)
            bgStyleInput.value = profile.backgroundStyle || 'blend';
        musicEditor.seedFromProfile(profile.profileMusicPlaylist || []);
        if (summary)
            summary.textContent = model.summaryName;
        if (defaultName)
            defaultName.textContent = model.summaryName;
        if (status)
            status.textContent = model.statusLine;
        if (playerId)
            playerId.textContent = model.playerIdLabel;
        if (helper)
            helper.textContent = model.helperText;
        if (flash)
            flash.textContent = model.flashMessage;
        if (saveLabel)
            saveLabel.textContent = model.saveLabel;
        profileNameInput.value = model.profileNameValue;
        profileNameInput.maxLength = model.profileNameMaxLength;
        if (realNameInput) {
            realNameInput.value = model.realNameValue;
            realNameInput.maxLength = model.realNameMaxLength;
        }
        if (bioInput) {
            bioInput.value = model.bioValue;
            bioInput.maxLength = model.bioMaxLength;
        }
        if (taglineInput) {
            taglineInput.value = model.taglineValue;
            taglineInput.maxLength = model.taglineMaxLength;
        }
        if (discoverableInput) {
            discoverableInput.checked = model.discoverableValue;
        }
        if (favoriteGameInput) {
            renderSelectOptions(favoriteGameInput, model.favoriteGameOptions, model.favoriteGameValue);
        }
        if (mainSqueezeModeInput) {
            renderSelectOptions(mainSqueezeModeInput, model.mainSqueezeModeOptions, model.mainSqueezeModeValue);
        }
        if (mainSqueezePlayerIdInput) {
            renderSelectOptions(mainSqueezePlayerIdInput, model.relationshipCandidateOptions, model.mainSqueezePlayerIdValue);
        }
        if (friendRailModeInput) {
            renderSelectOptions(friendRailModeInput, model.friendRailModeOptions, model.friendRailModeValue);
        }
        model.linkRows.forEach((row, index) => {
            const labelInput = byId(doc, `playerProfileLinkLabel${index + 1}`);
            const urlInput = byId(doc, `playerProfileLinkUrl${index + 1}`);
            const kindInput = byId(doc, `playerProfileLinkKind${index + 1}`);
            const idInput = byId(doc, `playerProfileLinkId${index + 1}`);
            if (labelInput) {
                labelInput.value = row.labelValue;
                labelInput.maxLength = row.labelMaxLength;
            }
            if (urlInput) {
                urlInput.value = row.urlValue;
                urlInput.maxLength = row.urlMaxLength;
            }
            if (kindInput) {
                kindInput.value = row.kindValue;
            }
            if (idInput) {
                idInput.value = row.idValue;
            }
        });
        model.friendSlotRows.forEach((row, index) => {
            const input = friendSlotInputs[index];
            renderSelectOptions(input, model.relationshipCandidateOptions, row.playerIdValue);
        });
        syncRelationshipInputState();
    }
    function openPanel() {
        if (panel)
            panel.hidden = false;
        button?.setAttribute("aria-expanded", "true");
        profileNameInput.focus();
        profileNameInput.select();
    }
    function closePanel() {
        if (panel)
            panel.hidden = true;
        button?.setAttribute("aria-expanded", "false");
        button?.focus();
    }
    button?.addEventListener("click", () => {
        if (panel && panel.hidden) {
            openPanel();
        }
        else if (panel) {
            closePanel();
        }
    });
    closeButton?.addEventListener("click", closePanel);
    clearButton?.addEventListener("click", async () => {
        const clearedProfile = await persistArcadeProfileDetails(storage, {
            profileName: "",
            realName: "",
            bio: "",
            tagline: "",
            favoriteGameSlug: "",
            backgroundImageUrl: "",
            backgroundStyle: "blend",
            links: [],
            profileMusicPlaylist: [],
            mainSqueezeMode: "manual",
            mainSqueezePlayerId: "",
            friendRailMode: "auto",
            manualFriendSlotPlayerIds: Array(FRIEND_RAIL_SLOT_COUNT).fill(""),
        }, {
            ...options,
            apiClient,
        });
        pendingAvatarAssetId = "";
        pendingAvatarUrl = "";
        setAvatarStatus("");
        pendingBackgroundImageUrl = "";
        setBgStatus("");
        musicEditor.reset();
        render("PLAYER CARD CLEARED");
        dispatchProfileUpdatedEvent(doc, "cleared", clearedProfile);
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const currentProfile = loadFactoryProfile(storage, options);
        const patch = {
            profileName: profileNameInput.value,
            realName: realNameInput?.value || "",
            bio: bioInput?.value || "",
            tagline: taglineInput?.value || "",
            favoriteGameSlug: favoriteGameInput?.value || "",
            discoverable: discoverableInput ? discoverableInput.checked : true,
            links: collectLinkRows(doc),
            profileMusicPlaylist: musicEditor.getPendingPlaylist(),
            mainSqueezeMode: mainSqueezeModeInput?.value || "manual",
            mainSqueezePlayerId: mainSqueezePlayerIdInput?.value || "",
            friendRailMode: friendRailModeInput?.value || "auto",
            manualFriendSlotPlayerIds: collectFriendSlotPlayerIds(doc),
        };
        if (pendingAvatarAssetId) {
            patch.avatarAssetId = pendingAvatarAssetId;
        }
        else if (currentProfile.avatarAssetId) {
            patch.avatarAssetId = currentProfile.avatarAssetId;
        }
        patch.backgroundImageUrl = pendingBackgroundImageUrl || currentProfile.backgroundImageUrl || "";
        patch.backgroundStyle = bgStyleInput?.value || currentProfile.backgroundStyle || 'blend';
        const savedProfile = await persistArcadeProfileDetails(storage, patch, {
            ...options,
            apiClient,
        });
        pendingAvatarAssetId = "";
        pendingAvatarUrl = "";
        setAvatarStatus("");
        pendingBackgroundImageUrl = "";
        setBgStatus("");
        render("PLAYER CARD SAVED");
        dispatchProfileUpdatedEvent(doc, "saved", savedProfile);
        if (typeof onSaved === "function") {
            onSaved(savedProfile);
        }
        else {
            closePanel();
        }
    });
    mainSqueezeModeInput?.addEventListener("change", syncRelationshipInputState);
    friendRailModeInput?.addEventListener("change", syncRelationshipInputState);
    doc.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && panel && !panel.hidden) {
            closePanel();
        }
    });
    render("");
    return {
        render,
        openPanel,
        closePanel,
    };
}
