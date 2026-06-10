#!/bin/bash
# Softhooky Tauri 打包发布脚本
#
# macOS: bash scripts/publish.sh                       → 本地构建 DMG
# Windows: 推 tag 到 GitHub 自动构建                   → CI 生成 exe
# 双端:    bash scripts/publish.sh + GitHub Actions    → 两个平台都拿到
#
# 使用步骤:
#   1. 改 package.json 里的 version
#   2. 本地构建 macOS:  bash scripts/publish.sh
#   3. 推 tag 触发 Windows 构建:  git tag v1.0.x && git push origin v1.0.x
#   4. deploy/ 上传到服务器覆盖站点根目录
#   5. PM2 重启
#
# ============================================================

set -e
cd "$(dirname "$0")/.."

VERSION=$(node -e "console.log(require('./package.json').version)")

echo "========================================================================"
echo "  Softhooky v$VERSION  Tauri 打包"
echo "========================================================================"
echo ""

# 确认版本
read -p "发布 v$VERSION ? (y/N): " confirm
[ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && echo "已取消" && exit 0

# ============================================================
# 1. 构建前端 + 编译 server.cjs
# ============================================================
echo ""
echo "🔨 [1/3] 构建前端 + 编译后端..."
npm run build
echo "  ✅ 构建完成"
echo ""

# ============================================================
# 2. 打包 macOS（本机原生构建）
# ============================================================
echo "📦 [2/3] 打包 macOS..."
echo ""

# 检查是否安装了 universal 目标
if rustup target list --installed 2>/dev/null | grep -q x86_64-apple-darwin; then
  echo "  编译 Universal DMG (ARM64 + Intel)..."
  MAC_TARGET="--target universal-apple-darwin"
else
  echo "  编译 ARM64 DMG（缺少 x86_64 目标）"
  MAC_TARGET="--target aarch64-apple-darwin"
fi

npx tauri build $MAC_TARGET --bundles dmg 2>&1 | grep -E "(Finished|error|Error|✅|✓)"
echo ""
echo "  ✅ macOS 构建完成"

# ============================================================
# 3. 收集构建产物到 deploy/
# ============================================================
echo "📋 [3/3] 收集 deploy/ 目录..."
echo ""

mkdir -p deploy/updates

# macOS 安装包
MAC_DMG=$(find src-tauri/target/*/release/bundle/dmg -name "*.dmg" 2>/dev/null | head -1)
MAC_SIG=$(find src-tauri/target/*/release/bundle/dmg -name "*.sig" 2>/dev/null | head -1)
if [ -n "$MAC_DMG" ]; then
  cp "$MAC_DMG" deploy/updates/
  size=$(ls -lh "$MAC_DMG" | awk '{print $5}')
  echo "  📄 macOS:  $(basename "$MAC_DMG")  ($size)"
fi
if [ -n "$MAC_SIG" ]; then
  cp "$MAC_SIG" deploy/updates/
fi

# 站点文件
cp server.cjs deploy/
cp -r dist deploy/
cp package.json deploy/

echo ""
echo "========================================================================"
echo "  ✅ 打包完成！"
echo "========================================================================"
echo ""
echo "📂 deploy/ 目录结构："
find deploy -maxdepth 2 -type f | while read f; do
  size=$(ls -lh "$f" | awk '{print $5}')
  echo "  📄 ${f#deploy/}  ($size)"
done
echo ""
echo "📤 上传部署："
echo "  把 deploy/ 整个文件夹拖到站点根目录覆盖"
echo "  pm2 restart softhooky"
echo ""
echo "🪟 Windows 版本（在 GitHub 上自动构建）："
echo "  git add . && git commit -m 'v$VERSION'"
echo "  git tag v$VERSION && git push origin v$VERSION"
echo "  等几分钟，GitHub Actions 会自动打出 .exe 并发布到 Release 页面"
echo ""
echo "  首次使用需要先去 GitHub 仓库设置添加密钥:"
echo "  Settings → Secrets → Actions → New repository secret"
echo "  名称: TAURI_PRIVATE_KEY"
echo "  值:  $(cat src-tauri/updater.key 2>/dev/null || echo '（请手动复制 src-tauri/updater.key 的内容）')"
echo ""
