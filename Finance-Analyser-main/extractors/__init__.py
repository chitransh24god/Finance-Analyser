import os
import pypdf
import re
from extractors.base_ex import BaseExtractor
from extractors.hdfc_ex import HdfcExtractor
from extractors.icici_ex import IciciExtractor
from extractors.sbi_ex import SbiExtractor
from extractors.axis_ex import AxisExtractor
from extractors.idfc_ex import IdfcExtractor
from extractors.yes_ex import YesExtractor
from extractors.canara_ex import CanaraExtractor
from extractors.kalupur_ex import KalupurExtractor
from extractors.generic_ex import GenericExtractor
from utils.logger import log_info

def detect_bank_and_get_extractor(pdf_path: str, password: str = None, original_filename: str = None) -> BaseExtractor:
    """
    Scans the first page of the PDF to identify the bank, and returns the appropriate extractor.
    """
    filename = original_filename if original_filename else os.path.basename(pdf_path)
    filename_lower = filename.lower()
    
    # 1. Filename-based routing first (highly accurate)
    if "hdfc" in filename_lower:
        log_info("Detected bank via filename: HDFC Bank")
        return HdfcExtractor()
    if "icici" in filename_lower or "ic bank" in filename_lower:
        log_info("Detected bank via filename: ICICI Bank")
        return IciciExtractor()
    if "sbi" in filename_lower or "state bank" in filename_lower:
        log_info("Detected bank via filename: SBI Bank")
        return SbiExtractor()
    if "axis" in filename_lower or "axix" in filename_lower:
        log_info("Detected bank via filename: Axis Bank")
        return AxisExtractor()
    if "idfc" in filename_lower:
        log_info("Detected bank via filename: IDFC First Bank")
        return IdfcExtractor()
    if "yes bank" in filename_lower or "yes_bank" in filename_lower or "yesbank" in filename_lower:
        log_info("Detected bank via filename: Yes Bank")
        return YesExtractor()
    if "canara" in filename_lower:
        log_info("Detected bank via filename: Canara Bank")
        return CanaraExtractor()
    if "kalupur" in filename_lower:
        log_info("Detected bank via filename: Kalupur Commercial Cooperative Bank")
        return KalupurExtractor()

    # 2. Header-based text signature routing
    try:
        import pdfplumber
        full_p1 = ""
        with pdfplumber.open(pdf_path, password=password) as pdf:
            if pdf.pages:
                full_p1 = pdf.pages[0].extract_text() or ""
    except Exception:
        full_p1 = ""

    if not full_p1:
        try:
            reader = pypdf.PdfReader(pdf_path)
            if reader.is_encrypted and password:
                reader.decrypt(password)
            full_p1 = reader.pages[0].extract_text() or ""
        except Exception:
            full_p1 = ""

    # Focus signature check on top header text before transaction table rows
    header_text = full_p1[:1500] if len(full_p1) > 1500 else full_p1
    header_lower = header_text.lower()

    # Match by explicit bank titles & IFSC prefixes in header
    if "kalupur" in header_lower or "kccb" in header_lower:
        log_info("Detected bank via header signature: Kalupur Cooperative Bank")
        return KalupurExtractor()
    if "canara" in header_lower or "cnrb" in header_lower:
        log_info("Detected bank via header signature: Canara Bank")
        return CanaraExtractor()
    if "idfc" in header_lower or "idfb" in header_lower:
        log_info("Detected bank via header signature: IDFC First Bank")
        return IdfcExtractor()
    if "yes bank" in header_lower or "yesbank" in header_lower or "yesb0" in header_lower:
        log_info("Detected bank via header signature: Yes Bank")
        return YesExtractor()
    if "state bank of india" in header_lower or "sbin0" in header_lower:
        log_info("Detected bank via header signature: State Bank of India")
        return SbiExtractor()
    if "axis bank" in header_lower or "axis account" in header_lower or "utib0" in header_lower:
        log_info("Detected bank via header signature: Axis Bank")
        return AxisExtractor()
    if "icici" in header_lower or "icic0" in header_lower:
        log_info("Detected bank via header signature: ICICI Bank")
        return IciciExtractor()
    if "hdfc" in header_lower or "hdfc0" in header_lower or "5750000" in header_lower:
        log_info("Detected bank via header signature: HDFC Bank")
        return HdfcExtractor()

    # Generic fallback
    log_info("Unrecognized bank format. Falling back to Generic Extractor.")
    return GenericExtractor()
