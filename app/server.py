# -*- coding: utf-8 -*-
"""本地 HTTP 服务：只绑 127.0.0.1，单用户，无需鉴权。

路由：/api/today /api/companies /api/company/<id> /api/contact/<id>
      /api/stats /api/settings /api/export /api/import
"""
import datetime
import json
import mimetypes
import os
import socket
import sqlite3
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import db
import parse
import release
import updater

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATIC = os.path.join(HERE, "static")
DATA = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA, "crm.db")
SEED = os.path.join(DATA, "seed.xlsx")

DEFAULT_BUDGET = 60
# 一条跟进要花的分钟数：新号码要先找号再打
COST = {
    "call_new": 7,      # 从没打过、有手机号
    "call_again": 4,    # 打过但没接通
    "wechat": 3,        # 微信触达
    "maimai": 3,
    "no_channel": 5,    # 只有座机/其它，要先想办法
}

STAGE_LABEL = parse.STAGE_LABEL
STAGE_RANK = parse.STAGE_RANK

_lock = threading.Lock()


def today_str():
    return datetime.date.today().isoformat()


def days_between(a, b):
    try:
        da = datetime.date.fromisoformat(a)
        dbb = datetime.date.fromisoformat(b)
        return (da - dbb).days
    except (ValueError, TypeError):
        return None


# ── 今日工作台 ────────────────────────────────────────────
def build_today(conn, budget=DEFAULT_BUDGET, tdate=None):
    tdate = tdate or today_str()
    base_sql = """
        SELECT c.*, (SELECT COUNT(*) FROM contacts x WHERE x.company_id=c.id) n_contacts,
               (SELECT COUNT(*) FROM contacts x WHERE x.company_id=c.id AND x.phone<>'' ) n_phone,
               (SELECT MIN(x.channel) FROM contacts x WHERE x.company_id=c.id) any_channel
        FROM companies c
        WHERE c.no_follow=0
          AND c.stage NOT IN ('signed','dropped','no_need') AND %s
    """
    due_rows = [dict(r) for r in conn.execute(
        base_sql % "c.next_at<>'' AND c.next_at<=?", (tdate,)).fetchall()]
    # 补足池：没到期的、还没排期的。昨天刚碰过的不补，避免天天推同一家。
    yesterday = (datetime.date.fromisoformat(tdate) - datetime.timedelta(days=1)).isoformat()
    fill_rows = [dict(r) for r in conn.execute(
        base_sql % "(c.next_at='' OR c.next_at>?) AND (c.last_at='' OR c.last_at<?)",
        (tdate, yesterday)).fetchall()]

    def prio(r):
        if r["source"] == "ka":
            return 0
        if r["source"] == "referrer" and r["third_party"] == "yes":
            return 1
        if r["stage"] in ("interested", "wechat", "material", "trial", "negotiating"):
            return 1
        return 2

    def cost(r):
        ch = r.get("any_channel") or ""
        if ch in ("wechat",):
            return COST["wechat"]
        if ch in ("maimai",):
            return COST["maimai"]
        if (r.get("n_phone") or 0) > 0:
            return COST["call_new"] if r["stage"] == "new" else COST["call_again"]
        return COST["no_channel"]

    def prep(r, bucket):
        r["prio"] = prio(r)
        r["cost"] = cost(r)
        r["bucket"] = bucket
        r["overdue"] = days_between(tdate, r["next_at"]) if r["next_at"] else 0
        return r

    due_rows = sorted((prep(r, "due") for r in due_rows),
                      key=lambda x: (x["prio"], x["next_at"] or "9999",
                                     -STAGE_RANK.get(x["stage"], 0)))
    fill_rows = sorted((prep(r, "fill") for r in fill_rows),
                       key=lambda x: (x["prio"], x["last_at"] or "1970-01-01",
                                      x["next_at"] or "9999"))

    picked, used = [], 0
    # 到期的也要受预算约束：之前这里无条件全塞，165 家到期就排了 662 分钟，
    # 一小时的 BD 窗口直接失效。至少保留第一条，避免第一条就超预算时队列全空。
    for r in due_rows:
        if picked and used + r["cost"] > budget:
            break
        picked.append(r)
        used += r["cost"]
    for r in fill_rows:
        if used + r["cost"] > budget:
            continue
        picked.append(r)
        used += r["cost"]

    seen = {r["id"] for r in picked}
    rest = [r for r in due_rows + fill_rows if r["id"] not in seen]
    today_done = conn.execute(
        "SELECT COUNT(*) c FROM activities WHERE happened_at=? AND origin<>'import'", (tdate,)
    ).fetchone()["c"]
    return {
        "date": tdate,
        "budget": budget,
        "planned_minutes": used,
        "done_today": today_done,
        "due_count": len(due_rows),
        "overdue_count": sum(1 for r in due_rows if r["next_at"] and r["next_at"] < tdate),
        "fill_count": len(fill_rows),
        "items": [_brief(conn, r) for r in picked],
        "overflow": [_brief(conn, r) for r in rest[:30]],
        "overflow_total": len(rest),
    }


