import type { FilePurpose } from '../types/file.types';

export interface FileStorageProvider {
  save(fileId: string, propertyId: string, purpose: FilePurpose, buffer: Buffer, ext: string): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}
