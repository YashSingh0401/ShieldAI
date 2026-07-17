from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import DATABASE_URL

# Create engine with SQLite multi-thread checking bypassed
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Listen for database connections and execute SQLite optimizations
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
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

# FastAPI dependency to yield database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
