# -*- coding: utf-8 -*-
"""接口自测：真起服务、真写库、真读回。用 python app/selftest.py 跑。"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = os.environ.get("CRM_BASE", "http://127.0.0.1:8795")
PASS, FAIL = [], []


def call(path, method="GET", body=None):
    url = BASE + "/api" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8")
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  OK  " if cond else " FAIL ") + name + ((" — " + str(detail)) if detail and not cond else ""))


def main():
    print("目标：", BASE)

    # 1. 元数据
    st, meta = call("/meta")
    check("meta 有行业/阶段/来源", st == 200 and meta.get("industries") and meta.get("stages"))

    # 2. 今日队列
    st, today = call("/today?minutes=60")
    check("today 返回队列", st == 200 and isinstance(today.get("items"), list))
    check("today 有计划分钟数", 0 < today.get("planned_minutes", 0) <= 60, today.get("planned_minutes"))
    check("today 条目带 bucket", all(i.get("bucket") in ("due", "fill") for i in today["items"]))
    due_ok = all(i["next_at"] <= today["date"] for i in today["items"] if i["bucket"] == "due")
    check("due 条目确实已到期", due_ok)

    # 3. 客户库与筛选
    st, cl = call("/companies?limit=5")
    check("companies 分页", st == 200 and len(cl.get("rows", [])) <= 5 and cl.get("total", 0) > 0)
    st, cl2 = call("/companies?third=yes&limit=500")
    check("三方筛选生效", all(r["third_party"] == "yes" for r in cl2.get("rows", [])))
    st, cl3 = call("/companies?q=" + urllib.parse.quote("半导体") + "&limit=10")
    check("全文搜索有结果", cl3.get("total", 0) > 0, cl3.get("total"))
    st, cl4 = call("/companies?stage=signed&limit=10")
    check("阶段筛选不报错", st == 200)

    # 4. 详情
    cid = cl["rows"][0]["id"]
    st, det = call("/company/%d" % cid)
    check("详情含联系人与时间线", st == 200 and "contacts" in det and "activities" in det)

    # 5. 新增客户
    st, r = call("/company", "POST", {"name": "自测专用（可删）科技有限公司", "source": "bd",
                                      "industry": "测试", "region": "上海"})
    new_id = r.get("id")
    check("新增客户", st == 200 and new_id, r)

    # 6. 新增联系人（含自动解析）
    st, r = call("/company/%d/contacts" % new_id, "POST",
                 {"raw": "李四 13800138000 人事经理"})
    k1 = r.get("id")
    check("新增联系人并解析号码", st == 200 and k1, r)
    st, det = call("/company/%d" % new_id)
    c = det["contacts"][0]
    check("联系人姓名解析", c["name"] == "李四", c)
    check("联系人号码解析", c["phone"] == "13800138000", c)

    # 7. 改联系人
    st, r = call("/contact/%d" % k1, "POST", {"is_kp": 1, "wechat_added": 1, "title": "HRD"})
    st, det = call("/company/%d" % new_id)
    c2 = [x for x in det["contacts"] if x["id"] == k1][0]
    check("联系人 KP/已加微 落库", c2["is_kp"] == 1 and c2["wechat_added"] == 1, c2)

    # 8. 记一笔 → 阶段推进 + 下次跟进
    chk = (time.strftime("%Y-%m-%d"))
    st, r = call("/company/%d/log" % new_id, "POST",
                 {"result": "wechat", "content": "自测：已加微信", "contact_id": k1,
                  "next_at": "2026-12-01"})
    check("记一笔接口", st == 200 and r.get("ok"), r)
    d = r["company"]
    check("记一笔后阶段=已加微信", d["stage"] == "wechat", d.get("stage"))
    check("记一笔后下次跟进已设", d["next_at"] == "2026-12-01", d.get("next_at"))
    check("时间线新增一条", any("自测" in a["content"] for a in d["activities"]))
    check("最近跟进=今天", d["last_at"] == chk, d.get("last_at"))

    # 9. 阶段不能倒退
    st, r = call("/company/%d/log" % new_id, "POST", {"result": "contacted", "content": "自测：没接"})
    check("阶段不倒退（已加微 → 未接 仍为已加微）", r["company"]["stage"] == "wechat", r["company"]["stage"])

    # 10. 标记不再跟进
    st, r = call("/company/%d" % new_id, "POST", {"no_follow": 1, "no_follow_reason": "自测", "stage": "dropped", "next_at": ""})
    check("标记不再跟进", r["company"]["no_follow"] == 1, r["company"].get("no_follow"))
    st, today2 = call("/today?minutes=60")
    check("停跟后不再出现在队列", all(i["id"] != new_id for i in today2["items"]))

    # 11. 恢复
    st, r = call("/company/%d" % new_id, "POST", {"no_follow": 0, "next_at": "2026-12-05"})
    check("恢复跟进", r["company"]["no_follow"] == 0)

    # 12. 删除联系人 / 客户
    st, r = call("/contact/%d" % k1, "DELETE")
    check("删除联系人", st == 200)
    st, r = call("/company/%d" % new_id, "DELETE")
    check("删除客户", st == 200)
    st, det = call("/company/%d" % new_id)
    check("删除后详情 404", st == 404 or det.get("error"))

    # 13. 统计与导出
    st, s = call("/stats")
    check("统计有行业/规模/阶段", st == 200 and s.get("by_industry") and s.get("by_size"))
    url = BASE + "/api/export?fmt=csv"
    with urllib.request.urlopen(url, timeout=20) as r:
        raw = r.read().decode("utf-8-sig")
    check("CSV 导出含表头与数据", raw.startswith("公司,来源") and raw.count("\n") > 100, raw[:40])

    # 14. 设置
    st, r = call("/settings", "POST", {"bd_minutes": "60", "remind_times": "11:30,13:00"})
    st, s = call("/settings")
    check("设置读写", s.get("bd_minutes") == "60")

    # 15. 全局搜索
    st, sr = call("/search?q=" + urllib.parse.quote("中微"))
    check("搜索返回公司", st == 200 and len(sr.get("companies", [])) > 0, sr)
    check("搜索返回联系人", len(sr.get("contacts", [])) > 0)

    # 16. 数据质量
    st, q = call("/quality")
    check("质量接口字段齐全",
          st == 200 and all(k in q for k in
                            ("no_phone", "no_industry", "no_size", "no_tp", "overdue", "never", "dupes")))

    # 17. 周报
    st, rep = call("/report?days=28")
    check("周报有 4 周数据点", st == 200 and len(rep.get("weekly", [])) == 4, rep.get("weekly"))
    check("周报本周结构", "this_week" in rep and "by_result" in rep["this_week"])

    # 18. 目标
    st, g = call("/goals")
    check("目标返回月份序列", st == 200 and len(g.get("months", [])) == 6, len(g.get("months", [])))
    st, g2 = call("/goals", "POST", {"target": 80000, "floor": 40000})
    check("目标可写", g2.get("target") == 80000 and g2.get("floor") == 40000, g2.get("target"))
    call("/goals", "POST", {"target": 60000, "floor": 30000})

    # 19. 批量操作
    st, r = call("/company", "POST", {"name": "批量测试甲有限公司", "source": "bd"})
    a = r["id"]
    st, r = call("/company", "POST", {"name": "批量测试乙有限公司", "source": "bd"})
    b = r["id"]
    st, r = call("/bulk", "POST", {"ids": [a, b], "action": "stage", "value": "interested"})
    check("批量改阶段", st == 200 and r.get("ok"), r)
    st, d = call("/company/%d" % a)
    check("批量改阶段已落库", d["stage"] == "interested", d.get("stage"))
    st, r = call("/bulk", "POST", {"ids": [a, b], "action": "next_at", "value": "2026-12-15"})
    st, d = call("/company/%d" % b)
    check("批量改下次跟进", d["next_at"] == "2026-12-15", d.get("next_at"))
    st, r = call("/bulk", "POST", {"ids": [a, b], "action": "delete"})
    check("批量删除", st == 200)
    st, d = call("/company/%d" % a)
    check("批量删除生效", st == 404 or d.get("error"))

    # 20. flag 筛选
    st, cl5 = call("/companies?flag=no_phone&limit=500")
    check("缺号码筛选返回集合", st == 200 and cl5.get("total", 0) > 0, cl5.get("total"))
    if cl5.get("rows"):
        st, det5 = call("/company/%d" % cl5["rows"][0]["id"])
        check("缺号码筛选结果确实无手机号",
              not any(c.get("phone") for c in det5.get("contacts", [])),
              det5.get("contacts"))
    st, cl6 = call("/companies?flag=overdue&limit=500")
    check("逾期筛选", st == 200 and all(
        r.get("next_at") and r["next_at"] < "2026-11-18" for r in cl6.get("rows", [])))

    # 21. 备份
    st, bk = call("/backup", "POST", {})
    check("数据库备份", st == 200 and bk.get("ok") and bk.get("size", 0) > 10000, bk)
    if bk.get("ok"):
        p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), bk["path"])
        check("备份文件真实存在", os.path.exists(p), p)

    print("\n通过 %d / 失败 %d" % (len(PASS), len(FAIL)))
    if FAIL:
        print("失败项：", FAIL)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