def _brief(conn, r):
    last = conn.execute(
        """SELECT happened_at, content FROM activities WHERE company_id=?
           ORDER BY (happened_at='') ASC, happened_at DESC, id DESC LIMIT 1""",
        (r["id"],),
    ).fetchone()
    contacts = [dict(x) for x in conn.execute(
        "SELECT id,name,phone,other_phone,wechat,channel,title,is_kp,wechat_added FROM contacts "
        "WHERE company_id=? ORDER BY is_kp DESC, (phone='') ASC, id ASC", (r["id"],)
    ).fetchall()]
    return {
        "id": r["id"], "name": r["name"], "source": r["source"],
        "industry": r["industry"], "size_band": r["size_band"], "region": r["region"],
        "headcount": r["headcount"], "third_party": r["third_party"],
        "third_party_note": r["third_party_note"], "vendors": r["vendors"],
        "stage": r["stage"], "stage_label": STAGE_LABEL.get(r["stage"], r["stage"]),
        "next_at": r["next_at"], "last_at": r["last_at"],
        "overdue": r["overdue"], "prio": r["prio"], "cost": r["cost"],
        "bucket": r.get("bucket", ""),
        "last_note": (last["content"] if last else "")[:90],
        "last_note_at": (last["happened_at"] if last else ""),
        "contacts": contacts,
    }


# ── 客户库 ────────────────────────────────────────────────
def list_companies(conn, q="", source="", stage="", industry="", size="", region="",
                   third="", kp="", nf="", flag="", sort="next", limit=200, offset=0):
    where, args = ["1=1"], []
    if q:
        where.append("(name LIKE ? OR industry LIKE ? OR region LIKE ? OR business LIKE ? "
                     "OR id IN (SELECT company_id FROM contacts WHERE name LIKE ? OR phone LIKE ? OR wechat LIKE ?))")
        like = "%" + q + "%"
        args += [like] * 7
    if source:
        where.append("source=?"); args.append(source)
    if stage:
        where.append("stage=?"); args.append(stage)
    if industry:
        where.append("industry=?"); args.append(industry)
    if size:
        where.append("size_band=?"); args.append(size)
    if region:
        where.append("region LIKE ?"); args.append("%" + region + "%")
    if third:
        where.append("third_party=?"); args.append(third)
    if nf == "1":
        where.append("no_follow=1")
    elif nf == "0":
        where.append("no_follow=0")
    if kp == "1":
        where.append("id IN (SELECT company_id FROM contacts WHERE is_kp=1)")
    if flag == "no_phone":
        where.append("id NOT IN (SELECT company_id FROM contacts WHERE phone<>'')")
    elif flag == "no_industry":
        where.append("COALESCE(industry,'')=''")
    elif flag == "no_size":
        where.append("headcount IS NULL AND COALESCE(size_band,'')=''")
    elif flag == "overdue":
        where.append("no_follow=0 AND next_at<>'' AND next_at<?")
        args.append(today_str())
    elif flag == "never":
        where.append("id NOT IN (SELECT company_id FROM activities)")
    order = {
        "next": "CASE WHEN next_at='' THEN 1 ELSE 0 END, next_at ASC, name",
        "last": "CASE WHEN last_at='' THEN 1 ELSE 0 END, last_at DESC, name",
        "name": "name",
        "size": "CASE WHEN headcount IS NULL THEN 1 ELSE 0 END, headcount DESC",
        "stage": "stage, name",
    }.get(sort, "name")
    sql = ("SELECT c.*, (SELECT COUNT(*) FROM contacts x WHERE x.company_id=c.id) n_contacts,"
           " (SELECT COUNT(*) FROM contacts x WHERE x.company_id=c.id AND x.phone<>'') n_phone"
           " FROM companies c WHERE " + " AND ".join(where) +
           " ORDER BY " + order + " LIMIT ? OFFSET ?")
    rows = [dict(r) for r in conn.execute(sql, args + [limit, offset]).fetchall()]
    total = conn.execute("SELECT COUNT(*) c FROM companies WHERE " + " AND ".join(where), args).fetchone()["c"]
    for r in rows:
        r["stage_label"] = STAGE_LABEL.get(r["stage"], r["stage"])
    return {"total": total, "rows": rows}


def company_detail(conn, cid):
    r = conn.execute("SELECT * FROM companies WHERE id=?", (cid,)).fetchone()
    if not r:
        return None
    out = dict(r)
    out["stage_label"] = STAGE_LABEL.get(out["stage"], out["stage"])
    out["contacts"] = [dict(x) for x in conn.execute(
        "SELECT * FROM contacts WHERE company_id=? ORDER BY is_kp DESC, invalid ASC, id", (cid,)).fetchall()]
    out["activities"] = [dict(x) for x in conn.execute(
        """SELECT a.*, ct.name contact_name FROM activities a
           LEFT JOIN contacts ct ON ct.id=a.contact_id
           WHERE a.company_id=? ORDER BY (a.happened_at='') ASC, a.happened_at DESC, a.id DESC""",
        (cid,)).fetchall()]
    out["siblings"] = [dict(x) for x in conn.execute(
        "SELECT id,name,region,source FROM companies WHERE norm_name=? AND id<>?", (out["norm_name"], cid)).fetchall()]
    return out


