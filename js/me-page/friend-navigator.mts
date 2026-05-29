type DocLike = Document | null | undefined;

export function normalizeFriendNavigatorQuery(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function applyFriendNavigatorFilter(doc: DocLike, query = ""): void {
  const normalizedQuery = normalizeFriendNavigatorQuery(query);
  const searchInput = doc?.getElementById?.("meFriendsSearchInput") as HTMLInputElement | null;
  if (searchInput && searchInput.value !== query) {
    searchInput.value = query;
  }

  const items = Array.from(doc?.querySelectorAll?.("[data-friend-navigator-item]") || []) as HTMLElement[];
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

export interface FriendNavigatorController {
  getViewState(): { expanded: boolean; searchQuery: string };
  toggleExpanded(): boolean;
  setSearchQuery(value?: string): string;
  applyFilter(doc: DocLike): void;
}

export function createFriendNavigatorController({
  initialExpanded = false,
  initialSearchQuery = "",
}: { initialExpanded?: boolean; initialSearchQuery?: string } = {}): FriendNavigatorController {
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
    applyFilter(doc: DocLike) {
      applyFriendNavigatorFilter(doc, searchQuery);
    },
  };
}
