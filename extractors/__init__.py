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

    # 2. Text-based signature routing (fallback)
    try:
        reader = pypdf.PdfReader(pdf_path)
        if reader.is_encrypted and password:
            reader.decrypt(password)
            
        first_page_text = reader.pages[0].extract_text() or ""
    except Exception:
        first_page_text = ""

    text_lower = first_page_text.lower()
    
    # Check for Axis
    if "axis bank" in text_lower or "axis account" in text_lower:
        log_info("Detected bank via signature: Axis Bank")
        return AxisExtractor()
    # Check for HDFC
    if "hdfc bank" in text_lower or "hdfcbank" in text_lower or "statement of account" in text_lower and "hdfc" in text_lower:
        log_info("Detected bank via signature: HDFC Bank")
        return HdfcExtractor()
    # Check for ICICI
    if "icici bank" in text_lower or "icic" in text_lower:
        log_info("Detected bank via signature: ICICI Bank")
        return IciciExtractor()
    # Check for SBI
    if "state bank of india" in text_lower or "sbi" in text_lower:
        log_info("Detected bank via signature: State Bank of India")
        return SbiExtractor()
    # Check for IDFC
    if "idfc" in text_lower:
        log_info("Detected bank via signature: IDFC First Bank")
        return IdfcExtractor()
    # Check for Yes Bank
    if "yes bank" in text_lower or "yesbank" in text_lower:
        log_info("Detected bank via signature: Yes Bank")
        return YesExtractor()
    # Check for Canara Bank
    if "canara bank" in text_lower or "canara" in text_lower:
        log_info("Detected bank via signature: Canara Bank")
        return CanaraExtractor()
    # Check for Kalupur Bank
    if "kalupur" in text_lower:
        log_info("Detected bank via signature: Kalupur Cooperative Bank")
        return KalupurExtractor()
        
    # Generic fallback
    log_info("Unrecognized bank format. Falling back to Generic Extractor.")
    return GenericExtractor()
