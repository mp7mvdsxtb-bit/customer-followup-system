# -*- coding: utf-8 -*-
"""更新执行器：在主进程退出后替换文件并重启。

独立进程，不 import 项目里的任何模块（因为 app/ 马上就会被换掉）。
由 updater.launch_helper() 以 pythonw 无窗口方式拉起。
"""
import json
import os
import py_compile
import shutil
import socket
import subprocess
import sys
import time

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))
UPD = os.path.join(ROOT, "data", "updates")
STAGING = os.path.join(UPD, "staging")
RESULT = os.path.join(UPD, "result.json")


def log(msg):
    try:
        with open(os.path.join(UPD, "update.log"), "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    except OSError:
        pass


def wait_port_free(port=8795, timeout=20):
    """等主进程把端口让出来。"""
    end = time.time() + timeout
    while time.time() < end:
        with socket.socket() as s:
            s.settimeout(0.4)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return True
        time.sleep(0.6)
    return False


def syntax_ok(path):
    bad = []
    for dirpath, _, files in os.walk(path):
        for fn in files:
            if fn.endswith(".py"):
                fp = os.path.join(dirpath, fn)
                try:
                    py_compile.compile(fp, cfile=os.path.join(UPD, "chk.pyc"),
                                       doraise=True)
                except py_compile.PyCompileError as e:
                    bad.append("%s: %s" % (fn, e.msg))
    return bad


def copy_tree(src, dst):
    n = 0
    for dirpath, _, files in os.walk(src):
        rel = os.path.relpath(dirpath, src)
        target = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target, exist_ok=True)
        for fn in files:
            shutil.copy2(os.path.join(dirpath, fn), os.path.join(target, fn))
            n += 1
    return n


def finish(ok, message, version=""):
    try:
        os.makedirs(UPD, exist_ok=True)
        with open(RESULT, "w", encoding="utf-8") as f:
            json.dump({"ok": ok, "message": message, "version": version,
                       "at": time.strftime("%Y-%m-%d %H:%M:%S")},
                      f, ensure_ascii=False)
    except OSError:
        pass


def main():
    log("== 更新开始 ==")
    if not os.path.isdir(STAGING):
        finish(False, "没找到待更新的文件")
        return 1

    if not wait_port_free():
        log("端口没释放，但继续尝试替换")

    # 替换前先验语法，错的代码宁可不上
    for sub in ("app",):
        p = os.path.join(STAGING, sub)
        if os.path.isdir(p):
            bad = syntax_ok(p)
            if bad:
                log("语法错误: " + "; ".join(bad[:5]))
                finish(False, "新版本代码有语法错误，已放弃更新：" + bad[0])
                return 1

    # 备份
    for sub in ("app", "tools"):
        src = os.path.join(ROOT, sub)
        bak = os.path.join(ROOT, sub + ".bak")
        if os.path.isdir(src):
            shutil.rmtree(bak, ignore_errors=True)
            try:
                shutil.copytree(src, bak)
                log("已备份 %s → %s.bak" % (sub, sub))
            except Exception as e:
                log("备份 %s 失败: %s" % (sub, e))

    # 覆盖
    total = 0
    try:
        for sub in ("app", "tools"):
            p = os.path.join(STAGING, sub)
            if os.path.isdir(p):
                total += copy_tree(p, os.path.join(ROOT, sub))
        for fn in os.listdir(STAGING):
            fp = os.path.join(STAGING, fn)
            if os.path.isfile(fp):
                shutil.copy2(fp, os.path.join(ROOT, fn))
                total += 1
    except Exception as e:
        log("替换失败: %s" % e)
        finish(False, "替换文件时出错：%s（app.bak 里有旧版本）" % e)
        return 1
    log("已替换 %d 个文件" % total)

    # 读一下新版本号
    ver = ""
    try:
        with open(os.path.join(ROOT, "app", "release.py"), encoding="utf-8") as f:
            for line in f:
                if line.startswith("VERSION"):
                    ver = line.split("=")[1].strip().strip('"').strip("'")
                    break
    except OSError:
        pass

    shutil.rmtree(STAGING, ignore_errors=True)
    finish(True, "更新完成，共替换 %d 个文件" % total, ver)
    log("== 更新完成 %s ==" % ver)

    # 重新启动
    start_bat = os.path.join(ROOT, "start.bat")
    if os.path.exists(start_bat):
        try:
            subprocess.Popen(["cmd", "/c", "start", "", start_bat],
                             cwd=ROOT, shell=False,
                             creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
            log("已重新启动")
        except Exception as e:
            log("重启失败: %s" % e)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log("未捕获异常: %r" % e)
        finish(False, "更新过程异常：%s" % e)
        sys.exit(1)
