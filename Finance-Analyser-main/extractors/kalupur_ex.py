import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class KalupurExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Kalupur Commercial Cooperative Bank")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"Account\s*Number\s*:?\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"(\d{11})", text)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"Period\s*:?\s*(\d{2}-\d{2}-\d{4})\s*[-to]*\s*(\d{2}-\d{2}-\d{4})", text, re.I)
        if not period_match:
            period_match = re.search(r"(\d{2}-\d{2}-\d{4})\s*[-to]+\s*(\d{2}-\d{2}-\d{4})", text)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        for idx, line in enumerate(lines):
            if any(k in line.lower() for k in ["branch sanction limit", "regular saving accounts", "type of account"]):
                # Customer name is on lines preceding account details
                name_parts = []
                for k in range(max(0, idx - 4), idx):
                    cand = lines[k]
                    if any(w in cand.lower() for w in ["account statement", "the kalupur", "phone", "society", "road", "ahmedabad", "fax", "micr"]):
                        continue
                    if len(cand) >= 3 and not re.match(r"^\d+$", cand):
                        name_parts.append(cand)
                if name_parts:
                    raw_name = " ".join(name_parts).strip()
                    raw_name = re.split(r"Branch|Sanction|Account|Drawing|Limit|ROI", raw_name, flags=re.I)[0].strip()
                    self.metadata["customer_name"] = raw_name
                    break

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing Kalupur Bank statement: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            current_tx = None
            for page_idx, page in enumerate(pdf.pages):
                words = page.extract_words()
                if not words:
                    continue
                
                # Group words by vertical alignment
                lines_dict = {}
                for w in words:
                    top = w["top"]
                    found = False
                    for line_top in lines_dict.keys():
                        if abs(line_top - top) < 3.0:
                            lines_dict[line_top].append(w)
                            found = True
                            break
                    if not found:
                        lines_dict[top] = [w]
                
                sorted_line_tops = sorted(lines_dict.keys())
                
                for top in sorted_line_tops:
                    # Filter out header/footer
                    if top < 120:
                        continue
                    if top > 785:
                        continue
                    
                    line_words = sorted(lines_dict[top], key=lambda w: w["x0"])
                    
                    # Columns:
                    # Date: [20, 80], Particulars: [185, 360]
                    # Debit: [360, 440], Credit: [440, 520], Balance: [520, 600]
                    date_words = []
                    narration_words = []
                    deb_words = []
                    cred_words = []
                    bal_words = []
                    
                    for w in line_words:
                        x0 = w["x0"]
                        text = w["text"]
                        
                        if 20 <= x0 < 80:
                            date_words.append(text)
                        elif 180 <= x0 < 360:
                            narration_words.append(text)
                        elif 360 <= x0 < 440:
                            deb_words.append(text)
                        elif 440 <= x0 < 520:
                            cred_words.append(text)
                        elif 520 <= x0 < 600:
                            bal_words.append(text)
                            
                    date_str = " ".join(date_words).strip()
                    narration_str = " ".join(narration_words).strip()
                    deb_str = " ".join(deb_words).strip()
                    cred_str = " ".join(cred_words).strip()
                    bal_str = " ".join(bal_words).strip()
                    
                    # Check if valid date format DD-Mmm-YYYY (e.g. 07-Apr-2025)
                    # We match a date format like DD-Mmm-YYYY or DD-MM-YYYY
                    if date_str and re.match(r"^\d{2}-[A-Za-z]{3}-\d{4}$", date_str):
                        if current_tx:
                            transactions.append(current_tx)
                        
                        current_tx = {
                            "date": date_str,
                            "narration": narration_str,
                            "debit": deb_str,
                            "credit": cred_str,
                            "balance": bal_str
                        }
                    else:
                        if current_tx:
                            if "opening balance" in narration_str.lower():
                                continue
                            if narration_str:
                                if current_tx["narration"]:
                                    current_tx["narration"] += " " + narration_str
                                else:
                                    current_tx["narration"] = narration_str
                            if deb_str and not current_tx["debit"]:
                                current_tx["debit"] = deb_str
                            if cred_str and not current_tx["credit"]:
                                current_tx["credit"] = cred_str
                            if bal_str and not current_tx["balance"]:
                                current_tx["balance"] = bal_str
                                
            if current_tx:
                transactions.append(current_tx)
                
        cleaned_txs = []
        for tx in transactions:
            parsed_date = self.parse_date(tx["date"])
            if not parsed_date:
                continue
                
            cleaned_txs.append({
                "Date": parsed_date,
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
                
        log_info(f"Kalupur extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs
