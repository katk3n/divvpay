const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

try {
  let indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const stylesheetHtml = fs.readFileSync(path.join(srcDir, 'stylesheet.html'), 'utf8');
  const javascriptHtml = fs.readFileSync(path.join(srcDir, 'javascript.html'), 'utf8');

  // Replace GAS template tags with local code
  indexHtml = indexHtml.replace(
    /<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]stylesheet['"]\)\.getContent\(\);\s*\?>/i,
    stylesheetHtml
  );

  indexHtml = indexHtml.replace(
    /<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]javascript['"]\)\.getContent\(\);\s*\?>/i,
    javascriptHtml
  );

  fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf8');
  console.log('Successfully compiled static distribution to: dist/index.html');
} catch (err) {
  console.error('Build failed:', err.message);
  process.exit(1);
}
