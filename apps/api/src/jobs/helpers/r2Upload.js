import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { env } from '../../config/env.js';

let _client = null;

function isConfigured() {
  return !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.R2_ENDPOINT);
}

function getClient() {
  if (_client) return _client;
  _client = new S3Client({
    endpoint: env.R2_ENDPOINT,
    region: 'auto', // R2 always uses 'auto'
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function buildKey(folder, publicId, resourceType, format) {
  const base = folder ? `${folder}/${publicId}` : publicId;
  if (format)                    return `${base}.${format}`;
  if (resourceType === 'image')  return `${base}.jpg`;
  return base;
}

// Returns the object key — bucket is private, use getSignedFileUrl to serve files
function buildUrl(key) {
  return key;
}

/**
 * Generate a short-lived signed URL for a private R2 object.
 * @param {string} key — R2 object key (as returned by uploadBuffer)
 * @param {number} expiresIn — seconds until expiry (default 900 = 15 min)
 */
export async function getSignedFileUrl(key, expiresIn = 900) {
  if (!isConfigured() || !key) return null;
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn });
}

/**
 * Download an R2 object and return its content as a Buffer.
 * Use this server-side instead of fetch() on a signed URL.
 * @param {string} key — R2 object key
 */
export async function getFileBuffer(key) {
  if (!isConfigured() || !key) return null;
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
  const response = await getClient().send(command);
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Upload a buffer to Cloudflare R2.
 *
 * @param {Buffer} buffer
 * @param {object} options  — folder, public_id, resource_type, format
 * @returns {Promise<{ url: string, publicId: string } | null>}
 */
export async function uploadBuffer(buffer, options = {}) {
  if (!isConfigured()) return null;

  const { folder, public_id, resource_type = 'auto', format } = options;

  let body = buffer;
  let contentType = 'application/octet-stream';
  let contentDisposition = 'inline';

  if (resource_type === 'image' || (resource_type === 'auto' && !format)) {
    body = await sharp(buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    contentType = 'image/jpeg';
  } else if (format === 'pdf' || resource_type === 'raw') {
    contentType = 'application/pdf';
    contentDisposition = `attachment; filename="${public_id}.pdf"`;
  }

  const key = buildKey(folder, public_id, resource_type, format);

  await getClient().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
    CacheControl: 'private, max-age=0',
  }));

  return { url: buildUrl(key), publicId: key };
}

/**
 * Delete a file from Cloudflare R2 by its key (publicId).
 *
 * @param {string} publicId — the full R2 object key returned by uploadBuffer
 */
export async function deleteFile(publicId) {
  if (!isConfigured() || !publicId) return null;
  await getClient().send(new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: publicId,
  }));
}
