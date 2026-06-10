import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

// 读取 package.json 获取 dependencies
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
  'node:*',
  'fs',
  'path',
  'url',
  'http',
  'https',
  'stream',
  'crypto',
  'zlib',
  'net',
  'tls',
  'os',
  'events',
  'util',
  'buffer',
  'querystring'
];

console.log('🔨 编译 server.ts...');

try {
  await build({
    entryPoints: ['./server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: './server.cjs',
    format: 'cjs',
    external: externalDeps,
    minify: true,
    sourcemap: false,
  });

  // 添加 shebang
  const content = readFileSync('./server.cjs', 'utf8');
  writeFileSync('./server.cjs', content);

  console.log('✅ Server 编译完成: server.cjs');
} catch (err) {
  console.error('❌ 编译失败:', err);
  process.exit(1);
}
