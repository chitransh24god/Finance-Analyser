import os
import re
import pypdf
import pdfplumber
import pandas as pd
from datetime import datetime
from utils.logger import log_info, log_warning, log_error

class BaseExtractor:
    def __init__(self, bank_name: str):
        self.bank_name = bank_name
        self.metadata = {
            "customer_name": "Not Available",
            "account_number": "Not Available",
            "start_date": "Not Available",
            "end_date": "Not Available",
            "bank_name": bank_name
        }

    def clean_amount(self, val) -> float:
        """
        Parses text amount strings into float (e.g. '1,23,456.78 Cr' or '(450.00)' or '-250.00').
        """
        if val is None:
            return 0.0
        val_str = str(val).strip().replace(",", "")
        if not val_str or val_str == "." or val_str == "-":
            return 0.0
        
        # Check if it contains Dr/Cr indicator
        is_dr = "dr" in val_str.lower()
        is_cr = "cr" in val_str.lower()
        
        # Remove any non-numeric and non-dot characters
        # Preserve negative signs and parenthesized numbers
        has_negative = "-" in val_str or ("(" in val_str and ")" in val_str)
        
        # Extract digits, dots
        cleaned = re.sub(r"[^\d\.]", "", val_str)
        if not cleaned:
            return 0.0
            
        try:
            amount = float(cleaned)
            if has_negative or is_dr:
                amount = -amount
            return amount
        except ValueError:
            return 0.0

    def parse_date(self, date_str: str) -> str:
        """
        Standardizes date strings to 'YYYY-MM-DD'.
        Validates that year is between 2020 and CurrentYear + 1.
        Returns empty string if invalid.
        """
        if not date_str or not isinstance(date_str, str):
            return ""
        
        date_str_clean = date_str.strip()
        
        # Try different formats
        formats = [
            "%d/%m/%y", "%d/%m/%Y",
            "%d-%m-%y", "%d-%m-%Y",
            "%d.%m.%y", "%d.%m.%Y",
            "%d/%b/%y", "%d/%b/%Y",
            "%d-%b-%y", "%d-%b-%Y",
            "%d/%B/%y", "%d/%B/%Y",
            "%d-%B-%y", "%d-%B-%Y",
            "%d %b %Y", "%d %b %y",
            "%d %B %Y", "%d %B %y",
            "%Y-%m-%d", "%Y/%m/%d"
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str_clean, fmt)
                # Validate year
                current_year = datetime.now().year
                if 2020 <= dt.year <= current_year + 1:
                    return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
                
        return ""

    def decrypt_pdf(self, pdf_path: str, password: str = None) -> pypdf.PdfReader:
        """
        Attempts to read and decrypt a PDF file.
        Returns pypdf.PdfReader if successful, else raises exception.
        """
        reader = pypdf.PdfReader(pdf_path)
        if reader.is_encrypted:
            if not password:
                raise ValueError("PDF is password-protected. Please provide a password.")
            
            result = reader.decrypt(password)
            if result == 0:
                raise ValueError("Incorrect password for PDF file.")
        return reader

    def extract_text_pypdf(self, pdf_path: str, password: str = None) -> str:
        """
        Helper to extract raw text from PDF for header parsing and metadata detection.
        """
        try:
            reader = self.decrypt_pdf(pdf_path, password)
            full_text = ""
            # Extract text from first 2 pages for metadata
            for i in range(min(2, len(reader.pages))):
                full_text += reader.pages[i].extract_text() or ""
            return full_text
        except Exception as e:
            log_error(f"Error extracting text with pypdf: {e}")
            raise e

    def parse(self, pdf_path: str, password: str = None) -> tuple[dict, list[dict]]:
        """
        Main parser interface. Must be implemented by child classes.
        """
        raise NotImplementedError("Each bank extractor must implement the parse method.")
