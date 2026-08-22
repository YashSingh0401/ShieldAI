from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import DATABASE_URL

# Create engine (bypassing multi-thread checks only for SQLite)
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL, connect_args=connect_args
)

# Listen for database connections and execute SQLite optimizations (SQLite only)
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    # Turn on Write-Ahead Logging (WAL) mode for concurrent reads/writes
    cursor.execute("PRAGMA journal_mode=WAL")
    # Set synchronous mode to NORMAL for safer fast commits
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Session creator
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for models
Base = declarative_base()


def ensure_schema_upgrades():
    """Lightweight startup migration for columns added after first launch.

    create_all() creates new tables but never ALTERs existing ones, so columns
    introduced post-deploy (user_email, is_hidden) are added here when missing.
    """
    inspector = inspect(engine)

    def _add_column(table: str, column_ddl: str, column_name: str):
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column_name not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_ddl}"))

    if inspector.has_table("scan_history"):
        _add_column("scan_history", "user_email VARCHAR", "user_email")
    if inspector.has_table("scam_reports"):
        # NOT NULL DEFAULT keeps pre-existing reports visible to the public feed.
        _add_column("scam_reports", "is_hidden BOOLEAN NOT NULL DEFAULT '0'", "is_hidden")


# FastAPI dependency to yield database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
