# -*- coding: utf-8 -*-
"""准备便携运行时：把 Python 官方 embeddable 包装进 runtime/。

只有从源码 clone 下来才需要跑这个。发布版 zip 里已经带好了运行时。
用法：  python tools/setup_runtime.py
"""
import os
import shutil
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME = os.path.join(ROOT, "runtime")
TMP = os.path.join(ROOT, "py.zip")

VERSION = "3.12.10"
MIRRORS = [
    "https://www.python.org/ftp/python/%s/python-%s-embed-amd64.zip" % (VERSION, VERSION),
    "https://mirrors.huaweicloud.com/python/%s/python-%s-embed-amd64.zip" % (VERSION, VERSION),
    "https://mirrors.tuna.tsinghua.edu.cn/python/%s/python-%s-embed-amd64.zip" % (VERSION, VERSION),
]


def download():
    if os.path.exists(TMP) and zipfile.is_zipfile(TMP):
        print("已有 py.zip，直接使用")
        return
    for url in MIRRORS:
        print("下载", url)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "setup/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r, open(TMP, "wb") as f:
                shutil.copyfileobj(r, f)
            if zipfile.is_zipfile(TMP):
                print("  完成 %.1f MB" % (os.path.getsize(TMP) / 1048576))
                return
        except Exception as e:
            print("  失败：%s" % e)
    raise SystemExit("所有镜像都失败了，请手动下载 python-%s-embed-amd64.zip 放到项目根目录，"
                     "改名 py.zip 后重跑" % VERSION)


def main():
    if os.path.exists(os.path.join(RUNTIME, "python.exe")):
        print("runtime/ 已存在，跳过")
        return
    download()
    os.makedirs(RUNTIME, exist_ok=True)
    print("解压到 runtime/")
    with zipfile.ZipFile(TMP) as z:
        z.extractall(RUNTIME)

    # 关键：embeddable 的 _pth 会接管 sys.path，必须把 app/ 加进去
    # 注意用 VERSION 而不是当前解释器版本——跑这个脚本的 python 未必是 3.12
    major, minor = VERSION.split(".")[:2]
    stem = "python%s%s" % (major, minor)
    pth = os.path.join(RUNTIME, stem + "._pth")
    with open(pth, "w", newline="\r\n") as f:
        f.write("%s.zip\r\n.\r\n..\\app\r\n" % stem)
    print("已写", stem + "._pth")

    try:
        os.remove(TMP)
    except OSError:
        pass
    print("\n完成。现在双击 start.bat 就能跑。")


if __name__ == "__main__":
    main()
