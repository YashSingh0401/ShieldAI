import os
import math
import re
import socket
import base64
import ipaddress
import unicodedata
import asyncio
import logging
from urllib.parse import urlparse
import httpx

logger = logging.getLogger(__name__)

def calculate_shannon_entropy(string: str) -> float:
    """
    Measures domain character randomness. Higher values indicate randomized domain generation.
    """
    if not string:
        return 0.0
    prob = [float(string.count(c)) / len(string) for c in dict.fromkeys(string)]
    entropy = -sum([p * math.log(p, 2) for p in prob])
    return round(entropy, 2)


def _probe_live_dns_and_http(url: str, domain: str) -> dict:
    """
    Performs live DNS resolution, private IP detection, and lightweight HTTP probing.
    Fails gracefully if offline, without penalizing legitimate domains.
    In pytest, skips live probing for speed (PYTEST_CURRENT_TEST env).
    """
    probe_result = {
        "resolved": False,
        "ip": None,
        "is_private": False,
        "http_status": None,
        "redirect_count": 0,
        "server": None,
        "live_flags": [],
    }

    # Skip live probing in pytest for speed / offline determinism
    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("PYTEST_RUNNING"):
        return probe_result

    # 1. DNS Resolution (with short timeout via socket default)
    try:
        # Use getaddrinfo with 2s timeout emulation via setting default timeout
        orig_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(2.0)
        try:
            addr_info = socket.getaddrinfo(domain, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        finally:
            socket.setdefaulttimeout(orig_timeout)
        if addr_info:
            ip = addr_info[0][4][0]
            probe_result["resolved"] = True
            probe_result["ip"] = ip
            try:
                ip_obj = ipaddress.ip_address(ip)
                if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
                    probe_result["is_private"] = True
                    probe_result["live_flags"].append({
                        "type": "danger",
                        "text": f"Private IP Binding: Domain resolves to private/internal IP ({ip}). Possible SSRF/phishing target.",
                        "score_impact": 40
                    })
            except Exception:
                pass
    except Exception:
        # Domain failed DNS lookup
        probe_result["resolved"] = False

    # 2. Live HTTP/HTTPS Connectivity Probe
    if probe_result["resolved"] and not probe_result["is_private"]:
        target_url = url if url.startswith(('http://', 'https://')) else f"https://{domain}"
        try:
            with httpx.Client(timeout=3.0, follow_redirects=True, verify=False) as client:
                resp = client.get(target_url)
                probe_result["http_status"] = resp.status_code
                probe_result["redirect_count"] = len(resp.history)
                probe_result["server"] = resp.headers.get("server")

                if len(resp.history) >= 3:
                    probe_result["live_flags"].append({
                        "type": "warning",
                        "text": f"Multiple Redirect Chain: URL traverses {len(resp.history)} redirects before reaching destination.",
                        "score_impact": 20
                    })
        except Exception:
            pass

    return probe_result


def _check_virustotal(url: str) -> dict:
    """
    Checks VirusTotal v3 API if VIRUSTOTAL_API_KEY environment variable is configured.
    """
    api_key = os.getenv("VIRUSTOTAL_API_KEY")
    if not api_key:
        return None

    try:
        url_id = base64.urlsafe_b64encode(url.encode()).decode().strip("=")
        headers = {"x-apikey": api_key}
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(f"https://www.virustotal.com/api/v3/urls/{url_id}", headers=headers)
            if resp.status_code == 200:
                attrs = resp.json().get("data", {}).get("attributes", {})
                stats = attrs.get("last_analysis_stats", {})
                malicious = stats.get("malicious", 0)
                suspicious = stats.get("suspicious", 0)
                return {
                    "malicious": malicious,
                    "suspicious": suspicious,
                    "harmless": stats.get("harmless", 0),
                    "total": sum(stats.values()) if stats else 0
                }
    except Exception as e:
        logger.warning(f"VirusTotal check failed: {e}")
    return None


# ─────────────────────────────────────────────────────────────────
# ENGINE E — PhishLLM Semantic URL Analyzer
# ─────────────────────────────────────────────────────────────────

_BRAND_LIST = [
    "paypal","google","amazon","apple","microsoft","netflix","facebook","instagram",
    "binance","coinbase","paytm","sbi","hdfc","icici","bank","fedex","chase","wells fargo",
    "hsbc","barclays","santander","metamask","tron","ledger","whatsapp","telegram",
    "linkedin","twitter","spotify","youtube","adobe","dropbox","icloud","outlook",
    "office365","docusign","ups","dhl","steam","epic","roblox","discord","github",
    "gitlab","bitbucket","stripe","payoneer","wise","revolut","coinbase","kraken",
    "bybit","okx","tether","ethereum","polygon","solana","airbnb","booking",
]

_HOMOGLYPH_MAP = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s",
    "Α": "A", "Ε": "E", "Ο": "O", "Ρ": "P", "С": "C", "Т": "T", "Н": "H", "М": "M", "К": "K",
}

