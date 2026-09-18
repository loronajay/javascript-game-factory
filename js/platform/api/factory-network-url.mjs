// Where the real-time server lives. Every cabinet with an online mode carries a
// copy of this rule in its own scripts; platform code that needs the socket
// (the arcade room's presence layer) reads it from here instead.
export const FACTORY_NETWORK_PROD_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";
function isLocalHostname(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
export function resolveFactoryNetworkUrl(locationLike = globalThis.location) {
    const protocol = typeof locationLike?.protocol === "string" ? locationLike.protocol : "";
    const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
    if (isLocalHostname(hostname)) {
        const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
        return `${wsProtocol}//${hostname}:${LOCAL_WS_PORT}`;
    }
    return FACTORY_NETWORK_PROD_URL;
}
