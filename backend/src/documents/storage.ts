import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  providerName(): "local" | "r2";
}

class LocalStorage implements Storage {
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private fullPath(key: string): string {
    return path.join(this.root, key);
  }

  providerName(): "local" {
    return "local";
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const fp = this.fullPath(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.fullPath(key));
    } catch {
      // ignore
    }
  }

  async signedDownloadUrl(key: string, _ttlSeconds: number): Promise<string> {
    return `/api/documents/raw/${encodeURIComponent(key)}`;
  }
}

class R2Storage implements Storage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = env.R2_BUCKET;
  }

  providerName(): "r2" {
    return "r2";
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const resp = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await resp.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;
  if (env.STORAGE_PROVIDER === "r2") {
    logger.info("Storage: Cloudflare R2");
    _storage = new R2Storage();
  } else {
    logger.info(`Storage: local filesystem (${env.LOCAL_UPLOAD_DIR})`);
    _storage = new LocalStorage(env.LOCAL_UPLOAD_DIR);
  }
  return _storage;
}
