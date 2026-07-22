import pandas as pd
from datetime import datetime, timedelta
import calendar
from utils.logger import log_info, log_warning, log_error

def calculate_monthly_abb(df: pd.DataFrame, start_date_str: str = None, end_date_str: str = None) -> tuple[pd.DataFrame, dict]:
    """
    Computes monthly ABB values based on the custom 5th, 10th, 15th, 20th, 25th, and End-of-Month balance rules.
    Returns:
        - df_monthly_abb: pd.DataFrame with monthly details.
        - abb_summary: dict with 1M, 3M, 6M ABB metrics.
    """
    log_info("Calculating ABB statistics...")
    
    if df is None or df.empty:
        return pd.DataFrame(), {"1M": "Data Unavailable", "3M": "Data Unavailable", "6M": "Data Unavailable"}

    # Parse and sort transactions
    df_clean = df.copy()
    
    # Robust coercion of Debit, Credit, and Balance columns to float, handling pd.NA and NaNs
    for col in ["Debit", "Credit", "Balance"]:
        if col in df_clean.columns:
            df_clean[col] = df_clean[col].apply(lambda x: 0.0 if pd.isna(x) or x == "" or x is None else float(x))
            
    df_clean["ParsedDate"] = pd.to_datetime(df_clean["Date"])
    # Use stable sort to preserve statement order of intra-day transactions
    df_clean = df_clean.sort_values(by=["ParsedDate"], ascending=[True], kind="mergesort").reset_index(drop=True)
    
    # Determine statement date bounds
    if start_date_str and start_date_str != "Not Available":
        start_dt = pd.to_datetime(start_date_str)
    else:
        start_dt = df_clean["ParsedDate"].min()
        
    if end_date_str and end_date_str != "Not Available":
        end_dt = pd.to_datetime(end_date_str)
    else:
        end_dt = df_clean["ParsedDate"].max()

    log_info(f"ABB Date Range: {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')}")
    
    # Calculate initial opening balance (pre-first transaction)
    first_tx = df_clean.iloc[0]
    opening_bal = float(first_tx["Balance"]) - float(first_tx["Credit"]) + float(first_tx["Debit"])
    
    # Build daily running balance lookup dictionary
    daily_balances = {}
    current_date = start_dt
    running_bal = opening_bal
    
    # Group transactions by date
    tx_by_date = df_clean.groupby("Date")
    
    # Iterate day-by-day and track balance
    while current_date <= end_dt:
        date_str = current_date.strftime("%Y-%m-%d")
        
        # Check if transactions occurred on this day
        if date_str in tx_by_date.groups:
            day_txs = tx_by_date.get_group(date_str)
            # The running balance at the end of the day is the balance of the last transaction of that day
            running_bal = float(day_txs.iloc[-1]["Balance"])
            
        daily_balances[date_str] = running_bal
        current_date += timedelta(days=1)
        
    # Helper function to get balance for a specific date (with missing date rollback logic)
    def get_balance_on_date(target_dt: datetime) -> float:
        # Scan backward day-by-day until we find a balance or reach start_dt
        scan_dt = target_dt
        while scan_dt >= start_dt:
            scan_str = scan_dt.strftime("%Y-%m-%d")
            if scan_str in daily_balances:
                return daily_balances[scan_str]
            scan_dt -= timedelta(days=1)
            
        # If still not found, return opening balance
        return opening_bal

    # Group by calendar months
    # Generate list of year-months covered
    months_covered = []
    curr = start_dt.replace(day=1)
    while curr <= end_dt:
        months_covered.append((curr.year, curr.month))
        # Move to next month
        if curr.month == 12:
            curr = curr.replace(year=curr.year + 1, month=1)
        else:
            curr = curr.replace(month=curr.month + 1)
            
    monthly_data = []
    
    for year, month in months_covered:
        # Calculate target dates for this month
        month_name = calendar.month_abbr[month]
        month_label = f"{month_name}-{year}"
        
        last_day = calendar.monthrange(year, month)[1]
        
        targets = [5, 10, 15, 20, 25, last_day]
        balances = []
        
        for t in targets:
            target_dt = datetime(year, month, t)
            # If target date is in the future relative to statement end date, cap at end date
            if target_dt > end_dt:
                target_dt = end_dt
                
            bal = get_balance_on_date(target_dt)
            balances.append(bal)
            
        b5, b10, b15, b20, b25, bend = balances
        monthly_abb = sum(balances) / 6.0
        
        monthly_data.append({
            "Month": month_label,
            "YearMonth": f"{year}-{month:02d}", # For sorting
            "5th Balance": b5,
            "10th Balance": b10,
            "15th Balance": b15,
            "20th Balance": b20,
            "25th Balance": b25,
            "Month End Balance": bend,
            "Monthly ABB": monthly_abb
        })
        
    df_monthly_abb = pd.DataFrame(monthly_data)
    # Sort months chronologically
    if not df_monthly_abb.empty:
        df_monthly_abb = df_monthly_abb.sort_values(by="YearMonth").reset_index(drop=True)
        
    # Calculate rolling averages
    abb_summary = {"1M": "Data Unavailable", "3M": "Data Unavailable", "6M": "Data Unavailable"}
    
    if not df_monthly_abb.empty:
        num_months = len(df_monthly_abb)
        
        # 1 Month ABB (Latest Month ABB)
        latest_abb = df_monthly_abb.iloc[-1]["Monthly ABB"]
        abb_summary["1M"] = round(latest_abb, 2)
        
        # 3 Month ABB (Average of latest 3 monthly ABB values)
        if num_months >= 3:
            three_m_abb = df_monthly_abb.iloc[-3:]["Monthly ABB"].mean()
            abb_summary["3M"] = round(three_m_abb, 2)
            
        # 6 Month ABB (Average of latest 6 monthly ABB values)
        if num_months >= 6:
            six_m_abb = df_monthly_abb.iloc[-6:]["Monthly ABB"].mean()
            abb_summary["6M"] = round(six_m_abb, 2)
            
    log_info(f"ABB calculation complete. Summary: {abb_summary}")
    return df_monthly_abb, abb_summary
