# -*- coding: utf-8 -*-
"""脏数据解析：联系方式、日期、跟进长文本、状态推断。

源表的实际情况：手机号夹座机、微信号、"脉脉"昵称混在一列；跟进情况是逐日
追加的长文本；日期写作 1.2 / 01.20 / 3.04 / 2026.9.28 四种。这里集中处理。
"""
import datetime
import re

TODAY = datetime.date.today()
YEAR = TODAY.year

# ── 公司名 ────────────────────────────────────────────────
_PUNCT = str.maketrans({"（": "(", "）": ")", "　": " ", "：": ":", "，": ","})


def norm_company(name):
    s = (name or "").translate(_PUNCT)
    s = re.sub(r"\s+", "", s)
    s = s.strip(".,;:、-—")
    return s


# ── 号码 ──────────────────────────────────────────────────
MOBILE = re.compile(r"1[3-9]\d{9}")
LANDLINE = re.compile(r"(?:0\d{2,3}[-\s]?\d{7,8})")
HOTLINE = re.compile(r"400[-\s]?\d{3}[-\s]?\d{4}")
DIGIT_RUN = re.compile(r"\d{6,14}")


def _squeeze_digits(text):
    """把手机号中间的空格干掉：'156 8383 9266' -> '15683839266'。"""
    return re.sub(r"(?<=\d)[ \u00a0]+(?=\d)", "", text or "")


def extract_numbers(text):
    """返回 (mobiles, landlines, others)。"""
    t = _squeeze_digits(text)
    mobiles = MOBILE.findall(t)
    hot = HOTLINE.findall(t)
    lands = [x for x in LANDLINE.findall(t) if not any(x in m for m in hot)]
    others = []
    for run in DIGIT_RUN.findall(t):
        if run in mobiles or any(run in h.replace("-", "").replace(" ", "") for h in hot):
            continue
        if any(run in l.replace("-", "").replace(" ", "") for l in lands):
            continue
        if len(run) in (6, 7, 8):        # 太短，多半是工号/分机
            continue
        others.append(run)
    return mobiles, lands + hot, others


# ── 联系人 ────────────────────────────────────────────────
TITLE_WORDS = (
    "人事", "招聘", "人力资源", "HRBP", "HRD", "HR", "BP", "政委", "经理", "总监",
    "主管", "负责人", "专员", "部长", "副总", "总裁", "校长", "院长", "总", "老师",
    "主任", "工程师", "业务", "采购", "行政", "文档", "仓库", "研发", "运营", "人资",
)
NAME_SUFFIX = ("先生", "女士", "小姐", "老师", "总", "经理", "总监", "主管", "负责人")
CHANNEL_HINTS = {
    "maimai": ("脉脉",),
    "wechat": ("微信", "weixin", "vx"),
}
WECHAT_ID = re.compile(r"微信(?:号)?[:：]?\s*([A-Za-z][A-Za-z0-9_\-]{3,})")
SEP = re.compile(r"[\s\-—/、|,，:：()（）\n\r\t]+")


def _clean_name(seg):
    s = seg.strip(" .。:：-—")
    s = re.sub(r"^[^\u4e00-\u9fa5A-Za-z]+", "", s)
    s = re.sub(r"[^\u4e00-\u9fa5A-Za-z]+$", "", s)
    return s


