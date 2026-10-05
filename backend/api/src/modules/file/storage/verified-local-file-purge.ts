import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FILE_PURPOSES } from '../constants/file.constants';
import type { StoredFilePurgeTarget, VerifiedFilePurgeResult } from './file-storage.provider';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const samePath = (first: string, second: string) => process.platform === 'win32'
  ? resolve(first).toLowerCase() === resolve(second).toLowerCase() : resolve(first) === resolve(second);
const pathInvalid = (): VerifiedFilePurgeResult => ({ state: 'failed', code: 'FILE_PURGE_PATH_INVALID', availability: 'unknown' });
const changed = (): VerifiedFilePurgeResult => ({ state: 'failed', code: 'FILE_PURGE_CONTENT_CHANGED', availability: 'present' });
const missing = (): VerifiedFilePurgeResult => ({ state: 'deleted', verifiedAbsent: true, freedBytes: 0 });
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Called only with a durable, exclusive database claim; never with an operator-supplied path. */
export async function purgeLocalFileVerified(rootPath: string, target: StoredFilePurgeTarget): Promise<VerifiedFilePurgeResult> {
  if (!uuid.test(target.id) || !uuid.test(target.propertyId) || !FILE_PURPOSES.includes(target.purpose)
    || !['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(target.extension)
    || !Number.isSafeInteger(target.sizeBytes) || target.sizeBytes <= 0 || target.sizeBytes > 10 * 1024 * 1024
    || !/^[a-f0-9]{64}$/i.test(target.checksumSha256)
    || target.storagePath !== `${target.propertyId}/${target.purpose}/${target.id}.${target.extension}`) return pathInvalid();
  try {
    // A missing/unreadable storage root is an outage, not evidence of deletion.
    const root = await realpath(rootPath);
    const segments = target.storagePath.split('/');
    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      const next = join(parent, segment);
      try {
        const info = await lstat(next);
        if (!info.isDirectory() || info.isSymbolicLink() || !samePath(await realpath(next), next)) return pathInvalid();
      } catch (error) { if (isMissing(error)) return missing(); throw error; }
      parent = next;
    }
    const absolute = join(parent, segments.at(-1)!);
    let before;
    try { before = await lstat(absolute); } catch (error) { if (isMissing(error)) return missing(); throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !samePath(await realpath(absolute), absolute)) return pathInvalid();
    if (before.size !== target.sizeBytes) return changed();
    const bytes = await readFile(absolute);
    if (createHash('sha256').update(bytes).digest('hex') !== target.checksumSha256.toLowerCase()) return changed();
    const checked = await lstat(absolute);
    if (checked.dev !== before.dev || checked.ino !== before.ino || checked.size !== before.size
      || checked.nlink !== 1 || !checked.isFile() || checked.isSymbolicLink()) return changed();
    let removed = true;
    try { await unlink(absolute); } catch (error) { if (isMissing(error)) removed = false; else throw error; }
    try { await lstat(absolute); return { state: 'retry_pending', code: 'FILE_PURGE_STORAGE_UNVERIFIED', availability: 'unknown' }; }
    catch (error) {
      if (isMissing(error)) return { state: 'deleted', verifiedAbsent: true, freedBytes: removed ? target.sizeBytes : 0 };
      throw error;
    }
  } catch {
    // EACCES, I/O and timeouts must never masquerade as ENOENT.
    return { state: 'retry_pending', code: 'FILE_PURGE_STORAGE_UNVERIFIED', availability: 'unknown' };
  }
}
