import os
import re
import pdfplumber
from extractors.base_ex import BaseExtractor
from utils.logger import log_info, log_warning, log_error

class CbiExtractor(BaseExtractor):
    def __init__(self):
        super().__init__("Central Bank of India")

    def extract_metadata(self, text: str):
        acc_match = re.search(r"Account\s*No(?:v|\.|\s|umber)?\s*:?\s*(\d+)", text, re.I)
        if acc_match:
            self.metadata["account_number"] = acc_match.group(1).strip()

        period_match = re.search(r"(?:Period|From)\s*:?\s*(\d{2}[-/.]\d{2}[-/.]\d{2,4})\s*(?:To|-)\s*(\d{2}[-/.]\d{2}[-/.]\d{2,4})", text, re.I)
        if period_match:
            self.metadata["start_date"] = self.parse_date(period_match.group(1))
            self.metadata["end_date"] = self.parse_date(period_match.group(2))

        name_match = re.search(r"(?:Customer|Account)\s*Name\s*:?\s*([A-Za-z0-9\s\.\&]+?)(?:\n|Account|IFSC|$)", text, re.I)
        if name_match:
            self.metadata["customer_name"] = name_match.group(1).strip()

    def parse(self, file_path: str, password: str = None) -> tuple[dict, list[dict]]:
        log_info(f"Parsing Central Bank of India statement: {os.path.basename(file_path)}")
        ext = os.path.splitext(file_path)[1].lower()

        if ext in [".csv", ".xls", ".xlsx"]:
            return self._parse_spreadsheet(file_path)
        else:
            return self._parse_pdf(file_path, password)

    def _parse_pdf(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        text_p1 = self.extract_text_pdfplumber(pdf_path, password)
        self.extract_metadata(text_p1)
        
        transactions = []
        current_tx = None

        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if not tables:
                    continue

                for table in tables:
                    if not table or not table[0]:
                        continue
                    headers = [str(col).lower().replace("\n", "").replace(" ", "").replace("/", "").replace(".", "") for col in table[0] if col is not None]

                    if ("date" in headers or "txndate" in headers) and "balance" in headers:
                        date_idx = headers.index("date") if "date" in headers else 0
                        desc_idx = headers.index("particulars") if "particulars" in headers else (headers.index("description") if "description" in headers else 1)
                        deb_idx = headers.index("debit") if "debit" in headers else (headers.index("withdrawal") if "withdrawal" in headers else 2)
                        cred_idx = headers.index("credit") if "credit" in headers else (headers.index("deposit") if "deposit" in headers else 3)
                        bal_idx = headers.index("balance")

                        for row in table[1:]:
                            if not row or len(row) <= max(date_idx, bal_idx):
                                continue

                            date_str = str(row[date_idx]).strip() if row[date_idx] is not None else ""
                            desc_str = str(row[desc_idx]).strip() if (desc_idx < len(row) and row[desc_idx] is not None) else ""
                            deb_str = str(row[deb_idx]).strip() if (deb_idx < len(row) and row[deb_idx] is not None) else ""
                            cred_str = str(row[cred_idx]).strip() if (cred_idx < len(row) and row[cred_idx] is not None) else ""
                            bal_str = str(row[bal_idx]).strip() if (bal_idx < len(row) and row[bal_idx] is not None) else ""

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

        cleaned_txs = self._finalize_transactions(transactions)
        return self.metadata, cleaned_txs

    def _parse_spreadsheet(self, file_path: str) -> tuple[dict, list[dict]]:
        rows = self.read_spreadsheet_rows(file_path)
        full_text = "\n".join([" ".join(row) for row in rows])
        self.extract_metadata(full_text)

        transactions = []
        current_tx = None

        header_row_idx = -1
        col_map = {}

        for idx, row in enumerate(rows):
            row_clean = [str(c).lower().replace(" ", "").replace("\n", "").replace(".", "").replace("/", "") for c in row]
            if any("date" in c for c in row_clean) and any("balance" in c for c in row_clean):
                header_row_idx = idx
                for c_idx, c_val in enumerate(row_clean):
                    if "date" in c_val:
                        col_map["date"] = c_idx
                    elif "particulars" in c_val or "description" in c_val or "narration" in c_val:
                        col_map["desc"] = c_idx
                    elif "withdrawal" in c_val or "debit" in c_val or "dr" in c_val:
                        col_map["deb"] = c_idx
                    elif "deposit" in c_val or "credit" in c_val or "cr" in c_val:
                        col_map["cred"] = c_idx
                    elif "balance" in c_val:
                        col_map["bal"] = c_idx
                break

        if header_row_idx != -1 and "date" in col_map and "bal" in col_map:
            date_idx = col_map["date"]
            desc_idx = col_map.get("desc", 1)
            deb_idx = col_map.get("deb", -1)
            cred_idx = col_map.get("cred", -1)
            bal_idx = col_map["bal"]

            for row in rows[header_row_idx + 1:]:
                if not row or len(row) <= max(date_idx, bal_idx):
                    continue

                date_str = str(row[date_idx]).strip()
                desc_str = str(row[desc_idx]).strip() if desc_idx < len(row) else ""
                deb_str = str(row[deb_idx]).strip() if (deb_idx != -1 and deb_idx < len(row)) else ""
                cred_str = str(row[cred_idx]).strip() if (cred_idx != -1 and cred_idx < len(row)) else ""
                bal_str = str(row[bal_idx]).strip() if bal_idx < len(row) else ""

                parsed_dt = self.parse_date(date_str)
                if parsed_dt:
                    if current_tx:
                        transactions.append(current_tx)
                    current_tx = {
                        "date": parsed_dt,
                        "narration": desc_str,
                        "debit": deb_str,
                        "credit": cred_str,
                        "balance": bal_str
                    }
                else:
                    if current_tx and desc_str:
                        current_tx["narration"] += " " + desc_str
                        current_tx["narration"] = re.sub(r"\s+", " ", current_tx["narration"]).strip()

            if current_tx:
                transactions.append(current_tx)

        cleaned_txs = self._finalize_transactions(transactions)
        return self.metadata, cleaned_txs

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

        log_info(f"Central Bank of India extraction complete. Rows: {len(cleaned_txs)}")
        return cleaned_txs
