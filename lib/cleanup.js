import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export class Cleanup extends EventEmitter {
  async cleanup(directory, optionsOrThreshold = 90, confirmArg = false) {
    let threshold = 90;
    let confirm = false;

    if (typeof optionsOrThreshold === 'object' && optionsOrThreshold !== null) {
      threshold = Number(optionsOrThreshold.olderThan ?? optionsOrThreshold.threshold ?? 90);
      confirm = Boolean(optionsOrThreshold.confirm);
    } else {
      threshold = Number(optionsOrThreshold);
      confirm = Boolean(confirmArg);
    }

    try {
      const dirStats = await fs.stat(directory);
      if (!dirStats.isDirectory()) {
        const error = new Error(`Not a directory: ${directory}`);
        error.code = 'ENOTDIR';
        throw error;
      }

      this.emit('cleanup-start', { directory, threshold, confirm });

      const entries = await fs.readdir(directory, { recursive: true });
      const filesToDelete = [];
      let totalSize = 0;

      for (const entry of entries) {
        const fullPath = path.join(directory, entry);
        try {
          const stats = await fs.stat(fullPath);
          if (!stats.isFile()) {
            continue;
          }

          const fileAge = Date.now() - stats.mtime.getTime();
          const daysOld = fileAge / (1000 * 60 * 60 * 24);

          if (daysOld > threshold) {
            const fileData = {
              path: fullPath,
              relativePath: entry,
              name: path.basename(fullPath),
              size: stats.size,
              mtime: stats.mtime,
              daysOld: Math.floor(daysOld),
              modifiedDate: stats.mtime.toISOString().split('T')[0]
            };

            filesToDelete.push(fileData);
            totalSize += stats.size;
            this.emit('file-found', fileData);
          }
        } catch (err) {
          if (err.code === 'ENOENT') {
            continue;
          } else if (err.code === 'EACCES' || err.code === 'EPERM') {
            console.error(`\n❌ Error: Permission denied: ${fullPath}`);
          } else {
            console.error(`\n❌ Unexpected error reading ${fullPath}: ${err.message}`);
          }
        }
      }

      this.emit('files-scanned', {
        directory,
        threshold,
        confirm,
        filesToDelete,
        totalSize
      });

      let deletedCount = 0;
      let freedSize = 0;

      if (confirm && filesToDelete.length > 0) {
        this.emit('delete-start', {
          totalFiles: filesToDelete.length,
          totalSize
        });

        for (let i = 0; i < filesToDelete.length; i++) {
          const file = filesToDelete[i];
          try {
            await fs.unlink(file.path);
            deletedCount += 1;
            freedSize += file.size;

            this.emit('file-deleted', {
              ...file,
              current: i + 1,
              total: filesToDelete.length
            });
          } catch (err) {
            if (err.code === 'ENOENT') {
              console.error(`\n❌ Error: File not found: ${file.path}`);
            } else if (err.code === 'EACCES' || err.code === 'EPERM') {
              console.error(`\n❌ Error: Permission denied: ${file.path}`);
            } else {
              console.error(`\n❌ Unexpected error deleting ${file.path}: ${err.message}`);
            }
          }
        }
      }

      const result = {
        directory,
        threshold,
        confirm,
        filesToDelete,
        totalFiles: filesToDelete.length,
        totalSize,
        deletedCount,
        freedSize
      };

      this.emit('cleanup-complete', result);
      return result;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`❌ Error: Directory not found: ${directory}`);
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.error(`❌ Error: Permission denied: ${directory}`);
      } else if (error.code === 'ENOTDIR') {
        console.error(`❌ Error: Path is not a directory: ${directory}`);
      } else {
        console.error(`❌ Unexpected error: ${error.message}`);
      }
      process.exit(1);
    }
  }
}

export default Cleanup;
