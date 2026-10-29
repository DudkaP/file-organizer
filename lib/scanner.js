import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

export class Scanner extends EventEmitter {
  async scan(directory) {
    try {
      const dirStats = await fs.stat(directory);
      if (!dirStats.isDirectory()) {
        const error = new Error(`Not a directory: ${directory}`);
        error.code = 'ENOTDIR';
        throw error;
      }

      this.emit('scan-start', { directory });

      const entries = await fs.readdir(directory, { recursive: true });
      const fileEntries = [];

      for (const entry of entries) {
        const fullPath = path.join(directory, entry);
        try {
          const stats = await fs.stat(fullPath);
          if (stats.isFile()) {
            fileEntries.push({ fullPath, relativePath: entry, stats });
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
      let totalSize = 0;
      const byType = new Map();
      const fileAge = {
        last7Days: 0,
        last30Days: 0,
        olderThan90Days: 0
      };
      const allFiles = [];
      let oldestFile = null;
      const now = Date.now();

      for (let i = 0; i < totalFiles; i++) {
        const { fullPath, relativePath, stats } = fileEntries[i];
        const size = stats.size;
        const mtime = stats.mtime;
        const ext = path.extname(fullPath).toLowerCase() || '(other)';
        const fileName = path.basename(fullPath);

        totalSize += size;

        if (!byType.has(ext)) {
          byType.set(ext, { count: 0, totalSize: 0 });
        }
        const typeData = byType.get(ext);
        typeData.count += 1;
        typeData.totalSize += size;

        const ageMs = now - mtime.getTime();
        const daysOld = ageMs / (1000 * 60 * 60 * 24);

        if (daysOld <= 7) {
          fileAge.last7Days += 1;
        }
        if (daysOld <= 30) {
          fileAge.last30Days += 1;
        }
        if (daysOld > 90) {
          fileAge.olderThan90Days += 1;
        }

        const fileInfo = {
          path: fullPath,
          relativePath,
          name: fileName,
          size,
          mtime,
          daysOld: Math.floor(daysOld)
        };

        allFiles.push(fileInfo);

        if (!oldestFile || mtime.getTime() < oldestFile.mtime.getTime()) {
          oldestFile = fileInfo;
        }

        this.emit('file-found', {
          ...fileInfo,
          current: i + 1,
          total: totalFiles
        });
      }

      const largestFiles = allFiles
        .slice()
        .sort((a, b) => b.size - a.size)
        .slice(0, 3);

      const sortedByType = new Map(
        [...byType.entries()].sort((a, b) => {
          if (a[0] === '(other)') return 1;
          if (b[0] === '(other)') return -1;
          return b[1].totalSize - a[1].totalSize;
        })
      );

      const statistics = {
        directory,
        totalFiles,
        totalSize,
        byType: sortedByType,
        fileAge,
        largestFiles,
        oldestFile
      };

      this.emit('scan-complete', statistics);
      return statistics;
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

export default Scanner;
