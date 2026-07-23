import { v2 as cloudinary } from "cloudinary";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/wav"]);
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
// Content-sniffing by magic bytes. The multipart mimeType is client-supplied and cannot be
// trusted — especially for audio, which Cloudinary stores as raw. These verify the bytes are
// actually one of the allowed formats before anything is uploaded.
function sniffImageMime(buffer) {
    if (buffer.length < 12) return "";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
    return "";
}
function sniffAudioMime(buffer) {
    if (buffer.length < 12) return "";
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "audio/ogg";
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) return "audio/wav";
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "audio/mpeg"; // ID3-tagged MP3
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg"; // MPEG audio frame sync
    return "";
}
export function createUploadService(config = {}) {
    const { cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret } = config;
    if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
        return null;
    }
    cloudinary.config({
        cloud_name: cloudinaryCloudName,
        api_key: cloudinaryApiKey,
        api_secret: cloudinaryApiSecret,
    });
    return {
        async uploadImage(buffer, { folder = "uploads", maxWidth = 1200, mimeType = "" } = {}) {
            // Validate by CONTENT, not the client-declared mimeType, then require the two to agree.
            const sniffed = sniffImageMime(buffer);
            if (!ALLOWED_MIME_TYPES.has(sniffed) || (mimeType && sniffed !== mimeType)) {
                return { ok: false, error: "unsupported_file_type" };
            }
            if (buffer.length > MAX_BYTES) {
                return { ok: false, error: "file_too_large" };
            }
            try {
                const result = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({
                        folder,
                        transformation: [{ width: maxWidth, crop: "limit" }],
                        resource_type: "image",
                    }, (error, result) => {
                        if (error)
                            reject(error);
                        else
                            resolve(result);
                    });
                    stream.end(buffer);
                });
                return {
                    ok: true,
                    assetId: result.public_id,
                    url: result.secure_url,
                };
            }
            catch {
                return { ok: false, error: "upload_failed" };
            }
        },
        async uploadAudio(buffer, { folder = "uploads/music", mimeType = "" } = {}) {
            // Audio is stored as Cloudinary `raw`, so content sniffing is the only real gate against
            // arbitrary files being hosted under the account. Validate bytes, then require agreement.
            const sniffed = sniffAudioMime(buffer);
            if (!ALLOWED_AUDIO_MIME_TYPES.has(sniffed) || (mimeType && sniffed !== mimeType)) {
                return { ok: false, error: "unsupported_file_type" };
            }
            if (buffer.length > MAX_AUDIO_BYTES) {
                return { ok: false, error: "file_too_large" };
            }
            try {
                const result = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "raw" }, (error, result) => {
                        if (error)
                            reject(error);
                        else
                            resolve(result);
                    });
                    stream.end(buffer);
                });
                return { ok: true, url: result.secure_url };
            }
            catch {
                return { ok: false, error: "upload_failed" };
            }
        },
    };
}
