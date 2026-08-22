import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main as app_main
from app.auth import create_session_token
from app.database import get_db
from app.main import app
from app.models import Base, ScamComment, ScamReport, ScanHistory

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def db_session():
    session = TestSessionLocal()
    session.query(ScamComment).delete()
    session.query(ScamReport).delete()
    session.query(ScanHistory).delete()
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    yield
    app.state.limiter._storage.reset()


@pytest.fixture()
def auth_headers():
    token = create_session_token({
        "sub": "test-user-123",
        "email": "tester@shieldai.test",
        "name": "Test User",
        "picture": "",
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def fake_url_analysis(monkeypatch):
    monkeypatch.setattr(app_main, "analyze_url", lambda url: {
        "url": url,
        "is_clean": False,
        "risk_score": 92,
        "risk_level": "High Risk - Phishing Suspected",
        "indicators": ["Suspicious TLD", "No HTTPS"],
    })


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
