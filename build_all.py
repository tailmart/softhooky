#!/usr/bin/env python3
"""
一键打包脚本 - Mac本地 + Windows云端(GitHub Actions)
打包完成后安装包输出到 ./dist_installers/ 目录
"""

import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
import zipfile
import io
import glob

# ========== 配置 ==========
GITHUB_REPO = "tailmart/softhooky"
GITHUB_TOKEN = ""  # 填你的GitHub Personal Access Token，不填则用gh CLI认证
WORKFLOW_FILE = "build-tauri.yml"
BRANCH = "main"
OUTPUT_DIR = "./dist_installers"
CHECK_INTERVAL = 30  # 检查间隔（秒）
MAX_WAIT = 1800      # 最大等待时间（秒）


def log(msg, icon=""):
    icons = {"ok": "✅", "fail": "❌", "info": "📦", "wait": "⏳", "start": "🚀"}
    print(f"\n{icons.get(icon, '▶')} {msg}")


def run_cmd(cmd, cwd=None, check=True):
    """执行命令并实时输出"""
    print(f"  $ {cmd}")
    result = subprocess.run(
        cmd, shell=True, cwd=cwd,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    if result.stdout:
        for line in result.stdout.strip().split("\n")[-20:]:
            print(f"    {line}")
    if check and result.returncode != 0:
        print(f"  命令失败 (exit code {result.returncode})")
        sys.exit(1)
    return result


def github_api(url):
    """调用GitHub API"""
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("  GitHub API认证失败，请设置GITHUB_TOKEN")
        return None


def build_mac():
    """Mac本地打包"""
    log("开始Mac本地打包", "start")

    # 1. 安装依赖
    log("安装npm依赖", "info")
    run_cmd("npm install")

    # 2. 生成图标（如果需要）
    log("检查/生成应用图标", "info")
    run_cmd("npm run tauri:icons", check=False)

    # 3. 构建Mac安装包
    log("构建Mac DMG（Universal: Intel + Apple Silicon）", "info")
    run_cmd("npm run tauri build -- --target universal-apple-darwin")

    # 4. 查找并复制安装包
    log("查找Mac安装包", "info")
    patterns = [
        "src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg",
        "src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app",
    ]
    found = []
    for pat in patterns:
        found.extend(glob.glob(pat))

    if not found:
        # 尝试其他target
        for t in ["aarch64-apple-darwin", "x86_64-apple-darwin"]:
            for pat in [
                f"src-tauri/target/{t}/release/bundle/dmg/*.dmg",
                f"src-tauri/target/{t}/release/bundle/macos/*.app",
            ]:
                found.extend(glob.glob(pat))

    if not found:
        log("未找到Mac安装包，请检查构建日志", "fail")
        return []

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    copied = []
    for f in found:
        dest = os.path.join(OUTPUT_DIR, os.path.basename(f))
        run_cmd(f'cp "{f}" "{dest}"', check=False)
        size_mb = os.path.getsize(dest) / 1024 / 1024
        log(f"Mac安装包: {dest} ({size_mb:.1f} MB)", "ok")
        copied.append(dest)

    return copied


def build_windows():
    """通过GitHub Actions打包Windows"""
    log("开始Windows云端打包 (GitHub Actions)", "start")

    # 1. 触发workflow
    log("触发GitHub Actions构建...", "info")

    # 尝试用gh CLI触发
    result = run_cmd(
        f'gh workflow run "{WORKFLOW_FILE}" --ref {BRANCH}',
        check=False
    )
    if result.returncode != 0:
        # gh CLI不可用，尝试API触发
        log("尝试通过API触发...", "info")
        url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{WORKFLOW_FILE}/dispatches"
        data = json.dumps({"ref": BRANCH}).encode()
        headers = {
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        }
        if GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            urllib.request.urlopen(req, timeout=10)
            log("API触发成功", "ok")
        except Exception as e:
            log(f"触发workflow失败: {e}", "fail")
            print("请手动到 GitHub Actions 页面触发构建")
            return []

    # 2. 等待并监控构建
    log("等待构建开始...", "wait")
    time.sleep(5)

    run_id = None
    for _ in range(60):  # 最多等5分钟找run
        runs = github_api(f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=5&status=in_progress")
        if runs and runs.get("workflow_runs"):
            for r in runs["workflow_runs"]:
                if r["workflow_file"] == WORKFLOW_FILE:
                    run_id = r["id"]
                    break
        if run_id:
            break
        # 也检查completed的runs
        runs2 = github_api(f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=5&status=completed&branch={BRANCH}")
        if runs2 and runs2.get("workflow_runs"):
            for r in runs2["workflow_runs"]:
                if r["workflow_file"] == WORKFLOW_FILE:
                    run_id = r["id"]
                    break
        if run_id:
            break
        print("  等待中...", end="\r")
        time.sleep(5)

    if not run_id:
        log("找不到workflow run", "fail")
        return []

    log(f"找到构建 # {run_id}", "ok")

    # 3. 等待Windows job完成
    start_time = time.time()
    while time.time() - start_time < MAX_WAIT:
        elapsed = int(time.time() - start_time)
        jobs = github_api(f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}/jobs")
        if not jobs:
            time.sleep(CHECK_INTERVAL)
            continue

        win_job = None
        for job in jobs.get("jobs", []):
            if "windows" in job["name"].lower():
                win_job = job
                break

        if not win_job:
            print(f"  等待Windows job启动... ({elapsed}s)", end="\r")
            time.sleep(CHECK_INTERVAL)
            continue

        status = win_job["status"]
        conclusion = win_job.get("conclusion")

        if status == "completed":
            if conclusion == "success":
                log(f"Windows构建成功! (耗时 {elapsed}s)", "ok")
                break
            else:
                log(f"Windows构建失败: {conclusion}", "fail")
                # 打印失败步骤
                for step in win_job.get("steps", []):
                    if step.get("conclusion") == "failure":
                        print(f"  失败步骤: {step['name']}")
                return []

        # 打印当前步骤
        current_step = ""
        for step in win_job.get("steps", []):
            if step["status"] == "in_progress":
                current_step = step["name"]
                break
        print(f"  Windows构建中... {current_step} ({elapsed}s)", end="\r")
        time.sleep(CHECK_INTERVAL)
    else:
        log(f"构建超时（超过{MAX_WAIT}s）", "fail")
        return []

    # 4. 下载Windows安装包
    log("下载Windows安装包...", "info")
    artifacts = github_api(f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}/artifacts")
    if not artifacts or not artifacts.get("artifacts"):
        log("找不到构建产物", "fail")
        return []

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    copied = []

    for artifact in artifacts["artifacts"]:
        name = artifact["name"]
        if "windows" not in name.lower():
            continue

        download_url = artifact["archive_download_url"]
        log(f"下载 {name} ({artifact['size_in_bytes']/1024/1024:.1f} MB)...", "info")

        headers = {"Accept": "application/vnd.github+json"}
        if GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
        req = urllib.request.Request(download_url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                zip_data = resp.read()

            # 解压zip
            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                for file_name in zf.namelist():
                    # 跳过PE签名文件
                    if file_name.endswith(".sig") or file_name.endswith(".nsiszip"):
                        continue
                    if file_name.endswith((".exe", ".msi", ".nsis")):
                        extracted = zf.read(file_name)
                        dest = os.path.join(OUTPUT_DIR, file_name)
                        with open(dest, "wb") as f:
                            f.write(extracted)
                        size_mb = len(extracted) / 1024 / 1024
                        log(f"Windows安装包: {dest} ({size_mb:.1f} MB)", "ok")
                        copied.append(dest)
        except Exception as e:
            log(f"下载失败: {e}", "fail")

    return copied


def main():
    print("=" * 50)
    print("  Softhooky 一键打包工具")
    print("  Mac本地 + Windows云端")
    print("=" * 50)

    mode = "both"
    if len(sys.argv) > 1:
        mode = sys.argv[1].lower()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []

    if mode in ("both", "mac"):
        results.extend(build_mac())

    if mode in ("both", "windows"):
        results.extend(build_windows())

    # 汇总
    print("\n" + "=" * 50)
    print("  打包完成!")
    print("=" * 50)
    if results:
        print(f"\n安装包输出目录: {os.path.abspath(OUTPUT_DIR)}\n")
        for f in results:
            size_mb = os.path.getsize(f) / 1024 / 1024
            print(f"  📦 {os.path.basename(f)} ({size_mb:.1f} MB)")
    else:
        print("\n  没有找到安装包，请检查构建日志")


if __name__ == "__main__":
    main()
