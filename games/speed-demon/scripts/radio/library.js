// Getting at the player's music folder.
//
// This is the only module in the cabinet that talks to the file system, and it
// is the only one that is genuinely browser-shaped: there is no way to read a
// folder from a web page without one of two APIs, and they have very different
// shapes.
//
//   File System Access (`showDirectoryPicker`) — Chromium. Hands back a
//     *handle*, which can be stored in IndexedDB and re-opened on a later visit
//     with one permission click. This is the one that makes "set the folder
//     once" actually mean once.
//
//   `<input webkitdirectory>` — everywhere else. Hands back a flat list of
//     File objects and nothing that outlives the page, so the folder has to be
//     re-picked each session.
//
// Both funnel into the same place: a list of `{ name, path, size }` records for
// `tracks.js` to turn into a playlist, plus a private map from track id back to
// whatever this layer needs to read the bytes later. The playlist itself stays
// plain data — no File objects, no handles — so the pure layer above never ends
// up holding something it cannot reason about.

import { buildPlaylist, isPlayableAudio } from "./tracks.js";
import {
  LIBRARY_ERROR,
  LIBRARY_IDLE,
  LIBRARY_LOCKED,
  LIBRARY_READY,
  LIBRARY_SCANNING,
} from "./library-status.js";

// Re-exported so callers that already hold a library never need to know the
// statuses live one module over.
export { LIBRARY_ERROR, LIBRARY_IDLE, LIBRARY_LOCKED, LIBRARY_READY, LIBRARY_SCANNING };

/** Guard rails on the walk, so a folder pointed at a whole drive still returns. */
const MAX_DEPTH = 8;
const MAX_FILES = 4000;

const DB_NAME = "speed-demon-radio";
const STORE = "handles";
const HANDLE_KEY = "musicFolder";

export function supportsDirectoryPicker() {
  return typeof globalThis.showDirectoryPicker === "function";
}

// ---------------------------------------------------------------------------
// Remembering the folder
// ---------------------------------------------------------------------------

/**
 * A directory handle is a structured-cloneable object but not a string, so it
 * cannot live in localStorage — IndexedDB is the only place it fits. Every call
 * resolves rather than rejects: a browser with IndexedDB blocked should lose the
 * convenience of a remembered folder, not the radio.
 */
function openHandleStore() {
  return new Promise((resolve) => {
    if (!globalThis.indexedDB) {
      resolve(null);
      return;
    }
    let request;
    try {
      request = globalThis.indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore(mode, run) {
  return openHandleStore().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const request = run(db.transaction(STORE, mode).objectStore(STORE));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

const loadSavedHandle = () => withStore("readonly", (store) => store.get(HANDLE_KEY));
// Only ever overwritten, never deleted: picking a new folder replaces the old
// one, and there is no "forget my music" affordance to serve a delete.
const saveHandle = (handle) => withStore("readwrite", (store) => store.put(handle, HANDLE_KEY));

// ---------------------------------------------------------------------------
// Walking a folder
// ---------------------------------------------------------------------------

/**
 * Every audio file under `directory`, depth-first, with its path relative to
 * the folder the player chose. Sub-folders are followed because an album folder
 * inside a music folder is the normal shape of a music folder.
 *
 * A directory that cannot be entered is skipped rather than fatal — one
 * unreadable sub-folder must not cost the player the whole playlist.
 */
async function walkDirectory(directory, { prefix = "", depth = 0, found = [] } = {}) {
  if (depth > MAX_DEPTH || found.length >= MAX_FILES) {
    return found;
  }
  for await (const entry of directory.values()) {
    if (found.length >= MAX_FILES) {
      break;
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      try {
        await walkDirectory(entry, { prefix: path, depth: depth + 1, found });
      } catch {
        // Unreadable sub-folder; the rest of the tree is still worth having.
      }
    } else if (isPlayableAudio(entry.name)) {
      found.push({ name: entry.name, path, handle: entry });
    }
  }
  return found;
}

/** The hidden folder input the fallback path uses, built on demand. */
function pickWithInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.webkitdirectory = true;
    input.setAttribute("webkitdirectory", "");
    input.style.display = "none";
    document.body.appendChild(input);

    const done = (files) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? [])), { once: true });
    // Without this a dismissed dialog would leave the library stuck reporting
    // SCANNING forever. Older browsers do not fire it, which is the one case
    // that still hangs — but there is no other signal to hang the recovery on.
    input.addEventListener("cancel", () => done([]), { once: true });
    input.click();
  });
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

/**
 * Owns the chosen folder, the scan, and the object URLs.
 *
 * `onChange` fires whenever the status or the playlist changes, which is how
 * the composition root learns that an async pick finished — nothing here calls
 * back into the game loop directly.
 */
