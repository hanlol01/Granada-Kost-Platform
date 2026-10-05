import type { FilePurpose } from '../types/file.types';

export type StoredFilePurgeTarget = {
  id: string; propertyId: string; purpose: FilePurpose; extension: string;
  storagePath: string; sizeBytes: number; checksumSha256: string;
};
export type VerifiedFilePurgeResult =
  | { state: 'deleted'; verifiedAbsent: true; freedBytes: number }
  | { state: 'failed'; code: 'FILE_PURGE_PATH_INVALID' | 'FILE_PURGE_CONTENT_CHANGED'; availability: 'present' | 'unknown' }
  | { state: 'retry_pending'; code: 'FILE_PURGE_STORAGE_UNVERIFIED'; availability: 'unknown' };

export interface FileStorageProvider {
  save(fileId: string, propertyId: string, purpose: FilePurpose, buffer: Buffer, ext: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
  /** No fallback to delete()/exists(): providers must positively verify absence. */
  purgeVerified?(target: StoredFilePurgeTarget): Promise<VerifiedFilePurgeResult>;
}