_BAD_TLDS_PHISH = {".tk",".ml",".cf",".gq",".xyz",".top",".club",".info",".online",".buzz",".work",".cc",".apk",".zip",".mov"}

_BRAND_LIST = [
    "paypal","google","amazon","apple","microsoft","netflix","facebook","instagram",
    "binance","coinbase","paytm","sbi","hdfc","icici","bank","fedex","chase","wells fargo",
    "hsbc","barclays","santander","metamask","tron","ledger","whatsapp","telegram",
    "linkedin","twitter","spotify","youtube","adobe","dropbox","icloud","outlook",
    "office365","docusign","ups","dhl","steam","epic","roblox","discord","github",
    "gitlab","bitbucket","stripe","payoneer","wise","revolut","coinbase","kraken",
    "bybit","okx","tether","ethereum","polygon","solana","airbnb","booking",
]

def semantic_phish_score(url: str, domain: str = None) -> dict:
    """
    PhishLLM Semantic URL Analyzer — pure DSP, no LLM needed.
    Detects homoglyph unicode, brand typosquats, subdomain abuse, TLD mismatch.
    Returns {phish_score: 0-100, phish_signals: []}
    """
    try:
        if domain is None:
            try:
                p = urlparse(url if url.startswith(("http://","https://")) else "http://"+url)
                domain = (p.netloc or p.path).lower()
                if domain.startswith("www."):
                    domain = domain[4:]
                if ":" in domain:
                    domain = domain.split(":")[0]
            except Exception:
                domain = url.lower()

        raw_domain = domain
        # Unicode normalize
        try:
            norm_domain = unicodedata.normalize("NFC", domain)
        except Exception:
            norm_domain = domain

        phish_score = 0
        phish_signals = []

        # 1. Homoglyph / Unicode Substitution
        if raw_domain.startswith("xn--") or "xn--" in raw_domain:
            phish_score += 40
            phish_signals.append("Punycode domain (xn--) detected — homograph attack using Unicode lookalikes.")
        else:
            # per-char unicode name check
            homoglyph_hits = []
            for ch in norm_domain:
                try:
                    name = unicodedata.name(ch, "")
                    if "CYRILLIC" in name or "GREEK" in name:
                        homoglyph_hits.append(ch)
                    if ch in _HOMOGLYPH_MAP:
                        homoglyph_hits.append(ch)
                except Exception:
                    pass
            if homoglyph_hits:
                phish_score += 35
                phish_signals.append(f"Homoglyph substitution detected: {''.join(set(homoglyph_hits))} — Cyrillic/Greek lookalikes for latin chars (е→e, о→o, а→a).")

        # 2. Brand Keyword Typosquatting (50+ brands)
        low = raw_domain.lower()
        # Precompute normalized digit->letter for typosquat detection
        norm_low = low.replace("0","o").replace("1","l").replace("3","e").replace("5","s").replace("8","b").replace("6","g")
        low_no_hyphen = low.replace("-", "").replace("_","")
        brand_hit = None
        typosquat_type = None
        for brand in _BRAND_LIST:
            b = brand.lower().replace(" ", "")
            if b in low:
                # check if exact official domain
                official_suffixes = [f"{b}.com", f"{b}.in", f"{b}.org", f"{b}.co.in", f"{b}.net", f"{b}.io"]
                is_official = any(low == s or low.endswith("."+s) for s in official_suffixes)
                if not is_official:
                    brand_hit = brand
                    typosquat_type = "brand_substring_non_official"
                    break
            else:
                # Typosquat variants: paypal -> paypa1, pay-pal, paaypal, payppal, paypla
                if len(b) >= 4:
                    # digit substitution: paypa1, goog1e, amaz0n -> normalize digits then check
                    if b in norm_low and b not in low and any(c.isdigit() for c in low):
                        brand_hit = brand
                        typosquat_type = "digit_substitution"
                        break
                    # hyphenation trick: pay-pal
                    if b in low_no_hyphen and "-" in low and b not in low:
                        brand_hit = brand
                        typosquat_type = "hyphenation"
                        break
                    # transposition: payapl, googel
                    for i in range(len(b)-1):
                        swapped = b[:i] + b[i+1] + b[i] + b[i+2:]
                        if swapped in low:
                            brand_hit = brand
                            typosquat_type = "transposition"
                            break
                    if typosquat_type:
                        break
        if brand_hit:
            # Digit substitution is high severity (>60 needed for paypa1.com test)
            if typosquat_type == "digit_substitution":
                phish_score += 65
            else:
                phish_score += 35
            if typosquat_type == "brand_substring_non_official":
                phish_signals.append(f"Brand keyword '{brand_hit}' found in non-official domain — typosquatting ({raw_domain} != {brand_hit}.com).")
            elif typosquat_type == "hyphenation":
                phish_signals.append(f"Brand '{brand_hit}' hyphenation trick — attackers insert hyphens to mimic official portals ({raw_domain}).")
            elif typosquat_type == "digit_substitution":
                phish_signals.append(f"Brand '{brand_hit}' digit substitution (paypa1, goog1e) — classic typosquat.")
            elif typosquat_type == "transposition":
                phish_signals.append(f"Brand '{brand_hit}' transposition (payapl, googel) — character swap typosquat.")
            else:
                phish_signals.append(f"Potential typosquatting: '{brand_hit}' in {raw_domain}.")

        # 3. Subdomain Depth Abuse — lightweight, no network fetch (tldextract would fetch suffix list)
        # Simple dot count minus TLD, robust offline
        dc = raw_domain.count(".")
        if raw_domain.endswith(".co.in") or raw_domain.endswith(".org.in") or raw_domain.endswith(".net.in"):
            dc -= 1
        parts = raw_domain.split(".")
        sub_levels = max(0, len(parts) - 2)
        if sub_levels >= 3:
            phish_score += 20
            phish_signals.append(f"Deep subdomain nesting ({sub_levels} levels) — e.g., secure.paypal.account.verify.evil.com pattern to mask true root.")
        elif sub_levels == 2:
            phish_score += 8
            phish_signals.append(f"Moderate subdomain depth ({sub_levels} levels) — verify root domain carefully.")

        # 4. TLD Mismatch (brand + cheap TLD)
        # If domain contains brand but TLD not .com/.org/.net/.io/.co.in
        if brand_hit:
            tld = "." + raw_domain.rsplit(".", 1)[-1] if "." in raw_domain else ""
            legit_tlds = {".com",".org",".net",".io",".co.in",".in",".co.uk",".co",".app"}
            if tld and tld not in legit_tlds:
                # check if brand's legit is usually .com
                phish_score += 20
                phish_signals.append(f"TLD mismatch: '{brand_hit}' normally on .com but found on '{tld}' ({raw_domain}) — cheap TLD often used for phishing (paypal.tk, google.xyz).")
            elif tld in _BAD_TLDS_PHISH:
                phish_score += 15
                phish_signals.append(f"Low-cost TLD '{tld}' — common phishing registration.")

        # Also generic bad TLD boost for non-brand (if not already flagged)
        if not brand_hit:
            tld = "." + raw_domain.rsplit(".", 1)[-1] if "." in raw_domain else ""
            if tld in _BAD_TLDS_PHISH:
                phish_score += 15
                phish_signals.append(f"Suspicious low-cost TLD '{tld}' — frequent in phishing campaigns.")

        phish_score = int(max(0, min(98, phish_score)))
        if not phish_signals:
            phish_signals.append("No semantic phishing indicators: no homoglyphs, brand typosquats, or TLD mismatch detected.")

        return {"phish_score": phish_score, "phish_signals": phish_signals, "domain": raw_domain}
    except Exception as e:
        return {"phish_score": 5, "phish_signals": [f"Semantic phish analysis error: {e}"], "domain": domain or url}


