import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class SbiExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("State Bank of India")

    def extract_metadata(self, text: str):
        # Account Number
        acc_match = re.search(r"Account\s*Number\s*:\s*(\d+)", text, re.I)
        if not acc_match:
            acc_match = re.search(r"Account\s*No(?:v|\.|\s|umber)?\s*:\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        # Date range
        period_match = re.search(r"(?:Account\s*)?Statement\s*from\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{2}[-/.]\d{2}[-/.]\d{2,4})\s*to\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{2}[-/.]\d{2}[-/.]\d{2,4})", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        # Customer Name
        name_match = re.search(r"Account\s*Name\s*:\s*(.+?)(?:\n|$)", text, re.I)
        if name_match:
            name_val = name_match.group(1).strip()
            name_val = re.sub(r"\s+Address.*", "", name_val, flags=re.I).strip()
            self.metadata["customer_name"] = name_val

    def parse(self, file_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing SBI statement: {os.path.basename(file_path)}")
        ext = os.path.splitext(file_path)[1].lower()

        if ext in [".csv", ".xls", ".xlsx"]:
            return self._parse_spreadsheet(file_path)
        else:
            return self._parse_pdf(file_path, password)

    def _parse_pdf(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        text_p1 = self.extract_text_pypdf(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        current_tx = None
        
        try:
            with pdfplumber.open(pdf_path, password=password) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    if not tables:
                        continue
                    
                    for table in tables:
                        if not table or not table[0]:
                            continue

                        headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]
                        
                        if "txndate" in headers and "balance" in headers:
                            date_idx = headers.index("txndate")
                            desc_idx = headers.index("description") if "description" in headers else (headers.index("particulars") if "particulars" in headers else 2)
                            ref_idx = -1
                            for h_kw in ["refnochequeno", "refnochequeno", "refno", "chequeno"]:
                                if h_kw in headers:
                                    ref_idx = headers.index(h_kw)
                                    break

                            deb_idx = headers.index("debit") if "debit" in headers else 5
                            cred_idx = headers.index("credit") if "credit" in headers else 6
                            bal_idx = headers.index("balance")
                            
                            for row in table[1:]:
                                if not row or len(row) <= max(date_idx, bal_idx):
                                    continue
                                
                                date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                                desc_str = str(row[desc_idx]).strip() if row[desc_idx] is not None else ""
                                ref_str = str(row[ref_idx]).strip() if (ref_idx != -1 and ref_idx < len(row) and row[ref_idx] is not None) else ""
                                deb_str = str(row[deb_idx]).strip() if (deb_idx < len(row) and row[deb_idx] is not None) else ""
                                cred_str = str(row[cred_idx]).strip() if (cred_idx < len(row) and row[cred_idx] is not None) else ""
                                bal_str = str(row[bal_idx]).strip() if (bal_idx < len(row) and row[bal_idx] is not None) else ""
                                
                                clean_date = date_str.replace("\n", " ").strip()
                                parsed_dt = self.parse_date(clean_date)
                                
                                full_desc = desc_str.replace("\n", " ").strip()
                                if ref_str and ref_str != "nan":
                                    full_desc += " Ref: " + ref_str.replace("\n", " ").strip()
                                
                                if parsed_dt:
                                    if current_tx:
                                        transactions.append(current_tx)
                                    current_tx = {
                                        "date": parsed_dt,
                                        "narration": full_desc,
                                        "debit": deb_str,
                                        "credit": cred_str,
                                        "balance": bal_str
                                    }
                                else:
                                    if current_tx and desc_str:
                                        current_tx["narration"] += " " + full_desc
                                        current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()
        except Exception as e:
            log_warning(f"SBI PDF plumber table parse error, using text fallback: {e}")

        if current_tx:
            transactions.append(current_tx)

        # Fallback text parsing if pdfplumber returned no table transactions
        if not transactions and text_p1:
            transactions = self._parse_text_fallback(text_p1)
                
        cleaned_txs = self._finalize_transactions(transactions)
        return self.metadata, cleaned_txs

    def _parse_spreadsheet(self, file_path: str) -> tuple[dict, list[dict]]:
        rows = self.read_spreadsheet_rows(file_path)
        full_text = "\n".join([" ".join(row) for row in rows])
        self.extract_metadata(full_text)

        transactions = []
        current_tx = None
        
        # Locate header row dynamically
        header_row_idx = -1
        col_map = {}

        for idx, row in enumerate(rows):
            row_str_clean = [str(c).lower().replace(" ", "").replace("\n", "").replace(".", "").replace("/", "") for c in row]
            if any("txndate" in c or "date" in c for c in row_str_clean) and any("balance" in c for c in row_str_clean):
                header_row_idx = idx
                for c_idx, c_val in enumerate(row_str_clean):
                    if "txndate" in c_val or "date" in c_val:
                        col_map["date"] = c_idx
                    elif "narration" in c_val or "description" in c_val or "particulars" in c_val:
                        col_map["desc"] = c_idx
                    elif "ref" in c_val or "cheque" in c_val:
                        col_map["ref"] = c_idx
                    elif "debit" in c_val or "withdrawal" in c_val:
                        col_map["deb"] = c_idx
                    elif "credit" in c_val or "deposit" in c_val:
                        col_map["cred"] = c_idx
                    elif "balance" in c_val:
                        col_map["bal"] = c_idx
                break

        if header_row_idx != -1 and "date" in col_map and "bal" in col_map:
            date_idx = col_map["date"]
            desc_idx = col_map.get("desc", 2)
            ref_idx = col_map.get("ref", -1)
            deb_idx = col_map.get("deb", -1)
            cred_idx = col_map.get("cred", -1)
            bal_idx = col_map["bal"]

            for row in rows[header_row_idx + 1:]:
                if not row or len(row) <= max(date_idx, bal_idx):
                    continue

                date_str = str(row[date_idx]).strip()
                desc_str = str(row[desc_idx]).strip() if desc_idx < len(row) else ""
                ref_str = str(row[ref_idx]).strip() if (ref_idx != -1 and ref_idx < len(row)) else ""
                deb_str = str(row[deb_idx]).strip() if (deb_idx != -1 and deb_idx < len(row)) else ""
                cred_str = str(row[cred_idx]).strip() if (cred_idx != -1 and cred_idx < len(row)) else ""
                bal_str = str(row[bal_idx]).strip() if bal_idx < len(row) else ""

                parsed_dt = self.parse_date(date_str)
                full_desc = desc_str
                if ref_str and ref_str.lower() != "nan":
                    full_desc += " Ref: " + ref_str

                if parsed_dt:
                    if current_tx:
                        transactions.append(current_tx)
                    current_tx = {
                        "date": parsed_dt,
                        "narration": full_desc,
                        "debit": deb_str,
                        "credit": cred_str,
                        "balance": bal_str
                    }
                else:
                    if current_tx and desc_str:
                        current_tx["narration"] += " " + full_desc
                        current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()

            if current_tx:
                transactions.append(current_tx)

        cleaned_txs = self._finalize_transactions(transactions)
        return self.metadata, cleaned_txs

    def _parse_text_fallback(self, text: str) -> list[dict]:
        txs = []
        lines = text.split("\n")
        # Line pattern: Date Description Debit Credit Balance
        pattern = re.compile(r"^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})?\s*([\d,]+\.\d{2})$")
        
        for line in lines:
            line_str = line.strip()
            m = pattern.match(line_str)
            if m:
                dt_str, desc, deb, cred, bal = m.groups()
                parsed_dt = self.parse_date(dt_str)
                if parsed_dt:
                    txs.append({
                        "date": parsed_dt,
                        "narration": desc.strip(),
                        "debit": deb or "",
                        "credit": cred or "",
                        "balance": bal or ""
                    })
        return txs

    def _finalize_transactions(self, transactions: list[dict]) -> list[dict]:
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
                
        log_info(f"SBI extraction complete. Rows: {len(cleaned_txs)}")
        return cleaned_txs