export function createMusicLibrary({ onChange = () => {} } = {}) {
  let status = LIBRARY_IDLE;
  let folderName = null;
  let message = null;
  let tracks = [];
  let directoryHandle = null;

  /** track id -> FileSystemFileHandle (picker path) or File (fallback path). */
  let sources = new Map();

  // Object URLs are minted per track as it becomes current, not for the whole
  // folder at once: a few hundred live blob URLs is a few hundred files the
  // browser cannot release. Two are kept alive so revoking the outgoing track
  // cannot pull the rug from under an element that is still switching to it.
  const urls = new Map();
  const urlOrder = [];

  function announce() {
    onChange({ status, folderName, tracks, message });
  }

  function setStatus(next, detail = null) {
    status = next;
    message = detail;
    announce();
  }

  function releaseUrls() {
    for (const url of urls.values()) {
      URL.revokeObjectURL(url);
    }
    urls.clear();
    urlOrder.length = 0;
  }

  function adopt(entries, name) {
    releaseUrls();
    sources = new Map();
    const files = entries.map((entry) => {
      const record = { name: entry.name, path: entry.path, size: entry.size ?? 0 };
      return record;
    });
    tracks = buildPlaylist(files);
    for (const entry of entries) {
      sources.set(entry.path, entry.handle ?? entry.file);
    }
    folderName = name;
    setStatus(LIBRARY_READY, tracks.length === 0 ? "no playable audio in that folder" : null);
  }

  async function scanHandle(handle) {
    setStatus(LIBRARY_SCANNING);
    try {
      const entries = await walkDirectory(handle);
      directoryHandle = handle;
      adopt(entries, handle.name);
    } catch (error) {
      setStatus(LIBRARY_ERROR, error?.message ?? "could not read that folder");
    }
  }

  /**
   * Permission on a remembered handle. `queryPermission` answers without a
   * prompt, which is what lets a boot-time restore stay silent; `requestPermission`
   * prompts and so may only be called from a user gesture.
   */
  async function permitted(handle, { prompt }) {
    const options = { mode: "read" };
    try {
      if ((await handle.queryPermission?.(options)) === "granted") {
        return true;
      }
      if (!prompt) {
        return false;
      }
      return (await handle.requestPermission?.(options)) === "granted";
    } catch {
      return false;
    }
  }

  return {
    supported: supportsDirectoryPicker(),

    state() {
      return { status, folderName, message, trackCount: tracks.length };
    },

    tracks() {
      return tracks;
    },

    /**
     * Boot-time restore. Silent by design: if the browser wants a prompt, the
     * library parks in LOCKED and the radio screen offers to resume, because a
     * permission dialog nobody asked for on page load is a dialog people click
     * away without reading.
     */
    async restore() {
      if (!supportsDirectoryPicker()) {
        return;
      }
      const handle = await loadSavedHandle();
      if (!handle) {
        return;
      }
      directoryHandle = handle;
      folderName = handle.name;
      if (await permitted(handle, { prompt: false })) {
        await scanHandle(handle);
      } else {
        setStatus(LIBRARY_LOCKED);
      }
    },

    /** Re-opens a remembered folder. Must be called inside a user gesture. */
    async resume() {
      if (!directoryHandle) {
        return;
      }
      if (await permitted(directoryHandle, { prompt: true })) {
        await scanHandle(directoryHandle);
      } else {
        setStatus(LIBRARY_LOCKED, "permission refused");
      }
    },

    /** Opens the folder picker. Must be called inside a user gesture. */
    async pick() {
      if (supportsDirectoryPicker()) {
        let handle;
        try {
          handle = await globalThis.showDirectoryPicker({ id: "speed-demon-music", mode: "read" });
        } catch {
          return; // dismissed — leave whatever was already loaded alone
        }
        await saveHandle(handle);
        await scanHandle(handle);
        return;
      }

      setStatus(LIBRARY_SCANNING);
      const files = await pickWithInput();
      if (files.length === 0) {
        setStatus(tracks.length > 0 ? LIBRARY_READY : LIBRARY_IDLE);
        return;
      }
      const entries = files
        .filter((file) => isPlayableAudio(file.name))
        .map((file) => ({
          name: file.name,
          // webkitRelativePath leads with the chosen folder's own name; dropping
          // it keeps paths comparable with the picker path's relative ones.
          path: (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name,
          size: file.size,
          file,
        }));
      const root = files[0].webkitRelativePath?.split("/")[0] ?? "Music";
      adopt(entries, root);
    },

    /**
     * A playable URL for a track, minted on demand. Returns null when the file
     * has gone — a folder can change under a remembered handle, and a missing
     * track should skip rather than wedge the deck.
     */
    async urlFor(track) {
      if (!track) {
        return null;
      }
      if (urls.has(track.id)) {
        return urls.get(track.id);
      }
      const source = sources.get(track.id);
      if (!source) {
        return null;
      }
      let file;
      try {
        file = typeof source.getFile === "function" ? await source.getFile() : source;
      } catch {
        return null;
      }
      const url = URL.createObjectURL(file);
      urls.set(track.id, url);
      urlOrder.push(track.id);
      while (urlOrder.length > 2) {
        const stale = urlOrder.shift();
        URL.revokeObjectURL(urls.get(stale));
        urls.delete(stale);
      }
      return url;
    },
  };
}
