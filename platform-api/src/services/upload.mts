import { v2 as cloudinary } from "cloudinary";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/wav"]);
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export function createUploadService(config: any = {}) {
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
    async uploadImage(buffer: Buffer, { folder = "uploads", maxWidth = 1200, mimeType = "" }: any = {}): Promise<any> {
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return { ok: false, error: "unsupported_file_type" };
      }

      if (buffer.length > MAX_BYTES) {
        return { ok: false, error: "file_too_large" };
      }

      try {
        const result = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              transformation: [{ width: maxWidth, crop: "limit" }],
              resource_type: "image",
            },
            (error: any, result: any) => {
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

    async uploadAudio(buffer: Buffer, { folder = "uploads/music", mimeType = "" }: any = {}): Promise<any> {
      if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
        return { ok: false, error: "unsupported_file_type" };
      }

      if (buffer.length > MAX_AUDIO_BYTES) {
        return { ok: false, error: "file_too_large" };
      }

      try {
        const result = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "raw" },
            (error: any, result: any) => {
              if (error) reject(error);
              else resolve(result);
            },
          );
          stream.end(buffer);
        });

        return { ok: true, url: result.secure_url };
      } catch {
        return { ok: false, error: "upload_failed" };
      }
    },
  };
}
