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
from extractors.kotak_ex import KotakExtractor
from extractors.pnb_ex import PnbExtractor
from extractors.bob_ex import BobExtractor
from extractors.union_ex import UnionExtractor
from extractors.indusind_ex import IndusindExtractor
from extractors.cbi_ex import CbiExtractor
from extractors.boi_ex import BoiExtractor
from extractors.generic_ex import GenericExtractor
from utils.logger import log_info

def detect_bank_and_get_extractor(file_path: str, password: str = None, original_filename: str = None) -> BaseExtractor:
    """
    Scans filename and header content of PDF or Spreadsheet (CSV/XLS/XLSX) to identify bank and return appropriate extractor.
    """
    filename = original_filename if original_filename else os.path.basename(file_path)
    filename_lower = filename.lower()
    
    # 1. Filename-based routing first
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
    if "kotak" in filename_lower or "kkbk" in filename_lower:
        log_info("Detected bank via filename: Kotak Mahindra Bank")
        return KotakExtractor()
    if "pnb" in filename_lower or "punjab national" in filename_lower:
        log_info("Detected bank via filename: Punjab National Bank")
        return PnbExtractor()
    if "bob" in filename_lower or "baroda" in filename_lower:
        log_info("Detected bank via filename: Bank of Baroda")
        return BobExtractor()
    if "union" in filename_lower or "ubin" in filename_lower:
        log_info("Detected bank via filename: Union Bank of India")
        return UnionExtractor()
    if "indusind" in filename_lower or "indb" in filename_lower:
        log_info("Detected bank via filename: IndusInd Bank")
        return IndusindExtractor()
    if "cbi" in filename_lower or "central bank" in filename_lower:
        log_info("Detected bank via filename: Central Bank of India")
        return CbiExtractor()
    if "boi" in filename_lower or "bank of india" in filename_lower:
        log_info("Detected bank via filename: Bank of India")
        return BoiExtractor()

    # 2. File Content Signature check
    ext = os.path.splitext(file_path)[1].lower()
    full_p1 = ""

    if ext in [".csv", ".txt", ".xls", ".xlsx"]:
        try:
            base_ex = BaseExtractor("temp")
            rows = base_ex.read_spreadsheet_rows(file_path)
            if rows:
                full_p1 = " ".join([" ".join(r) for r in rows[:15]])
        except Exception:
            full_p1 = ""
    else:
        try:
            import pdfplumber
            with pdfplumber.open(file_path, password=password) as pdf:
                if pdf.pages:
                    full_p1 = pdf.pages[0].extract_text() or ""
        except Exception:
            full_p1 = ""

        if not full_p1:
            try:
                reader = pypdf.PdfReader(file_path)
                if reader.is_encrypted and password:
                    reader.decrypt(password)
                full_p1 = reader.pages[0].extract_text() or ""
            except Exception:
                full_p1 = ""

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
    if "state bank of india" in header_lower or "sbin0" in header_lower or "sbi" in header_lower:
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
    if "kotak" in header_lower or "kkbk0" in header_lower:
        log_info("Detected bank via header signature: Kotak Mahindra Bank")
        return KotakExtractor()
    if "punjab national" in header_lower or "punb0" in header_lower:
        log_info("Detected bank via header signature: Punjab National Bank")
        return PnbExtractor()
    if "bank of baroda" in header_lower or "barb0" in header_lower:
        log_info("Detected bank via header signature: Bank of Baroda")
        return BobExtractor()
    if "union bank" in header_lower or "ubin0" in header_lower:
        log_info("Detected bank via header signature: Union Bank of India")
        return UnionExtractor()
    if "indusind" in header_lower or "indb0" in header_lower:
        log_info("Detected bank via header signature: IndusInd Bank")
        return IndusindExtractor()
    if "central bank" in header_lower or "cbin0" in header_lower:
        log_info("Detected bank via header signature: Central Bank of India")
        return CbiExtractor()
    if "bank of india" in header_lower or "bkid0" in header_lower:
        log_info("Detected bank via header signature: Bank of India")
        return BoiExtractor()

    # Generic fallback
    log_info("Unrecognized bank format. Falling back to Generic Extractor.")
    return GenericExtractor()
