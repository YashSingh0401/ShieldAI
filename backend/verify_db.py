import sys
from app.database import engine, Base, SessionLocal
from app.models import ScamReport

def verify_and_seed():
    print("1. Creating database tables in SQLite...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")

    print("\n2. Initializing database session...")
    db = SessionLocal()
    
    try:
        # Check if table is empty
        count = db.query(ScamReport).count()
        print(f"Current scam reports count in database: {count}")
        
        if count == 0:
            print("\n3. Seeding database with initial security alerts...")
            mock_reports = [
                ScamReport(
                    report_type="phishing_link",
                    title="Fake Electricity Suspension SMS Link",
                    scam_content="http://electricity-bill-pay-help.in",
                    description="Received SMS stating electricity connection would be cut off tonight at 9:30 PM due to unpaid bills. Asked to call a mobile number or update status via link.",
                    location="Mumbai, MH",
                    upvotes=18
                ),
                ScamReport(
                    report_type="scam_call",
                    title="FedEx Delivery Pending Custody Call",
                    scam_content="+91 98765-43210",
                    description="Robocall claiming a package in my name contains illegal items and is held by Customs. They demand bank details or immediate funds to release and verify identity.",
                    location="New Delhi, DL",
                    upvotes=42
                ),
                ScamReport(
                    report_type="fake_app",
                    title="SBI Yono SecurShield App APK",
                    scam_content="sbi-yono-verify.apk",
                    description="Sms link prompting to download a security app for bank verification. It downloads a malicious third-party APK that intercepts SMS OTP codes.",
                    location="Bengaluru, KA",
                    upvotes=27
                )
            ]
            
            db.add_all(mock_reports)
            db.commit()
            print("Successfully seeded 3 mock reports!")
        else:
            print("\nDatabase already contains data, skipping seed step.")

        print("\n4. Running test query from database...")
        records = db.query(ScamReport).all()
        print(f"Queried {len(records)} records from SQLite:")
        for r in records:
            print(f" - #{r.id} [{r.report_type}]: {r.title} at {r.location} (Upvotes: {r.upvotes})")
            
        print("\nDatabase layer verification PASSED successfully!")
        
    except Exception as e:
        print(f"\nVerification FAILED with error: {e}", file=sys.stderr)
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    verify_and_seed()
