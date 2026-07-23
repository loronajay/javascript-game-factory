import busboy from "busboy";
// Credentialed CORS is only granted to allow-listed origins. Reflecting an
// arbitrary Origin together with access-control-allow-credentials would let any
// website make authenticated cross-origin requests as a logged-in user and read
// the responses. The live frontend origin plus any localhost dev origin are
// allowed by default; extra origins can be added via ALLOWED_ORIGINS (comma list).
const DEFAULT_ALLOWED_ORIGINS = ["https://loronajay.github.io"];
function configuredAllowedOrigins() {
    const raw = typeof process.env.ALLOWED_ORIGINS === "string" ? process.env.ALLOWED_ORIGINS : "";
    const extra = raw.split(",").map((value) => value.trim()).filter(Boolean);
    return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}
function isAllowedOrigin(origin) {
    if (!origin) return false;
    if (configuredAllowedOrigins().has(origin)) return true;
    try {
        const { hostname } = new URL(origin);
        return hostname === "localhost" || hostname === "127.0.0.1";
    }
    catch {
        return false;
    }
}
export function applyCorsHeaders(res, requestOrigin) {
    const origin = typeof requestOrigin === "string" ? requestOrigin : "";
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("access-control-allow-credentials", "true");
        res.setHeader("vary", "Origin");
    }
    else if (!origin) {
        // Non-browser / same-origin callers (no Origin header): wildcard, never with credentials.
        res.setHeader("access-control-allow-origin", "*");
    }
    else {
        // A browser origin that is not allow-listed: do not echo it and do not grant
        // credentials, so the browser blocks any cross-origin credentialed read.
        res.setHeader("vary", "Origin");
    }
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, authorization");
}
export function writeJson(res, statusCode, payload, requestOrigin) {
    res.statusCode = statusCode;
    applyCorsHeaders(res, requestOrigin);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
}
export async function readJsonBody(req) {
    const chunks = [];
    try {
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
    }
    catch {
        return { ok: false, error: "invalid_body" };
    }
    if (chunks.length === 0) {
        return { ok: true, value: {} };
    }
    try {
        return {
            ok: true,
            value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        };
    }
    catch {
        return { ok: false, error: "invalid_json" };
    }
}
export function readMultipartFile(req) {
    return new Promise((resolve) => {
        const contentType = req.headers?.["content-type"] || "";
        if (!contentType.startsWith("multipart/form-data")) {
            resolve({ ok: false, error: "not_multipart" });
            return;
        }
        let bb;
        try {
            bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
        }
        catch {
            resolve({ ok: false, error: "invalid_multipart" });
            return;
        }
        let fileBuffer = null;
        let mimeType = "";
        let fileSizeLimitHit = false;
        bb.on("file", (_fieldname, fileStream, info) => {
            mimeType = info.mimeType || "";
            const chunks = [];
            fileStream.on("data", (chunk) => chunks.push(chunk));
            fileStream.on("limit", () => { fileSizeLimitHit = true; fileStream.resume(); });
            fileStream.on("end", () => {
                if (!fileSizeLimitHit) {
                    fileBuffer = Buffer.concat(chunks);
                }
            });
        });
        bb.on("finish", () => {
            if (fileSizeLimitHit) {
                resolve({ ok: false, error: "file_too_large" });
            }
            else if (!fileBuffer) {
                resolve({ ok: false, error: "no_file" });
            }
            else {
                resolve({ ok: true, buffer: fileBuffer, mimeType });
            }
        });
        bb.on("error", () => resolve({ ok: false, error: "multipart_parse_error" }));
        req.pipe(bb);
    });
}