def parse_contact(text):
    """把一格里的人名/号码/渠道拆开。返回 dict，字段都可能为空。"""
    raw = (text or "").strip()
    out = {
        "name": "", "phone": "", "other_phone": "", "wechat": "",
        "channel": "unknown", "title": "", "note": "",
    }
    if not raw:
        return out

    mobiles, lands, others = extract_numbers(raw)
    if mobiles:
        out["phone"] = mobiles[0]
        if len(mobiles) > 1:
            out["other_phone"] = "/".join(mobiles[1:])
    elif lands:
        out["phone"] = lands[0]
        out["channel"] = "landline"
    elif others:
        out["other_phone"] = others[0]
        out["channel"] = "other"

    m = WECHAT_ID.search(raw)
    if m:
        out["wechat"] = m.group(1)
        out["channel"] = "wechat"

    low = raw.lower()
    for ch, hints in CHANNEL_HINTS.items():
        if any(h in low for h in hints):
            if ch == "maimai":
                out["channel"] = "maimai"
            elif not out["phone"] and not out["wechat"]:
                out["channel"] = "wechat"
            break

    # 余下文字里挑名字与职位
    rest = raw
    for pat in (MOBILE, LANDLINE, HOTLINE, DIGIT_RUN):
        rest = pat.sub(" ", rest)
    rest = WECHAT_ID.sub(" ", rest)
    rest = re.sub(r"微信(号)?(同号|同手机号)?|脉脉|企微|个微|在线|400|校招", " ", rest)

    name, title, leftovers = "", "", []
    for seg in SEP.split(rest):
        seg = _clean_name(seg)
        if not seg or len(seg) > 24:
            continue
        if seg in ("男", "女", "在职", "离职", "个微", "企微"):
            continue
        has_title = any(w in seg for w in TITLE_WORDS)
        core = re.sub(r"[-—_]", "", seg)
        if not name and not has_title and 2 <= len(core) <= 9 and re.fullmatch(
            r"[\u4e00-\u9fa5A-Za-z]{2,9}", core
        ):
            name = core
        elif not name and has_title:
            # "韩经理" / "周老师" 这类：去掉职位词剩下的当名字，但只剩一个字就整段留作名字
            for suf in NAME_SUFFIX:
                if core.endswith(suf) and len(core) - len(suf) >= 2:
                    name = core[: -len(suf)]
                    title = title or suf
                    break
            if not name and 2 <= len(core) <= 9:
                name = core
        elif has_title and not title:
            title = seg
        else:
            leftovers.append(seg)

    out["name"] = name or out["name"]
    out["title"] = title
    out["note"] = " ".join(leftovers)[:80]
    if out["channel"] == "unknown" and out["phone"]:
        out["channel"] = "phone"
    return out


# ── 日期 ──────────────────────────────────────────────────
_DATE_PAT = re.compile(
    r"(?:(?P<y>20\d{2})[./\-])?(?P<m>\d{1,2})[.\-/月](?P<d>\d{1,2})日?"
)


def parse_date(text, default_year=None, future_ok=True):
    """'01.20' / '1.2' / '3.04' / '2026.9.28' / '9月16日' -> 'YYYY-MM-DD'。

    没有年份的按当年。future_ok=False 用于「事情发生的日期」：既然不可能发生在
    未来，算出来比今天晚就直接算去年（例：11 月整理的表里出现 12.5 是去年 12 月）。
    """
    if text is None:
        return ""
    s = str(text).strip()
    if not s:
        return ""
    m = _DATE_PAT.search(s)
    if not m:
        return ""
    y = int(m.group("y")) if m.group("y") else (default_year or YEAR)
    mo, d = int(m.group("m")), int(m.group("d"))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return ""
    try:
        got = datetime.date(y, mo, d)
    except ValueError:
        return ""
    if not m.group("y"):
        limit = TODAY if not future_ok else TODAY + datetime.timedelta(days=30)
        if got > limit:
            try:
                got = datetime.date(y - 1, mo, d)
            except ValueError:
                pass
    return got.isoformat()


# ── 长文本 → 时间线 ───────────────────────────────────────
_SPLIT_MARK = re.compile(
    r"(?:^|(?<=[\s；;。\n]))(20\d{2}[./\-])?(\d{1,2})[.\-/月](\d{1,2})日?"
)


