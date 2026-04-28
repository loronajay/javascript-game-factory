import { v2 as cloudinary } from "cloudinary";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

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
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return { ok: false, error: "unsupported_file_type" };
      }

      if (buffer.length > MAX_BYTES) {
        return { ok: false, error: "file_too_large" };
      }

      try {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              transformation: [{ width: maxWidth, crop: "limit" }],
              resource_type: "image",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          );
          stream.end(buffer);
        });

        return {
          ok: true,
          assetId: result.public_id,
          url: result.secure_url,
        };
      } catch {
        return { ok: false, error: "upload_failed" };
      }
    },
  };
}
