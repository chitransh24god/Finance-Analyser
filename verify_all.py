import os
import sys

# Add current path to import extractors
sys.path.append(r"C:\Users\ThinkPad\Downloads\excel_file_management\ABB_Analyzer")

from extractors import detect_bank_and_get_extractor
from utils.abb_calculator import calculate_monthly_abb
from utils.credit_analyzer import analyze_credit_profile
import pandas as pd

pdf_dir = r"C:\Users\ThinkPad\Downloads\excel_file_management\pdfs_of_statements"
pdf_files = [
    "Axis Bank SAVING BANK.pdf",
    "Axix bank neo for cooperative banks.pdf",
    "Canara bank format.pdf",
    "Hdfc format.PDF",
    "IC BANK format.pdf",
    "ICICI Bank.pdf",
    "IDFC_First bank.pdf",
    "Kalupur cooperative bank.pdf",
    "Sbi format.pdf",
    "yes bank.pdf",
    "passwordless/HDFC Account Statement.pdf"
]

print("=== STARTING BATCH VERIFICATION TESTING ===")
for filename in pdf_files:
    path = os.path.join(pdf_dir, filename)
    if not os.path.exists(path):
        # Check nested
        if "passwordless" not in filename and os.path.exists(os.path.join(pdf_dir, "passwordless", filename)):
            path = os.path.join(pdf_dir, "passwordless", filename)
        else:
            print(f"Skipping missing file: {filename}")
            continue
            
    print(f"\n--- Processing: {filename} ---")
    try:
        # Get extractor
        extractor = detect_bank_and_get_extractor(path)
        print(f"  Detected Extractor: {extractor.__class__.__name__}")
        
        # Parse
        metadata, transactions = extractor.parse(path)
        print(f"  Customer Name: {metadata.get('customer_name')}")
        print(f"  Account Number: {metadata.get('account_number')}")
        print(f"  Date Range: {metadata.get('start_date')} to {metadata.get('end_date')}")
        print(f"  Extracted Transactions: {len(transactions)}")
        
        if len(transactions) > 0:
            df_txs = pd.DataFrame(transactions)
            df_monthly, abb_summary = calculate_monthly_abb(df_txs, metadata["start_date"], metadata["end_date"])
            print(f"  ABB Summary: 1M={abb_summary['1M']}, 3M={abb_summary['3M']}, 6M={abb_summary['6M']}")
            
            # Analyze
            assessment = analyze_credit_profile(df_txs, df_monthly, abb_summary, metadata)
            print(f"  Liquidity Grade: {assessment.get('liquidity_strength')}")
            print(f"  Risk Profile: {assessment.get('overall_profile')}")
        else:
            print("  Warning: No transactions extracted!")
            
    except Exception as e:
        print(f"  ERROR: Failed to process {filename}: {e}")

print("\n=== BATCH VERIFICATION TESTING COMPLETED ===")
