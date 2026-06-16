#!/usr/bin/env node
/**
 * Tauri 发布脚本
 * 
 * 功能：
 * 1. 收集构建产物（DMG/NSIS）
 * 2. 生成 update-manifest.json 供 Tauri updater 使用
 * 3. 将所有文件复制到 deploy/updates 目录
 * 
 * 用法:
 *   node publish-tauri.js              - 自动检测平台并发布
 *   node publish-tauri.js --mac        - 只发布 Mac 版本
 *   node publish-tauri.js --win        - 只发布 Windows 版本
 *   node publish-tauri.js --notes "xxx" - 添加更新说明
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { cp, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const version = pkg.version;
const args = process.argv.slice(2);
const onlyMac = args.includes('--mac');
const onlyWin = args.includes('--win');
const notesIdx = args.indexOf('--notes');
const notes = notesIdx >= 0 ? args[notesIdx + 1] : `Softhooky v${version} 更新`;

const deployDir = join(__dirname, 'deploy', 'updates');
const tauriBundle = join(__dirname, 'src-tauri', 'target', 'release', 'bundle');

console.log('=========================================');
console.log(`  Softhooky Tauri 发布 v${version}`);
console.log('=========================================');

// 清理 deploy/updates
if (existsSync(deployDir)) {
  await rm(deployDir, { recursive: true, force: true });
}
mkdirSync(deployDir, { recursive: true });

const manifest = {
  version,
  notes,
  pubDate: new Date().toISOString(),
  dmgFile: null,
  dmgSize: 0,
  dmgUrl: null,
  nsisFile: null,
  nsisSize: 0,
  nsisUrl: null,
};

// 查找文件的辅助函数
function findFile(dir, pattern) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir);
  for (const f of files) {
    if (f.match(pattern)) return join(dir, f);
  }
  return null;
}

// 发布 Mac DMG
async function publishMac() {
  const dmgDir = join(tauriBundle, 'dmg');
  const dmgFile = findFile(dmgDir, /\.dmg$/i);

  if (dmgFile) {
    const dmgName = `Softhooky_${version}_universal.dmg`;
    const destPath = join(deployDir, dmgName);
    await cp(dmgFile, destPath);
    const stat = statSync(destPath);
    manifest.dmgFile = dmgName;
    manifest.dmgSize = stat.size;
    manifest.dmgUrl = `http://43.161.228.92:3001/updates/${dmgName}`;
    console.log(`  ✅ Mac DMG: ${dmgName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('  ⚠️  未找到 Mac DMG 文件');
  }
}

// 发布 Windows NSIS
async function publishWin() {
  const nsisDir = join(tauriBundle, 'nsis');
  const nsisFile = findFile(nsisDir, /_x64-setup\.exe$/i) || findFile(nsisDir, /setup\.exe$/i);

  if (nsisFile) {
    const nsisName = `Softhooky_${version}_x64-setup.exe`;
    const destPath = join(deployDir, nsisName);
    await cp(nsisFile, destPath);
    const stat = statSync(destPath);
    manifest.nsisFile = nsisName;
    manifest.nsisSize = stat.size;
    manifest.nsisUrl = `http://43.161.228.92:3001/updates/${nsisName}`;
    console.log(`  ✅ Windows NSIS: ${nsisName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('  ⚠️  未找到 Windows NSIS 安装包');
  }
}

// 执行发布
if (!onlyWin) await publishMac();
if (!onlyMac) await publishWin();

// 写入更新清单
const manifestPath = join(deployDir, 'update-manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`  ✅ 更新清单: update-manifest.json`);

// 同时更新 deploy 目录的 latest.yml 格式（可选，兼容其他更新方式）
const latestYml = `version: ${manifest.version}
files:
  - url: ${manifest.nsisUrl || manifest.dmgUrl || ''}
    sha512: ""
    size: ${manifest.nsisSize || manifest.dmgSize || 0}
path: ${manifest.nsisFile || manifest.dmgFile || ''}
sha512: ""
releaseDate: '${manifest.pubDate}'`;

writeFileSync(join(deployDir, 'latest.yml'), latestYml);

console.log('');
console.log('=========================================');
console.log(`  ✅ 发布完成: v${version}`);
console.log('=========================================');
console.log('');
console.log('部署目录:', deployDir);
console.log('');
console.log('清单内容:');
console.log(JSON.stringify(manifest, null, 2));
console.log('');
console.log('下一步:');
console.log('1. 将 deploy/updates 目录中的文件上传到服务器');
console.log('2. 已安装的用户会自动检测到新版本');
