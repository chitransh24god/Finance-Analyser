import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class HdfcExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("HDFC Bank")

    def extract_metadata(self, text: str):
        """
        Parses customer details from HDFC text.
        """
        # 1. Account Number
        acc_match = re.search(r"Account\s*No\s*:\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*Number\s*:\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # 2. Date Range
        period_match = re.search(r"From\s*:\s*(\d{2}/\d{2}/\d{4})\s*To\s*:\s*(\d{2}/\d{2}/\d{4})", text, re.I)
        if not period_match:
            period_match = re.search(r"From\s*:\s*(\d{2}/\d{2}/\d{2})\s*To\s*:\s*(\d{2}/\d{2}/\d{2})", text, re.I)
        if not period_match:
            period_match = re.search(r"Period\s*:\s*(\d{2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{2}-[A-Za-z]{3}-\d{4})", text, re.I)
            
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # 3. Customer Name
        # Savings format: Name is usually near "MR CHITRANSHSHARMA"
        name_match = re.search(r"(?:MR|MRS|MS|M/S)\s+([A-Z\s]{4,30})", text)
        if name_match:
            self.metadata["customer_name"] = name_match.group(0).strip()
        else:
            # Corporate format: Name is usually line before "ADDRESS"
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for idx, line in enumerate(lines):
                if "ADDRESS" in line:
                    # Previous non-empty line could be name
                    if idx > 0:
                        self.metadata["customer_name"] = lines[idx-1]
                        break

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing HDFC statement: {os.path.basename(pdf_path)}")
        
        # Extract metadata from text
        text_p1 = self.extract_text_pypdf(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            # Detect layout format by looking at columns of first page table
            is_savings_layout = False
            first_page = pdf.pages[0]
            tables = first_page.extract_tables()
            
            if tables:
                headers = [str(col).lower().replace("\n", "").replace(" ", "") for col in tables[0][0] if col is not None]
                if "date" in headers and "closingbalance" in headers and "withdrawalamt." in headers:
                    is_savings_layout = True
                    log_info("Detected HDFC Savings Account layout (coordinate-based parsing required)")
            
            if is_savings_layout:
                transactions = self._parse_savings_coordinates(pdf)
            else:
                log_info("Detected HDFC Corporate/Current Account layout (table-based parsing)")
                transactions = self._parse_corporate_table(pdf)
                
        # Post-process list to ensure correct types and standard formats
        cleaned_txs = []
        for tx in transactions:
            parsed_date = self.parse_date(tx["date"])
            if not parsed_date:
                continue # Skip invalid date rows
                
            cleaned_txs.append({
                "Date": parsed_date,
                "Particulars": tx["narration"],
                "Debit": self.clean_amount(tx["debit"]),
                "Credit": self.clean_amount(tx["credit"]),
                "Balance": self.clean_amount(tx["balance"])
            })
            
        # Update metadata start/end date from transaction dates if not found
        if cleaned_txs:
            # Ensure chronological sorting
            cleaned_txs.sort(key=lambda x: x["Date"])
            if self.metadata["start_date"] == "Not Available":
                self.metadata["start_date"] = cleaned_txs[0]["Date"]
            if self.metadata["end_date"] == "Not Available":
                self.metadata["end_date"] = cleaned_txs[-1]["Date"]
                
        log_info(f"HDFC extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs

    def _parse_savings_coordinates(self, pdf) -> list[dict]:
        """
        Coordinates-based extraction for Savings format (multi-line squashed rows).
        """
        transactions = []
        
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
            current_tx = None
            
            for top in sorted_line_tops:
                # Filter out header/footer
                if top < 220:
                    continue
                if top > 780:
                    continue
                
                line_words = sorted(lines_dict[top], key=lambda w: w["x0"])
                
                # Column bounds:
                # Date: [30, 65], Narration: [65, 270], Ref: [270, 355]
                # ValDate: [355, 395], Withdrawal: [395, 480], Deposit: [480, 560], Balance: [560, 630]
                date_words = []
                narration_words = []
                ref_words = []
                val_words = []
                with_words = []
                dep_words = []
                bal_words = []
                
                for w in line_words:
                    x0 = w["x0"]
                    text = w["text"]
                    
                    if 30 <= x0 < 65:
                        date_words.append(text)
                    elif 65 <= x0 < 270:
                        narration_words.append(text)
                    elif 270 <= x0 < 355:
                        ref_words.append(text)
                    elif 355 <= x0 < 395:
                        val_words.append(text)
                    elif 395 <= x0 < 480:
                        with_words.append(text)
                    elif 480 <= x0 < 560:
                        dep_words.append(text)
                    elif 560 <= x0 < 630:
                        bal_words.append(text)
                
                date_str = " ".join(date_words).strip()
                narration_str = " ".join(narration_words).strip()
                ref_str = " ".join(ref_words).strip()
                val_str = " ".join(val_words).strip()
                with_str = " ".join(with_words).strip()
                dep_str = " ".join(dep_words).strip()
                bal_str = " ".join(bal_words).strip()
                
                # If valid date format DD/MM/YY
                if date_str and re.match(r"^\d{2}/\d{2}/\d{2}$", date_str):
                    if current_tx:
                        transactions.append(current_tx)
                    
                    current_tx = {
                        "date": date_str,
                        "narration": narration_str,
                        "ref": ref_str,
                        "val_date": val_str,
                        "debit": with_str,
                        "credit": dep_str,
                        "balance": bal_str
                    }
                else:
                    # Continuation of narration
                    if current_tx and narration_str:
                        # Append space if narration already has content
                        if current_tx["narration"]:
                            current_tx["narration"] += " " + narration_str
                        else:
                            current_tx["narration"] = narration_str
                            
            if current_tx:
                transactions.append(current_tx)
                
        return transactions

    def _parse_corporate_table(self, pdf) -> list[dict]:
        """
        Parses Corporate layout which has well-defined table rows.
        """
        transactions = []
        current_tx = None
        
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue
            
            for table in tables:
                headers = [str(col).lower().replace("\n", "").replace(" ", "") for col in table[0] if col is not None]
                # Check for corporate headers
                if "transactiondate" in headers and "closingbalance" in headers:
                    date_idx = headers.index("transactiondate")
                    desc_idx = headers.index("transactiondescription") if "transactiondescription" in headers else 1
                    ref_idx = headers.index("referenceno.") if "referenceno." in headers else 2
                    val_idx = headers.index("valuedate") if "valuedate" in headers else 3
                    deb_idx = headers.index("debitamount") if "debitamount" in headers else 4
                    cred_idx = headers.index("creditamount") if "creditamount" in headers else 5
                    bal_idx = headers.index("closingbalance")
                    
                    for row in table[1:]:
                        if not row or len(row) <= max(date_idx, bal_idx):
                            continue
                        
                        date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                        desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                        ref_str = str(row[ref_idx]).strip() if row[ref_idx] is not None else ""
                        val_str = str(row[val_idx]).strip() if row[val_idx] is not None else ""
                        deb_str = str(row[deb_idx]).strip() if row[deb_idx] is not None else ""
                        cred_str = str(row[cred_idx]).strip() if row[cred_idx] is not None else ""
                        bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                        
                        # Sometimes transaction dates contain time, e.g. "27-Feb-2026\n16:57:33"
                        # Clean to only have date part
                        clean_date = date_str.split("\n")[0].strip()
                        
                        # Check if it has a valid date structure (starts with DD-Mmm-YYYY)
                        # e.g., "27-Feb-2026"
                        is_valid_date = False
                        if clean_date:
                            # Matches DD-Mmm-YYYY
                            if re.match(r"^\d{2}-[A-Za-z]{3}-\d{4}$", clean_date):
                                is_valid_date = True
                        
                        if is_valid_date:
                            if current_tx:
                                transactions.append(current_tx)
                            
                            # Standardize desc by cleaning up newlines
                            desc_clean = desc_str.replace("\n", " ").strip()
                            
                            current_tx = {
                                "date": clean_date,
                                "narration": desc_clean,
                                "ref": ref_str.replace("\n", " ").strip(),
                                "val_date": val_str.strip(),
                                "debit": deb_str.strip(),
                                "credit": cred_str.strip(),
                                "balance": bal_str.strip()
                            }
                        else:
                            # Continuation of narration or noise row
                            # If we have a current transaction, append details
                            if current_tx:
                                if desc_str:
                                    current_tx["narration"] += " " + desc_str.replace("\n", " ").strip()
                                if ref_str:
                                    current_tx["ref"] += " " + ref_str.replace("\n", " ").strip()
                                # Clean double spaces
                                current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()
                                current_tx["ref"] = re.sub(r"\s+", " ", current_tx["ref"]).strip()
                                
            if current_tx:
                transactions.append(current_tx)
                current_tx = None
                
        return transactions
