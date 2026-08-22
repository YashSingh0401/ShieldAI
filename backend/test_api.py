"""API integration tests using FastAPI TestClient against an in-memory database.

Run with: pytest
"""
# Shared fixtures (auth_headers, fake_url_analysis, client) live in conftest.py.

from app import main as app_main


# ─── Health ───────────────────────────────────────────────────────────────────

def test_root(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# ─── URL Verification (public) ───────────────────────────────────────────────

def test_verify_url_requires_no_auth(client, fake_url_analysis):
    res = client.get("/verify/url", params={"url": "http://paytm-kyc-verify-update.in/auth"})
    assert res.status_code == 200
    body = res.json()
    assert body["is_clean"] is False
    assert body["risk_score"] >= 70


def test_verify_url_requires_query_param(client):
    res = client.get("/verify/url")
    assert res.status_code == 422


def test_verify_url_saves_history(client, auth_headers, fake_url_analysis):
    client.get("/verify/url", params={"url": "http://example-scam.test"}, headers=auth_headers)
    res = client.get("/verify/history", headers=auth_headers)
    assert res.status_code == 200
    rows = [r for r in res.json() if r["target"] == "http://example-scam.test"]
    assert len(rows) == 1
    assert rows[0]["scan_type"] == "url"


def test_verify_url_rate_limited(client, fake_url_analysis):
    statuses = []
    for _ in range(40):
        statuses.append(client.get("/verify/url", params={"url": "http://rl.test"}).status_code)
    assert 429 in statuses
    assert statuses.index(429) < 35


# ─── Auth ────────────────────────────────────────────────────────────────────

def test_auth_google_rejects_invalid_token(client, monkeypatch):
    from fastapi import HTTPException

    def raise_invalid(token):
        raise HTTPException(status_code=401, detail="Invalid Google token: bad")

    monkeypatch.setattr(app_main, "verify_google_token", raise_invalid)
    res = client.post("/auth/google", json={"credential": "not-a-real-jwt"})
    assert res.status_code == 401


def test_auth_google_returns_token(client, monkeypatch):
    monkeypatch.setattr(app_main, "verify_google_token", lambda token: {
        "sub": "google-123",
        "email": "user@shieldai.test",
        "name": "User",
        "picture": "",
    })
    res = client.post("/auth/google", json={"credential": "valid-mock-jwt"})
    assert res.status_code == 200
    body = res.json()
    assert body["token"]
    assert body["user"]["email"] == "user@shieldai.test"


def test_verify_history_requires_auth(client):
    res = client.get("/verify/history")
    assert res.status_code == 401


def test_verify_history_returns_rows(client, auth_headers, fake_url_analysis):
    client.get("/verify/url", params={"url": "http://history-scan.test"}, headers=auth_headers)
    res = client.get("/verify/history", headers=auth_headers)
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["scan_type"] == "url"
    assert rows[0]["risk_score"] == 92
    assert rows[0]["status"] == "danger"


def test_verify_history_filter_by_scan_type(client, auth_headers, fake_url_analysis):
    client.get("/verify/url", params={"url": "http://filter-scan.test"}, headers=auth_headers)
    res = client.get("/verify/history", params={"scan_type": "image"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == []


# ─── Protected Verifications ─────────────────────────────────────────────────

def test_verify_image_requires_auth(client):
    res = client.post("/verify/image", files={"file": ("a.jpg", b"not-an-image", "image/jpeg")})
    assert res.status_code == 401


def test_verify_image_rejects_wrong_content_type(client, auth_headers):
    res = client.post(
        "/verify/image",
        files={"file": ("evil.txt", b"hello", "text/plain")},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "Unsupported file type" in res.json()["detail"]


def test_verify_video_requires_auth(client):
    res = client.post("/verify/video", files={"file": ("a.mp4", b"x", "video/mp4")})
    assert res.status_code == 401


def test_verify_audio_requires_auth(client):
    res = client.post("/verify/audio", files={"file": ("a.wav", b"x", "audio/wav")})
    assert res.status_code == 401


# ─── Scam Reports ────────────────────────────────────────────────────────────

def test_create_report_requires_auth(client):
    res = client.post("/reports", json={
        "report_type": "phishing_link",
        "title": "Fake Subsidy Link",
        "description": "Fake SMS urging clients to claim subsidies immediately.",
    })
    assert res.status_code == 401


def test_report_crud_flow(client, auth_headers):
    payload = {
        "report_type": "phishing_link",
        "title": "Fake Power Grid Subsidies SMS Link",
        "scam_content": "http://power-grid-subsidy-pay.com",
        "description": "Fake SMS urging clients to claim state electrical subsidies.",
        "location": "Chennai, TN",
    }
    created = client.post("/reports", json=payload, headers=auth_headers)
    assert created.status_code == 200
    report_id = created.json()["id"]
    assert report_id is not None

    upvote = client.post(f"/reports/{report_id}/upvote", headers=auth_headers)
    assert upvote.status_code == 200
    assert upvote.json()["upvotes"] == 1

    comment = client.post(
        f"/reports/{report_id}/comments",
        json={"author": "SecurityAnalyst", "content": "Confirming this domain is suspicious."},
        headers=auth_headers,
    )
    assert comment.status_code == 200
    assert comment.json()["id"] is not None

    comments = client.get(f"/reports/{report_id}/comments")
    assert comments.status_code == 200
    assert len(comments.json()) == 1
    assert comments.json()[0]["author"] == "SecurityAnalyst"


def test_upvote_missing_report_404(client, auth_headers):
    res = client.post("/reports/99999/upvote", headers=auth_headers)
    assert res.status_code == 404


def test_get_reports_public(client, auth_headers):
    payload = {
        "report_type": "scam_call",
        "title": "Bank Call Scam",
        "scam_content": "caller-id-199",
        "description": "Caller impersonating bank staff demanding OTP.",
    }
    client.post("/reports", json=payload, headers=auth_headers)
    res = client.get("/reports")
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_get_reports_search_filter(client, auth_headers):
    payload = {
        "report_type": "phishing_link",
        "title": "Unique Searchable Title XyZ",
        "scam_content": "http://u.test",
        "description": "A very specific fake link campaign description.",
    }
    client.post("/reports", json=payload, headers=auth_headers)
    found = client.get("/reports", params={"q": "Unique Searchable"})
    assert found.status_code == 200
    assert len(found.json()) == 1
    none = client.get("/reports", params={"q": "NoSuchTermzzz"})
    assert none.json() == []
