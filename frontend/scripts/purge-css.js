const fs = require('fs');
const path = require('path');
const glob = require('glob');

const projectRoot = process.cwd().replace(/\\/g, '/');
const distPath = path.join(projectRoot, 'dist', 'browser');

console.log('Searching for CSS files in:', distPath);

const cssFiles = glob.sync(path.join(distPath, 'styles-*.css').replace(/\\/g, '/'));
console.log('Found CSS files:', cssFiles);

if (cssFiles.length === 0) {
  console.log('No styles.css found, skipping PurgeCSS');
  process.exit(0);
}

const stylesFile = cssFiles[0];
console.log('Running PurgeCSS on:', path.basename(stylesFile));

const contentFiles = [path.join(distPath, 'index.html').replace(/\\/g, '/'), ...glob.sync(path.join(distPath, '*.js').replace(/\\/g, '/'))];
console.log('Content files count:', contentFiles.length);

const purgecss = require('@fullhuman/postcss-purgecss');

const result = purgecss({
  content: contentFiles,
  css: [stylesFile],
  safelist: {
    standard: [/^ng-/, /^mat-/, /^cdk-/, /^nb-/, /^p-/],
    deep: [
      /mat-mdc-/,
      /mat-drawer/,
      /mat-sidenav/,
      /ng-trigger/,
      /ng-star-/,
      /modal-/,
      /toast-/,
      /fade/,
      /show/,
      /collapse/,
      /dropdown/,
      /nav-/,
      /accordion-/,
      /spinner/,
      /visible/,
      /hidden/,
      /scrollbar/,
      /owl-/,
      /active/,
      /disabled/,
      /open/,
      /loading/,
      /mat-/,
      /cdk-/,
      /ng-/,
      /nb-/,
      /accordion/,
      /collapsible/,
      /fa-/,
      /bi-/,
      /pe-7s/,
      /al-/
    ]
  },
  defaultExtractor: (content) => content.match(/[\w-/:]+(?<!:)/g) || []
});

if (result && result.css) {
  const purged = result.css;
  const originalSize = fs.statSync(stylesFile).size;
  fs.writeFileSync(stylesFile, purged);
  const newSize = fs.statSync(stylesFile).size;
  const savings = (((originalSize - newSize) / originalSize) * 100).toFixed(1);
  console.log(`CSS reduced: ${(originalSize / 1024).toFixed(1)}KB -> ${(newSize / 1024).toFixed(1)}KB (${savings}% reduction)`);
} else if (Array.isArray(result)) {
  const purged = result[0].css;
  const originalSize = fs.statSync(stylesFile).size;
  fs.writeFileSync(stylesFile, purged);
  const newSize = fs.statSync(stylesFile).size;
  const savings = (((originalSize - newSize) / originalSize) * 100).toFixed(1);
  console.log(`CSS reduced: ${(originalSize / 1024).toFixed(1)}KB -> ${(newSize / 1024).toFixed(1)}KB (${savings}% reduction)`);
} else {
  console.log('PurgeCSS completed but no output');
}
