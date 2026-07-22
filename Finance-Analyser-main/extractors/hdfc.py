from pathlib import Path
from typing import Optional, Tuple

from utils.pdf_reader import extract_hdfc_transactions


def extract_hdfc(file_path: str, password: Optional[str] = None) -> Tuple[object, dict]:
    return extract_hdfc_transactions(Path(file_path), password=password)
