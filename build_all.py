#!/usr/bin/env python3
"""
一键打包脚本 - Mac本地 + Windows云端(GitHub Actions)
打包完成后安装包输出到 ./dist_installers/ 目录

用法:
  python3 build_all.py          - 打包双端 (Mac本地 + Windows云端)
  python3 build_all.py mac      - 只打包 Mac
  python3 build_all.py windows  - 只打包 Windows
"""
import os
import sys
import json
import time
import glob
import shutil
import subprocess
import urllib.request
import urllib.error
import zipfile
import io
import tarfile

# ========== 配置 ==========
GITHUB_REPO = "tailmart/softhooky"
GITHUB_TOKEN = ""
WORKFLOW_FILE = "build-tauri.yml"
BRANCH = "main"
OUTPUT_DIR = "./dist_installers"
CHECK_INTERVAL = 30
MAX_WAIT = 1800

ROOT = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.expanduser(os.environ.get("GITHUB_TOKEN_FILE", "/tmp/gh_token.txt"))

# @tauri-apps/cli 版本 (在官网查询最新: https://www.npmjs.com/package/@tauri-apps/cli)
TAURI_CLI_VERSION = "2.11.2"


def log(msg, icon=""):
    icons = {"ok": "✅", "fail": "❌", "info": "📦", "wait": "⏳", "start": "🚀"}
    print(f"\n{icons.get(icon, '▸')} {msg}")


