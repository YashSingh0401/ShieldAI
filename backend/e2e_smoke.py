"""End-to-end smoke test against a running uvicorn server."""
import json
import sys
import urllib.request
import urllib.parse
import urllib.error

from app.auth import create_session_token

BASE = "http://127.0.0.1:8000"


def req(method, path, headers=None, form=None, timeout=120):
    r = urllib.request.Request(BASE + path, method=method, headers=headers or {})
    data = None
    if form:
        boundary = "----e2e" + "x" * 16
        chunks = []
        for field, (name, content, ctype) in form.items():
            chunks.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{name}\"\r\n"
                f"Content-Type: {ctype}\r\n\r\n".encode("utf-8")
            )
            chunks.append(content)
            chunks.append(b"\r\n")
        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        data = b"".join(chunks)
        r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(r, data=data, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body) if body else None
        except json.JSONDecodeError:
            return e.code, body.decode("utf-8", "replace")


def main():
    token = create_session_token({"sub": "e2e", "email": "e2e@test.local", "name": "E2E"})
    auth = {"Authorization": f"Bearer {token}"}

    checks = []
    ok = lambda name, passed, extra="": checks.append((name, passed, extra))

    with open("benchmark_data/image/modified/modified_00_splice.jpg", "rb") as f:
        img_t = f.read()
    with open("benchmark_data/image/clean/clean_00.jpg", "rb") as f:
        img_c = f.read()
    with open("benchmark_data/audio/clean/clean_00.wav", "rb") as f:
        audio = f.read()
    with open("benchmark_data/video/clean/clean_00.mp4", "rb") as f:
        video = f.read()

    s, d = req("GET", "/health")
    ok("health", s == 200 and d == {"status": "ok"}, d)

    s, d = req("GET", "/verify/url?url=" + urllib.parse.quote("http://paytm-kyc-update.in/auth"))
    ok("url high risk (no auth)", s == 200 and d["risk_score"] >= 70, f"risk={d['risk_score']} {d['risk_level']}")

    s, d = req("POST", "/verify/image", auth, {"file": ("tampered.jpg", img_t, "image/jpeg")})
    ok("image tampered flagged", s == 200 and d["is_clean"] is False and d["risk_score"] >= 40, f"risk={d['risk_score']}")

    s, d = req("POST", "/verify/image", auth, {"file": ("clean.jpg", img_c, "image/jpeg")})
    ok("image clean passed", s == 200 and d["is_clean"] is True and d["risk_score"] <= 20, f"risk={d['risk_score']}")

    s, d = req("POST", "/verify/audio", auth, {"file": ("speech.wav", audio, "audio/wav")})
    ok("audio clean", s == 200 and d["is_clean"] is True, f"risk={d['risk_score']} {d['risk_level']}")

    s, d = req("POST", "/verify/video", auth, {"file": ("clip.mp4", video, "video/mp4")})
    ok("video analyzed", s == 200 and len(d.get("timeline", [])) == 20, f"risk={d['risk_score']} {d['risk_level']}")

    s, d = req("GET", "/verify/history", auth)
    ok("history has rows", s == 200 and len(d) >= 5, f"rows={len(d)}")

    s, d = req("GET", "/verify/history")
    ok("history requires auth", s == 401, f"status={s}")

    s, d = req("POST", "/reports", auth)
    ok("reports require auth", s in (401, 422), f"status={s}")

    print()
    failed = 0
    for name, passed, extra in checks:
        print(("PASS " if passed else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
        failed += 0 if passed else 1
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
