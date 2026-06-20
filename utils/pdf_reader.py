import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber
import pandas as pd
from dateutil.parser import parse as parse_date

TRANSACTION_DATE_PATTERN = re.compile(r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b")
AMOUNT_PATTERN = re.compile(r"[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?")
HEADER_PATTERNS = [
    "statement of account",
    "account no",
    "a/c no",
    "page",
    "statement period",
    "closing balance",
    "opening balance",
    "page no",
    "ifsc",
    "branch",
]


def open_pdf(file_path: Path, password: Optional[str] = None) -> pdfplumber.PDF:
    try:
        return pdfplumber.open(str(file_path), password=password)
    except Exception as exc:
        message = str(exc).lower()
        if "password" in message or "encrypted" in message:
            raise ValueError("Incorrect PDF password or the file is password protected.")
        raise RuntimeError(f"Unable to open PDF: {exc}")


def normalize_amount(value: str) -> Optional[float]:
    if value is None:
        return None
    raw = str(value).strip().replace(",", "").replace("(", "-").replace(")", "")
    if raw in {"", "-", "+", "na", "n/a"}:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_flexible_date(value: str) -> Optional[date]:
    candidate = value.strip().replace(".", "/")
    for fmt in ["%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d-%m-%y", "%d %b %Y", "%d %B %Y", "%d %b %y", "%d %B %y"]:
        try:
            parsed = datetime.strptime(candidate, fmt).date()
            if parsed.year < 2020:
                continue
            if parsed.year > datetime.now().year + 1:
                continue
            return parsed
        except Exception:
            continue
    try:
        parsed = parse_date(candidate, dayfirst=True, fuzzy=False).date()
        if parsed.year < 2020 or parsed.year > datetime.now().year + 1:
            return None
        return parsed
    except Exception:
        return None


def extract_customer_name(text: str) -> str:
    patterns = [
        r"(?:Account Holder|Account Name|Customer Name|Name)[:\s]+([A-Z][A-Za-z &]{2,80})",
        r"([A-Z][A-Za-z ]{3,80})\n?\n?\s*Account Number",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return "Not Available"


def extract_account_number(text: str) -> str:
    match = re.search(r"(?:Account No(?:\.|umber)?|A/c No|Acct No)[:\s]*([0-9]{4,20})", text, re.IGNORECASE)
    return match.group(1).strip() if match else "Not Available"


def extract_statement_period(text: str) -> Tuple[Optional[date], Optional[date]]:
    match = re.search(r"(?:statement period|period)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})", text, re.IGNORECASE)
    if match:
        start = parse_flexible_date(match.group(1))
        end = parse_flexible_date(match.group(2))
        return start, end
    match = re.search(r"from[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})", text, re.IGNORECASE)
    if match:
        return parse_flexible_date(match.group(1)), parse_flexible_date(match.group(2))
    return None, None


def is_header_line(line: str) -> bool:
    normalized = line.strip().lower()
    if any(pattern in normalized for pattern in HEADER_PATTERNS):
        return True
    if len(normalized) < 3:
        return True
    if normalized.isdigit():
        return True
    return False


def find_transaction_date(line: str) -> Optional[tuple[date, int, int]]:
    for match in TRANSACTION_DATE_PATTERN.finditer(line):
        parsed = parse_flexible_date(match.group(1))
        if parsed:
            return parsed, match.start(1), match.end(1)
    return None


def parse_transaction_line(line: str) -> Optional[Dict[str, Any]]:
    date_match = find_transaction_date(line)
    if not date_match:
        return None
    transaction_date, start, end = date_match
    remainder = line[end:].strip()
    amounts = AMOUNT_PATTERN.findall(remainder)
    values = [normalize_amount(amount) for amount in amounts]
    values = [v for v in values if v is not None]
    if not values:
        return None

    debit = None
    credit = None
    balance = None
    if len(values) >= 3:
        debit, credit, balance = values[-3], values[-2], values[-1]
        if debit == 0:
            debit = None
        if credit == 0:
            credit = None
    elif len(values) == 2:
        balance = values[-1]
        first_value = values[0]
        flags = remainder.lower()
        if " cr" in flags or "credit" in flags:
            credit = first_value
        elif " dr" in flags or "debit" in flags:
            debit = first_value
        else:
            debit = abs(first_value)
    else:
        balance = values[0]

    particulars = remainder
    if amounts:
        first_amount = amounts[0]
        idx = remainder.find(first_amount)
        if idx != -1:
            particulars = remainder[:idx].strip()
    particulars = re.sub(r"\s+", " ", particulars).strip()
    if particulars == "":
        particulars = "Not Available"

    return {
        "Date": transaction_date,
        "Particulars": particulars,
        "Debit": debit,
        "Credit": credit,
        "Balance": balance,
    }


def extract_hdfc_transactions(file_path: Path, password: Optional[str] = None) -> Tuple[pd.DataFrame, dict]:
    with open_pdf(file_path, password=password) as pdf:
        pages = list(pdf.pages)
        text = "\n".join(page.extract_text() or "" for page in pages)
        customer_name = extract_customer_name(text)
        account_number = extract_account_number(text)
        start_date, end_date = extract_statement_period(text)

        lines: List[str] = []
        for page in pages:
            page_lines = [line.strip() for line in (page.extract_text() or "").splitlines() if line.strip()]
            filtered = [line for line in page_lines if not is_header_line(line)]
            current = ""
            for line in filtered:
                if find_transaction_date(line) and (len(line) < 120 or line[0].isdigit()):
                    if current:
                        lines.append(current)
                    current = line
                else:
                    if current:
                        current = f"{current} {line}"
            if current:
                lines.append(current)
                current = ""

        for page in pages:
            for table in (page.extract_tables() or []):
                for row in table:
                    if not row:
                        continue
                    joined = " ".join(str(cell).strip() for cell in row if cell and str(cell).strip())
                    if joined and find_transaction_date(joined):
                        lines.append(joined)

        rows: List[Dict[str, Any]] = []
        for line in lines:
            parsed = parse_transaction_line(line)
            if parsed is not None:
                rows.append(parsed)

        df = pd.DataFrame(rows)
        if not df.empty:
            df["Date"] = pd.to_datetime(df["Date"])
            for column in ["Debit", "Credit", "Balance"]:
                if column in df.columns:
                    df[column] = pd.to_numeric(df[column], errors="coerce")
            df = df.dropna(subset=["Date", "Balance"]).reset_index(drop=True)

        metadata = {
            "customer_name": customer_name or "Not Available",
            "account_number": account_number or "Not Available",
            "statement_start_date": start_date,
            "statement_end_date": end_date,
            "statement_period_days": (end_date - start_date).days + 1 if start_date and end_date else None,
            "bank_name": "HDFC Bank",
        }

        return df[["Date", "Particulars", "Debit", "Credit", "Balance"]] if not df.empty else pd.DataFrame(columns=["Date", "Particulars", "Debit", "Credit", "Balance"]), metadata