def split_timeline(text, default_year=None, future_ok=False):
    """把 '01.20联系…01.21加上微信…' 切成 [(日期, 内容), ...]。"""
    s = (text or "").replace("\r", "\n").strip()
    if not s:
        return []
    marks = []
    for m in _SPLIT_MARK.finditer(s):
        y = int(m.group(1)[:4]) if m.group(1) else (default_year or YEAR)
        mo, d = int(m.group(2)), int(m.group(3))
        if not (1 <= mo <= 12 and 1 <= d <= 31):
            continue
        try:
            dt = datetime.date(y, mo, d)
        except ValueError:
            continue
        if not m.group(1):
            limit = TODAY if not future_ok else TODAY + datetime.timedelta(days=30)
            if dt > limit:
                try:
                    dt = datetime.date(y - 1, mo, d)
                except ValueError:
                    continue
        marks.append((m.start(), m.end(), dt.isoformat()))
    if not marks:
        return [("", s)]
    out = []
    if marks[0][0] > 0:
        head = s[: marks[0][0]].strip(" ；;。,，\n")
        if head:
            out.append(("", head))
    for i, (_, end, day) in enumerate(marks):
        nxt = marks[i + 1][0] if i + 1 < len(marks) else len(s)
        body = s[end:nxt].strip(" ；;。,，\n")
        if body:
            out.append((day, body))
    return out


# ── 状态推断 ──────────────────────────────────────────────
STAGES = [
    ("signed", ("已签约", "签约完成", "已充值", "已预充", "合同已", "已打款")),
    ("negotiating", ("签约中", "对接合同", "走招投标", "招投标流程", "商务条款")),
    ("dropped", ("没有合作", "不合作", "丢单", "不再跟进", "不考虑", "已流失")),
    ("no_need", ("无需求", "暂时不需要", "暂时没有需求", "没有背调需求", "无背调需求",
                 "不需要", "无招聘需求", "暂无需求", "不招人", "近期无需求")),
    ("trial", ("试单", "试用", "体验中", "申请试用")),
    ("material", ("已发资料", "发了资料", "已发报价", "发了报价", "发送报价", "已报价",
                  "发送报告", "发资料", "已发企业介绍", "发送卡券", "发送卡卷", "发卡券")),
    # 「已加微信」和「可加微信」是两件事：前者已经建立私域，后者只是拿到了入口
    ("wechat", ("已加微信", "加上微信", "加了微信", "已添加微信", "微信已加", "已通过微信")),
    ("reachable", ("可加微信", "可添加微信", "微信同号", "微信同手机号", "可加好友",
                   "号码可加微信", "号码可加", "加微信了解", "微信联系", "可加微信了解")),
    ("interested", ("有兴趣", "意向", "了解一下", "询价", "咨询", "想知道", "想了解")),
    ("contacted", ("不接", "未接", "没接", "挂断", "不回复", "未回复", "打错", "已离职",
                   "失联", "未通过", "搜不到", "不通过", "问啥都不清楚", "拒")),
]

STAGE_LABEL = {
    "new": "待触达", "contacted": "已触达", "reachable": "待加微", "wechat": "已加微信",
    "interested": "有兴趣", "material": "已发资料", "trial": "试单中",
    "negotiating": "签约中", "signed": "已签约", "no_need": "暂无需求", "dropped": "已弃单",
}
STAGE_ORDER = ["new", "contacted", "reachable", "wechat", "interested", "material",
               "trial", "negotiating", "signed", "no_need", "dropped"]
# 推进程度（越大越靠后），用于漏斗和排序
STAGE_RANK = {s: i for i, s in enumerate(
    ["new", "contacted", "reachable", "wechat", "interested", "material",
     "trial", "negotiating", "signed"])}
STAGE_RANK.update({"no_need": -1, "dropped": -1})


def infer_stage(*texts):
    blob = " ".join(str(t or "") for t in texts)
    if not blob.strip():
        return "new"
    for stage, keys in STAGES:
        if any(k in blob for k in keys):
            return stage
    return "new"


# ── 第三方背调 ────────────────────────────────────────────
VENDOR_NAMES = ("八方", "全景", "太和", "芝麻", "爱背调", "i背调", "凯莱德", "汇华",
                "求真", "猎聘背调", "智联背调", "boss直聘背调")
NO_TP = ("无三方", "无第三方", "没有三方", "没有第三方", "目前无三方", "暂无三方",
         "自己做背调", "自己背调", "公司自己背调", "自己做的背调")
YES_TP = ("有三方", "有第三方", "已有三方", "已有第三方", "有多家三方", "多家三方",
          "有固定三方", "有合作供应商", "有合作的第三方", "有三方合作") + VENDOR_NAMES
