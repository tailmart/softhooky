#!/usr/bin/env python3
"""
生成代理配置文件 config.json
用法:
  python3 scripts/gen-agent-config.py --url http://代理域名.com --name "代理品牌名"
  python3 scripts/gen-agent-config.py --url http://代理域名.com --name "XX代理" --logo http://代理域名.com/logo.png

输出: dist_installers/config.json（随安装包一起发客户）
"""
import json, os, argparse

OUTPUT_DIR = "./dist_installers"

def main():
    parser = argparse.ArgumentParser(description="生成 Softhooky 代理配置文件")
    parser.add_argument("--url", required=True, help="代理后端 API 地址")
    parser.add_argument("--name", default="", help="代理品牌名称")
    parser.add_argument("--logo", default="", help="代理 Logo URL")
    parser.add_argument("--header", action="append", nargs=2, metavar=("KEY", "VALUE"),
                        help="额外请求头（用于代理鉴权），可多次使用")
    parser.add_argument("--output", default=os.path.join(OUTPUT_DIR, "config.json"),
                        help="输出路径 (默认 dist_installers/config.json)")
    args = parser.parse_args()

    config = {
        "apiBaseUrl": args.url.rstrip("/"),
    }
    if args.name:
        config["brandName"] = args.name
    if args.logo:
        config["logoUrl"] = args.logo
    if args.header:
        config["extraHeaders"] = {k: v for k, v in args.header}

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print(f"✅ 配置文件已生成: {args.output}")
    print(f"   API: {config['apiBaseUrl']}")
    if args.name:
        print(f"   品牌: {args.name}")
    print(f"\n   将 {args.output} 和安装包一起发给客户即可")


if __name__ == "__main__":
    main()
