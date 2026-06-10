import { readFileSync, existsSync } from 'fs';
import { cp, rm, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const version = pkg.version;
const releaseDir = join(__dirname, 'release');
const deployDir = join(__dirname, 'deploy', 'updates');

async function publish() {
  // 1. 清理 deploy/updates 下所有旧文件
  if (existsSync(deployDir)) {
    const files = await readdir(deployDir);
    for (const file of files) {
      if (file === '.DS_Store' || file === 'README.md') continue;
      await rm(join(deployDir, file), { recursive: true, force: true });
      console.log(`  🗑️  删除旧文件: ${file}`);
    }
  }

  // 2. 复制新文件
  const files = await readdir(releaseDir);
  for (const file of files) {
    if (file === '.DS_Store' || file.endsWith('.yml') || file === 'builder-effective-config.yaml' || file.startsWith('.') || file === 'mac' || file === 'win-unpacked') continue;
    const src = join(releaseDir, file);
    const dest = join(deployDir, file);
    await cp(src, dest);
    console.log(`  📋 复制: ${file}`);
  }

  // 3. 复制 latest yml 文件
  for (const yml of ['latest.yml', 'latest-mac.yml', 'builder-debug.yml']) {
    const src = join(releaseDir, yml);
    if (existsSync(src)) {
      await cp(src, join(deployDir, yml));
      console.log(`  📋 复制: ${yml}`);
    }
  }

  console.log(`\n✅ 发布完成: v${version}`);
}

publish().catch(err => {
  console.error('❌ 发布失败:', err);
  process.exit(1);
});
