#!/bin/bash
# Tauri 构建脚本
# 用法:
#   ./build-tauri.sh mac       - 构建 Mac 版本 (universal binary)
#   ./build-tauri.sh mac-arm   - 构建 Mac ARM (Apple Silicon) 版本
#   ./build-tauri.sh mac-intel - 构建 Mac Intel 版本
#   ./build-tauri.sh win       - 构建 Windows 版本 (需要 Windows 或 Docker)
#   ./build-tauri.sh all       - 构建所有平台

set -e

export PATH="$HOME/.cargo/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 从 package.json 读取版本
VERSION=$(node -p "require('./package.json').version")
echo "========================================="
echo "  Softhooky Tauri 构建 v${VERSION}"
echo "========================================="

# 确保图标已生成
if [ ! -f src-tauri/icons/icon.icns ] || [ ! -f src-tauri/icons/icon.ico ]; then
  echo "[INFO] 生成应用图标..."
  node src-tauri/generate-icons.mjs
fi

# 构建前端
echo "[STEP 1] 构建前端..."
npm run build

case "${1:-mac}" in
  mac|mac-arm|mac-arm64)
    echo "[STEP 2] 构建 Mac ARM64 版本..."
    npx tauri build --target aarch64-apple-darwin
    echo ""
    echo "[完成] Mac ARM64 版本构建成功!"
    echo "输出目录: src-tauri/target/release/bundle/"
    ls -la src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
    ;;
  mac-intel|x86_64)
    echo "[STEP 2] 构建 Mac x86_64 版本..."
    npx tauri build --target x86_64-apple-darwin
    echo ""
    echo "[完成] Mac Intel 版本构建成功!"
    echo "输出目录: src-tauri/target/release/bundle/"
    ls -la src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
    ;;
  mac)
    echo "[STEP 2] 构建 Mac Universal 版本..."
    npx tauri build --target universal-apple-darwin
    echo ""
    echo "[完成] Mac Universal 版本构建成功!"
    echo "输出目录: src-tauri/target/release/bundle/"
    ls -la src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
    ;;
  win|windows)
    echo "[STEP 2] 构建 Windows 版本..."
    echo "[注意] Windows 版本需要在 Windows 上构建或使用 Docker"
    npx tauri build --target x86_64-pc-windows-msvc
    echo ""
    echo "[完成] Windows 版本构建成功!"
    echo "输出目录: src-tauri/target/release/bundle/nsis/"
    ls -la src-tauri/target/release/bundle/nsis/ 2>/dev/null || true
    ;;
  all)
    echo "[STEP 2] 构建 Mac Universal 版本..."
    npx tauri build --target universal-apple-darwin
    echo ""
    echo "[STEP 3] 尝试构建 Windows 版本..."
    echo "[注意] 在 macOS 上无法直接构建 Windows NSIS 安装包"
    echo "[提示] 请使用 GitHub Actions 或 Windows 机器单独构建 Windows 版本"
    echo ""
    echo "[完成] Mac 版本构建成功!"
    ls -la src-tauri/target/release/bundle/dmg/ 2>/dev/null || true
    ;;
  *)
    echo "未知参数: $1"
    echo "用法: $0 {mac|mac-arm|mac-intel|win|all}"
    exit 1
    ;;
esac

echo ""
echo "========================================="
echo "  构建完成!"
echo "========================================="
echo ""
echo "下一步: 运行 npm run tauri:publish 发布更新"
