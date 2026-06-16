import sharp from 'sharp';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const iconsDir = join(__dirname, 'icons');

const sourceIcon = join(projectRoot, 'public', 'logo.png');

if (!existsSync(sourceIcon)) {
  console.error('Source icon not found:', sourceIcon);
  process.exit(1);
}

async function generateIcons() {
  // PNG icons for all platforms
  const sizes = [32, 128, 256, 512];
  for (const size of sizes) {
    const name = size === 256 ? '128x128@2x.png' : size === 128 ? '128x128.png' : `${size}x${size}.png`;
    await sharp(sourceIcon)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, name));
    console.log(`Generated ${name}`);
  }

  // icon.png (used by tray icon, 32x32)
  await sharp(sourceIcon)
    .resize(32, 32)
    .png()
    .toFile(join(iconsDir, 'icon.png'));
  console.log('Generated icon.png');

  // icon.ico for Windows - use the 256px PNG as base
  // On macOS, we can use sips or create a simple ICO
  // For ICO we'll use the sharp pipeline with a buffer approach
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = [];
  for (const s of icoSizes) {
    const buf = await sharp(sourceIcon).resize(s, s).png().toBuffer();
    icoBuffers.push({ size: s, buffer: buf });
  }

  // Simple ICO file creator
  const numImages = icoBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  let offset = 6 + numImages * 16;
  for (const { size, buffer } of icoBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size < 256 ? size : 0, 0); // Width
    entry.writeUInt8(size < 256 ? size : 0, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // Image size
    entry.writeUInt32LE(offset, 12); // Image offset
    dirEntries.push(entry);
    offset += buffer.length;
  }

  const ico = Buffer.concat([header, ...dirEntries, ...icoBuffers.map(b => b.buffer)]);
  const { writeFileSync } = await import('fs');
  writeFileSync(join(iconsDir, 'icon.ico'), ico);
  console.log('Generated icon.ico');

  // macOS .icns - use sips/iconutil if available
  try {
    // Create iconset directory
    const { mkdirSync } = await import('fs');
    const iconsetDir = join(iconsDir, 'icon.iconset');
    mkdirSync(iconsetDir, { recursive: true });

    const icnsSizes = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' },
    ];

    for (const { size, name } of icnsSizes) {
      await sharp(sourceIcon).resize(size, size).png().toFile(join(iconsetDir, name));
    }

    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(iconsDir, 'icon.icns')}"`);
    console.log('Generated icon.icns');

    // Clean up iconset
    const { rmSync } = await import('fs');
    rmSync(iconsetDir, { recursive: true, force: true });
  } catch (e) {
    console.log('Could not generate .icns (iconutil not available):', e.message);
    // Copy PNG as fallback
    const { copyFileSync } = await import('fs');
    copyFileSync(join(iconsDir, '512x512.png'), join(iconsDir, 'icon.icns'));
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