def stats(conn):
    def g(sql, *a):
        return [dict(x) for x in conn.execute(sql, *a).fetchall()]
    total = conn.execute("SELECT COUNT(*) c FROM companies").fetchone()["c"]
    return {
        "total": total,
        "by_source": g("SELECT source k, COUNT(*) v FROM companies GROUP BY source"),
        "by_stage": g("SELECT stage k, COUNT(*) v FROM companies GROUP BY stage"),
        "by_industry": g("SELECT COALESCE(NULLIF(industry,''),'未分类') k, COUNT(*) v FROM companies "
                         "GROUP BY k ORDER BY v DESC LIMIT 20"),
        "by_size": g("SELECT COALESCE(NULLIF(size_band,''),'未知') k, COUNT(*) v FROM companies "
                     "GROUP BY k ORDER BY v DESC"),
        "by_region": g("SELECT COALESCE(NULLIF(region,''),'未知') k, COUNT(*) v FROM companies "
                       "GROUP BY k ORDER BY v DESC LIMIT 15"),
        "by_third": g("SELECT third_party k, COUNT(*) v FROM companies GROUP BY k"),
        "due_today": conn.execute("SELECT COUNT(*) c FROM companies WHERE no_follow=0 "
                                  "AND next_at=?", (today_str(),)).fetchone()["c"],
        "overdue": conn.execute("SELECT COUNT(*) c FROM companies WHERE no_follow=0 "
                                "AND next_at<>'' AND next_at<?", (today_str(),)).fetchone()["c"],
        "no_phone": conn.execute(
            "SELECT COUNT(*) c FROM companies WHERE id NOT IN "
            "(SELECT company_id FROM contacts WHERE phone<>'')").fetchone()["c"],
    }


def search_all(conn, q, limit=8):
    like = "%" + q + "%"
    comps = [dict(r) for r in conn.execute(
        """SELECT id,name,source,industry,region FROM companies
           WHERE name LIKE ? OR industry LIKE ? OR business LIKE ?
           ORDER BY CASE source WHEN 'ka' THEN 0 ELSE 1 END, name LIMIT ?""",
        (like, like, like, limit)).fetchall()]
    cts = [dict(r) for r in conn.execute(
        """SELECT ct.id,ct.name,ct.phone,ct.wechat,ct.title,ct.company_id,co.name company_name
           FROM contacts ct JOIN companies co ON co.id=ct.company_id
           WHERE ct.name LIKE ? OR ct.phone LIKE ? OR ct.wechat LIKE ? OR co.name LIKE ?
           ORDER BY ct.is_kp DESC, ct.id LIMIT ?""",
        (like, like, like, like, limit)).fetchall()]
    return {"companies": comps, "contacts": cts}


def bulk_action(conn, ids, action, value=None, tdate=None):
    if not ids:
        return {"ok": False, "error": "没有选中"}
    ph = ",".join("?" * len(ids))
    args = list(ids)
    if action == "stage":
        conn.execute("UPDATE companies SET stage=?, updated_at=? WHERE id IN (%s)" % ph,
                     [value, db.now()] + args)
    elif action == "next_at":
        conn.execute("UPDATE companies SET next_at=?, updated_at=? WHERE id IN (%s)" % ph,
                     [value or "", db.now()] + args)
    elif action == "no_follow":
        conn.execute("UPDATE companies SET no_follow=1, stage='dropped', next_at='', "
                     "no_follow_reason=COALESCE(NULLIF(no_follow_reason,''),'批量停跟'), updated_at=? "
                     "WHERE id IN (%s)" % ph, [db.now()] + args)
    elif action == "delete":
        conn.execute("DELETE FROM companies WHERE id IN (%s)" % ph, args)
    else:
        return {"ok": False, "error": "未知操作"}
    conn.commit()
    return {"ok": True, "affected": len(ids)}


GOAL_DEFAULTS = {"goal_target": "60000", "goal_floor": "30000"}


def goals_payload(conn, tdate=None):
    t = datetime.date.fromisoformat(tdate or today_str())
    target = int(float(db.get_setting(conn, "goal_target", GOAL_DEFAULTS["goal_target"])))
    floor = int(float(db.get_setting(conn, "goal_floor", GOAL_DEFAULTS["goal_floor"])))
    months = []
    # 当前月往前 3、往后 2
    y, m = t.year, t.month
    keys = []
    for delta in range(-3, 3):
        mm = m + delta
        yy = y + (mm - 1) // 12
        mm = (mm - 1) % 12 + 1
        keys.append((yy, mm))
    for yy, mm in keys:
        key = "%04d-%02d" % (yy, mm)
        actual = db.get_setting(conn, "goal_actual_" + key, "0")
        label = ("%d月" % mm) if yy == t.year else ("%d年%d月" % (yy % 100, mm))
        months.append({
            "key": key, "label": label,
            "target": target, "floor": floor,
            "actual": int(float(actual or 0)),
            "current": (yy == y and mm == m),
        })
    return {"months": months, "target": target, "floor": floor}


