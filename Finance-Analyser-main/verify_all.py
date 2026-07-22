import os
import sys

sys.path.insert(0, r"C:\Users\ThinkPad\Downloads\Finance-Analyser-main")

from extractors import detect_bank_and_get_extractor
from utils.abb_calculator import calculate_monthly_abb
from utils.credit_analyzer import analyze_credit_profile
import pandas as pd

pdf_dir = r"C:\Users\ThinkPad\Downloads\HONEY BANK STATEMENT (2)\HONEY BANK STATEMENT"
if not os.path.exists(pdf_dir):
    pdf_dir = r"C:\Users\ThinkPad\Downloads\excel_file_management\pdfs_of_statements"

pdf_files = sorted([f for f in os.listdir(pdf_dir) if f.lower().endswith('.pdf')])

print("=== STARTING BATCH VERIFICATION TESTING ===")
success_count = 0
for filename in pdf_files:
    path = os.path.join(pdf_dir, filename)
    print(f"\n--- Processing: {filename} ---")
    try:
        extractor = detect_bank_and_get_extractor(path)
        print(f"  Bank Identified: {extractor.bank_name} ({extractor.__class__.__name__})")
        
        metadata, transactions = extractor.parse(path)
        print(f"  Customer Name: {metadata.get('customer_name')}")
        print(f"  Account Number: {metadata.get('account_number')}")
        print(f"  Date Range: {metadata.get('start_date')} to {metadata.get('end_date')}")
        print(f"  Extracted Transactions: {len(transactions)}")
        
        if len(transactions) > 0:
            df_txs = pd.DataFrame(transactions)
            df_monthly, abb_summary = calculate_monthly_abb(df_txs, metadata["start_date"], metadata["end_date"])
            print(f"  ABB Summary: 1M={abb_summary['1M']}, 3M={abb_summary['3M']}, 6M={abb_summary['6M']}")
            
            assessment = analyze_credit_profile(df_txs, df_monthly, abb_summary, metadata)
            print(f"  Liquidity Grade: {assessment.get('liquidity_strength')}")
            print(f"  Risk Profile: {assessment.get('overall_profile')}")
            success_count += 1
        else:
            print("  Warning: No transactions extracted!")
            
    except Exception as e:
        print(f"  ERROR: Failed to process {filename}: {e}")

print(f"\n=== BATCH VERIFICATION COMPLETED: {success_count}/{len(pdf_files)} STATEMENTS PARSED SUCCESSFULLY ===")
