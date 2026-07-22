import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class YesExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Yes Bank")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"ACCOUNT\s*NO\s*:?\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"STATEMENT\s*PERIOD\s*:?\s*(\d{2}-\d{2}-\d{4})\s*to\s*(\d{2}-\d{2}-\d{4})", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        name_match = re.search(r"ACCOUNT\s*NAME\s*:?\s*(.+?)(?:\s*STATEMENT|\s*BRANCH|\n|$)", text, re.I)
        if name_match:
            self.metadata["customer_name"] = name_match.group(1).strip()

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing Yes Bank statement: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        current_tx = None
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if not tables:
                    continue
                
                for table in tables:
                    headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]
                    
                    if "transactiondate" in headers and "runningbalance" in headers:
                        date_idx = headers.index("transactiondate")
                        desc_idx = headers.index("transactiondescription") if "transactiondescription" in headers else 2
                        deb_idx = headers.index("debitamount") if "debitamount" in headers else 4
                        cred_idx = headers.index("creditamount") if "creditamount" in headers else 5
                        bal_idx = headers.index("runningbalance")
                        
                        for row in table[1:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue
                            
                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                            deb_str = str(row[deb_idx]).strip() if row[deb_idx] is not None else ""
                            cred_str = str(row[cred_idx]).strip() if row[cred_idx] is not None else ""
                            bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                            
                            # Clean date (Yes bank sometimes includes time)
                            clean_date = ""
                            if date_str:
                                date_parts = date_str.split("\n")[0].split()
                                if date_parts:
                                    clean_date = date_parts[0].strip()
                                    
                            parsed_dt = self.parse_date(clean_date)
                            
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
                                if "opening balance" in desc_str.lower():
                                    continue
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
                
        log_info(f"Yes Bank extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs
