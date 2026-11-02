/** The harbor's physical noticeboard, using public property visits for online and offline residents. */
export function createIslandResidents(load: (after: string) => Promise<any>, onClose: () => void) {
  const root = document.createElement("aside"); root.className = "inventory-panel"; root.hidden = true; root.id = "islandResidents";
  const header = document.createElement("header"); header.className = "pets-panel__head";
  const title = document.createElement("strong"); title.textContent = "Orchard Isle residents";
  const done = document.createElement("button"); done.className = "farm-button"; done.textContent = "Done";
  header.append(title, done);
  const list = document.createElement("div"); list.className = "properties-panel__body";
  const message = document.createElement("p"); message.setAttribute("aria-live", "polite");
  const more = document.createElement("button"); more.className = "farm-button"; more.textContent = "More residents"; more.hidden = true;
  root.append(header, list, message, more); document.querySelector(".farm-shell")!.append(root);
  let next = "", busy = false;
  async function read(append: boolean) {
    if (busy) return; busy = true; more.disabled = true; message.textContent = "Reading the homestead register…";
    try {
      const result = await load(append ? next : "");
      if (!result || !Array.isArray(result.residents)) throw Error("unavailable");
      if (!append) list.replaceChildren();
      for (const resident of result.residents) {
        const link = document.createElement("a"); link.className = "farm-button"; link.textContent = `Visit ${resident.name}'s island farm`;
        link.href = `../index.html?id=${encodeURIComponent(resident.playerId)}&property=lot.orchard&from=orchard-harbor`;
        list.append(link);
      }
      next = result.next ?? ""; more.hidden = !next;
      message.textContent = list.childElementCount ? "Visit a homestead even when its owner is away. Chat together when you're both there." : "No homesteads yet. Visit the Property Office in Orchard Market to become the first resident.";
    } catch { message.textContent = "The resident register could not be reached. Close it and try again."; }
    finally { busy = false; more.disabled = false; }
  }
  const close = () => { root.hidden = true; onClose(); };
  done.addEventListener("click", close); more.addEventListener("click", () => { void read(true); });
  return { root, close, open: () => { root.hidden = false; document.exitPointerLock?.(); void read(false); } };
}
