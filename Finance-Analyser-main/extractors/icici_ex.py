import os
import re
import pdfplumber
import pypdf
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class IciciExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("ICICI Bank")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"A/C\s*No\s*:?\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*no\.\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*No(?:v|\.|\s|umber)?\s*:?\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"Period\s*:?\s*From\s*(\d{2}/\d{2}/\d{4})\s*To\s*(\d{2}/\d{2}/\d{4})", text, re.I)
        if not period_match:
            period_match = re.search(r"From\s*(\d{2}/\d{2}/\d{4})\s*To\s*(\d{2}/\d{2}/\d{4})", text, re.I)
        if not period_match:
            period_match = re.search(r"period\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})\s*-\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        name_match = re.search(r"Name\s*:\s*([A-Za-z0-9\s\-\&\.\/]+?)(?:\s*Branch:|\n|$)", text, re.I)
        if name_match:
            self.metadata["customer_name"] = name_match.group(1).strip()
        else:
            # Check lines around "Statement of Transactions in"
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            for idx, line in enumerate(lines):
                if "Statement of Transactions in" in line:
                    if idx + 1 < len(lines):
                        cand = lines[idx+1].split("Your Base Branch")[0].strip()
                        if cand and len(cand) >= 3 and not any(k in cand.lower() for k in ["statement", "account", "transaction"]):
                            self.metadata["customer_name"] = cand
                            break

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing ICICI statement: {os.path.basename(pdf_path)}")
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        
        # Try table parsing first
        with pdfplumber.open(pdf_path, password=password) as pdf:
            current_tx = None
            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if not tables:
                    continue
                
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]
                    
                    if "transactiondate" in headers and "balance" in headers:
                        date_idx = headers.index("transactiondate")
                        desc_idx = headers.index("transactionremarks") if "transactionremarks" in headers else 6
                        deb_idx = -1
                        cred_idx = -1
                        
                        for i, h in enumerate(headers):
                            if "withdrawal" in h or "dr" in h:
                                deb_idx = i
                                break
                        for i, h in enumerate(headers):
                            if "deposit" in h or "cr" in h:
                                cred_idx = i
                                break
                        if deb_idx == -1: deb_idx = 7
                        if cred_idx == -1: cred_idx = 8
                        bal_idx = headers.index("balance")
                        
                        for row in table[1:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue
                            
                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                            deb_str = str(row[deb_idx]).strip() if row[deb_idx] is not None else ""
                            cred_str = str(row[cred_idx]).strip() if row[cred_idx] is not None else ""
                            bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                            
                            clean_date = date_str.split("\n")[0].strip()
                            parsed_dt = self.parse_date(clean_date)
                            
                            if parsed_dt:
                                if current_tx:
                                    transactions.append(current_tx)
                                current_tx = {
                                    "Date": parsed_dt,
                                    "Particulars": desc_str.replace("\n", " ").strip(),
                                    "Debit": deb_str,
                                    "Credit": cred_str,
                                    "Balance": bal_str
                                }
                            else:
                                if current_tx and desc_str:
                                    current_tx["Particulars"] += " " + desc_str.replace("\n", " ").strip()
                                    current_tx["Particulars"] = re.sub(r"\s+", " ", current_tx["Particulars"]).strip()
                                    
                    elif "transactionremarks" in headers and "balance(inr)" in headers:
                        date_idx = headers.index("transactiondate")
                        desc_idx = headers.index("transactionremarks")
                        deb_idx = headers.index("withdrawalamount(inr)") if "withdrawalamount(inr)" in headers else 4
                        cred_idx = headers.index("depositamount(inr)") if "depositamount(inr)" in headers else 5
                        bal_idx = headers.index("balance(inr)")
                        
                        for row in table[1:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue
                            
                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                            deb_str = str(row[deb_idx]).strip() if row[deb_idx] is not None else ""
                            cred_str = str(row[cred_idx]).strip() if row[cred_idx] is not None else ""
                            bal_str = str(row[bal_idx]).strip() if row[bal_idx] is not None else ""
                            
                            parsed_dt = self.parse_date(date_str)
                            if parsed_dt:
                                if current_tx:
                                    transactions.append(current_tx)
                                current_tx = {
                                    "Date": parsed_dt,
                                    "Particulars": desc_str.replace("\n", " ").strip(),
                                    "Debit": deb_str,
                                    "Credit": cred_str,
                                    "Balance": bal_str
                                }
                            else:
                                if current_tx and desc_str:
                                    current_tx["Particulars"] += " " + desc_str.replace("\n", " ").strip()
                                    current_tx["Particulars"] = re.sub(r"\s+", " ", current_tx["Particulars"]).strip()
            
            if current_tx:
                transactions.append(current_tx)
                current_tx = None

        # Fallback to line-by-line parsing if table extraction got 0 rows
        if len(transactions) == 0:
            log_info("Table parsing extracted 0 rows. Falling back to line-by-line text parsing...")
            transactions = self._parse_line_by_line(pdf_path, password)
            
        cleaned_txs = []
        for tx in transactions:
            cleaned_txs.append({
                "Date": tx["Date"],
                "Particulars": tx["Particulars"],
                "Debit": self.clean_amount(tx["Debit"]),
                "Credit": self.clean_amount(tx["Credit"]),
                "Balance": self.clean_amount(tx["Balance"])
            })
            
        if cleaned_txs:
            cleaned_txs.sort(key=lambda x: x["Date"])
            if self.metadata["start_date"] == "Not Available":
                self.metadata["start_date"] = cleaned_txs[0]["Date"]
            if self.metadata["end_date"] == "Not Available":
                self.metadata["end_date"] = cleaned_txs[-1]["Date"]
                
        log_info(f"ICICI extraction complete. Rows: {len(cleaned_txs)}")
        return self.metadata, cleaned_txs

    def _parse_line_by_line(self, pdf_path: str, password: str = None) -> list[dict]:
        transactions = []
        current_tx = None
        
        row_re = re.compile(r"^\s*(\d+)\s+(\d{2}\.\d{2}\.\d{4})\s+(.*)$")
        num_re = re.compile(r"^\d+(\.\d+)?$")
        
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    m = row_re.match(line)
                    if m:
                        if current_tx:
                            transactions.append(current_tx)
                        sno = m.group(1)
                        date_str = m.group(2)
                        rest = m.group(3).strip()
                        parsed_dt = self.parse_date(date_str)
                        
                        parts = rest.split()
                        bal = ""
                        amt = ""
                        desc = rest
                        if len(parts) >= 2:
                            cand_b = parts[-1].replace(",", "")
                            cand_a = parts[-2].replace(",", "")
                            if num_re.match(cand_b) and num_re.match(cand_a):
                                bal = cand_b
                                amt = cand_a
                                desc = " ".join(parts[:-2])
                            elif num_re.match(cand_b):
                                bal = cand_b
                                desc = " ".join(parts[:-1])
                                
                        current_tx = {
                            "Date": parsed_dt,
                            "Particulars": desc,
                            "Debit": amt,
                            "Credit": "",
                            "Balance": bal
                        }
                    else:
                        if current_tx:
                            # Skip headers/footers
                            if any(k in line for k in ["Statement of Transactions", "Saving Account no.", "DESAI ALOK", "Transaction Remarks", "S No.", "Legends for transactions"]):
                                continue
                            current_tx["Particulars"] += " " + line
                            current_tx["Particulars"] = re.sub(r"\s+", " ", current_tx["Particulars"]).strip()
                            
            if current_tx:
                transactions.append(current_tx)
                
        # Reconstruct Debit vs Credit from Balance changes if amounts only
        if len(transactions) >= 2:
            transactions.sort(key=lambda x: x["Date"])
            for i in range(len(transactions)):
                tx = transactions[i]
                bal_curr = self.clean_amount(tx["Balance"])
                amt_val = self.clean_amount(tx["Debit"])
                
                if i > 0:
                    bal_prev = self.clean_amount(transactions[i-1]["Balance"])
                    delta = bal_curr - bal_prev
                    if delta > 0:
                        tx["Credit"] = str(delta)
                        tx["Debit"] = ""
                    else:
                        tx["Debit"] = str(abs(delta))
                        tx["Credit"] = ""
                else:
                    tx["Debit"] = str(amt_val)
                    tx["Credit"] = ""
                        
        return transactions
