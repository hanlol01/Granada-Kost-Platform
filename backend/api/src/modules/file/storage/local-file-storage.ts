import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { FilePurpose } from '../types/file.types';
import type { FileStorageProvider } from './file-storage.provider';

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
    try {
      await access(this.resolveStoragePath(storagePath));
      return true;
    } catch {
      return false;
    }
  }

  private resolveStoragePath(storagePath: string): string {
    const absolutePath = resolve(join(this.rootPath, storagePath));
    if (absolutePath !== this.rootPath && !absolutePath.startsWith(`${this.rootPath}${sep}`)) {
      throw new Error('Resolved upload path escapes storage root');
    }
    return absolutePath;
  }
}
