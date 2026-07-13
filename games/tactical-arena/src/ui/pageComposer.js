export async function composePage({
  root = document,
  fetchImpl = fetch,
} = {}) {
  const slots = [...root.querySelectorAll("[data-fragment-src]")];
  const baseUrl = root.baseURI ?? document.baseURI;

  const fragments = await Promise.all(slots.map(async (slot) => {
    const source = slot.dataset.fragmentSrc;
    const url = new URL(source, baseUrl);
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Unable to load page fragment "${source}" (HTTP ${response.status}).`);
    }
    return { slot, markup: await response.text() };
  }));

  for (const { slot, markup } of fragments) {
    slot.insertAdjacentHTML("beforebegin", markup);
    slot.remove();
  }
}

