import math
from urllib.parse import urlparse

def calculate_shannon_entropy(string: str) -> float:
    """
    Measures domain character randomness. Higher values indicate randomized domain generation.
    """
    if not string:
        return 0.0
    prob = [float(string.count(c)) / len(string) for c in dict.fromkeys(string)]
    entropy = -sum([p * math.log(p, 2) for p in prob])
    return round(entropy, 2)

def analyze_url(url: str) -> dict:
    """
    Evaluates lexical patterns, TLD safety, domain sub-depths, and entropy metrics.
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
    brands = ['paytm', 'paypal', 'google', 'netflix', 'amazon', 'facebook', 'bank', 'sbi', 'hdfc', 'icici', 'fedex']
    brand_found = None
    for b in brands:
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
        
    # Boundary constraints
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
        "flags": flags
    }