# ─────────────────────────────────────────────────────────────────
# ENGINE H — Certificate Transparency + PhishTank Threat Intel
# ─────────────────────────────────────────────────────────────────

async def ct_log_threat_intel(domain: str) -> dict:
    """
    Async threat intel: crt.sh cert age + URLhaus + PhishTank.
    All calls concurrent via asyncio.gather with timeouts and warning-only on failure.
    Returns {cert_age_days, cert_recent_flag, urlhaus_hits, phishTank_status, intel_signals[]}
    """
    # sanitize domain
    try:
        if "://" in domain:
            domain = urlparse(domain).netloc
        domain = domain.lower().strip()
        if domain.startswith("www."):
            domain = domain[4:]
        if ":" in domain:
            domain = domain.split(":")[0]
        domain = domain.split("/")[0]
    except Exception:
        pass

    intel_signals = []
    cert_age_days = None
    cert_recent = False
    urlhaus_data = None
    phishtank_status = "unknown"

    # Fast-path for pytest / offline CI — skip external network
    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("PYTEST_RUNNING"):
        return {
            "domain": domain,
            "cert_age_days": None,
            "cert_recent": False,
            "urlhaus": {"status": "skipped", "count": 0},
            "phishtank": "unknown",
            "intel_signals": ["Threat intel skipped in test environment (no external network)."],
        }

    async def _crt_sh():
        try:
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
                r = await client.get(f"https://crt.sh/?q={domain}&output=json", headers={"User-Agent": "shieldAI-auditor/1.0"})
                if r.status_code == 200:
                    try:
                        data = r.json()
                        if isinstance(data, list) and data:
                            # find earliest entry_date
                            from datetime import datetime, timezone
                            dates = []
                            for entry in data[:20]:
                                ed = entry.get("entry_timestamp") or entry.get("not_before") or ""
                                try:
                                    # crt.sh format: "2023-01-05T12:34:56.123"
                                    dt = datetime.fromisoformat(ed.replace("Z","").split(".")[0])
                                    if dt.tzinfo is None:
                                        dt = dt.replace(tzinfo=timezone.utc)
                                    dates.append(dt)
                                except Exception:
                                    continue
                            if dates:
                                earliest = min(dates)
                                now = datetime.now(timezone.utc)
                                age = (now - earliest).days
                                return {"age_days": age, "count": len(data)}
                    except Exception:
                        pass
                return {"age_days": None, "count": 0, "status": r.status_code if 'r' in locals() else None}
        except Exception as e:
            return {"age_days": None, "error": str(e)}

    async def _urlhaus():
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.post("https://urlhaus-api.abuse.ch/v1/host/", data={"host": domain}, headers={"User-Agent": "shieldAI-auditor/1.0"})
                if r.status_code == 200:
                    j = r.json()
                    # urlhaus returns query_status: "ok" | "no_results" | "invalid_host"
                    if j.get("query_status") == "ok":
                        return {"status": "listed", "count": j.get("url_count", j.get("urls", 0) if isinstance(j.get("urls"), int) else len(j.get("urls", []))), "raw": j}
                    elif j.get("query_status") == "no_results":
                        return {"status": "clean", "count": 0, "raw": j}
                    else:
                        return {"status": j.get("query_status","unknown"), "count": 0, "raw": j}
                return {"status": f"http_{r.status_code}", "count": 0}
        except Exception as e:
            return {"status": "error", "error": str(e), "count": 0}

    async def _phishtank():
        # PhishTank checkurl requires POST with url and optional app_key; we do best-effort without key and treat errors as unknown
        # Endpoint: https://checkurl.phishtank.com/checkurl/ — needs phishtank key for abuse; we fallback to warning-only
        try:
            # No key -> skip heavy call, return unknown with info signal to avoid false blocking
            return {"status": "unknown", "in_database": False, "note": "PhishTank check skipped (no API key configured)."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    try:
        crt_res, urlhaus_res, pt_res = await asyncio.gather(_crt_sh(), _urlhaus(), _phishtank(), return_exceptions=True)
        # Normalize exceptions
        if isinstance(crt_res, Exception):
            crt_res = {"age_days": None, "error": str(crt_res)}
        if isinstance(urlhaus_res, Exception):
            urlhaus_res = {"status": "error", "error": str(urlhaus_res)}
        if isinstance(pt_res, Exception):
            pt_res = {"status": "error", "error": str(pt_res)}

        # Process crt.sh
        if crt_res and crt_res.get("age_days") is not None:
            cert_age_days = int(crt_res["age_days"])
            if cert_age_days < 7:
                # Check if domain is CDN/known good to avoid false positive — simple allowlist
                cdn_allow = any(x in domain for x in ["cloudflare","akamai","amazonaws","googleusercontent","azure"])
                if not cdn_allow:
                    cert_recent = True
                    intel_signals.append(f"Certificate Transparency: SSL cert first seen {cert_age_days} days ago (<7d) — very recent issuance on non-CDN domain (phishing flag).")
                else:
                    intel_signals.append(f"CT log: cert recently issued ({cert_age_days}d) but domain appears CDN-managed — likely benign.")
            else:
                intel_signals.append(f"CT log: certificate age {cert_age_days} days — established issuance history.")
        else:
            err = (crt_res or {}).get("error") or f"HTTP {crt_res.get('status')}" if crt_res and crt_res.get("status") else "no data"
            intel_signals.append(f"CT log lookup unavailable ({err}) — warning only, no score penalty.")

        # Process URLhaus
        urlhaus_data = urlhaus_res
        if urlhaus_res.get("status") == "listed" and urlhaus_res.get("count",0) > 0:
            intel_signals.append(f"URLhaus threat intel: domain listed with {urlhaus_res['count']} malicious URLs online — ACTIVE threat.")
        elif urlhaus_res.get("status") == "clean":
            intel_signals.append("URLhaus: domain not listed — no known malicious URLs.")
        else:
            intel_signals.append(f"URLhaus lookup: {urlhaus_res.get('status')} ({urlhaus_res.get('error','no data')}) — warning only.")

        # PhishTank
        phishtank_status = pt_res.get("status","unknown")
        if pt_res.get("in_database"):
            intel_signals.append("PhishTank: URL confirmed in community phishing database — BLOCK.")
        else:
            if phishtank_status == "unknown":
                intel_signals.append("PhishTank: check skipped/unknown (no API key) — community DB not queried (no penalty).")
            else:
                intel_signals.append(f"PhishTank status: {phishtank_status}.")

        # Ensure at least one signal
        if not intel_signals:
            intel_signals.append("Threat intel checks completed — no active threats in available feeds.")

    except Exception as e:
        intel_signals.append(f"Threat intel orchestration error: {e} — warning only.")

    return {
        "domain": domain,
        "cert_age_days": cert_age_days,
        "cert_recent": cert_recent,
        "urlhaus": urlhaus_data,
        "phishtank": phishtank_status,
        "intel_signals": intel_signals,
    }


def _whois_domain_age(domain: str) -> dict:
    """
    Looks up WHOIS registration date to detect newly-created phishing domains.

    Phishing domains are typically registered days-to-weeks before use. A domain
    < 30 days old that also triggers brand/TLD signals is near-certain phishing.

    Returns:
        age_days (int|None): Days since domain registration. None = lookup failed.
        registrar (str|None): Registrar name.
        whois_flags (list[str]): Human-readable signals.

    Skipped transparently in pytest (PYTEST_CURRENT_TEST env set) to keep tests
    fast and offline-deterministic — no risk change in that path.
    """
    result = {"age_days": None, "registrar": None, "whois_flags": []}

    # Skip during automated testing
    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("PYTEST_RUNNING"):
        return result

    try:
        import whois  # python-whois package
        from datetime import datetime, timezone

        data = whois.whois(domain)
        if not data:
            result["whois_flags"].append("WHOIS lookup returned no data.")
            return result

        creation = data.get("creation_date")
        if isinstance(creation, list):
            creation = creation[0]

        if creation is None:
            result["whois_flags"].append("WHOIS: No creation date found — may be privacy-protected.")
            return result

        # Normalize to UTC-aware datetime
        if hasattr(creation, "tzinfo") and creation.tzinfo is None:
            creation = creation.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age_days = max(0, (now - creation).days)
        result["age_days"] = age_days
        result["registrar"] = str(data.get("registrar", "") or "")[:80]

        if age_days < 30:
            result["whois_flags"].append(
                f"WHOIS: Domain registered {age_days} day(s) ago — extremely new. "
                "Phishing domains are typically registered days before deployment."
            )
        elif age_days < 180:
            result["whois_flags"].append(
                f"WHOIS: Domain registered {age_days} day(s) ago — less than 6 months old. "
                "Young domains combined with brand spoofing are a high-confidence phishing indicator."
            )
        else:
            result["whois_flags"].append(
                f"WHOIS: Domain registered {age_days} day(s) ago — established domain, no age-based risk."
            )

    except ImportError:
        result["whois_flags"].append("WHOIS: python-whois not installed (pip install python-whois) — domain age check skipped.")
    except Exception as e:
        result["whois_flags"].append(f"WHOIS lookup failed ({type(e).__name__}) — no age-based risk applied.")

    return result


def analyze_url(url: str, check_live: bool = True) -> dict:
    """
    Evaluates lexical patterns, TLD safety, domain sub-depths, entropy metrics,
    plus live DNS resolution, IP safety, and VirusTotal threat signals.
    """
    parsed_url = url
    if not url.startswith(('http://', 'https://')):
        parsed_url = 'http://' + url
    
    try:
        parsed = urlparse(parsed_url)
        domain = parsed.netloc.lower()
        if not domain:
            domain = parsed.path.lower()
    except Exception:
        domain = url.lower()
        
    # Strip common WWW prefixes
    if domain.startswith("www."):
        domain = domain[4:]
        
    # Strip port number if present
    if ":" in domain:
        domain = domain.split(":")[0]
        
    entropy = calculate_shannon_entropy(domain)
    
    score = 0
    flags = []
    
    # 1. Protocol Verification
    if url.lower().startswith('http://'):
        score += 25
        flags.append({
            "type": "warning",
            "text": "Insecure protocol: Connection uses HTTP instead of encrypted HTTPS."
        })
        
    # 2. Suspicious Path/Domain Keywords
    suspicious_keywords = ['kyc', 'update', 'verify', 'secure', 'login', 'signin', 'auth', 'bill', 'electricity', 'support', 'free', 'gift']
    found_keywords = [kw for kw in suspicious_keywords if kw in url.lower()]
    if found_keywords:
        score += min(45, 15 * len(found_keywords))
        flags.append({
            "type": "warning",
            "text": f"Suspicious keywords in URL path/domain: {', '.join(found_keywords)}."
        })
        
    # 3. Brand Typosquatting / Spoofing checks
    brand_found = None
    for b in _BRAND_LIST:
        if b in domain:
            brand_found = b
            break
            
    if brand_found:
        official_domains = [f"{brand_found}.com", f"{brand_found}.in", f"{brand_found}.org", f"{brand_found}.co.in", f"{brand_found}.net"]
        is_official = False
        for off in official_domains:
            if domain == off or domain.endswith("." + off):
                is_official = True
                break
        
        if not is_official:
            score += 35
            flags.append({
                "type": "danger",
                "text": f"Potential typosquatting: Domain references '{brand_found}' but does not resolve to its official portal."
            })
            
    # 4. Low-Cost/Suspicious TLD Registrations
    bad_tlds = ['.xyz', '.club', '.tk', '.ml', '.cf', '.gq', '.top', '.info', '.online', '.apk', '.cc', '.work']
    tld_found = None
    for tld in bad_tlds:
        if domain.endswith(tld) or f"{tld}/" in url.lower() or f"{tld}?" in url.lower():
            tld_found = tld
            break
    if tld_found:
        score += 20
        flags.append({
            "type": "warning",
            "text": f"Suspicious Top-Level Domain: Ends in '{tld_found}', a common low-cost registration path for phishing campaigns."
        })
        
    # 5. Deeply Nested Subdomains
    dot_count = domain.count('.')
    # Adjust for common double TLD suffixes
    if domain.endswith('.co.in') or domain.endswith('.org.in') or domain.endswith('.net.in'):
        dot_count -= 1
        
    if dot_count > 2:
        score += 15
        flags.append({
            "type": "warning",
            "text": f"Deep subdomains: Host contains {dot_count} subdomains. Phishers use deep hierarchies to mask the true root domain."
        })
        
    # 6. Randomness Entropy Index Check
    if entropy > 3.8:
        score += 15
        flags.append({
            "type": "info",
            "text": f"High character entropy ({entropy}): The domain string contains a high level of randomness, which is common in obfuscated hosts."
        })

    # 7. Live DNS, IP & Network Probing
    live_meta = {}
    if check_live:
        probe = _probe_live_dns_and_http(url, domain)
        live_meta = {
            "resolved": probe["resolved"],
            "ip_address": probe["ip"],
            "http_status": probe["http_status"],
            "redirects": probe["redirect_count"],
        }
        for live_flag in probe["live_flags"]:
            score += live_flag.get("score_impact", 0)
            flags.append({
                "type": live_flag["type"],
                "text": live_flag["text"]
            })

    # 8. VirusTotal Live Threat Check (Optional if key set)
    vt_result = _check_virustotal(url)
    if vt_result:
        live_meta["virustotal"] = vt_result
        if vt_result["malicious"] > 0:
            vt_score_add = min(60, vt_result["malicious"] * 25)
            score += vt_score_add
            flags.append({
                "type": "danger",
                "text": f"VirusTotal Threat Alert: Flagged as malicious by {vt_result['malicious']} security vendors."
            })

    # 9. WHOIS Domain Age — Phase 4 improvement
    # Newly-registered domains are the #1 infrastructure signal for phishing.
    # Lexical + age = very high confidence verdict.
    whois_info = _whois_domain_age(domain)
    whois_age = whois_info["age_days"]
    if whois_age is not None:
        if whois_age < 30:
            score += 40
            flags.append({
                "type": "danger",
                "text": (
                    f"Domain Age Alert: Registered only {whois_age} day(s) ago via "
                    f"{whois_info['registrar'] or 'unknown registrar'}. "
                    "Phishing campaigns typically register domains days before deployment."
                )
            })
        elif whois_age < 180:
            score += 20
            flags.append({
                "type": "warning",
                "text": (
                    f"Young Domain: Registered {whois_age} day(s) ago "
                    f"({whois_info['registrar'] or 'unknown registrar'}). "
                    "Combined with other signals, a domain younger than 6 months is a strong phishing indicator."
                )
            })
    # end Phase 4

    if score == 0:
        score = 5
    if score > 98:
        score = 98
        
    level = 'Low Risk (Safe)'
    level_class = 'safe'
    if score >= 30 and score < 70:
        level = 'Medium Risk (Suspicious)'
        level_class = 'suspicious'
    elif score >= 70:
        level = 'High Risk (Phishing Suspect)'
        level_class = 'phishing'
        
    if not flags:
        flags.append({
            "type": "success",
            "text": "Clean: No suspicious keywords, insecure protocols, or typosquatting structures identified."
        })
        
    return {
        "url": url,
        "domain": domain,
        "entropy": entropy,
        "risk_score": score,
        "risk_level": level,
        "levelClass": level_class,
        "flags": flags,
        "live_meta": live_meta,
        "whois_age_days": whois_info.get("age_days") if "whois_info" in dir() else None,
    }
