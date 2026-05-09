export function normalizeFriendNavigatorQuery(value) {
  return String(value || "").trim().toLowerCase();
}

export function applyFriendNavigatorFilter(doc, query = "") {
  const normalizedQuery = normalizeFriendNavigatorQuery(query);
  const searchInput = doc?.getElementById?.("meFriendsSearchInput");
  if (searchInput && searchInput.value !== query) {
    searchInput.value = query;
  }

  const items = Array.from(doc?.querySelectorAll?.("[data-friend-navigator-item]") || []);
  let visibleCount = 0;
  items.forEach((item) => {
    const searchText = String(item?.dataset?.friendSearchText || "").toLowerCase();
    const isMatch = !normalizedQuery || searchText.includes(normalizedQuery);
    item.hidden = !isMatch;
    if (isMatch) visibleCount += 1;
  });

  const emptyState = doc?.getElementById?.("meFriendsSearchEmpty");
  if (emptyState) {
    emptyState.hidden = items.length === 0 || visibleCount > 0;
  }
}

export function createFriendNavigatorController({
  initialExpanded = false,
  initialSearchQuery = "",
} = {}) {
  let expanded = !!initialExpanded;
  let searchQuery = typeof initialSearchQuery === "string" ? initialSearchQuery : "";

  return {
    getViewState() {
      return {
        expanded,
        searchQuery,
      };
    },
    toggleExpanded() {
      expanded = !expanded;
      return expanded;
    },
    setSearchQuery(value = "") {
      searchQuery = typeof value === "string" ? value : "";
      return searchQuery;
    },
    applyFilter(doc) {
      applyFriendNavigatorFilter(doc, searchQuery);
    },
  };
}
