"""One-shot verification: boot the app over a pre-Phase-3 schema (simulating prod)."""
import os
import sqlite3
import sys
import tempfile

db_path = os.path.join(tempfile.gettempdir(), "shieldai_migration_test.db")
if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute(
    "CREATE TABLE scan_history (id INTEGER PRIMARY KEY, scan_type VARCHAR NOT NULL, "
    "target VARCHAR NOT NULL, risk_score FLOAT NOT NULL, status VARCHAR NOT NULL, "
    "timestamp DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
)
c.execute(
    "INSERT INTO scan_history (scan_type, target, risk_score, status) "
    "VALUES ('url', 'http://old.test', 5, 'success')"
)
c.execute(
    "CREATE TABLE scam_reports (id INTEGER PRIMARY KEY, report_type VARCHAR NOT NULL, "
    "title VARCHAR NOT NULL, description TEXT NOT NULL)"
)
c.execute(
    "INSERT INTO scam_reports (report_type, title, description) "
    "VALUES ('other', 'Old row', 'Pre-migration report row here')"
)
c.execute(
    "CREATE TABLE scam_comments (id INTEGER PRIMARY KEY, report_id INTEGER NOT NULL, "
    "author VARCHAR NOT NULL, content TEXT NOT NULL, "
    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
)
conn.commit()
conn.close()
print("old-schema db created")

os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

from app.main import app  # noqa: E402,F401  (boot triggers ensure_schema_upgrades + create_all)
print("app booted over old schema OK")

conn = sqlite3.connect(db_path)
c = conn.cursor()
cols_h = [r[1] for r in c.execute("PRAGMA table_info(scan_history)")]
cols_r = [r[1] for r in c.execute("PRAGMA table_info(scam_reports)")]
hidden = c.execute("SELECT is_hidden FROM scam_reports").fetchall()
rows = c.execute("SELECT COUNT(*), SUM(user_email IS NULL) FROM scan_history").fetchone()
users = c.execute("SELECT name FROM sqlite_master WHERE name='users'").fetchall()
conn.close()

print("scan_history cols:", cols_h)
print("scam_reports cols:", cols_r)
print("backfilled is_hidden values:", hidden)
print("history rows preserved:", rows[0], "| with NULL email:", rows[1])
print("users table created:", bool(users))

ok = (
    "user_email" in cols_h
    and "is_hidden" in cols_r
    and all(v == (0,) for (v,) in hidden)
    and rows[0] == 1
    and rows[1] == 1
    and users
)
sys.exit(0 if ok else 1)
