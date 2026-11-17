# -*- coding: utf-8 -*-
"""极简 xlsx 读取器：只依赖标准库，够用即可。

返回 list[list[str]]，按列索引补齐空串；支持共享字符串、内联字符串、
合并单元格（左上角值填充整个区域）。
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _col_index(ref):
    m = re.match(r"([A-Z]+)", ref or "")
    if not m:
        return 0
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _row_index(ref):
    m = re.search(r"(\d+)", ref or "")
    return int(m.group(1)) - 1 if m else 0


class Workbook:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.shared = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            root = ET.fromstring(self.z.read("xl/sharedStrings.xml"))
            for si in root.iter(NS + "si"):
                self.shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
        self._sheets = self._read_manifest()

    def _read_manifest(self):
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))
        rmap = {r.get("Id"): r.get("Target") for r in rels}
        out = {}
        for s in wb.iter(NS + "sheet"):
            target = rmap.get(s.get(R_NS + "id"), "")
            target = target.lstrip("/")
            path = target if target.startswith("xl/") else "xl/" + target
            if path not in self.z.namelist():
                suffix = target.split("/")[-1]
                cand = [n for n in self.z.namelist() if n.endswith(suffix)]
                path = cand[0] if cand else None
            out[s.get("name")] = path
        return out

    @property
    def sheet_names(self):
        return list(self._sheets.keys())

    def sheet(self, name):
        path = self._sheets.get(name)
        if not path:
            raise KeyError("no sheet named %r (have %r)" % (name, self.sheet_names))
        root = ET.fromstring(self.z.read(path))
        grid = {}
        max_c = 0
        for row in root.iter(NS + "row"):
            r = _row_index(row.get("r"))
            for c in row.iter(NS + "c"):
                ref = c.get("r")
                ci = _col_index(ref)
                t = c.get("t")
                v = c.find(NS + "v")
                isx = c.find(NS + "is")
                if t == "s" and v is not None and v.text is not None:
                    try:
                        val = self.shared[int(v.text)]
                    except (ValueError, IndexError):
                        val = ""
                elif t == "inlineStr" and isx is not None:
                    val = "".join(x.text or "" for x in isx.iter(NS + "t"))
                else:
                    val = v.text if v is not None and v.text is not None else ""
                if val != "":
                    grid[(r, ci)] = val
                    max_c = max(max_c, ci)

        # 合并单元格：把左上角的值铺满整个区域
        for mc in root.iter(NS + "mergeCell"):
            ref = mc.get("ref") or ""
            if ":" not in ref:
                continue
            a, b = ref.split(":", 1)
            r1, c1 = _row_index(a), _col_index(a)
            r2, c2 = _row_index(b), _col_index(b)
            val = grid.get((r1, c1))
            if val is None:
                continue
            for rr in range(r1, r2 + 1):
                for cc in range(c1, c2 + 1):
                    grid.setdefault((rr, cc), val)
            max_c = max(max_c, c2)

        if not grid:
            return []
        n_rows = max(r for r, _ in grid) + 1
        rows = []
        for r in range(n_rows):
            rows.append([grid.get((r, c), "") for c in range(max_c + 1)])
        return rows


def rows_as_dicts(rows):
    """按首行表头转 dict；同名表头加 _2 后缀。"""
    if not rows:
        return []
    head = [str(h).strip() for h in rows[0]]
    seen = {}
    keys = []
    for h in head:
        if h in seen:
            seen[h] += 1
            keys.append("%s_%d" % (h, seen[h]))
        else:
            seen[h] = 0
            keys.append(h)
    out = []
    for r in rows[1:]:
        d = {}
        for i, k in enumerate(keys):
            d[k] = r[i] if i < len(r) else ""
        out.append(d)
    return out
