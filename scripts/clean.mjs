import { rmSync } from 'fs';
const dirs = ['dist'];
for (const dir of dirs) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`  ✅ 已清理: ${dir}`);
}
