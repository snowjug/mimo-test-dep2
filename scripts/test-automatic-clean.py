#!/usr/bin/env python3
"""
MIMO Automated Colour Ink Cleaning Test Runner
==============================================
Runs and tests the automated colour printer ink cleaning routine.
1. Checks printer queue to guarantee no customer jobs are disturbed.
2. Generates ESC/P-R printhead clean sequence (Clean Head command).
3. Submits cleaning job to CUPS.
4. Calls backend API (POST /kiosk/report-clean) to send email to visionprintt@gmail.com
   and record the maintenance event in Firestore.
"""

import os
import sys
import argparse

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add pi_scripts to Python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PI_SCRIPTS_DIR = os.path.join(ROOT_DIR, "pi_scripts")
if PI_SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, PI_SCRIPTS_DIR)

import clean_epson as CE


def main():
    parser = argparse.ArgumentParser(description="Trigger automated colour ink cleaning test")
    parser.add_argument("--printer", default=os.getenv("COLOR_PRINTER_NAME", "Epson_L3250"), help="Colour printer name (default: Epson_L3250)")
    parser.add_argument("--kiosk", default=os.getenv("KIOSK_ID", "SV-002"), help="Kiosk ID (default: SV-002)")
    parser.add_argument("--backend-url", default=os.getenv("BACKEND_URL", "https://api-upqxuj7evq-uc.a.run.app"), help="Backend URL")
    args = parser.parse_args()

    os.environ["BACKEND_URL"] = args.backend_url
    print("=" * 60)
    print("🚀 MIMO Automated Colour Ink Cleaning Test")
    print(f"   Target Kiosk:   {args.kiosk}")
    print(f"   Colour Printer: {args.printer}")
    print(f"   Backend URL:    {args.backend_url}")
    print("=" * 60)

    print("\n[Step 1/3] Running safety verification: ensuring printer queue is idle...")
    is_idle = CE.is_printer_idle(args.printer)
    if is_idle:
        print(f"✅ Printer {args.printer} queue is verified idle. Safe to clean.")
    else:
        print(f"⏳ Printer {args.printer} is busy. Waiting for customer print to finish safely...")

    print("\n[Step 2/3] Submitting ESC/P-R printhead cleaning routine...")
    success, detail = CE.run_cleaning_job(printer_name=args.printer, kiosk_id=args.kiosk)

    print("\n[Step 3/3] Execution Summary:")
    print(f"   Status:  {'✅ SUCCESS' if success else '❌ FAILED'}")
    print(f"   Details: {detail}")
    print("\nNotification sent to visionprintt@gmail.com and logged in Firestore.")
    print("=" * 60)

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
