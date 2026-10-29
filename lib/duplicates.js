import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async findDuplicates(directory) {
    try {
      const dirStats = await fsPromises.stat(directory);
      if (!dirStats.isDirectory()) {
        const error = new Error(`Not a directory: ${directory}`);
        error.code = 'ENOTDIR';
        throw error;
      }

      this.emit('search-start', { directory });

      const entries = await fsPromises.readdir(directory, { recursive: true });
      const fileEntries = [];

      for (const entry of entries) {
        const fullPath = path.join(directory, entry);
        try {
          const stats = await fsPromises.stat(fullPath);
          if (stats.isFile()) {
            fileEntries.push({
              fullPath,
              displayPath: path.join(path.basename(path.resolve(directory)), entry),
              size: stats.size
            });
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

      const totalFiles = fileEntries.length;
      const hashMap = new Map();
      const sizeMap = new Map();

      for (let i = 0; i < totalFiles; i++) {
        const file = fileEntries[i];
        try {
          const hash = await calculateHash(file.fullPath);

          if (!hashMap.has(hash)) {
            hashMap.set(hash, []);
            sizeMap.set(hash, file.size);
          }
          hashMap.get(hash).push(file.displayPath);

          this.emit('file-processed', {
            path: file.fullPath,
            hash,
            current: i + 1,
            total: totalFiles
          });
        } catch (err) {
          if (err.code === 'ENOENT') {
            console.error(`\n❌ Error: File not found: ${file.fullPath}`);
          } else if (err.code === 'EACCES' || err.code === 'EPERM') {
            console.error(`\n❌ Error: Permission denied: ${file.fullPath}`);
          } else {
            console.error(`\n❌ Unexpected error hashing ${file.fullPath}: ${err.message}`);
          }
        }
      }

      const duplicateGroups = [];
      let totalWastedSpace = 0;

      for (const [hash, filePaths] of hashMap.entries()) {
        if (filePaths.length > 1) {
          const fileSize = sizeMap.get(hash);
          const wastedSpace = fileSize * (filePaths.length - 1);
          totalWastedSpace += wastedSpace;

          duplicateGroups.push({
            hash,
            files: filePaths,
            copies: filePaths.length,
            sizeEach: fileSize,
            wastedSpace
          });
        }
      }

      duplicateGroups.sort((a, b) => b.wastedSpace - a.wastedSpace);

      const result = {
        directory,
        totalFiles,
        duplicateGroups,
        totalWastedSpace
      };

      this.emit('duplicates-found', result);
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

export default DuplicateFinder;
