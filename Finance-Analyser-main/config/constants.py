from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_NAME = "MyBankLoan AI"
PASSWORD = "Mybankloan.ai@2023"
SUPPORTED_BANKS = ["HDFC Bank"]
PAGE_OPTIONS = [
    "Dashboard",
    "Transactions",
    "ABB Analysis",
    "Loan Assessment",
    "Downloads",
    "Settings",
]

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "output"
PROCESSED_FOLDER = "processed"
LOG_FOLDER = "logs"
REPORTS_FOLDER = "reports"
EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
