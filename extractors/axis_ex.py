import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class AxisExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Axis Bank")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"(?:Axis\s*(?:Bank)?\s*)?Account\s*No\s*:?\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*Number\s*:?\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"period\s*\(?\s*From\s*:\s*(\d{2}[-/]\d{2}[-/]\d{4})\s*To\s*:\s*(\d{2}[-/]\d{2}[-/]\d{4})\s*\)?", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        for idx, line in enumerate(lines):
            # Check if line contains Joint Holder
            if "Joint Holder" in line:
                # Name might be before "Joint Holder" on same line or previous line
                parts = re.split(r"Joint\s*Holder", line, flags=re.I)
                cand = parts[0].strip()
                if cand and len(cand) >= 3 and not any(k in cand.lower() for k in ["statement", "report", "account"]):
                    self.metadata["customer_name"] = cand
                    break
                elif idx > 0:
                    prev = lines[idx-1].strip()
                    if prev and len(prev) >= 3 and not any(k in prev.lower() for k in ["statement", "report", "account"]):
                        self.metadata["customer_name"] = prev
                        break
        
        # Fallback Name search if still Not Available
        if self.metadata["customer_name"] == "Not Available":
            for line in lines[:5]:
                if any(k in line.lower() for k in ["account statement", "statement report", "opening balance", "s.no", "joint holder", "customer"]):
                    continue
                if len(line) >= 4 and re.match(r"^[A-Z0-9\s\.\&\,\-\/]+$", line):
                    self.metadata["customer_name"] = line
                    break

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing Axis statement: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        current_tx = None
        
        active_format = None
        col_indices = {}
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if not tables:
                    continue
                
                for table in tables:
                    if not table or not table[0]:
                        continue
                        
                    headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]
                    start_row_idx = 1
                    
                    # 1. Format 1: Tran Date, Particulars, Debit, Credit, Balance
                    if "trandate" in headers and "balance" in headers:
                        active_format = "format1"
                        col_indices = {
                            "date": headers.index("trandate"),
                            "desc": headers.index("particulars") if "particulars" in headers else 2,
                            "deb": headers.index("debit") if "debit" in headers else 3,
                            "cred": headers.index("credit") if "credit" in headers else 4,
                            "bal": headers.index("balance")
                        }
                    # 2. Format 2: S.NO, Transaction Date (dd/mm/yyyy), Particulars, Amount(INR), Debit/Credit, Balance(INR)
                    elif "transactiondate(ddmmyyyy)" in headers and "balance(inr)" in headers:
                        active_format = "format2"
                        col_indices = {
                            "date": headers.index("transactiondate(ddmmyyyy)"),
                            "desc": headers.index("particulars"),
                            "amt": headers.index("amount(inr)"),
                            "dc": headers.index("debitcredit"),
                            "bal": headers.index("balance(inr)")
                        }
                    elif active_format and len(table[0]) >= 5:
                        # Continuation table on subsequent page without header row
                        start_row_idx = 0
                    else:
                        continue
                        
                    if active_format == "format1":
                        date_idx = col_indices["date"]
                        desc_idx = col_indices["desc"]
                        deb_idx = col_indices["deb"]
                        cred_idx = col_indices["cred"]
                        bal_idx = col_indices["bal"]
                        
                        for row in table[start_row_idx:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue
                            
                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                            deb_str = str(row[deb_idx]).strip() if row[deb_idx] is not None else ""
                            cred_str = str(row[cred_idx]).strip() if row[cred_idx] is not None else ""
                            bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                            
                            # Filter out non-transaction summary rows
                            if any(k in desc_str.lower() for k in ["opening balance", "transaction total", "closing balance", "charge breakup"]):
                                continue
                            if any(k in date_str.lower() for k in ["sr. no.", "period", "recover"]):
                                continue
                                
                            parsed_dt = self.parse_date(date_str)
                            if parsed_dt:
                                if current_tx:
                                    transactions.append(current_tx)
                                current_tx = {
                                    "date": parsed_dt,
                                    "narration": desc_str.replace("\n", " ").strip(),
                                    "debit": deb_str,
                                    "credit": cred_str,
                                    "balance": bal_str
                                }
                            else:
                                if current_tx and desc_str:
                                    current_tx["narration"] += " " + desc_str.replace("\n", " ").strip()
                                    current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()
                                    
                    elif active_format == "format2":
                        date_idx = col_indices["date"]
                        desc_idx = col_indices["desc"]
                        amt_idx = col_indices["amt"]
                        dc_idx = col_indices["dc"]
                        bal_idx = col_indices["bal"]
                        
                        for row in table[start_row_idx:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue
                            
                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                            amt_str = str(row[amt_idx]).strip() if row[amt_idx] is not None else ""
                            dc_str = str(row[dc_idx]).strip() if row[dc_idx] is not None else ""
                            bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                            
                            parsed_dt = self.parse_date(date_str)
                            if parsed_dt:
                                if current_tx:
                                    transactions.append(current_tx)
                                
                                is_dr = "dr" in dc_str.lower()
                                is_cr = "cr" in dc_str.lower()
                                deb_val = amt_str if is_dr else ""
                                cred_val = amt_str if is_cr else ""
                                
                                current_tx = {
                                    "date": parsed_dt,
                                    "narration": desc_str.replace("\n", " ").strip(),
                                    "debit": deb_val,
                                    "credit": cred_val,
                                    "balance": bal_str
                                }
                            else:
                                if current_tx and desc_str:
                                    current_tx["narration"] += " " + desc_str.replace("\n", " ").strip()
                                    current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()
                                    
            if current_tx:
                transactions.append(current_tx)
                
        cleaned_txs = []
        for tx in transactions:
            cleaned_txs.append({
                "Date": tx["date"],
                "Particulars": tx["narration"],
                "Debit": self.clean_amount(tx["debit"]),
                "Credit": self.clean_amount(tx["credit"]),
                "Balance": self.clean_amount(tx["balance"])
            })
            
        if cleaned_txs:
            cleaned_txs.sort(key=lambda x: x["Date"])
            if self.metadata["start_date"] == "Not Available":
                self.metadata["start_date"] = cleaned_txs[0]["Date"]
            if self.metadata["end_date"] == "Not Available":
                self.metadata["end_date"] = cleaned_txs[-1]["Date"]
                
        log_info(f"Axis extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs
