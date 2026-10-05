import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { FilePurpose } from '../types/file.types';
import type { FileStorageProvider, StoredFilePurgeTarget } from './file-storage.provider';
import { purgeLocalFileVerified } from './verified-local-file-purge';

@Injectable()
export class LocalFileStorage implements FileStorageProvider {
  private readonly rootPath: string;

  constructor(config: ConfigService) {
    this.rootPath = resolve(config.getOrThrow<string>('upload.storagePath'));
  }

  async save(
    fileId: string,
    propertyId: string,
    purpose: FilePurpose,
    buffer: Buffer,
    ext: string,
  ): Promise<string> {
    const storagePath = [propertyId, purpose, `${fileId}.${ext}`].join('/');
    const absolutePath = this.resolveStoragePath(storagePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: 'wx' });
    return storagePath;
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(this.resolveStoragePath(storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await unlink(this.resolveStoragePath(storagePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const absolutePath = this.resolveStoragePath(storagePath);
    // A missing/unreadable storage root is uncertainty, not absence of a file.
    const root = await lstat(this.rootPath);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Storage root unavailable');
    await access(this.rootPath);
    try {
      await access(absolutePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Also guard a root disappearing after the initial successful check.
        await access(this.rootPath);
        return false;
      }
      throw error;
    }
  }

  async purgeVerified(target: StoredFilePurgeTarget) {
    return purgeLocalFileVerified(this.rootPath, target);
  }

  private resolveStoragePath(storagePath: string): string {
    const absolutePath = resolve(join(this.rootPath, storagePath));
    if (absolutePath !== this.rootPath && !absolutePath.startsWith(`${this.rootPath}${sep}`)) {
      throw new Error('Resolved upload path escapes storage root');
    }
    return absolutePath;
  }
}