UNKNOWN_TP = ("不清楚", "不确定", "不方便告知", "不负责", "待确认", "不知道", "没问")


def infer_third_party(text):
    s = str(text or "")
    if not s.strip():
        return "unknown"
    if any(k in s for k in NO_TP):
        return "no"
    if any(k in s for k in YES_TP):
        return "yes"
    if any(k in s for k in UNKNOWN_TP):
        return "unknown"
    return "unknown"


def vendor_note(text):
    s = str(text or "")
    hits = [v for v in VENDOR_NAMES if v in s]
    return "、".join(dict.fromkeys(hits))


# ── 规模 ──────────────────────────────────────────────────
SIZE_BAND = [(10000, "10000+"), (1000, "1000-9999"), (100, "100-999"), (0, "100以下")]


def parse_size(*texts):
    """'2900+' / '大型（1000-9999人）' -> (headcount, band)。"""
    for t in texts:
        s = str(t or "")
        if not s.strip():
            continue
        m = re.search(r"(\d{2,6})\s*人?\s*[以\-~至]", s)
        if not m:
            m = re.search(r"(\d{2,6})\s*\+", s)
        if not m:
            m = re.search(r"^(\d{2,6})$", s.strip())
        if m:
            n = int(m.group(1))
            band = next(b for th, b in SIZE_BAND if n >= th)
            return n, band
    s = str(texts[0] or "") + str(texts[1] if len(texts) > 1 else "")
    for th, b in SIZE_BAND:
        if ("超大型" if th >= 10000 else "大型" if th >= 1000 else "中型" if th >= 100 else "小型") in s:
            return th, b
    return None, ""


# ── 商机线索自由文本 ──────────────────────────────────────
CO_SUFFIX = ("有限公司", "股份公司", "集团", "公司", "研究院", "银行", "中心", "工厂",
             "厂", "事务所", "医院", "学校", "大学", "局", "所")


def parse_lead_blob(text):
    """'陶杨，15250695910，人事，女，中辰昊智能装备（江苏）有限公司，有兴趣了'"""
    raw = (text or "").replace("\u00a0", "|").replace("，", ",").replace("。", ";")
    raw = re.sub(r"[；;]+", ";", raw)
    parts = [p.strip() for p in re.split(r"[,\t;|\-]+", raw) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in re.split(r"\s{2,}|-", raw) if p.strip()]

    out = {"company": "", "name": "", "phone": "", "title": "", "note": "", "gender": ""}
    notes = []
    for p in parts:
        p = re.sub(r"@\S+\s*$", "", p).strip()     # 去掉 @史清竹 这类提及
        if not p:
            continue
        p2 = p.replace(" ", "")
        mob = MOBILE.search(p2)
        if mob and not out["phone"]:
            out["phone"] = mob.group(0)
            p = MOBILE.sub("", p).strip()
            p2 = p2.replace(mob.group(0), "")
            if not p2:
                continue
        if p2 in ("男", "女"):
            out["gender"] = p2
            continue
        # 公司名的判据是「以公司后缀结尾」，避免把
        # 「之前在某某化妆品有限公司目前在哪家未透露」这种描述当公司；
        # 「某某商业保理有限公司（合肥）」要先剥掉末尾括号再判。
        core = re.sub(r"[（(][^）)]*[）)]$", "", p2)
        if 4 <= len(core) <= 30 and any(core.endswith(s) for s in CO_SUFFIX):
            if len(p2) > len(out["company"]):
                out["company"] = p2
            continue
        if any(w in p2 for w in ("@", "推荐")):
            notes.append(p)
            continue
        core = _clean_name(p2)
        if not out["name"] and 2 <= len(core) <= 4 and re.fullmatch(r"[\u4e00-\u9fa5]{2,4}", core) \
                and not any(w in core for w in TITLE_WORDS):
            out["name"] = core
            continue
        if any(w in p2 for w in TITLE_WORDS) and len(p2) <= 16:
            if not out["title"]:
                out["title"] = p2
            continue
        notes.append(p)
    out["note"] = "；".join(notes)[:160]
    return out