def quality_payload(conn, tdate=None):
    tdate = tdate or today_str()
    one = lambda sql, *a: conn.execute(sql, a).fetchone()["c"]
    no_phone = one("""SELECT COUNT(*) c FROM companies WHERE id NOT IN
                      (SELECT company_id FROM contacts WHERE phone<>'')""")
    no_ind = one("SELECT COUNT(*) c FROM companies WHERE COALESCE(industry,'')=''")
    no_size = one("SELECT COUNT(*) c FROM companies WHERE headcount IS NULL "
                  "AND COALESCE(size_band,'')=''")
    no_tp = one("SELECT COUNT(*) c FROM companies WHERE third_party='unknown'")
    overdue = one("SELECT COUNT(*) c FROM companies WHERE no_follow=0 AND next_at<>'' AND next_at<?",
                  tdate)
    never = one("SELECT COUNT(*) c FROM companies WHERE id NOT IN "
                "(SELECT company_id FROM activities)")
    rows = conn.execute("SELECT id,name,norm_name,source,region FROM companies").fetchall()
    dupes = []
    seen = set()
    items = [(r["id"], r["name"], r["norm_name"], r["source"], r["region"]) for r in rows]
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            if (a[0], b[0]) in seen:
                continue
            s = _name_sim(a[2], b[2])
            if s >= 0.88 and a[2] != b[2]:
                seen.add((a[0], b[0]))
                dupes.append({
                    "score": round(s, 3),
                    "items": [
                        {"id": a[0], "name": a[1], "source": a[3]},
                        {"id": b[0], "name": b[1], "source": b[3]},
                    ],
                })
    dupes.sort(key=lambda x: -x["score"])
    return {"no_phone": no_phone, "no_industry": no_ind, "no_size": no_size,
            "no_tp": no_tp, "overdue": overdue, "never": never, "dupes": dupes[:40]}


