const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsPath = path.join(__dirname, '..', 'src', 'assets');

const imagesToOptimize = [
  { input: 'images/help/add-cart.png', output: 'images/help/add-cart.webp', width: 800 },
  { input: 'images/help/add-cat-dialog.png', output: 'images/help/add-cat-dialog.webp', width: 800 },
  { input: 'images/help/add-entry-dialog.png', output: 'images/help/add-entry-dialog.webp', width: 800 },
  { input: 'images/help/add-product-btn.png', output: 'images/help/add-product-btn.webp', width: 800 },
  { input: 'images/help/add-product-dialog.png', output: 'images/help/add-product-dialog.webp', width: 800 },
  { input: 'images/help/menu.png', output: 'images/help/menu.webp', width: 800 },
  { input: 'images/help/register.png', output: 'images/help/register.webp', width: 800 },
  { input: 'images/user/avatar-1.jpg', output: 'images/user/avatar-1.webp', width: 200 },
  { input: 'images/user/avatar-2.jpg', output: 'images/user/avatar-2.webp', width: 200 },
  { input: 'images/user/avatar-3.jpg', output: 'images/user/avatar-3.webp', width: 200 },
  { input: 'images/user/avatar-4.jpg', output: 'images/user/avatar-4.webp', width: 200 },
  { input: 'images/user/avatar-5.jpg', output: 'images/user/avatar-5.webp', width: 200 },
  { input: 'images/logo-white.png', output: 'images/logo-white.webp', width: 400 },
  { input: 'images/avatar-group.png', output: 'images/avatar-group.webp', width: 400 },
  { input: 'images/profile/card.png', output: 'images/profile/card.webp', width: 400 }
];

async function optimizeImages() {
  console.log('Optimizing images to WebP...\n');
  let totalSaved = 0;

  for (const img of imagesToOptimize) {
    const inputPath = path.join(assetsPath, img.input);
    const outputPath = path.join(assetsPath, img.output);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(inputPath)) {
      console.log(`⚠️  Skipping (not found): ${img.input}`);
      continue;
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const originalSize = fs.statSync(inputPath).size;

    try {
      await sharp(inputPath).resize(img.width, null, { withoutEnlargement: true }).webp({ quality: 80 }).toFile(outputPath);

      const optimizedSize = fs.statSync(outputPath).size;
      const saved = originalSize - optimizedSize;
      totalSaved += saved;
      const savingsPercent = ((saved / originalSize) * 100).toFixed(1);

      console.log(`✓ ${img.input} -> ${img.output}`);
      console.log(`  ${(originalSize / 1024).toFixed(1)}KB -> ${(optimizedSize / 1024).toFixed(1)}KB (${savingsPercent}% smaller)\n`);
    } catch (err) {
      console.error(`✗ Error processing ${img.input}:`, err.message);
    }
  }

  console.log(`\n📊 Total space saved: ${(totalSaved / 1024).toFixed(1)}KB`);
  console.log('\nNote: Update your templates to use the new .webp images');
  console.log('Example: <img src="assets/images/help/add-cart.webp">');
}

optimizeImages();
