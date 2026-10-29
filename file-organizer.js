import path from 'path';
import { fileURLToPath } from 'url';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export function drawProgressBar(current, total, width = 20) {
  if (total === 0) {
    return `${'█'.repeat(width)} 0/0`;
  }
  const percentage = current / total;
  const filled = Math.round(percentage * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

function printHelp() {
  console.log(`Usage: node file-organizer.js <command> [options]

Commands:
  scan <directory>                                      Scan directory and show statistics
  duplicates <directory>                                Find duplicate files by SHA-256 hash
  organize <sourceDir> --output <targetDir>             Organize files into categories
  cleanup <directory> --older-than <days> [--confirm]   Find and delete old files`);
}

async function runScan(directory) {
  if (!directory) {
    console.error('❌ Error: Please provide a directory path to scan.');
    process.exit(1);
  }

  const scanner = new Scanner();

  scanner.on('scan-start', (data) => {
    console.log(`📂 Scanning: ${data.directory}`);
  });

  scanner.on('file-found', (data) => {
    process.stdout.write(`\rProcessing... ${drawProgressBar(data.current, data.total)} files`);
  });

  scanner.on('scan-complete', (stats) => {
    if (stats.totalFiles === 0) {
      console.log(`Processing... ${drawProgressBar(0, 0)} files`);
    } else {
      console.log('');
    }

    console.log('\n📊 Scan Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}`);

    console.log('\nBy File Type:');
    if (stats.byType.size === 0) {
      console.log('  (none)');
    } else {
      for (const [ext, info] of stats.byType.entries()) {
        const extLabel = ext.padEnd(8, ' ');
        const countLabel = `${info.count} files`.padEnd(11, ' ');
        console.log(`  ${extLabel}${countLabel}${formatSize(info.totalSize)}`);
      }
    }

    console.log('\nFile Age:');
    console.log(`  Last 7 days:    ${stats.fileAge.last7Days} files`);
    console.log(`  Last 30 days:   ${stats.fileAge.last30Days} files`);
    console.log(`  Older than 90:  ${stats.fileAge.olderThan90Days} files`);

    console.log('\nLargest files:');
    if (stats.largestFiles.length === 0) {
      console.log('  (none)');
    } else {
      stats.largestFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name.padEnd(22, ' ')} ${formatSize(file.size)}`);
      });
    }

    if (stats.oldestFile) {
      console.log(`\nOldest file: ${stats.oldestFile.name} (modified ${stats.oldestFile.daysOld} days ago)`);
    } else {
      console.log('\nOldest file: (none)');
    }
  });

  await scanner.scan(directory);
}

async function runDuplicates(directory) {
  if (!directory) {
    console.error('❌ Error: Please provide a directory path to check for duplicates.');
    process.exit(1);
  }

  const finder = new DuplicateFinder();

  finder.on('search-start', (data) => {
    console.log(`🔍 Searching for duplicates in: ${data.directory}`);
  });

  finder.on('file-processed', (data) => {
    process.stdout.write(`\rCalculating hashes... ${drawProgressBar(data.current, data.total)} files`);
  });

  finder.on('duplicates-found', (result) => {
    if (result.totalFiles === 0) {
      console.log(`Calculating hashes... ${drawProgressBar(0, 0)} files`);
    } else {
      console.log('');
    }

    const groupCount = result.duplicateGroups.length;
    console.log(`\nFound ${groupCount} duplicate groups (${formatSize(result.totalWastedSpace)} wasted):\n`);

    result.duplicateGroups.forEach((group, index) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Group ${index + 1} (${group.copies} copies, ${formatSize(group.sizeEach)} each):`);
      console.log(`  SHA-256: ${group.hash}\n`);

      for (const filePath of group.files) {
        console.log(`  📄 ${filePath.replace(/\\/g, '/')}`);
      }

      console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}\n`);
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`💾 Total wasted space: ${formatSize(result.totalWastedSpace)}`);
  });

  await finder.findDuplicates(directory);
}

async function runOrganize(args) {
  let sourceDir = null;
  let targetDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      targetDir = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith('-') && !sourceDir) {
      sourceDir = args[i];
    }
  }

  if (!sourceDir || !targetDir) {
    console.error('❌ Error: Usage: node file-organizer.js organize <sourceDir> --output <targetDir>');
    process.exit(1);
  }

  const organizer = new Organizer();
  let foldersHeaderPrinted = false;

  organizer.on('organize-start', (data) => {
    console.log(`📦 Organizing: ${data.sourceDir}`);
    console.log(`Target: ${data.targetDir}\n`);
  });

  organizer.on('folder-created', (data) => {
    if (!foldersHeaderPrinted) {
      console.log('Creating folders...');
      foldersHeaderPrinted = true;
    }
    console.log(`  ✓ ${data.category}/`);
  });

  organizer.on('copy-start', (data) => {
    if (data.current === 1) {
      console.log('');
    }
    process.stdout.write(`\rCopying files... ${drawProgressBar(data.current - 1, data.total)}`);
  });

  organizer.on('copy-complete', (data) => {
    process.stdout.write(`\rCopying files... ${drawProgressBar(data.current, data.total)}`);
  });

  organizer.on('copy-error', (data) => {
    if (data.error.code === 'ENOENT') {
      console.error(`\n❌ Error: File not found: ${data.sourcePath}`);
    } else if (data.error.code === 'EACCES' || data.error.code === 'EPERM') {
      console.error(`\n❌ Error: Permission denied: ${data.sourcePath}`);
    } else {
      console.error(`\n❌ Unexpected error copying ${data.sourcePath}: ${data.error.message}`);
    }
  });

  organizer.on('organize-complete', (summary) => {
    if (summary.totalCopied === 0) {
      console.log(`\nCopying files... ${drawProgressBar(0, 0)}`);
    } else {
      console.log('');
    }

    console.log('\n✅ Organization complete!\n');
    console.log('Summary:');

    const targetFolderName = path.basename(path.resolve(summary.targetDir));
    for (const [category, count] of Object.entries(summary.categoryCounts)) {
      const catLabel = `${category}:`.padEnd(11, ' ');
      const countLabel = `${count} files`.padStart(9, ' ');
      console.log(`  ${catLabel}${countLabel} → ${targetFolderName}/${category}/`);
    }

    console.log(`\nTotal copied: ${summary.totalCopied} files (${formatSize(summary.totalSize)})`);
  });

  await organizer.organize(sourceDir, targetDir);
}

async function runCleanup(args) {
  let directory = null;
  let olderThan = 90;
  let hasOlderThan = false;
  let confirm = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--older-than') {
      olderThan = Number(args[i + 1]);
      hasOlderThan = true;
      i += 1;
    } else if (args[i] === '--confirm') {
      confirm = true;
    } else if (!args[i].startsWith('-') && !directory) {
      directory = args[i];
    }
  }

  if (!directory) {
    console.error('❌ Error: Usage: node file-organizer.js cleanup <directory> --older-than <days> [--confirm]');
    process.exit(1);
  }

  if (hasOlderThan && (Number.isNaN(olderThan) || olderThan < 0)) {
    console.error('❌ Error: Invalid value for --older-than. Must be a non-negative number of days.');
    process.exit(1);
  }

  const cleaner = new Cleanup();

  cleaner.on('cleanup-start', (data) => {
    console.log(`🧹 Cleanup: ${data.directory}`);
    console.log(`Looking for files older than ${data.threshold} days...\n`);
  });

  cleaner.on('files-scanned', (data) => {
    console.log(`Found ${data.filesToDelete.length} files to delete:\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const previewLimit = 10;
    const displayedFiles = data.filesToDelete.slice(0, previewLimit);

    displayedFiles.forEach((file, index) => {
      console.log(`${file.name}`);
      console.log(`  Size: ${formatSize(file.size)}`);
      console.log(`  Modified: ${file.daysOld} days ago (${file.modifiedDate})`);
      if (index < displayedFiles.length - 1) {
        console.log('');
      }
    });

    if (data.filesToDelete.length > previewLimit) {
      console.log(`\n... (${data.filesToDelete.length - previewLimit} more files)`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!data.confirm) {
      console.log(`Total: ${data.filesToDelete.length} files (${formatSize(data.totalSize)})\n`);
      console.log('⚠️  DRY RUN MODE: No files were deleted.');
      console.log('To actually delete these files, run with --confirm flag.');
    }
  });

  cleaner.on('delete-start', (data) => {
    console.log(`⚠️  DELETING ${data.totalFiles} files (${formatSize(data.totalSize)}). This action cannot be undone!\n`);
  });

  cleaner.on('file-deleted', (data) => {
    process.stdout.write(`\rDeleting... ${drawProgressBar(data.current, data.total)}`);
  });

  cleaner.on('cleanup-complete', (result) => {
    if (result.confirm) {
      if (result.totalFiles > 0) {
        console.log('\n');
      }
      console.log('✅ Cleanup complete!');
      console.log(`Deleted: ${result.deletedCount} files (${formatSize(result.freedSize)} freed)`);
    }
  });

  await cleaner.cleanup(directory, { olderThan, confirm });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case 'scan':
      await runScan(args[1]);
      break;
    case 'duplicates':
      await runDuplicates(args[1]);
      break;
    case 'organize':
      await runOrganize(args.slice(1));
      break;
    case 'cleanup':
      await runCleanup(args.slice(1));
      break;
    default:
      console.error(`❌ Error: Unknown command "${command}"`);
      printHelp();
      process.exit(1);
  }
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  main();
}

