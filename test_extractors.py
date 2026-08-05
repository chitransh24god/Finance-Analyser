import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extractors import detect_bank_and_get_extractor
from extractors.sbi_ex import SbiExtractor
from extractors.canara_ex import CanaraExtractor
from extractors.kotak_ex import KotakExtractor
from extractors.pnb_ex import PnbExtractor
from extractors.bob_ex import BobExtractor
from extractors.union_ex import UnionExtractor
from extractors.indusind_ex import IndusindExtractor
from extractors.cbi_ex import CbiExtractor
from extractors.boi_ex import BoiExtractor

class TestBankExtractors(unittest.TestCase):

    def test_bank_routing_by_filename(self):
        tests = [
            ("sbi_statement_2026.csv", SbiExtractor),
            ("canara_savings.xlsx", CanaraExtractor),
            ("kotak_account_jan.csv", KotakExtractor),
            ("pnb_passbook.csv", PnbExtractor),
            ("bob_statement.xlsx", BobExtractor),
            ("union_bank_txn.csv", UnionExtractor),
            ("indusind_report.csv", IndusindExtractor),
            ("cbi_statement.csv", CbiExtractor),
            ("boi_statement.csv", BoiExtractor),
        ]
        for filename, expected_cls in tests:
            ext = detect_bank_and_get_extractor("dummy.csv", original_filename=filename)
            self.assertIsInstance(ext, expected_cls, f"Failed routing for {filename}")

    def test_sbi_csv_parsing(self):
        content = """Txn Date,Value Date,Description,Ref No./Cheque No.,Branch Code,Debit,Credit,Balance
01/01/2026,01/01/2026,UPI/12345/SALARY,TRANSFER,1001,,50000.00,50000.00
02/01/2026,02/01/2026,ATM WITHDRAWAL,12345,1001,2000.00,,48000.00
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(content)
            f_path = f.name

        try:
            extractor = SbiExtractor()
            metadata, txs = extractor.parse(f_path)
            self.assertEqual(len(txs), 2)
            self.assertEqual(txs[0]["Date"], "2026-01-01")
            self.assertEqual(txs[0]["Credit"], 50000.0)
            self.assertEqual(txs[1]["Debit"], 2000.0)
            self.assertEqual(txs[1]["Balance"], 48000.0)
        finally:
            os.remove(f_path)

    def test_canara_csv_parsing(self):
        content = """Date,Particulars,Deposit,Withdrawal,Balance
05/01/2026,INTEREST CREDIT,150.00,,10150.00
06/01/2026,BILL PAYMENT,,500.00,9650.00
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(content)
            f_path = f.name

        try:
            extractor = CanaraExtractor()
            metadata, txs = extractor.parse(f_path)
            self.assertEqual(len(txs), 2)
            self.assertEqual(txs[0]["Credit"], 150.0)
            self.assertEqual(txs[1]["Debit"], 500.0)
        finally:
            os.remove(f_path)

    def test_kotak_csv_parsing(self):
        content = """Date,Particulars,Withdrawal,Deposit,Balance
10-01-2026,NEFT OUTWARD,1200.00,,8450.00
11-01-2026,DIVIDEND RECEIVED,,300.00,8750.00
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(content)
            f_path = f.name

        try:
            extractor = KotakExtractor()
            metadata, txs = extractor.parse(f_path)
            self.assertEqual(len(txs), 2)
            self.assertEqual(txs[0]["Debit"], 1200.0)
            self.assertEqual(txs[1]["Credit"], 300.0)
        finally:
            os.remove(f_path)

if __name__ == "__main__":
    unittest.main()
