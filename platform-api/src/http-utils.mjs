import busboy from "busboy";

export function applyCorsHeaders(res, requestOrigin) {
  if (requestOrigin) {
    res.setHeader("access-control-allow-origin", requestOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  } else {
    res.setHeader("access-control-allow-origin", "*");
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
  } catch {
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
  } catch {
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
    } catch {
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
      } else if (!fileBuffer) {
        resolve({ ok: false, error: "no_file" });
      } else {
        resolve({ ok: true, buffer: fileBuffer, mimeType });
      }
    });

    bb.on("error", () => resolve({ ok: false, error: "multipart_parse_error" }));
    req.pipe(bb);
  });
}
