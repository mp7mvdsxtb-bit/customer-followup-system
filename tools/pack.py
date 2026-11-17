# -*- coding: utf-8 -*-
"""打可分发的绿色压缩包：解压即用，不装 Python。"""
import datetime
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.dirname(ROOT)


def version():
    import re
    try:
        with open(os.path.join(ROOT, "app", "release.py"), encoding="utf-8") as f:
            m = re.search(r'VERSION\s*=\s*"([^"]+)"', f.read())
            if m:
                return m.group(1)
    except OSError:
        pass
    return "0.0.0"

SKIP_DIRS = {"__pycache__", ".git", "shots", "node_modules", "backups"}
SKIP_EXT = {".pyc", ".pyo", ".log", ".pdb", ".ilk", ".exp", ".lib"}
SKIP_NAMES = {"crm.db-wal", "crm.db-shm", "server.log", "start.log", "py.zip"}

INCLUDE_TOP = [
    "start.bat", "停止服务.bat", "启用提醒.bat", "关闭提醒.bat", "重置数据.bat",
    "使用说明.txt", "app", "runtime", "tools",
]
# 注意：这里绝不能出现 "data"。
# 发布包是要上传到公开 Release 的，一旦带上 crm.db / seed.xlsx
# 就等于把客户名单（公司名 + 手机号）公开了。
# 需要带数据的本机/私下分发包，用 tools/make_* 系列脚本单独生成。


def want(path):
    base = os.path.basename(path)
    if base in SKIP_NAMES:
        return False
    if os.path.splitext(base)[1].lower() in SKIP_EXT:
        return False
    return True


def verify_no_data(path):
    """发布前自检：包里有任何数据库或表格就报错。
    这条检查是为了防止再次把客户数据传上公开 Release。"""
    bad = []
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            low = n.lower()
            if ("/data/" in low or low.startswith("data/")
                    or low.endswith((".db", ".db-wal", ".db-shm", ".xlsx", ".xls", ".csv"))):
                bad.append(n)
    if bad:
        raise SystemExit(
            "!! 打包自检失败：压缩包里含数据文件，禁止发布：\n   " + "\n   ".join(bad[:10]))
    return True


def main():
    stamp = datetime.date.today().strftime("%Y%m%d")
    ver = version()
    out = os.path.join(OUT_DIR, "customer-followup-system-v%s.zip" % ver)
    if os.path.exists(out):
        os.remove(out)
    n, total = 0, 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for top in INCLUDE_TOP:
            p = os.path.join(ROOT, top)
            if not os.path.exists(p):
                print("  跳过（不存在）:", top)
                continue
            if os.path.isfile(p):
                z.write(p, os.path.join("客户跟进系统", top))
                n += 1
                total += os.path.getsize(p)
                continue
            for dirpath, dirnames, filenames in os.walk(p):
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
                for fn in filenames:
                    fp = os.path.join(dirpath, fn)
                    if not want(fp):
                        continue
                    rel = os.path.relpath(fp, ROOT).replace("\\", "/")
                    z.write(fp, "客户跟进系统/" + rel)
                    n += 1
                    total += os.path.getsize(fp)
    size = os.path.getsize(out)
    verify_no_data(out)
    print("发布自检通过：包内不含任何数据库/表格文件")
    print("文件 %d 个，原始 %.1f MB，压缩后 %.1f MB" % (n, total / 1048576, size / 1048576))
    print("输出：", out)
    return out


if __name__ == "__main__":
    main()
