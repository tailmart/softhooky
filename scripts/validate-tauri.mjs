#!/usr/bin/env node
/**
 * Tauri 构建配置预验证脚本
 * 在 CI 打包前运行，捕获常见错误
 * 用法: node scripts/validate-tauri.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let errors = 0;
let warnings = 0;

function err(msg) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`  ✅ ${msg}`); }

console.log('\n🔍 Tauri 构建配置预验证\n');

// 1. 验证 tauri.conf.json
const confPath = join(ROOT, 'src-tauri', 'tauri.conf.json');
if (!existsSync(confPath)) {
  err(`tauri.conf.json 不存在: ${confPath}`);
  process.exit(1);
}
const conf = JSON.parse(readFileSync(confPath, 'utf-8'));
ok('tauri.conf.json 格式有效');

// 1a. 窗口配置
const windows = conf?.app?.windows;
if (!windows || windows.length === 0) {
  err('未定义窗口');
} else {
  windows.forEach((w, i) => {
    if (!w.label) err(`窗口 #${i} 缺少 label`);
    else ok(`窗口 "${w.label}" 已定义`);
    if (!w.title) warn(`窗口 ${w.label || i} 缺少 title`);
    if (w.visible === false) warn(`窗口 ${w.label || i} 设置了 visible: false`);
    if (w.width < 100 || w.height < 100) err(`窗口 ${w.label || i} 尺寸过小 (${w.width}x${w.height})`);
    if (w.decorations === false && !w.dragDropEnabled) warn(`窗口 ${w.label || i} 无边框且无 drag-drop`);
  });
}

// 1b. 构建命令
const build = conf?.build;
if (build) {
  if (!build.frontendDist) err('缺少 frontendDist');
  else if (!existsSync(join(ROOT, build.frontendDist))) warn(`frontendDist 路径不存在: ${build.frontendDist}（构建前正常）`);
  if (build.devUrl && !build.devUrl.startsWith('http')) warn(`devUrl 格式可能不正确: ${build.devUrl}`);
}

// 1c. 更新器配置
const updater = conf?.plugins?.updater;
if (updater) {
  if (!updater.pubkey) err('updater 缺少 pubkey');
  const endpoints = updater.endpoints || [];
  endpoints.forEach((ep, i) => {
    if (!ep.startsWith('https://')) err(`updater.endpoints[${i}] 必须使用 HTTPS: ${ep}`);
    else ok(`updater.endpoints[${i}] 使用 HTTPS`);
  });
  ok('updater 配置检查完成');
} else {
  warn('未配置 updater 插件（如果有该 Rust 依赖则需配置）');
}

// 1d. Shell 插件 scope
const shell = conf?.plugins?.shell;
if (shell) {
  if (shell.open === false && (!shell.scope || shell.scope.length === 0)) {
    warn('shell 插件已禁用 open 且无 scope');
  }
  if (shell.scope) {
    shell.scope.forEach((s, i) => {
      if (s.validation && s.validation.includes('https?://')) {
        warn(`shell.scope[${i}] 的 validation 正则过宽: ${s.validation}`);
      }
      if (s.args === true && !s.validation) {
        warn(`shell.scope[${i}] 允许任意参数但无 validation 正则`);
      }
    });
  }
  ok('shell 配置检查完成');
}

// 1e. CSP
if (conf?.app?.security?.csp === null) {
  warn('CSP 设置为 null — 无内容安全策略，生产环境建议配置具体策略');
}

// 2. 检查必要的资源文件
const icons = [
  'src-tauri/icons/32x32.png',
  'src-tauri/icons/128x128.png',
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/icon.ico',
];
icons.forEach(icon => {
  if (!existsSync(join(ROOT, icon))) err(`图标文件缺失: ${icon}`);
  else ok(`图标存在: ${icon}`);
});

// 3. 检查 Cargo.toml
const cargoPath = join(ROOT, 'src-tauri', 'Cargo.toml');
if (existsSync(cargoPath)) {
  const cargo = readFileSync(cargoPath, 'utf-8');
  if (cargo.includes('strip = true') || cargo.includes('strip = "symbols"')) ok('Cargo.toml 已配置 strip');
  else warn('Cargo.toml 未配置 strip，构建产物会泄漏路径信息');
  if (cargo.includes('lto = true')) ok('Cargo.toml 已配置 LTO');
  else warn('Cargo.toml 未配置 LTO，建议开启以减小体积');
  if (cargo.includes('opt-level = "s"') || cargo.includes('opt-level = "z"')) ok('Cargo.toml 已优化体积 (opt-level)');
} else {
  err('Cargo.toml 不存在');
}

// 4. 检查前端 dist (构建后)
const distPath = join(ROOT, 'dist');
if (existsSync(distPath)) {
  const files = ['index.html', 'assets'];
  files.forEach(f => {
    if (!existsSync(join(distPath, f))) warn(`dist 中缺少 ${f}（可能是构建未完成）`);
  });
  ok('前端 dist 目录存在');
}

// 5. 检查 server.cjs
const serverPath = join(ROOT, 'server.cjs');
if (existsSync(serverPath)) {
  ok('server.cjs 存在');
} else if (existsSync(join(ROOT, 'dist'))) {
  warn('server.cjs 不存在（Tauri app 运行 API 时会失败）');
}

// 总结
console.log(`\n📊 验证结果: ${errors} 错误, ${warnings} 警告\n`);
process.exit(errors > 0 ? 1 : 0);
