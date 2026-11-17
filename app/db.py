# -*- coding: utf-8 -*-
"""SQLite 层：建库、连接、通用查询。"""
import os
import sqlite3
import time

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  norm_name     TEXT NOT NULL,
  source        TEXT NOT NULL,          -- ka / referrer / bd / opportunity
  industry      TEXT DEFAULT '',
  size_band     TEXT DEFAULT '',
  headcount     INTEGER,
  region        TEXT DEFAULT '',
  business      TEXT DEFAULT '',
  hire_scale    INTEGER,
  vendors       TEXT DEFAULT '',        -- 目前合作供应商
  third_party   TEXT DEFAULT 'unknown', -- yes / no / unknown
  third_party_note TEXT DEFAULT '',
  stage         TEXT DEFAULT 'new',
  no_follow     INTEGER DEFAULT 0,
  no_follow_reason TEXT DEFAULT '',
  owner         TEXT DEFAULT '我',
  referrer      TEXT DEFAULT '',        -- 推荐人
  next_at       TEXT DEFAULT '',        -- 下次跟进 YYYY-MM-DD
  last_at       TEXT DEFAULT '',
  raw_note      TEXT DEFAULT '',
  created_at    TEXT,
  updated_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_company_norm ON companies(norm_name, source);
CREATE INDEX IF NOT EXISTS ix_company_next ON companies(next_at);
CREATE INDEX IF NOT EXISTS ix_company_stage ON companies(stage);

CREATE TABLE IF NOT EXISTS contacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  other_phone  TEXT DEFAULT '',
  wechat       TEXT DEFAULT '',
  channel      TEXT DEFAULT 'phone',   -- phone / wechat / maimai / email / unknown
  title        TEXT DEFAULT '',
  is_kp        INTEGER DEFAULT 0,
  wechat_added INTEGER DEFAULT 0,
  invalid      INTEGER DEFAULT 0,
  note         TEXT DEFAULT '',
  created_at   TEXT,
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS ix_contact_company ON contacts(company_id);

CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id INTEGER,
  kind       TEXT DEFAULT 'call',
  happened_at TEXT DEFAULT '',
  content    TEXT DEFAULT '',
  result     TEXT DEFAULT '',
  next_at    TEXT DEFAULT '',
  origin     TEXT DEFAULT 'manual',    -- import / manual
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_activity_company ON activities(company_id, happened_at);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY,
  v TEXT
);
"""


def now():
    return time.strftime("%Y-%m-%d %H:%M:%S")


def connect(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init(db_path):
    conn = connect(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def get_setting(conn, k, default=None):
    row = conn.execute("SELECT v FROM settings WHERE k=?", (k,)).fetchone()
    return row["v"] if row else default


def set_setting(conn, k, v):
    conn.execute(
        "INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
        (k, str(v)),
    )
    conn.commit()


def rows_to_dicts(cur):
    return [dict(r) for r in cur.fetchall()]
