# -*- coding: utf-8 -*-
"""在线更新：检查 GitHub Releases → 下载 → 解压 → 交给独立进程替换。

为什么不直接替换：Windows 上正在运行的 python 会占住文件，
而且进程没法覆盖自己。所以改成「准备好新文件 + 拉起一个 helper +
主进程退出 + helper 替换并重启」。
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

import release

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
UPD_DIR = os.path.join(DATA, "updates")
STAGING = os.path.join(UPD_DIR, "staging")
RESULT = os.path.join(UPD_DIR, "result.json")
UA = "FollowUpCRM-Updater/1.0 (+%s)" % release.REPO_URL


def _fetch(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def check():
    """查最新版本。任何失败都安静返回，不打扰使用。"""
    out = {
        "current": release.VERSION,
        "latest": "",
        "has_update": False,
        "notes": "",
        "url": release.RELEASES_PAGE,
        "published": "",
        "asset": None,
        "error": "",
    }
    # 按通道和版本选择 Release，逐页扫描以免遗漏旧通道。
    prefix = release.UPDATE_CHANNEL + "-v"
    candidates = []
    page = 1
    try:
        while True:
            raw = _fetch(release.RELEASES_API + "?per_page=100&page=%d" % page, timeout=8)
            items = json.loads(raw.decode("utf-8"))
            if not isinstance(items, list):
                raise ValueError("invalid release list")
            for item in items:
                tag = (item.get("tag_name") or "").strip()
                version = tag[len(prefix):] if tag.startswith(prefix) else ""
                if (not item.get("draft") and not item.get("prerelease")
                        and re.fullmatch(r"\d+\.\d+\.\d+", version)):
                    candidates.append((release.parse_ver(version), version, item))
            if len(items) < 100:
                break
            page += 1
    except urllib.error.HTTPError as e:
        out["error"] = "仓库还没有发布版本" if e.code == 404 else "GitHub 返回 %d" % e.code
        return out
    except Exception as e:
        out["error"] = "连不上 GitHub（%s）" % type(e).__name__
        return out

    if not candidates:
        out["error"] = "此版本的更新通道尚无发布版本"
        return out
    _, version, data = max(candidates, key=lambda item: item[0])
    out["latest"] = version
    out["notes"] = (data.get("body") or "").strip()[:1200]
    out["published"] = (data.get("published_at") or "")[:10]
    out["url"] = data.get("html_url") or release.RELEASES_PAGE
    expected = "customer-followup-%s-v%s.zip" % (release.UPDATE_CHANNEL, version)
    for asset in data.get("assets") or []:
        if asset.get("name") == expected and asset.get("browser_download_url"):
            out["asset"] = {"name": expected, "url": asset["browser_download_url"],
                            "size": asset.get("size", 0)}
            break
    if release.is_newer(version):
        if out["asset"]:
            out["has_update"] = True
        else:
            out["error"] = "此版本缺少对应的更新包，请稍后重试"
    return out


def _safe_members(zf):
    """只取允许替换的那部分，并且拒绝跳出目录的路径。"""
    for info in zf.infolist():
        if info.is_dir():
            continue
        name = info.filename.replace("\\", "/")
        parts = name.split("/")
        rel = "/".join(parts[1:]) if len(parts) > 1 else parts[0]
        if not rel or rel.endswith("/") or ".." in rel.split("/"):
            continue
        ok = rel.startswith(release.UPDATE_ALLOW) or rel in release.UPDATE_ALLOW_FILES
        if not ok:
            continue
        norm = os.path.normpath(rel).replace("\\", "/")
        if norm.startswith("..") or os.path.isabs(norm):
            continue
        yield info, norm


def prepare(asset):
    """下载 + 解压到 staging。返回文件数。"""
    if not asset or not asset.get("url"):
        raise RuntimeError("这个版本没有附带 zip 包")
    os.makedirs(UPD_DIR, exist_ok=True)
    if os.path.exists(STAGING):
        shutil.rmtree(STAGING, ignore_errors=True)
    os.makedirs(STAGING, exist_ok=True)

    zp = os.path.join(UPD_DIR, "download.zip")
    req = urllib.request.Request(asset["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r, open(zp, "wb") as f:
        shutil.copyfileobj(r, f)

    n = 0
    with zipfile.ZipFile(zp) as zf:
        for info, rel in _safe_members(zf):
            dst = os.path.join(STAGING, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with zf.open(info) as src, open(dst, "wb") as out:
                shutil.copyfileobj(src, out)
            n += 1
    try:
        os.remove(zp)
    except OSError:
        pass
    if n == 0:
        raise RuntimeError("压缩包里没有可更新的文件（结构不对？）")
    return n


def launch_helper():
    """把 helper 拷到 data/updates 下，用 pythonw 无窗口拉起，然后主进程该退出了。"""
    src = os.path.join(HERE, "update_helper.py")
    dst = os.path.join(UPD_DIR, "update_helper.py")
    shutil.copyfile(src, dst)

    pyw = os.path.join(ROOT, "runtime", "pythonw.exe")
    if not os.path.exists(pyw):
        pyw = os.path.join(ROOT, "runtime", "python.exe")
    if not os.path.exists(pyw):
        pyw = sys.executable

    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | \
                getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen([pyw, dst, ROOT], cwd=ROOT, creationflags=flags,
                     close_fds=True, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def last_result():
    try:
        with open(RESULT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def clear_result():
    try:
        os.remove(RESULT)
    except OSError:
        pass