def _name_sim(a, b):
    """公司名相似度：先剥掉通用后缀，再用编辑距离比。"""
    import difflib
    strip = ("股份有限公司", "有限责任公司", "有限公司", "集团", "科技", "技术", "（中国）", "(中国)")
    def norm(s):
        for w in strip:
            s = s.replace(w, "")
        return s
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def report_payload(conn, days=28, tdate=None):
    t = datetime.date.fromisoformat(tdate or today_str())
    # 近 N 周，每 7 天一格，本周为最后一格
    weeks = []
    monday = t - datetime.timedelta(days=t.weekday())
    span = 4 if days >= 28 else max(1, days // 7)
    for k in range(span - 1, -1, -1):
        start = monday - datetime.timedelta(days=7 * k)
        end = start + datetime.timedelta(days=6)
        n = conn.execute(
            "SELECT COUNT(*) c FROM activities WHERE happened_at BETWEEN ? AND ? AND origin<>'import'",
            (start.isoformat(), end.isoformat())).fetchone()["c"]
        weeks.append({
            "label": "%d/%d" % (start.month, start.day),
            "total": n,
            "current": k == 0,
        })
    ws = monday.isoformat()
    today = t.isoformat()
    total = conn.execute("SELECT COUNT(*) c FROM activities WHERE happened_at BETWEEN ? AND ? "
                         "AND origin<>'import'", (ws, today)).fetchone()["c"]
    by_company = conn.execute("SELECT COUNT(DISTINCT company_id) c FROM activities "
                              "WHERE happened_at BETWEEN ? AND ? AND origin<>'import'",
                              (ws, today)).fetchone()["c"]
    by_result = [dict(r) for r in conn.execute(
        "SELECT result k, COUNT(*) v FROM activities WHERE happened_at BETWEEN ? AND ? "
        "AND origin<>'import' AND result<>'' GROUP BY result ORDER BY v DESC",
        (ws, today)).fetchall()]
    return {"weekly": weeks, "this_week": {
        "total": total, "by_company": by_company, "by_result": by_result,
    }}


def install_reminders():
    """调 PowerShell 注册计划任务（周二至周五 11:30 / 13:00 / 13:30）。"""
    import subprocess
    ps1 = os.path.join(ROOT, "tools", "install_reminders.ps1")
    if not os.path.exists(ps1):
        return {"ok": False, "message": "找不到 tools/install_reminders.ps1"}
    try:
        p = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
            capture_output=True, timeout=60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        out = (p.stdout or b"").decode("gbk", "replace").strip()
        return {"ok": p.returncode == 0, "message": out.splitlines()[-1] if out else "已注册"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


def backup_db():
    import shutil
    bdir = os.path.join(DATA, "backups")
    os.makedirs(bdir, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    dst = os.path.join(bdir, "crm-%s.db" % stamp)
    src = db.connect(DB_PATH)
    try:
        target = sqlite3.connect(dst)
        src.backup(target)
        target.close()
    finally:
        src.close()
    return {"ok": True, "path": os.path.relpath(dst, ROOT), "size": os.path.getsize(dst)}


def weekly_payload(conn, start=None, include_import=False, tdate=None):
    """按周（周一~周日）汇总：跟了哪些客户、每家结果如何。"""
    t = datetime.date.fromisoformat(tdate or today_str())
    if start:
        try:
            s = datetime.date.fromisoformat(start)
        except ValueError:
            s = t - datetime.timedelta(days=t.weekday()) - datetime.timedelta(days=7)
    else:
        # 默认给「上一个完整周」——周一汇报时正好是刚结束的那一周
        s = t - datetime.timedelta(days=t.weekday()) - datetime.timedelta(days=7)
    s -= datetime.timedelta(days=s.weekday())          # 对齐到周一
    e = s + datetime.timedelta(days=6)
    origin = "" if include_import else " AND a.origin='manual'"

    raw = conn.execute(
        """SELECT a.company_id, c.name, c.source, c.industry, c.headcount, c.region,
                  c.stage, c.next_at, c.third_party, c.no_follow,
                  COUNT(*) n, MAX(a.happened_at) last_at
           FROM activities a JOIN companies c ON c.id=a.company_id
           WHERE a.happened_at BETWEEN ? AND ? AND a.happened_at<>'' %s
           GROUP BY a.company_id
           ORDER BY last_at DESC, c.name""" % origin,
        (s.isoformat(), e.isoformat())).fetchall()

    rows = []
    result_count = {}
    for r in raw:
        acts = conn.execute(
            """SELECT happened_at, content, result, kind FROM activities
               WHERE company_id=? AND happened_at BETWEEN ? AND ? AND happened_at<>'' %s
               ORDER BY happened_at, id""" % origin,
            (r["company_id"], s.isoformat(), e.isoformat())).fetchall()
        last = acts[-1] if acts else None
        best_rank, best = -2, ""
        for a in acts:
            rr = STAGE_RANK.get(a["result"], -2)
            if rr > best_rank:
                best_rank, best = rr, a["result"]
            if a["result"]:
                result_count[a["result"]] = result_count.get(a["result"], 0) + 1
        cts = conn.execute(
            "SELECT name,phone FROM contacts WHERE company_id=? AND phone<>'' LIMIT 2",
            (r["company_id"],)).fetchall()
        rows.append({
            "id": r["company_id"], "name": r["name"], "source": r["source"],
            "industry": r["industry"], "headcount": r["headcount"],
            "region": r["region"], "stage": r["stage"],
            "stage_label": STAGE_LABEL.get(r["stage"], r["stage"]),
            "next_at": r["next_at"], "no_follow": r["no_follow"],
            "n": r["n"], "last_at": r["last_at"],
            "last_result": (last["result"] if last else ""),
            "last_content": ((last["content"] or "")[:80] if last else ""),
            "best_result": best,
            "contact": (cts[0]["name"] + " " + cts[0]["phone"]) if cts else "",
        })

    total_acts = sum(r["n"] for r in rows)
    advanced = [r for r in rows if STAGE_RANK.get(r["best_result"], -1) >= 2]
    signed = [r for r in rows if r["best_result"] == "signed" or r["stage"] == "signed"]
    next_week = (e + datetime.timedelta(days=1)).isoformat()
    nxt = [r for r in rows if r["next_at"] and r["next_at"] >= next_week]

    return {
        "week": {
            "start": s.isoformat(), "end": e.isoformat(),
            "label": "%d月%d日 – %d月%d日" % (s.month, s.day, e.month, e.day),
            "prev": (s - datetime.timedelta(days=7)).isoformat(),
            "next": (s + datetime.timedelta(days=7)).isoformat(),
            "is_this_week": s == t - datetime.timedelta(days=t.weekday()),
            "is_last_week": s == t - datetime.timedelta(days=t.weekday()) - datetime.timedelta(days=7),
        },
        "summary": {
            "activities": total_acts,
            "companies": len(rows),
            "advanced": len(advanced),
            "signed": len(signed),
            "next_week_planned": len(nxt),
            "by_result": [{"k": k, "v": v} for k, v in
                          sorted(result_count.items(), key=lambda x: -x[1])],
        },
        "rows": rows,
        "include_import": bool(include_import),
    }


def weekly_csv(conn, start=None, include_import=False):
    import csv
    import io
    d = weekly_payload(conn, start, include_import)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["周报", d["week"]["label"]])
    w.writerow(["跟进次数", d["summary"]["activities"], "覆盖客户",
                d["summary"]["companies"], "有推进", d["summary"]["advanced"],
                "签约", d["summary"]["signed"]])
    w.writerow([])
    w.writerow(["公司", "来源", "行业", "规模", "联系人", "本周跟进次数",
                "本周最好结果", "最后一次结果", "最后一次记录", "当前阶段", "下次跟进"])
    src = {"ka": "目标KA", "referrer": "证明人线索", "bd": "自主BD", "opportunity": "商机线索"}
    for r in d["rows"]:
        w.writerow([
            r["name"], src.get(r["source"], r["source"]), r["industry"],
            (str(r["headcount"]) if r["headcount"] else ""), r["contact"], r["n"],
            STAGE_LABEL.get(r["best_result"], ""), STAGE_LABEL.get(r["last_result"], ""),
            r["last_content"], r["stage_label"], r["next_at"] or "",
        ])
    return "\ufeff" + buf.getvalue(), d["week"]["label"]


# ── HTTP ──────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    server_version = "FollowUpCRM/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("CRM_VERBOSE"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # 工具
    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, obj, code=200):
        self._send(code, obj)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC, path.lstrip("/")))
        if not fp.startswith(STATIC) or not os.path.isfile(fp):
            self._send(404, "not found", "text/plain; charset=utf-8")
            return
        ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
        if fp.endswith(".js"):
            ctype = "application/javascript; charset=utf-8"
        elif fp.endswith(".css"):
            ctype = "text/css; charset=utf-8"
        elif fp.endswith(".html"):
            ctype = "text/html; charset=utf-8"
        with open(fp, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        path = u.path
        if not path.startswith("/api/"):
            return self._static(path)
        conn = db.connect(DB_PATH)
        try:
            one = lambda k, d="": (qs.get(k) or [d])[0]
            if path == "/api/today":
                mins = int(one("minutes", DEFAULT_BUDGET) or DEFAULT_BUDGET)
                return self._json(build_today(conn, mins))
            if path == "/api/companies":
                return self._json(list_companies(
                    conn, q=one("q"), source=one("source"), stage=one("stage"),
                    industry=one("industry"), size=one("size"), region=one("region"),
                    third=one("third"), kp=one("kp"), nf=one("nf"), flag=one("flag"),
                    sort=one("sort", "next"),
                    limit=int(one("limit", "200")), offset=int(one("offset", "0"))))
            if path.startswith("/api/company/"):
                cid = int(path.rsplit("/", 1)[1])
                d = company_detail(conn, cid)
                return self._json(d) if d else self._json({"error": "not found"}, 404)
            if path == "/api/stats":
                return self._json(stats(conn))
            if path == "/api/search":
                q = (one("q") or "").strip()
                if not q:
                    return self._json({"companies": [], "contacts": []})
                return self._json(search_all(conn, q))
            if path == "/api/goals":
                return self._json(goals_payload(conn))
            if path == "/api/quality":
                return self._json(quality_payload(conn))
            if path == "/api/report":
                return self._json(report_payload(conn, int(one("days", "28"))))
            if path == "/api/weekly":
                return self._json(weekly_payload(
                    conn, one("start") or None, one("include_import") == "1"))
            if path == "/api/weekly/export":
                data, label = weekly_csv(
                    conn, one("start") or None, one("include_import") == "1")
                fn = "周报-%s.csv" % label.replace(" ", "").replace("–", "-")
                return self._send(200, data.encode("utf-8"), "text/csv; charset=utf-8",
                                  {"Content-Disposition":
                                   'attachment; filename="%s"' % urllib.parse.quote(fn)})
            if path == "/api/meta":
                return self._json(meta(conn))
            if path == "/api/settings":
                rows = conn.execute("SELECT k,v FROM settings").fetchall()
                d = {r["k"]: r["v"] for r in rows}
                d["db_path"] = os.path.relpath(DB_PATH, ROOT)
                d["version"] = release.VERSION
                d["repo"] = release.REPO
                d["has_seed"] = os.path.exists(SEED)
                d["has_data"] = conn.execute(
                    "SELECT COUNT(*) c FROM companies").fetchone()["c"] > 0
                return self._json(d)
            if path == "/api/update/check":
                return self._json(updater.check())
            if path == "/api/update/result":
                return self._json(updater.last_result() or {})
            if path == "/api/export":
                return self.export(conn, one("fmt", "csv"))
            return self._json({"error": "no route"}, 404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return self._json({"error": str(e)}, 500)
        finally:
            conn.close()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        path = u.path
        body = self._body()
        conn = db.connect(DB_PATH)
        try:
            if path == "/api/company":
                return self._json(create_company(conn, body))
            if path.startswith("/api/company/") and path.endswith("/log"):
                cid = int(path.split("/")[-2])
                return self._json(add_log(conn, cid, body))
            if path.startswith("/api/company/") and path.endswith("/contacts"):
                cid = int(path.split("/")[-2])
                return self._json(create_contact(conn, cid, body))
            if path.startswith("/api/company/"):
                cid = int(path.rsplit("/", 1)[1])
                return self._json(update_company(conn, cid, body))
            if path.startswith("/api/contact/"):
                kid = int(path.rsplit("/", 1)[1])
                return self._json(update_contact(conn, kid, body))
            if path == "/api/bulk":
                return self._json(bulk_action(conn, body.get("ids") or [],
                                              body.get("action"), body.get("value")))
            if path == "/api/goals":
                if "target" in body:
                    db.set_setting(conn, "goal_target", body["target"])
                if "floor" in body:
                    db.set_setting(conn, "goal_floor", body["floor"])
                if body.get("month"):
                    db.set_setting(conn, "goal_actual_" + body["month"], body.get("actual", 0))
                return self._json(goals_payload(conn))
            if path == "/api/reminders":
                return self._json(install_reminders())
            if path == "/api/backup":
                return self._json(backup_db())
            if path == "/api/update/clear":
                updater.clear_result()
                return self._json({"ok": True})
            if path == "/api/update/apply":
                info = updater.check()
                if not info.get("has_update"):
                    return self._json({"ok": False,
                                       "error": info.get("error") or "已经是最新版本"})
                try:
                    n = updater.prepare(info.get("asset"))
                except Exception as e:
                    return self._json({"ok": False, "error": "下载失败：%s" % e})
                updater.launch_helper()
                self._json({"ok": True, "files": n, "version": info.get("latest")})
                # 先把响应发出去，再退出，让页面上看到「正在重启」
                threading.Timer(1.2, lambda: os._exit(0)).start()
                return
            if path == "/api/settings":
                for k, v in body.items():
                    db.set_setting(conn, k, v)
                return self._json({"ok": True})
            if path == "/api/import":
                import importer
                src = body.get("path") or SEED
                res = importer.run(DB_PATH + ".tmp", src, reset=True)
                os.replace(DB_PATH + ".tmp", DB_PATH)
                return self._json(res)
            return self._json({"error": "no route"}, 404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return self._json({"error": str(e)}, 500)
        finally:
            conn.close()

    def do_DELETE(self):
        u = urllib.parse.urlparse(self.path)
        path = u.path
        conn = db.connect(DB_PATH)
        try:
            if path.startswith("/api/contact/"):
                kid = int(path.rsplit("/", 1)[1])
                conn.execute("DELETE FROM contacts WHERE id=?", (kid,))
                conn.commit()
                return self._json({"ok": True})
            if path.startswith("/api/company/"):
                cid = int(path.rsplit("/", 1)[1])
                conn.execute("DELETE FROM companies WHERE id=?", (cid,))
                conn.commit()
                return self._json({"ok": True})
            return self._json({"error": "no route"}, 404)
        finally:
            conn.close()

    # ── 导出 ──────────────────────────────────────────────
    def export(self, conn, fmt):
        import csv
        import io
        rows = conn.execute("""
            SELECT name 公司, source 来源, industry 行业, size_band 规模档, headcount 人数,
                   region 地区, third_party 第三方背调, stage 阶段, next_at 下次跟进,
                   last_at 最近跟进, no_follow 不再跟进, no_follow_reason 原因,
                   (SELECT group_concat(name||' '||phone, ' / ') FROM contacts WHERE company_id=c.id) 联系人
            FROM companies c ORDER BY source, name
        """).fetchall()
        buf = io.StringIO()
        w = csv.writer(buf)
        head = ["公司", "来源", "行业", "规模档", "人数", "地区", "第三方背调", "阶段",
                "下次跟进", "最近跟进", "不再跟进", "原因", "联系人"]
        w.writerow(head)
        for r in rows:
            w.writerow([r[k] for k in head])
        data = "\ufeff" + buf.getvalue()
        fn = "客户跟进导出-%s.csv" % datetime.date.today().isoformat()
        self._send(200, data.encode("utf-8"), "text/csv; charset=utf-8",
                   {"Content-Disposition": 'attachment; filename="%s"' % urllib.parse.quote(fn)})


def meta(conn):
    def distinct(col):
        return [r[0] for r in conn.execute(
            "SELECT DISTINCT %s FROM companies WHERE %s<>'' ORDER BY 1" % (col, col)).fetchall()]
    return {
        "industries": distinct("industry"),
        "sizes": [x for x in ["10000+", "1000-9999", "100-999", "100以下"]],
        "sources": [{"k": k, "v": v} for k, v in
                    (("ka", "目标KA"), ("referrer", "证明人线索"), ("bd", "自主BD"), ("opportunity", "商机线索"))],
        "stages": [{"k": s, "v": STAGE_LABEL[s]} for s in parse.STAGE_ORDER],
        "settings": dict(conn.execute("SELECT k,v FROM settings").fetchall()),
    }


# ── 写操作 ────────────────────────────────────────────────
COMPANY_FIELDS = ("name", "industry", "size_band", "headcount", "region", "business",
                  "vendors", "third_party", "third_party_note", "stage", "no_follow",
                  "no_follow_reason", "next_at", "referrer", "owner")


def update_company(conn, cid, body):
    sets, args = [], []
    for k in COMPANY_FIELDS:
        if k in body:
            v = body[k]
            if k in ("no_follow",):
                v = 1 if v else 0
            if k == "headcount" and v in ("", None):
                v = None
            sets.append("%s=?" % k)
            args.append(v)
    if "name" in body:
        sets.append("norm_name=?")
        args.append(parse.norm_company(body["name"]))
    if not sets:
        return {"ok": False, "error": "empty"}
    sets.append("updated_at=?")
    args.append(db.now())
    args.append(cid)
    conn.execute("UPDATE companies SET " + ", ".join(sets) + " WHERE id=?", args)
    conn.commit()
    return {"ok": True, "company": company_detail(conn, cid)}


def create_company(conn, body):
    name = (body.get("name") or "").strip()
    if not name:
        return {"ok": False, "error": "公司名不能为空"}
    cur = conn.execute(
        """INSERT INTO companies (name,norm_name,source,industry,size_band,region,
           third_party,stage,owner,next_at,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (name, parse.norm_company(name), body.get("source") or "bd",
         body.get("industry") or "", body.get("size_band") or "", body.get("region") or "",
         body.get("third_party") or "unknown", body.get("stage") or "new",
         body.get("owner") or "我", body.get("next_at") or "", db.now(), db.now()))
    conn.commit()
    return {"ok": True, "id": cur.lastrowid}


def create_contact(conn, cid, body):
    info = parse.parse_contact(body.get("raw") or "")
    name = (body.get("name") or info["name"] or "").strip()
    phone = (body.get("phone") or info["phone"] or "").strip()
    wechat = (body.get("wechat") or info["wechat"] or "").strip()
    channel = body.get("channel") or info["channel"] or ("phone" if phone else "unknown")
    cur = conn.execute(
        """INSERT INTO contacts (company_id,name,phone,other_phone,wechat,channel,title,
           is_kp,wechat_added,invalid,note,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (cid, name, phone, info["other_phone"], wechat, channel,
         body.get("title") or info["title"], 1 if body.get("is_kp") else 0,
         1 if body.get("wechat_added") else 0, 0, body.get("note") or info["note"],
         db.now(), db.now()))
    conn.commit()
    return {"ok": True, "id": cur.lastrowid}


def update_contact(conn, kid, body):
    allowed = ("name", "phone", "other_phone", "wechat", "channel", "title",
               "is_kp", "wechat_added", "invalid", "note")
    sets, args = [], []
    for k in allowed:
        if k in body:
            v = body[k]
            if k in ("is_kp", "wechat_added", "invalid"):
                v = 1 if v else 0
            sets.append("%s=?" % k)
            args.append(v)
    if not sets:
        return {"ok": False}
    sets.append("updated_at=?")
    args += [db.now(), kid]
    conn.execute("UPDATE contacts SET " + ", ".join(sets) + " WHERE id=?", args)
    conn.commit()
    return {"ok": True}


def add_log(conn, cid, body):
    """记一笔：写时间线 + 推进阶段 + 定下次跟进。"""
    content = (body.get("content") or "").strip()
    kind = body.get("kind") or "call"
    result = body.get("result") or ""
    happened = body.get("happened_at") or today_str()
    next_at = body.get("next_at") or ""
    contact_id = body.get("contact_id") or None
    if not content and not result:
        return {"ok": False, "error": "内容不能为空"}
    text = content or STAGE_LABEL.get(result, result)
    conn.execute(
        """INSERT INTO activities (company_id,contact_id,kind,happened_at,content,result,
           next_at,origin,created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
        (cid, contact_id, kind, happened, text, result, next_at, "manual", db.now()))
    sets, args = ["last_at=?", "updated_at=?"], [happened, db.now()]
    cur = conn.execute("SELECT stage,next_at FROM companies WHERE id=?", (cid,)).fetchone()
    new_stage = cur["stage"]
    if result in parse.STAGE_LABEL:
        # 只前进不后退（除非明确标为无需求/弃单）
        if result in ("no_need", "dropped", "signed") or \
                STAGE_RANK.get(result, 0) >= STAGE_RANK.get(cur["stage"], 0):
            new_stage = result
    if body.get("no_follow"):
        sets += ["no_follow=1", "no_follow_reason=?"]
        args.append(body.get("no_follow_reason") or text)
        new_stage = "dropped"
    sets.append("stage=?")
    args.append(new_stage)
    if next_at:
        sets.append("next_at=?")
        args.append(next_at)
    args.append(cid)
    conn.execute("UPDATE companies SET " + ", ".join(sets) + " WHERE id=?", args)
    # 联系人侧的状态同步
    if contact_id:
        if result == "wechat":
            conn.execute("UPDATE contacts SET wechat_added=1 WHERE id=?", (contact_id,))
        if kind == "wechat":
            conn.execute("UPDATE contacts SET wechat_added=1 WHERE id=?", (contact_id,))
    conn.commit()
    return {"ok": True, "company": company_detail(conn, cid)}


# ── 启动 ──────────────────────────────────────────────────
def pick_port(preferred=8795, tries=20):
    for p in range(preferred, preferred + tries):
        with socket.socket() as s:
            s.settimeout(0.2)
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return preferred


def ensure_db():
    os.makedirs(DATA, exist_ok=True)
    fresh = not os.path.exists(DB_PATH)
    conn = db.init(DB_PATH)
    # 用 seeded 标记而不是「有没有数据」来决定是否灌种子：
    # 否则用户把客户删光了，下次启动会又被灌回来。
    seeded = db.get_setting(conn, "seeded", "")
    if not seeded and os.path.exists(SEED):
        conn.close()
        import importer
        res = importer.run(DB_PATH, SEED, reset=True)
        print("[init] 已导入种子数据:", res)
        return fresh
    conn.close()
    return fresh


def main():
    port = int(os.environ.get("CRM_PORT") or 0) or pick_port()
    ensure_db()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = "http://127.0.0.1:%d/" % port
    print("客户跟进系统已启动: %s" % url)
    print("按 Ctrl+C 停止")
    if os.environ.get("CRM_NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
