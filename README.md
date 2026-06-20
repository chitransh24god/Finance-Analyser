# MyBankLoan AI - Professional Loan Analyzer (V3)

A high-performance Credit Underwriting, Financial Verification, and Loan Assessment dashboard designed for Banks, NBFCs, DSA Teams, and Loan Officers. 

This application parses bank statement PDFs, cleans and standardizes transactions, and computes critical credit risk metrics—including a custom Average Daily Balance (ABB) formula with day-by-day historical missing date rollback logic.

---

## Installation

1. **System Prerequisites**:
   Ensure you have **Python 3.8+** installed on your system.

2. **Clone/Navigate to Project Location**:
   Navigate to:
   ```bash
   cd C:\Users\ThinkPad\Downloads\excel_file_management\ABB_Analyzer
   ```

3. **Install Dependencies**:
   Install all required libraries using pip:
   ```bash
   pip install -r requirements.txt
   ```

---

## Folder Structure

```
ABB_Analyzer/
│
├── app.py                      # Main Streamlit dashboard application
├── requirements.txt            # Project dependencies list
├── README.md                   # System documentation (This file)
├── verify_all.py               # Batch testing script for validating statements
│
├── extractors/                 # Modular Bank Statement Extractors
│   ├── __init__.py             # Autodetects bank and routes to correct parser
│   ├── base_ex.py              # Base extractor class with shared helper functions
│   ├── hdfc_ex.py              # HDFC Bank Extractor (Savings/Current/Corporate)
│   ├── icici_ex.py             # ICICI Bank Extractor
│   ├── sbi_ex.py               # SBI Extractor
│   ├── axis_ex.py              # Axis Bank Extractor
│   ├── idfc_ex.py              # IDFC First Bank Extractor
│   ├── yes_ex.py               # Yes Bank Extractor
│   └── generic_ex.py           # General heuristic-based fallback extractor
│
├── utils/                      # Helper Libraries
│   ├── __init__.py
│   ├── abb_calculator.py       # Custom ABB Formula & Missing Date Logic
│   ├── credit_analyzer.py      # Risk grading and ledger flow analyzer
│   ├── report_generator.py     # Excel formatting & generation engine
│   ├── validator.py            # Data integrity validation rules
│   └── logger.py               # Application logs compiler
│
└── output/                     # Generated reports (created dynamically)
    ├── app.log                 # Auditable execution logs
    ├── cleaned_transactions.xlsx
    ├── monthly_abb_report.xlsx
    ├── abb_report.xlsx
    └── loan_assessment.xlsx
```

---

## How to Run

Launch the Streamlit dashboard on your local dev server:
```bash
streamlit run app.py
```
This will open the application in your default web browser (typically at `http://localhost:8501`).

---

## How ABB Works

### Custom ABB Formula
For every month, balances are captured on:
- **5th** of the month
- **10th** of the month
- **15th** of the month
- **20th** of the month
- **25th** of the month
- **Last Day** of the month

The monthly Average Daily Balance (ABB) is computed as:
$$\text{ABB} = \frac{B_{5} + B_{10} + B_{15} + B_{20} + B_{25} + B_{\text{MonthEnd}}}{6}$$

### Missing Date Rollback Logic
If there is no transaction recorded on a specific target date (e.g., October 15th):
1. The system automatically rolls backward day-by-day (checking October 14th, then October 13th, etc.).
2. The balance of the **most recent transaction** prior to that target date is used.
3. If the target date falls before the statement's first transaction, the estimated opening balance is used.

### Rolling Averages
The system compiles rolling averages across multiple months:
- **1 Month ABB**: Latest month's ABB.
- **3 Month ABB**: Average of the latest 3 monthly ABB values.
- **6 Month ABB**: Average of the latest 6 monthly ABB values.
- *If there is insufficient month history, the metrics display `Data Unavailable`.*

---

## How To Add New Banks

To support a new bank format:
1. Create a new extractor file in the `extractors/` folder, e.g. `extractors/kotak_ex.py`.
2. Inherit from `BaseExtractor` and implement the `parse` method:
   ```python
   from extractors.base_ex import BaseExtractor
   
   class KotakExtractor(BaseExtractor):
       def __init__(self):
           super().__init__("Kotak Bank")
           
       def parse(self, pdf_path, password=None):
           # Extract tables and metadata...
           return metadata_dict, transaction_list
   ```
3. Update the `detect_bank_and_get_extractor` function in `extractors/__init__.py` to import and route to the new extractor ifKotak keywords or signatures are matched in the PDF filename or first-page text.

No changes are required in the core UI (`app.py`), the ABB calculator (`abb_calculator.py`), or the Excel formatter (`report_generator.py`).

---

## Deployment Instructions

### Streamlit Cloud (Compatibility Guaranteed)
1. Push this project folder structure to a private GitHub repository.
2. Log in to [Streamlit Community Cloud](http://share.streamlit.io/).
3. Connect your GitHub repository and specify `app.py` as the entrypoint file.
4. Set the Streamlit theme to **Light** in your app settings (or configure `.streamlit/config.toml` to enforce a light theme).
5. Deploy. The password `Mybankloan.ai@2023` serves as the login gate.

---

## Troubleshooting

- **PDF Password Errors**: If the statement is password-encrypted, you will be prompted to enter the correct password. Verify that your password is correct by opening the PDF in a standard PDF viewer first.
- **Zero Rows Extracted**: If the fallback Generic Extractor returns 0 rows, check that the PDF contains actual text tables rather than scanned images (OCR). Scanned PDFs are not currently supported in Version 1.
- **Negative Balance Errors**: If the statement has a credit limit (like an overdraft or CC account), a negative balance may be normal. However, the system requires a positive daily ledger balance to validate loan safety.
