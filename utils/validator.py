import pandas as pd
from datetime import datetime
from utils.logger import log_info, log_warning, log_error

class ValidationResult:
    def __init__(self, is_valid: bool, error_message: str = ""):
        self.is_valid = is_valid
        self.error_message = error_message

def validate_transactions(df: pd.DataFrame, abb_summary: dict = None) -> ValidationResult:
    """
    Validates the extracted transaction dataframe and ABB calculations.
    Returns ValidationResult.
    """
    log_info("Starting statement validation...")
    
    # 1. No transactions found
    if df is None or df.empty:
        msg = "Validation Rejected: No transactions found in the statement."
        log_error(msg)
        return ValidationResult(False, msg)
    
    # 2. Check for required columns
    required_cols = ["Date", "Particulars", "Debit", "Credit", "Balance"]
    for col in required_cols:
        if col not in df.columns:
            msg = f"Validation Rejected: Missing required column '{col}'."
            log_error(msg)
            return ValidationResult(False, msg)
            
    # 3. Check for balance column validity (should contain numeric values)
    non_null_balances = df["Balance"].dropna()
    if non_null_balances.empty:
        msg = "Validation Rejected: Missing balance column values."
        log_error(msg)
        return ValidationResult(False, msg)
        
    # 4. Check date validity and range
    parsed_dates = []
    invalid_dates_count = 0
    total_rows = len(df)
    
    for idx, row in df.iterrows():
        dt_val = row["Date"]
        # Try parsing date
        try:
            if isinstance(dt_val, pd.Timestamp):
                parsed_dates.append(dt_val)
            elif isinstance(dt_val, str):
                # Clean up and parse common formats
                parsed_dt = pd.to_datetime(dt_val.strip())
                parsed_dates.append(parsed_dt)
            else:
                invalid_dates_count += 1
        except Exception:
            invalid_dates_count += 1
            
    # More than 20% invalid dates
    invalid_pct = (invalid_dates_count / total_rows) * 100
    if invalid_pct > 20:
        msg = f"Validation Rejected: More than 20% invalid dates found ({invalid_pct:.2f}%)."
        log_error(msg)
        return ValidationResult(False, msg)
        
    if not parsed_dates:
        msg = "Validation Rejected: No valid dates found."
        log_error(msg)
        return ValidationResult(False, msg)
        
    start_date = min(parsed_dates)
    end_date = max(parsed_dates)
    
    # Invalid date range
    if end_date < start_date:
        msg = f"Validation Rejected: Invalid date range (Start: {start_date}, End: {end_date})."
        log_error(msg)
        return ValidationResult(False, msg)
        
    # Statement period > 500 days
    days_covered = (end_date - start_date).days + 1
    if days_covered > 500:
        msg = f"Validation Rejected: Statement period exceeds 500 days ({days_covered} days covered)."
        log_error(msg)
        return ValidationResult(False, msg)
        
    # Check ABB if provided
    if abb_summary:
        # Check if 1M, 3M, or 6M ABB is less than 0
        for key, val in abb_summary.items():
            if isinstance(val, (int, float)) and val < 0:
                msg = f"Validation Rejected: Calculated ABB ({key} = {val}) is negative."
                log_error(msg)
                return ValidationResult(False, msg)
                
    log_info(f"Validation successful. Covered: {days_covered} days, Invalid dates: {invalid_pct:.1f}%.")
    return ValidationResult(True)
