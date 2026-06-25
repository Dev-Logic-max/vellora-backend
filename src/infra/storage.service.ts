import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/configuration';

export interface SignedUpload {
  /** PUT/POST target the client uploads the file bytes to. */
  url: string;
  /** Object path to persist on the document row. */
  storageKey: string;
  /** Opaque token some Supabase upload flows require. */
  token?: string;
}

/**
 * Private-bucket file access via Supabase Storage. Files are NEVER public — the
 * client gets a short-lived SIGNED upload URL to push bytes, and signed
 * download URLs (permission-checked upstream) to read them.
 *
 * Degrades gracefully without SUPABASE_URL + service-role key: returns a local
 * dev stub URL so the API contract holds and the frontend flow is testable.
 */
export interface PublicUpload extends SignedUpload {
  /** The permanent public URL the image is reachable at after upload. */
  publicUrl: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client?: SupabaseClient;
  private readonly bucket: string;
  private readonly publicBucket: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('supabase.url', { infer: true });
    const key = config.get('supabase.serviceRoleKey', { infer: true });
    this.bucket = config.get('supabase.docsBucket', { infer: true });
    this.publicBucket = config.get('supabase.publicBucket', { infer: true });
    if (url && key) {
      this.client = createClient(url, key, { auth: { persistSession: false } });
    } else {
      this.logger.warn('Supabase storage not configured — using local dev stub URLs.');
    }
  }

  /**
   * Signed upload to the PUBLIC bucket (company banner/logo, avatars). Unlike the
   * docs bucket these are world-readable via a stable `publicUrl`, so we return
   * that alongside the signed upload target. Degrades to a dev stub when storage
   * isn't configured. `prefix` groups objects (e.g. "company/<id>").
   */
  async createPublicImageUpload(prefix: string, filename: string): Promise<PublicUpload> {
    const storageKey = this.buildKey(prefix, filename);
    if (!this.client) {
      const stub = `/dev-storage/public/${encodeURIComponent(storageKey)}`;
      return { url: stub, storageKey, publicUrl: stub };
    }
    const { data, error } = await this.client.storage
      .from(this.publicBucket)
      .createSignedUploadUrl(storageKey);
    if (error || !data) {
      throw new InternalServerErrorException(`Storage upload URL failed: ${error?.message}`);
    }
    const { data: pub } = this.client.storage.from(this.publicBucket).getPublicUrl(storageKey);
    return { url: data.signedUrl, storageKey, token: data.token, publicUrl: pub.publicUrl };
  }

  get enabled(): boolean {
    return Boolean(this.client);
  }

  /** A unique object path under the tenant prefix. */
  buildKey(companyId: string, filename: string): string {
    const safe = filename.replace(/[^\w.-]+/g, '_').slice(0, 120);
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `${companyId}/${stamp}-${safe}`;
  }

  /** Signed URL the client uses to upload bytes directly to the private bucket. */
  async createSignedUpload(companyId: string, filename: string): Promise<SignedUpload> {
    const storageKey = this.buildKey(companyId, filename);
    if (!this.client) {
      return { url: `/dev-storage/upload/${encodeURIComponent(storageKey)}`, storageKey };
    }
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storageKey);
    if (error || !data) {
      throw new InternalServerErrorException(`Storage upload URL failed: ${error?.message}`);
    }
    return { url: data.signedUrl, storageKey, token: data.token };
  }

  /** Short-lived signed download URL (default 5 min). */
  async createSignedDownload(storageKey: string, expiresIn = 300): Promise<string> {
    if (!this.client) return `/dev-storage/download/${encodeURIComponent(storageKey)}`;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, expiresIn);
    if (error || !data) {
      throw new InternalServerErrorException(`Storage download URL failed: ${error?.message}`);
    }
    return data.signedUrl;
  }

  /** Server-side copy (used to store a signed-document copy). Best-effort in stub mode. */
  async copy(from: string, to: string): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.storage.from(this.bucket).copy(from, to);
    if (error) this.logger.warn(`Storage copy failed: ${error.message}`);
  }

  async remove(storageKeys: string[]): Promise<void> {
    if (!this.client || storageKeys.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(storageKeys);
    if (error) this.logger.warn(`Storage remove failed: ${error.message}`);
  }
}