def run_cmd(cmd, cwd=None, check=True):
    """执行命令并实时输出"""
    print(f"  $ {cmd}")
    result = subprocess.run(
        cmd, shell=True, cwd=cwd or ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    if result.stdout:
        for line in result.stdout.strip().split("\n")[-20:]:
            print(f"    {line}")
    if check and result.returncode != 0:
        print(f"  命令失败 (exit code {result.returncode})")
        sys.exit(1)
    return result


def get_token():
    """获取 GitHub token: 优先 env, 其次 token 文件"""
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token and os.path.exists(TOKEN_FILE):
        token = open(TOKEN_FILE).read().strip()
    return token


def install_tauri_cli():
    """从 npm registry 直接下载 @tauri-apps/cli + 平台二进制"""
    arch = os.uname().machine
    target = "darwin-arm64" if arch == "arm64" else "darwin-x64"
    nm_dir = os.path.join(ROOT, "node_modules")
    ta_dir = os.path.join(nm_dir, "@tauri-apps")
    bin_dir = os.path.join(nm_dir, ".bin")

    # 检查是否已安装
    if os.path.exists(os.path.join(bin_dir, "tauri")):
        ver = subprocess.run(
            ["node", os.path.join(ta_dir, "cli", "tauri.js"), "--version"],
            capture_output=True, text=True, cwd=ROOT
        ).stdout.strip()
        if ver:
            log(f"@tauri-apps/cli 已就绪: {ver}", "ok")
            return True

    log("安装 @tauri-apps/cli...", "info")

    for subdir in [os.path.join(ta_dir, "cli"), os.path.join(ta_dir, f"cli-{target}")]:
        os.makedirs(subdir, exist_ok=True)

    def download_and_extract(pkg_name, dest_dir):
        url = f"https://registry.npmjs.org/@tauri-apps/{pkg_name}/-/{pkg_name}-{TAURI_CLI_VERSION}.tgz"
        tgt_path = f"/tmp/tauri-{pkg_name.replace('/', '-')}.tgz"
        urllib.request.urlretrieve(url, tgt_path)
        tmpdir = os.path.join("/tmp", f"tauri-{pkg_name.replace('/', '-')}-extract")
        if os.path.exists(tmpdir):
            shutil.rmtree(tmpdir)
        with tarfile.open(tgt_path) as tf:
            # Python 3.12+ has filter='data', older doesn't
            kwargs = {"filter": "data"} if sys.version_info >= (3, 12) else {}
            tf.extractall(tmpdir, **kwargs)
        pkg_dir = os.path.join(tmpdir, "package")
        for f in os.listdir(pkg_dir):
            s = os.path.join(pkg_dir, f)
            d = os.path.join(dest_dir, f)
            if os.path.exists(d):
                os.remove(d)
            shutil.move(s, d)
        shutil.rmtree(tmpdir, ignore_errors=True)

    download_and_extract("cli", os.path.join(ta_dir, "cli"))
    download_and_extract(f"cli-{target}", os.path.join(ta_dir, f"cli-{target}"))

    # 创建 symlink
    os.makedirs(bin_dir, exist_ok=True)
    symlink_target = os.path.join("..", "@tauri-apps", "cli", "tauri.js")
    symlink_path = os.path.join(bin_dir, "tauri")
    if os.path.exists(symlink_path):
        os.remove(symlink_path)
    os.symlink(symlink_target, symlink_path)

    log(f"@tauri-apps/cli 已安装 ({target})", "ok")
    return True


def build_frontend():
    """构建前端 + Server"""
    log("清理旧构建产物...", "info")
    run_cmd("node scripts/clean.mjs")
    log("构建前端 (Vite)...", "info")
    run_cmd("npx vite build")
    log("编译 Server (esbuild)...", "info")
    run_cmd("node build-server.js")


def build_mac():
    """Mac本地打包"""
    log("开始 Mac 本地打包", "start")

    # 1. 构建前端
    build_frontend()

    # 2. 确保 Tauri CLI 可用
    install_tauri_cli()

    # 3. 生成图标（如果需要）
    log("检查/生成应用图标", "info")
    run_cmd("node src-tauri/generate-icons.mjs", check=False)

    # 4. 构建 Mac Universal DMG
    log("构建 Mac DMG (Universal: Intel + Apple Silicon)", "info")
    run_cmd("npx tauri build --target universal-apple-darwin", check=False)
    # 如果 Tauri DMG 打包失败（常见 hdiutil 资源忙），尝试手动转换
    dmg_path = "src-tauri/target/universal-apple-darwin/release/bundle/dmg"
    temp_dmg = glob.glob(f"{dmg_path}/rw.*.dmg")
    if temp_dmg and not glob.glob(f"{dmg_path}/Softhooky_*.dmg"):
        log("Tauri DMG 打包遇 hdiutil 问题，尝试手动转换...", "info")
        # 先卸载残留
        subprocess.run(["hdiutil", "detach", "-force", "/dev/disk4"], capture_output=True)
        # 手动转换
        run_cmd(f'hdiutil convert "{temp_dmg[0]}" -format UDZO -imagekey zlib-level=9 -o "{dmg_path}/Softhooky_{version}.dmg"', check=False)

    # 5. 查找安装包
    log("查找 Mac 安装包", "info")
    found = glob.glob("src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg")
    if not found:
        for t in ["aarch64-apple-darwin", "x86_64-apple-darwin"]:
            found.extend(glob.glob(f"src-tauri/target/{t}/release/bundle/dmg/*.dmg"))
    if not found:
        log("未找到 Mac 安装包，请检查构建日志", "fail")
        return []

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    copied = []
    for f in found:
        dest = os.path.join(OUTPUT_DIR, os.path.basename(f))
        shutil.copy2(f, dest)
        size_mb = os.path.getsize(dest) / 1024 / 1024
        log(f"Mac 安装包: {os.path.basename(dest)} ({size_mb:.1f} MB)", "ok")
        copied.append(dest)
    return copied


def github_api(url, token=None):
    """调用 GitHub API"""
    if not token:
        token = get_token()
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "softhooky-builder"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        if e.code == 401:
            log(f"GitHub API 认证失败 (401): 请在 {TOKEN_FILE} 中设置有效的 token", "fail")
        else:
            print(f"  API error {e.code}: {body[:200]}")
        return None


def git_push_and_trigger():
    """推送代码到 GitHub 并触发 workflow"""
    token = get_token()
    if not token:
        log("未找到 GitHub token，无法触发 Windows 构建", "fail")
        return None

    # 1. 确保代码已经 push
    log("检查 Git 状态...", "info")
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, cwd=ROOT
    )
    if status.stdout.strip():
        log("有未提交的更改，正在提交并推送...", "info")
        run_cmd("git add -A")
        run_cmd('git commit -m "chore: build update"', check=False)
    # 尝试推送，如果因 workflow scope 失败则提示用户
    log("推送到 GitHub...", "info")
    result = subprocess.run(
        ["git", "push", "--force", "origin", BRANCH],
        capture_output=True, text=True, cwd=ROOT
    )
    if result.returncode != 0:
        err_msg = result.stderr + result.stdout
        if "workflow" in err_msg and "scope" in err_msg:
            log("推送失败: PAT 缺少 workflow 权限", "fail")
            log("请手动执行以下命令推送代码，触发 Windows 构建:", "info")
            print(f"    1. cd {ROOT}")
            print("    2. git push --force origin main")
            print(f"    3. 到 https://github.com/{GITHUB_REPO}/actions 手动触发")
            log("或为当前 PAT 添加 workflow 权限后重试", "info")
        else:
            log(f"推送失败: {err_msg[:200]}", "fail")
        return None

    # 2. 触发 workflow
    log("触发 GitHub Actions 构建...", "info")
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{WORKFLOW_FILE}/dispatches"
    data = json.dumps({"ref": BRANCH}).encode()
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        log(f"Windows 构建已触发 (HTTP {resp.status})", "ok")
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        log(f"触发失败: {e.code} {body[:200]}", "fail")
        print("可手动到 GitHub Actions 页面触发构建")
        return None
    return token


