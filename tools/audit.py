# -*- coding: utf-8 -*-
"""导入质量审计：列出可疑的公司名、联系人、日期。"""
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(HERE, "data", "crm.db")

SUSPECT_CO = re.compile(r"之前|目前在哪|未透露|公司名称未提供|待确认|^（|^\(|有限公司.*有限公司")
BAD_NAME = re.compile(r"\d|微信|脉脉|电话|手机|^[^\u4e00-\u9fa5A-Za-z]{2,}$")


def main():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row

    def q(sql, *a):
        return [dict(r) for r in c.execute(sql, a).fetchall()]

    print("=== 可疑公司名 ===")
    rows = q("SELECT id,name,source FROM companies")
    bad = [r for r in rows if SUSPECT_CO.search(r["name"]) or len(r["name"]) > 28]
    for r in bad:
        print("  #%d [%s] %s" % (r["id"], r["source"], r["name"]))
    print("  共 %d 条" % len(bad))

    print("\n=== 可疑联系人名 ===")
    bad2 = [r for r in q("SELECT id,name,phone,company_id FROM contacts")
            if r["name"] and (BAD_NAME.search(r["name"]) or len(r["name"]) > 12)]
    for r in bad2[:20]:
        print("  #%d %r %s" % (r["id"], r["name"], r["phone"]))
    print("  共 %d 条" % len(bad2))

    print("\n=== 联系人渠道分布 ===")
    for r in q("SELECT channel,COUNT(*) n FROM contacts GROUP BY channel ORDER BY n DESC"):
        print("  %-10s %d" % (r["channel"], r["n"]))

    print("\n=== 无任何联系方式的公司 ===")
    r = q("""SELECT COUNT(*) n FROM companies WHERE id NOT IN
             (SELECT company_id FROM contacts)""")[0]
    print("  %d 家" % r["n"])

    print("\n=== 日期越界检查（未来 > 30 天的事件） ===")
    fut = q("""SELECT a.id,a.happened_at,co.name FROM activities a
               JOIN companies co ON co.id=a.company_id
               WHERE a.happened_at > date('now','+30 day')""")
    for r in fut[:10]:
        print("  %s %s" % (r["happened_at"], r["name"]))
    print("  共 %d 条" % len(fut))

    print("\n=== 规模档位 ===")
    for r in q("SELECT COALESCE(NULLIF(size_band,''),'（空）') k,COUNT(*) n FROM companies GROUP BY k ORDER BY n DESC"):
        print("  %-14s %d" % (r["k"], r["n"]))

    print("\n=== 行业 TOP8 ===")
    for r in q("SELECT COALESCE(NULLIF(industry,''),'（空）') k,COUNT(*) n FROM companies GROUP BY k ORDER BY n DESC LIMIT 8"):
        print("  %-18s %d" % (r["k"], r["n"]))


if __name__ == "__main__":
    main()
