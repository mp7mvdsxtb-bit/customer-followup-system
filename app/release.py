# -*- coding: utf-8 -*-
"""版本号与更新通道配置。

发新版时改这里（VERSION）+ GitHub 打一个同名 tag（v1.2.0）。
程序靠 Releases 的 tag 判断有没有新版本。
"""

VERSION = "1.4.1"

# 本安装专属更新通道；另一个版本使用 no-intro。
UPDATE_CHANNEL = "with-intro"

APP_NAME = "客户跟进系统"

# 公开仓库：只放代码，不放客户数据
REPO = "mp7mvdsxtb-bit/customer-followup-system"
REPO_URL = "https://github.com/" + REPO
RELEASES_API = "https://api.github.com/repos/%s/releases" % REPO
RELEASES_PAGE = REPO_URL + "/releases"

# 判断新版本时忽略的文件：这些是数据，更新不能覆盖
KEEP_ON_UPDATE = ("data/",)

# 更新时只替换这些前缀下的文件，其余一律不碰
UPDATE_ALLOW = ("app/", "tools/")
UPDATE_ALLOW_FILES = ("start.bat", "停止服务.bat", "启用提醒.bat",
                      "关闭提醒.bat", "重置数据.bat", "使用说明.txt", "README.md")


def parse_ver(v):
    """'v1.2.3' / '1.2.3' -> (1,2,3)；解析不了返回 (0,)"""
    s = str(v or "").strip().lstrip("vV")
    out = []
    for part in s.split("."):
        num = ""
        for ch in part:
            if ch.isdigit():
                num += ch
            else:
                break
        out.append(int(num) if num else 0)
    while len(out) < 3:
        out.append(0)
    return tuple(out[:3])


def is_newer(latest, current=None):
    """current 默认在调用时读取 VERSION，而不是定义时绑定。"""
    return parse_ver(latest) > parse_ver(current if current is not None else VERSION)
