"""Tests for the free-tier daily quota and community-feed moderation."""
import io

import pytest
from PIL import Image

from app import main as app_main
from app.models import ScanHistory, ScamReport


@pytest.fixture()
def admin_env(monkeypatch):
    monkeypatch.setattr(app_main, "ADMIN_EMAILS", {"admin@shieldai.test"})


@pytest.fixture()
def admin_headers():
    from app.auth import create_session_token

    token = create_session_token({
        "sub": "admin-1",
        "email": "admin@shieldai.test",
        "name": "Admin",
        "picture": "",
    })
    return {"Authorization": f"Bearer {token}"}


def _jpeg_bytes():
    img = Image.new("RGB", (32, 32), (120, 120, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _seed_media_scans(db_session, email, count):
    for i in range(count):
        db_session.add(ScanHistory(
            scan_type="image",
            target=f"seed_{i}.jpg",
            risk_score=5,
            status="success",
            user_email=email,
        ))
    db_session.commit()


REPORT_PAYLOAD = {
    "report_type": "phishing_link",
    "title": "Fake courier delivery fee link",
    "scam_content": "http://fake-courier.test/pay",
    "description": "SMS claiming a parcel is held at the warehouse pending a small fee.",
}


# ─── Quota ───────────────────────────────────────────────────────────────────

def test_quota_blocks_after_limit(client, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(app_main, "FREE_DAILY_MEDIA_SCANS", 3)
    _seed_media_scans(db_session, "tester@shieldai.test", 3)

    res = client.post(
        "/verify/image",
        files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=auth_headers,
    )
    assert res.status_code == 402
    detail = res.json()["detail"]
    assert detail["code"] == "quota_exceeded"
    assert detail["limit"] == 3


def test_quota_allows_below_limit(client, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(app_main, "FREE_DAILY_MEDIA_SCANS", 3)
    _seed_media_scans(db_session, "tester@shieldai.test", 2)

    res = client.post(
        "/verify/image",
        files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_clean"] in (True, False)


def test_quota_ignores_url_scans(client, auth_headers, db_session, fake_url_analysis, monkeypatch):
    monkeypatch.setattr(app_main, "FREE_DAILY_MEDIA_SCANS", 3)
    _seed_media_scans(db_session, "tester@shieldai.test", 3)

    res = client.get("/verify/url", params={"url": "http://still-allowed.test"}, headers=auth_headers)
    assert res.status_code == 200


def test_quota_is_per_user(client, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(app_main, "FREE_DAILY_MEDIA_SCANS", 3)
    _seed_media_scans(db_session, "someoneelse@shieldai.test", 10)

    res = client.post(
        "/verify/image",
        files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
        headers=auth_headers,
    )
    assert res.status_code == 200


# ─── History scoping ─────────────────────────────────────────────────────────

def test_history_is_private_per_user(client, auth_headers, fake_url_analysis):
    client.get("/verify/url", params={"url": "http://mine-only.test"}, headers=auth_headers)

    from app.auth import create_session_token

    other = create_session_token({"sub": "o", "email": "other@x.test", "name": "Other"})
    res = client.get("/verify/history", headers={"Authorization": f"Bearer {other}"})
    assert res.status_code == 200
    assert res.json() == []


# ─── Moderation: spam + duplicates + length caps ─────────────────────────────

def test_spam_link_flood_rejected(client, auth_headers):
    payload = dict(REPORT_PAYLOAD)
    payload["title"] = "Too many links spam"
    payload["description"] = " ".join([f"http://spam{i}.test" for i in range(7)]) + " and some text"
    res = client.post("/reports", json=payload, headers=auth_headers)
    assert res.status_code == 400
    assert "spam" in res.json()["detail"].lower()


def test_spam_char_flood_rejected(client, auth_headers):
    payload = dict(REPORT_PAYLOAD)
    payload["title"] = "Character flood"
    payload["description"] = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa scam text here"
    res = client.post("/reports", json=payload, headers=auth_headers)
    assert res.status_code == 400


def test_duplicate_report_rejected(client, auth_headers):
    first = client.post("/reports", json=REPORT_PAYLOAD, headers=auth_headers)
    assert first.status_code == 200
    second = client.post("/reports", json=REPORT_PAYLOAD, headers=auth_headers)
    assert second.status_code == 400
    assert "identical" in second.json()["detail"].lower()


def test_report_length_caps(client, auth_headers):
    payload = dict(REPORT_PAYLOAD)
    payload["title"] = "Over-long description"
    payload["description"] = "x" * 1001
    res = client.post("/reports", json=payload, headers=auth_headers)
    assert res.status_code == 422


def test_comment_length_cap(client, auth_headers):
    created = client.post("/reports", json={
        **REPORT_PAYLOAD, "title": "Comment cap report",
    }, headers=auth_headers)
    report_id = created.json()["id"]
    res = client.post(
        f"/reports/{report_id}/comments",
        json={"author": "Someone", "content": "y" * 501},
        headers=auth_headers,
    )
    assert res.status_code == 422


# ─── Moderation: hide / unhide / delete (admin only) ────────────────────────

def _create_report(client, headers, title="Hideable report"):
    res = client.post("/reports", json={**REPORT_PAYLOAD, "title": title}, headers=headers)
    assert res.status_code == 200
    return res.json()["id"]


def test_hide_requires_admin(client, auth_headers):
    report_id = _create_report(client, auth_headers)
    res = client.post(f"/admin/reports/{report_id}/hide", headers=auth_headers)
    assert res.status_code == 403


def test_hidden_reports_excluded_from_public_feed(client, auth_headers, admin_headers, admin_env):
    report_id = _create_report(client, auth_headers, title="Soon hidden")

    hide = client.post(f"/admin/reports/{report_id}/hide", headers=admin_headers)
    assert hide.status_code == 200
    assert hide.json()["is_hidden"] is True

    public = client.get("/reports")
    assert all(r["id"] != report_id for r in public.json())

    client.post(f"/admin/reports/{report_id}/unhide", headers=admin_headers)
    public_after = client.get("/reports")
    assert any(r["id"] == report_id for r in public_after.json())


def test_admin_can_delete_report_and_comments_cascade(client, auth_headers, admin_headers, admin_env):
    report_id = _create_report(client, auth_headers, title="Deletable report")
    comment = client.post(
        f"/reports/{report_id}/comments",
        json={"author": "Analyst", "content": "Confirmed fake domain."},
        headers=auth_headers,
    )
    assert comment.status_code == 200

    deleted = client.delete(f"/admin/reports/{report_id}", headers=admin_headers)
    assert deleted.status_code == 200

    assert client.get(f"/reports/{report_id}/comments").status_code == 404


def test_non_admin_cannot_delete_comment(client, auth_headers):
    report_id = _create_report(client, auth_headers, title="Comment guard report")
    client.post(
        f"/reports/{report_id}/comments",
        json={"author": "Analyst", "content": "Keep this comment."},
        headers=auth_headers,
    )
    comments = client.get(f"/reports/{report_id}/comments").json()
    res = client.delete(
        f"/admin/reports/{report_id}/comments/{comments[0]['id']}",
        headers=auth_headers,
    )
    assert res.status_code == 403
