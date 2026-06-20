import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class GenericExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Unrecognized Bank")

    def extract_metadata(self, text: str):
        # Fallback account number search
        acc_match = re.search(r"Account\s*No(?:v|\.|\s|umber)?\s*:\s*(\w+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()
            
        # Fallback name search
        name_patterns = [
            r"Name\s*:\s*([A-Z\s]{4,30})",
            r"Customer\s*Name\s*:\s*([A-Z\s]{4,30})"
        ]
        for pat in name_patterns:
            m = re.search(pat, text, re.I)
            if m:
                self.metadata["customer_name"] = m.group(1).strip()
                break

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Using Generic Extractor for: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pypdf(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        current_tx = None
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if not tables:
                    continue
                
                for table in tables:
                    # Heuristically detect columns
                    # We look for a column containing dates, one containing balance, and some containing debit/credit
                    if not table or len(table[0]) < 3:
                        continue
                        
                    headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]
                    
                    # Look for date column index
                    date_idx = -1
                    for idx, h in enumerate(headers):
                        if any(k in h for k in ["date", "txn", "tran", "val"]):
                            date_idx = idx
                            break
                            
                    # Look for balance column index
                    bal_idx = -1
                    for idx, h in enumerate(headers):
                        if "balance" in h or "bal" in h:
                            bal_idx = idx
                            break
                            
                    if date_idx == -1 or bal_idx == -1:
                        # Skip this table as it doesn't look like a transaction table
                        continue
                        
                    # Find debit/credit or amount columns
                    deb_idx = -1
                    cred_idx = -1
                    amt_idx = -1
                    
                    for idx, h in enumerate(headers):
                        if idx == date_idx or idx == bal_idx:
                            continue
                        if "debit" in h or "withdrawal" in h or "dr" in h:
                            deb_idx = idx
                        elif "credit" in h or "deposit" in h or "cr" in h:
                            cred_idx = idx
                        elif "amount" in h or "amt" in h:
                            amt_idx = idx
                            
                    # Narration column
                    desc_idx = -1
                    for idx, h in enumerate(headers):
                        if idx in [date_idx, bal_idx, deb_idx, cred_idx, amt_idx]:
                            continue
                        if any(k in h for k in ["particulars", "description", "narration", "remarks"]):
                            desc_idx = idx
                            break
                    if desc_idx == -1:
                        # Fallback narration is the first column that isn't date, balance or amount
                        for idx in range(len(headers)):
                            if idx not in [date_idx, bal_idx, deb_idx, cred_idx, amt_idx]:
                                desc_idx = idx
                                break
                                
                    if desc_idx == -1:
                        continue
                        
                    for row in table[1:]:
                        if not row or len(row) <= max(date_idx, bal_idx, desc_idx):
                            continue
                            
                        date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                        desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                        bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                        
                        deb_str = ""
                        cred_str = ""
                        
                        if deb_idx != -1 and deb_idx < len(row) and row[deb_idx] is not None:
                            deb_str = str(row[deb_idx]).strip()
                        if cred_idx != -1 and cred_idx < len(row) and row[cred_idx] is not None:
                            cred_str = str(row[cred_idx]).strip()
                        if amt_idx != -1 and amt_idx < len(row) and row[amt_idx] is not None:
                            amt_str = str(row[amt_idx]).strip()
                            # If we only have amount column, try to classify it by sign or let clean_amount handle it
                            if deb_str == "" and cred_str == "":
                                deb_str = amt_str # Default to debit/credit based on sign later
                                
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
                
        log_info(f"Generic extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs
