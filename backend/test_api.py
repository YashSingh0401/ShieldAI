import urllib.request
import urllib.parse
import json
import sys

def test_endpoints():
    base_url = "http://127.0.0.1:8000"
    print("Running integration tests on locally hosted uvicorn server...")
    
    # 1. Test GET /verify/url
    url_to_test = "http://paytm-kyc-verify-update.in/auth"
    encoded_url = urllib.parse.quote(url_to_test)
    req = urllib.request.Request(f"{base_url}/verify/url?url={encoded_url}")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print("[OK] GET /verify/url PASSED!")
            print(f"  Risk rating: {res_data.get('risk_score')}% - {res_data.get('risk_level')}")
            assert res_data.get('risk_score') >= 70, "URL should be classified as high risk"
    except Exception as e:
        print(f"[ERROR] GET /verify/url FAILED: {e}", file=sys.stderr)
        sys.exit(1)
        
    # 2. Test GET /reports
    req = urllib.request.Request(f"{base_url}/reports")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print(f"[OK] GET /reports PASSED! Found {len(res_data)} existing reports.")
            assert len(res_data) >= 0, "Should return list of reports"
    except Exception as e:
        print(f"[ERROR] GET /reports FAILED: {e}", file=sys.stderr)
        sys.exit(1)
        
    # 3. Test POST /reports
    report_payload = {
        "report_type": "phishing_link",
        "title": "Fake Power Grid Subsidies SMS Link",
        "scam_content": "http://power-grid-subsidy-pay.com",
        "description": "Fake SMS urging clients to claim state electrical subsidies immediately or face power interruption.",
        "location": "Chennai, TN"
    }
    data = json.dumps(report_payload).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/reports",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            created_id = res_data.get('id')
            print(f"[OK] POST /reports PASSED! Created scam report ID: {created_id}")
            assert created_id is not None, "Report ID must be created"
    except Exception as e:
        print(f"[ERROR] POST /reports FAILED: {e}", file=sys.stderr)
        sys.exit(1)
        
    # 4. Test POST /reports/{id}/upvote
    req = urllib.request.Request(
        f"{base_url}/reports/{created_id}/upvote",
        data=b"",
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print(f"[OK] POST /reports/{created_id}/upvote PASSED! Total Upvotes: {res_data.get('upvotes')}")
            assert res_data.get('upvotes') == 1, "Upvote count should increment to 1"
    except Exception as e:
        print(f"[ERROR] POST /reports/upvote FAILED: {e}", file=sys.stderr)
        sys.exit(1)
        
    # 5. Test POST /reports/{id}/comments
    comment_payload = {
        "author": "SecurityAnalyst",
        "content": "Confirming this domain is hosted on a dynamic hosting provider using a cheap domain registrar."
    }
    data = json.dumps(comment_payload).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/reports/{created_id}/comments",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            comment_id = res_data.get('id')
            print(f"[OK] POST /reports/{created_id}/comments PASSED! Comment ID: {comment_id}")
            assert comment_id is not None, "Comment ID must be created"
    except Exception as e:
        print(f"[ERROR] POST /reports/{created_id}/comments FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    # 6. Test GET /reports/{id}/comments
    req = urllib.request.Request(f"{base_url}/reports/{created_id}/comments")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print(f"[OK] GET /reports/{created_id}/comments PASSED! Found {len(res_data)} comments.")
            assert len(res_data) == 1, "Should return 1 comment"
            assert res_data[0].get('author') == "SecurityAnalyst", "Comment author should match"
    except Exception as e:
        print(f"[ERROR] GET /reports/{created_id}/comments FAILED: {e}", file=sys.stderr)
        sys.exit(1)
        
    print("\nALL INTEGRATION ENDPOINT CHECKS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_endpoints()


