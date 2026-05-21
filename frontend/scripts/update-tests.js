const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'app');

// Get all spec files recursively
function getSpecFiles(dir, files = []) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          getSpecFiles(fullPath, files);
        } else if (item.endsWith('.spec.ts')) {
          files.push(fullPath);
        }
      } catch (e) {
        // Skip inaccessible files
      }
    }
  } catch (e) {
    console.log(`Cannot read directory: ${dir}`);
  }
  return files;
}

const specFiles = getSpecFiles(srcDir);
console.log(`Found ${specFiles.length} spec files`);

let updated = 0;
let skipped = 0;

for (const specFile of specFiles) {
  try {
    let content = fs.readFileSync(specFile, 'utf8');

    // Skip if already has CommonTestModule
    if (content.includes('CommonTestModule')) {
      skipped++;
      continue;
    }

    // Calculate relative path
    const specDir = path.dirname(specFile);
    const testingPath = path.relative(specDir, path.join(__dirname, '..', 'src', 'testing', 'common-test.module'));
    const normalizedPath = testingPath.replace(/\\/g, '/');

    // Add import at the very beginning of the file
    content = `import { CommonTestModule } from '${normalizedPath}';\n\n${content}`;

    // Add CommonTestModule to imports array in TestBed.configureTestingModule
    if (content.includes('TestBed.configureTestingModule')) {
      content = content.replace(/imports:\s*\[([^\]]*)\]/g, (match, imports) => {
        if (imports.trim()) {
          return `imports: [${imports.trim()}, CommonTestModule]`;
        } else {
          return `imports: [CommonTestModule]`;
        }
      });
    }

    fs.writeFileSync(specFile, content);
    updated++;
  } catch (e) {
    console.log(`Error processing ${specFile}: ${e.message}`);
  }
}

console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log('Done!');
