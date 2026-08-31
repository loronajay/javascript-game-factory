// Same policy as Mini Hoops: Fisher-Yates once per cabinet boot, then repeat that
// complete order. Rematches, mute and pause never create a new playlist.
export function shuffle(ids, random = Math.random) {
    const order = [...ids];
    for (let at = order.length - 1; at > 0; at--) {
        const swap = Math.floor(random() * (at + 1));
        [order[at], order[swap]] = [order[swap], order[at]];
    }
    return order;
}
export function createPlaylist({ ids = [], random = Math.random } = {}) {
    const order = shuffle(ids, random);
    let at = 0;
    return {
        order: () => [...order],
        current: () => order[at] ?? null,
        advance() {
            if (!order.length)
                return null;
            at = (at + 1) % order.length;
            return order[at];
        },
    };
}
