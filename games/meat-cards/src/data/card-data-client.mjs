export async function loadCardGameData(fetcher = fetch) {
  const [cardPaths, deckPaths] = await Promise.all([
    fetchJson(fetcher, "/api/card-files"),
    fetchJson(fetcher, "/api/deck-files"),
  ]);
  const [cards, decks] = await Promise.all([
    Promise.all(cardPaths.map((filePath) => fetchJson(fetcher, `/${filePath}`))),
    Promise.all(deckPaths.map((filePath) => fetchJson(fetcher, `/${filePath}`))),
  ]);

  return {
    cards,
    decks,
    cardsById: Object.fromEntries(cards.map((card) => [card.id, card])),
    decksById: Object.fromEntries(decks.map((deck) => [deck.id, deck])),
  };
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: ${response.status}`);
  }
  return response.json();
}