def build_windows():
    """通过 GitHub Actions 打包 Windows"""
    log("开始 Windows 云端打包 (GitHub Actions)", "start")

    token = git_push_and_trigger()
    if not token:
        return []

    # 3. 查找 workflow run
    log("等待构建启动...", "wait")
    time.sleep(5)
    run_id = None
    for _ in range(60):
        runs = github_api(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=5&event=workflow_dispatch",
            token
        )
        if runs and runs.get("workflow_runs"):
            for r in runs["workflow_runs"]:
                if r["workflow_file"] == WORKFLOW_FILE and r["status"] != "completed":
                    run_id = r["id"]
                    break
        if run_id:
            break
        time.sleep(5)

    if not run_id:
        log("找不到 workflow run，尝试找刚完成的...", "wait")
        runs = github_api(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=3",
            token
        )
        if runs and runs.get("workflow_runs"):
            run_id = runs["workflow_runs"][0]["id"]
    if not run_id:
        log("找不到 workflow run", "fail")
        return []

    log(f"找到构建 #{run_id}", "ok")

    # 4. 等待完成
    start_time = time.time()
    while time.time() - start_time < MAX_WAIT:
        elapsed = int(time.time() - start_time)
        run_data = github_api(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}",
            token
        )
        if not run_data:
            time.sleep(CHECK_INTERVAL)
            continue

        status = run_data["status"]
        conclusion = run_data.get("conclusion")

        # 获取当前步骤
        jobs_data = github_api(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}/jobs",
            token
        )
        current_step = ""
        if jobs_data:
            for job in jobs_data.get("jobs", []):
                if job["status"] == "in_progress":
                    for step in job.get("steps", []):
                        if step["status"] == "in_progress":
                            current_step = step["name"]
                            break

        print(f"\r  [{elapsed}s] Status: {status} | {current_step[:50]}  ", end="", flush=True)

        if status == "completed":
            print()
            if conclusion == "success":
                log(f"Windows 构建成功 (耗时 {elapsed}s)", "ok")
                break
            else:
                log(f"Windows 构建失败: {conclusion}", "fail")
                if jobs_data:
                    for job in jobs_data.get("jobs", []):
                        for step in job.get("steps", []):
                            if step.get("conclusion") == "failure":
                                print(f"  失败步骤: {step['name']}")
                return []

        time.sleep(CHECK_INTERVAL)
    else:
        log(f"构建超时 ({MAX_WAIT}s)", "fail")
        return []

    # 5. 下载安装包
    log("下载 Windows 安装包...", "info")
    artifacts = github_api(
        f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}/artifacts",
        token
    )
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

        dl_headers = {"Accept": "application/vnd.github+json", "User-Agent": "softhooky"}
        if token:
            dl_headers["Authorization"] = f"Bearer {token}"

        try:
            dl_req = urllib.request.Request(download_url, headers=dl_headers)
            with urllib.request.urlopen(dl_req, timeout=180) as resp:
                zip_data = resp.read()

            with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                for file_name in zf.namelist():
                    if file_name.endswith((".sig", ".nsiszip")):
                        continue
                    if file_name.endswith((".exe", ".msi", ".nsis")):
                        extracted = zf.read(file_name)
                        dest = os.path.join(OUTPUT_DIR, os.path.basename(file_name))
                        with open(dest, "wb") as f:
                            f.write(extracted)
                        size_mb = len(extracted) / 1024 / 1024
                        log(f"Windows 安装包: {os.path.basename(dest)} ({size_mb:.1f} MB)", "ok")
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

    os.chdir(ROOT)
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
        print("\n  没有生成安装包 — 请检查上面的日志")


if __name__ == "__main__":
    main()
