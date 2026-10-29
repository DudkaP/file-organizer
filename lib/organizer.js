import { EventEmitter } from 'events';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

export const categories = {
  Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
  Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
  Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
  Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
  Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
  Other: []
};

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

export class Organizer extends EventEmitter {
  getCategory(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return 'Other';
  }

  async resolveConflictPath(targetDir, fileName) {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let candidatePath = path.join(targetDir, fileName);
    let counter = 1;

    while (true) {
      try {
        await fsPromises.access(candidatePath);
        candidatePath = path.join(targetDir, `${baseName}(${counter})${ext}`);
        counter += 1;
      } catch (error) {
        if (error.code === 'ENOENT') {
          return candidatePath;
        }
        throw error;
      }
    }
  }

  async copySingleFile(sourcePath, targetPath, fileSize) {
    if (fileSize >= LARGE_FILE_THRESHOLD) {
      await pipeline(
        fs.createReadStream(sourcePath),
        fs.createWriteStream(targetPath)
      );
    } else {
      await fsPromises.copyFile(sourcePath, targetPath);
    }
  }

  async organize(sourceDir, targetDir) {
    try {
      const sourceStats = await fsPromises.stat(sourceDir);
      if (!sourceStats.isDirectory()) {
        const error = new Error(`Not a directory: ${sourceDir}`);
        error.code = 'ENOTDIR';
        throw error;
      }

      this.emit('organize-start', { sourceDir, targetDir });

      const resolvedTarget = path.resolve(targetDir);
      const entries = await fsPromises.readdir(sourceDir, { recursive: true });
      const fileEntries = [];

      for (const entry of entries) {
        const fullPath = path.join(sourceDir, entry);
        const resolvedFull = path.resolve(fullPath);

        if (
          resolvedFull === resolvedTarget ||
          resolvedFull.startsWith(resolvedTarget + path.sep)
        ) {
          continue;
        }

        try {
          const stats = await fsPromises.stat(fullPath);
          if (stats.isFile()) {
            fileEntries.push({
              fullPath,
              fileName: path.basename(fullPath),
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

      const categoryCounts = {};
      for (const category of Object.keys(categories)) {
        const categoryPath = path.join(targetDir, category);
        await fsPromises.mkdir(categoryPath, { recursive: true });
        categoryCounts[category] = 0;
        this.emit('folder-created', { category, path: categoryPath });
      }

      const totalFiles = fileEntries.length;
      let totalCopied = 0;
      let totalSize = 0;

      for (let i = 0; i < totalFiles; i++) {
        const file = fileEntries[i];
        const category = this.getCategory(file.fullPath);
        const categoryDir = path.join(targetDir, category);

        try {
          const targetPath = await this.resolveConflictPath(categoryDir, file.fileName);

          this.emit('copy-start', {
            sourcePath: file.fullPath,
            targetPath,
            category,
            size: file.size,
            current: i + 1,
            total: totalFiles
          });

          await this.copySingleFile(file.fullPath, targetPath, file.size);

          categoryCounts[category] += 1;
          totalCopied += 1;
          totalSize += file.size;

          this.emit('copy-complete', {
            sourcePath: file.fullPath,
            targetPath,
            category,
            size: file.size,
            current: i + 1,
            total: totalFiles
          });
        } catch (err) {
          this.emit('copy-error', {
            sourcePath: file.fullPath,
            category,
            error: err,
            current: i + 1,
            total: totalFiles
          });
        }
      }

      const summary = {
        sourceDir,
        targetDir,
        categoryCounts,
        totalCopied,
        totalSize
      };

      this.emit('organize-complete', summary);
      return summary;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`❌ Error: Directory not found: ${sourceDir}`);
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.error(`❌ Error: Permission denied: ${error.path || sourceDir}`);
      } else if (error.code === 'ENOTDIR') {
        console.error(`❌ Error: Path is not a directory: ${sourceDir}`);
      } else if (error.code === 'ENOSPC') {
        console.error(`❌ Error: No space left on device: ${targetDir}`);
      } else {
        console.error(`❌ Unexpected error: ${error.message}`);
      }
      process.exit(1);
    }
  }
}

export default Organizer;
