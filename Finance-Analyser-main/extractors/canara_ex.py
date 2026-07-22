import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class CanaraExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Canara Bank")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"Statement\s*for\s*A/c\s*(\w+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"A/c\s*(\w+)\s*for", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*No(?:v|\.|\s|umber)?\s*:?\s*(\w+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"period\s*(\d{2}-[-A-Za-z0-9]+)\s*to\s*(\d{2}-[-A-Za-z0-9]+)", text, re.I)
        if not period_match:
            period_match = re.search(r"(\d{2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{2}-[A-Za-z]{3}-\d{4})", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        name_match = re.search(r"(?:^|\n)(?!Branch\s*Name)Name\s*:?\s*([A-Za-z0-9\s\-\&]+?)(?:\s*Phone|\s*Product|\s*Branch|\n|$)", text, re.I)
        if not name_match:
            name_match = re.search(r"(?:^|\n)Name\s+([A-Za-z\s]{4,30})", text)
        if name_match:
            cand = name_match.group(1).strip()
            if cand and len(cand) >= 3 and not any(k in cand.lower() for k in ["statement", "account", "product", "branch", "gidc"]):
                self.metadata["customer_name"] = cand
        if self.metadata["customer_name"] == "Not Available" or "GIDC" in self.metadata["customer_name"]:
            name_m2 = re.search(r"(?:^|\n)Name\s+([A-Za-z\s]{4,30})", text)
            if name_m2:
                self.metadata["customer_name"] = name_m2.group(1).strip()

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing Canara statement: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            current_tx = None
            for page_idx, page in enumerate(pdf.pages):
                words = page.extract_words()
                if not words:
                    continue
                
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
                    if top < 110 or top > 760:
                        continue
                    
                    line_words = sorted(lines_dict[top], key=lambda w: w["x0"])
                    
                    date_words = []
                    narration_words = []
                    dep_words = []
                    with_words = []
                    bal_words = []
                    
                    for w in line_words:
                        x0 = w["x0"]
                        text = w["text"]
                        
                        if 20 <= x0 < 100:
                            date_words.append(text)
                        elif 100 <= x0 < 310:
                            narration_words.append(text)
                        elif 310 <= x0 < 400:
                            dep_words.append(text)
                        elif 400 <= x0 < 510:
                            with_words.append(text)
                        elif 510 <= x0 < 620:
                            bal_words.append(text)
                            
                    date_str = " ".join(date_words).strip()
                    narration_str = " ".join(narration_words).strip()
                    dep_str = " ".join(dep_words).strip()
                    with_str = " ".join(with_words).strip()
                    bal_str = " ".join(bal_words).strip()
                    
                    # Match dates like 03-04-2025 or 03-Apr-2025
                    is_valid_dt = bool(re.match(r"^\d{2}[-/]\d{2}[-/]\d{4}$", date_str) or re.match(r"^\d{2}-[A-Za-z]{3}-\d{4}$", date_str))
                    
                    if date_str and is_valid_dt:
                        if current_tx:
                            transactions.append(current_tx)
                        
                        current_tx = {
                            "date": date_str,
                            "narration": narration_str,
                            "debit": with_str,
                            "credit": dep_str,
                            "balance": bal_str
                        }
                    else:
                        if current_tx:
                            if "opening balance" in narration_str.lower() or "particulars" in narration_str.lower():
                                continue
                            if narration_str:
                                if current_tx["narration"]:
                                    current_tx["narration"] += " " + narration_str
                                else:
                                    current_tx["narration"] = narration_str
                            if dep_str and not current_tx["credit"]:
                                current_tx["credit"] = dep_str
                            if with_str and not current_tx["debit"]:
                                current_tx["debit"] = with_str
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
                
        log_info(f"Canara extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs
