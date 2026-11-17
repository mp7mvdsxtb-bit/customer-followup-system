# -*- coding: utf-8 -*-
"""把「客户跟进名单.xlsx」导成结构化库。

四张表入库：目标KA客户 / 证明人线索 / 自主BD / 商机线索。
callin 按需求不做；目标拆解不入库。
"""
import os
import re

import db
import parse
import xlsx

SOURCE_LABEL = {
    "ka": "目标KA",
    "referrer": "证明人线索",
    "bd": "自主BD",
    "opportunity": "商机线索",
}


def _v(row, i, default=""):
    return (row[i] if i < len(row) else default) or default


def _s(x):
    return str(x or "").strip()


class Importer:
    def __init__(self, conn):
        self.conn = conn
        self.stats = {"companies": 0, "contacts": 0, "activities": 0, "warn": []}
        self._cache = {}

    # ── 基础写入 ──────────────────────────────────────────
    def _company(self, **kw):
        raw_name = (kw.get("name") or "").strip()
        # 「（公司名称未提供）」这类占位不是公司
        if not raw_name or len(raw_name) < 2 or raw_name.startswith(("（", "(")):
            return None
        kw["name"] = raw_name
        norm = parse.norm_company(raw_name)
        if not norm:
            return None
        source = kw.get("source", "")
        key = (norm, source)
        if key in self._cache:
            return self._cache[key]
        cur = self.conn.execute(
            """INSERT INTO companies
               (name, norm_name, source, industry, size_band, headcount, region,
                business, hire_scale, vendors, third_party, third_party_note, stage,
                owner, referrer, next_at, last_at, raw_note, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                kw.get("name", "").strip(), norm, source,
                kw.get("industry", ""), kw.get("size_band", ""), kw.get("headcount"),
                kw.get("region", ""), kw.get("business", ""), kw.get("hire_scale"),
                kw.get("vendors", ""), kw.get("third_party", "unknown"),
                kw.get("third_party_note", ""), kw.get("stage", "new"),
                kw.get("owner", "我"), kw.get("referrer", ""),
                kw.get("next_at", ""), kw.get("last_at", ""),
                kw.get("raw_note", ""), db.now(), db.now(),
            ),
        )
        cid = cur.lastrowid
        self._cache[key] = cid
        self.stats["companies"] += 1
        return cid

    def _contact(self, company_id, text, is_kp=False, wechat_added=None):
        info = parse.parse_contact(text)
        if not any([info["name"], info["phone"], info["wechat"], info["other_phone"]]) \
                and info["channel"] not in ("wechat", "maimai"):
            return None
        if not info["name"] and info["channel"] in ("wechat", "maimai"):
            info["name"] = "微信" if info["channel"] == "wechat" else "脉脉"
        added = info["channel"] == "wechat"
        if wechat_added is not None:
            added = wechat_added
        cur = self.conn.execute(
            """INSERT INTO contacts
               (company_id,name,phone,other_phone,wechat,channel,title,is_kp,
                wechat_added,invalid,note,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                company_id, info["name"], info["phone"], info["other_phone"],
                info["wechat"], info["channel"], info["title"],
                1 if is_kp else 0, 1 if added else 0, 0, info["note"],
                db.now(), db.now(),
            ),
        )
        self.stats["contacts"] += 1
        return cur.lastrowid

    def _activity(self, company_id, contact_id, day, content, result=""):
        content = _s(content)
        if not content:
            return
        self.conn.execute(
            """INSERT INTO activities
               (company_id,contact_id,kind,happened_at,content,result,next_at,origin,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (company_id, contact_id, "import", day or "", content, result, "", "import", db.now()),
        )
        self.stats["activities"] += 1

    # ── 目标KA客户 ────────────────────────────────────────
    def load_ka(self, wb):
        rows = wb.sheet("目标KA客户")
        for row in rows[1:]:
            name = _s(_v(row, 1))
            if not name or name in ("企业名称",) or len(name) < 3:
                continue
            industry = _s(_v(row, 4))
            vendors = _s(_v(row, 3))
            size_band = _s(_v(row, 5))
            headcount, band = parse.parse_size(size_band)
            next_at = parse.parse_date(_v(row, 19))
            groups = [(9, 10), (11, 12), (13, 14), (15, 16), (17, 18)]
            notes, stage_src = [], []
            for ci, ni in groups:
                notes.append(_s(_v(row, ni)))
            blob = " ".join(notes)
            stage = parse.infer_stage(blob)
            tp = "no"
            if vendors:
                tp = "yes"
            cid = self._company(
                name=name, source="ka", industry=industry, size_band=band or size_band,
                headcount=headcount, region=_s(_v(row, 2)), business=_s(_v(row, 6)),
                hire_scale=int(_v(row, 7)) if _s(_v(row, 7)).isdigit() else None,
                vendors=vendors, third_party=tp,
                third_party_note=vendors, stage=stage,
                next_at=next_at, raw_note=blob,
            )
            if not cid:
                continue
            kp_hint = _s(_v(row, 8))
            for ci, ni in groups:
                who = _s(_v(row, ci))
                note = _s(_v(row, ni))
                if not who and not note:
                    continue
                contact_id = self._contact(cid, who, is_kp=bool(kp_hint and kp_hint in who))
                for day, body in parse.split_timeline(note):
                    self._activity(cid, contact_id, day, body,
                                   result=parse.infer_stage(body))
            self._refresh(cid)

    # ── 证明人线索 ────────────────────────────────────────
    def load_referrer(self, wb):
        rows = wb.sheet("证明人线索")
        for row in rows[1:]:
            name = _s(_v(row, 0))
            if not name or name in ("公司名称",) or len(name) < 2:
                continue
            size_txt = _s(_v(row, 1))
            headcount, band = parse.parse_size(size_txt)
            rec = _s(_v(row, 7))          # 推荐情况
            follow1 = _s(_v(row, 8))
            follow2 = _s(_v(row, 10))
            sign = _s(_v(row, 11))
            blob = " ".join(x for x in (rec, follow1, follow2, sign) if x)
            tp = parse.infer_third_party(rec) if rec else "unknown"
            if tp == "unknown" and rec:
                tp = parse.infer_third_party(blob)
            cid = self._company(
                name=name, source="referrer", industry=_s(_v(row, 3)),
                size_band=(band or ("" if "待确认" in size_txt else size_txt)),
                headcount=headcount,
                region=_s(_v(row, 2)), third_party=tp,
                third_party_note=rec + ("／" + parse.vendor_note(blob) if parse.vendor_note(blob) else ""),
                referrer=_s(_v(row, 6)),
                stage=parse.infer_stage(blob, sign),
                next_at=parse.parse_date(_v(row, 9)),
                raw_note=blob,
            )
            if not cid:
                continue
            who = _s(_v(row, 4))
            contact_id = self._contact(cid, who + " " + _s(_v(row, 5))) if (who or _s(_v(row, 5))) else None
            # 推荐情况（在职/有第三方/可加微信…）本身就是一条线索情报，进时间线
            if rec:
                self._activity(cid, contact_id, "", "推荐情报：" + rec,
                               result=parse.infer_stage(rec))
            for src in (follow1, follow2):
                for day, body in parse.split_timeline(src):
                    self._activity(cid, contact_id, day, body, result=parse.infer_stage(body))
            if sign:
                self._activity(cid, contact_id, parse.parse_date(_v(row, 9)), "签约标记：" + sign,
                               result=parse.infer_stage(sign))
            self._refresh(cid)

    # ── 自主BD ────────────────────────────────────────────
    def load_bd(self, wb):
        rows = wb.sheet("自主BD")
        for row in rows[1:]:
            name = _s(_v(row, 0))
            if not name or name in ("客户情况",) or len(name) < 2:
                continue
            headcount = None
            hc = _s(_v(row, 4))
            if hc.isdigit():
                headcount = int(hc)
            next_raw = _s(_v(row, 7))
            follow = _s(_v(row, 8))
            blob = " ".join(x for x in (_s(_v(row, 6)), next_raw, follow, _s(_v(row, 10))) if x)
            cid = self._company(
                name=name, source="bd", headcount=headcount,
                size_band=parse.parse_size(hc)[1],
                third_party=parse.infer_third_party(blob),
                third_party_note=parse.vendor_note(blob),
                stage=parse.infer_stage(blob),
                next_at=parse.parse_date(next_raw),
                raw_note=blob,
            )
            if not cid:
                continue
            who = _s(_v(row, 1))
            way = _s(_v(row, 2))
            contact_id = None
            if who or way:
                contact_id = self._contact(cid, (who + " " + way).strip())
                # 联系方式只写了「微信」/「脉脉」时，纯渠道标签也要落到联系人上
            for src in (_s(_v(row, 6)), follow):
                for day, body in parse.split_timeline(src):
                    self._activity(cid, contact_id, day, body, result=parse.infer_stage(body))
            if next_raw and parse.parse_date(next_raw):
                rest = re.sub(r"^\s*\d{1,2}[.\-/]\d{1,2}\s*", "", next_raw).strip()
                if rest:
                    self._activity(cid, contact_id, parse.parse_date(next_raw), rest,
                                   result=parse.infer_stage(rest))
            self._refresh(cid)

    # ── 商机线索 ──────────────────────────────────────────
    def load_opportunity(self, wb):
        rows = wb.sheet("商机线索")
        for row in rows[1:]:
            blob_text = _s(_v(row, 2))
            if not blob_text or blob_text == "公司信息":
                continue
            info = parse.parse_lead_blob(blob_text)
            name = info["company"]
            if not name or len(name) < 3:
                self.stats["warn"].append("商机线索无公司名：" + blob_text[:40])
                continue
            date_raw = _s(_v(row, 1))
            follow = _s(_v(row, 5))
            added = _s(_v(row, 4)) == "是"
            blob = " ".join(x for x in (follow, info["note"]) if x)
            cid = self._company(
                name=name, source="opportunity",
                third_party=parse.infer_third_party(blob),
                third_party_note=parse.vendor_note(blob),
                stage=parse.infer_stage(blob),
                owner=_s(_v(row, 3)) or "我",
                raw_note=blob,
            )
            if not cid:
                continue
            contact_id = self._contact(cid, (info["name"] + " " + info["phone"]).strip(),
                                       wechat_added=added or None)
            day = parse.parse_date(date_raw, future_ok=False)
            body = info["note"] or blob_text
            self._activity(cid, contact_id, day, body, result=parse.infer_stage(blob))
            self._refresh(cid, touch_next=False)

    # ── 收尾：重算 last_at/next_at/stage ──────────────────
    def _refresh(self, cid, touch_next=True):
        row = self.conn.execute(
            "SELECT * FROM companies WHERE id=?", (cid,)
        ).fetchone()
        if not row:
            return
        acts = self.conn.execute(
            "SELECT happened_at, content, result FROM activities WHERE company_id=? ORDER BY happened_at",
            (cid,),
        ).fetchall()
        days = [a["happened_at"] for a in acts if a["happened_at"]]
        last_at = max(days) if days else ""
        stage = row["stage"]
        if stage in ("new", "") and acts:
            stage = parse.infer_stage(*[a["content"] for a in acts])
        next_at = row["next_at"] or ""
        if not next_at and stage in ("interested", "wechat", "material", "trial", "negotiating"):
            next_at = ""
        self.conn.execute(
            "UPDATE companies SET last_at=?, stage=?, updated_at=? WHERE id=?",
            (last_at, stage, db.now(), cid),
        )


def run(db_path, excel_path, reset=False):
    if reset and os.path.exists(db_path):
        for suffix in ("", "-wal", "-shm"):
            p = db_path + suffix
            if os.path.exists(p):
                os.remove(p)
    conn = db.init(db_path)
    n = conn.execute("SELECT COUNT(*) c FROM companies").fetchone()["c"]
    if n and not reset:
        return {"skipped": True, "companies": n}
    wb = xlsx.Workbook(excel_path)
    imp = Importer(conn)
    imp.load_ka(wb)
    imp.load_referrer(wb)
    imp.load_bd(wb)
    imp.load_opportunity(wb)
    conn.commit()
    # 统计口径：默认给「有兴趣」以上的线索排下一次跟进
    _default_next(conn)
    db.set_setting(conn, "imported_at", db.now())
    db.set_setting(conn, "import_source", os.path.basename(excel_path))
    db.set_setting(conn, "seeded", "1")
    out = dict(imp.stats)
    out["skipped"] = False
    return out


DEFAULT_GAP = {
    "interested": 2, "wechat": 3, "reachable": 2, "material": 4, "trial": 3,
    "negotiating": 2, "contacted": 7, "new": 0,
}


def _default_next(conn):
    """没有明确下次跟进时间的，按阶段给一个默认间隔，避免线索躺在库里不动。"""
    import datetime
    today = datetime.date.today()
    rows = conn.execute(
        "SELECT id, stage FROM companies WHERE next_at='' AND no_follow=0"
    ).fetchall()
    for r in rows:
        gap = DEFAULT_GAP.get(r["stage"], 0)
        if not gap:
            continue
        d = (today + datetime.timedelta(days=gap)).isoformat()
        conn.execute("UPDATE companies SET next_at=? WHERE id=?", (d, r["id"]))
    conn.commit()


if __name__ == "__main__":
    import sys
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dbp = os.path.join(here, "data", "crm.db")
    xl = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "data", "seed.xlsx")
    print(run(dbp, xl, reset=True))
