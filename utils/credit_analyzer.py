import pandas as pd
from utils.logger import log_info

def analyze_credit_profile(df: pd.DataFrame, df_monthly_abb: pd.DataFrame, abb_summary: dict, metadata: dict) -> dict:
    """
    Computes summary metrics and loan risk evaluations for the credit profile.
    """
    log_info("Analyzing credit risk profile...")
    
    # Simple defaults if dataframe is empty
    if df is None or df.empty:
        return {}

    # Standard columns
    df_clean = df.copy()
    df_clean["ParsedDate"] = pd.to_datetime(df_clean["Date"])
    
    # Days covered
    start_dt = df_clean["ParsedDate"].min()
    end_dt = df_clean["ParsedDate"].max()
    days_covered = (end_dt - start_dt).days + 1
    
    # Total debits / credits
    total_debits = df_clean["Debit"].sum()
    total_credits = df_clean["Credit"].sum()
    
    # Counts
    debit_count = (df_clean["Debit"] > 0).sum()
    credit_count = (df_clean["Credit"] > 0).sum()
    
    # Balances
    highest_balance = df_clean["Balance"].max()
    lowest_balance = df_clean["Balance"].min()
    
    # Sorted end-of-period balance
    df_sorted = df_clean.sort_values(by=["ParsedDate", "Balance"], ascending=[True, True])
    latest_balance = df_sorted.iloc[-1]["Balance"]
    
    # Monthly statistics
    df_clean["YearMonth"] = df_clean["ParsedDate"].dt.strftime("%Y-%m")
    monthly_stats = df_clean.groupby("YearMonth").agg(
        monthly_credit=("Credit", "sum"),
        monthly_debit=("Debit", "sum")
    )
    
    avg_monthly_credit = monthly_stats["monthly_credit"].mean() if not monthly_stats.empty else 0.0
    avg_monthly_debit = monthly_stats["monthly_debit"].mean() if not monthly_stats.empty else 0.0
    
    highest_monthly_credit = monthly_stats["monthly_credit"].max() if not monthly_stats.empty else 0.0
    highest_monthly_debit = monthly_stats["monthly_debit"].max() if not monthly_stats.empty else 0.0

    # Risk grading logic
    # 1. ABB Status
    # Calculate average of all available monthly ABB values
    if not df_monthly_abb.empty:
        avg_abb = df_monthly_abb["Monthly ABB"].mean()
    else:
        avg_abb = 0.0
        
    if avg_abb > 500000:
        abb_status = "Excellent"
    elif avg_abb > 100000:
        abb_status = "Good"
    elif avg_abb > 25000:
        abb_status = "Average"
    else:
        abb_status = "Risky"
        
    # 2. Balance Stability
    # Grade by lowest balance
    if lowest_balance > 50000:
        balance_stability = "Excellent"
    elif lowest_balance > 10000:
        balance_stability = "Good"
    elif lowest_balance > 0:
        balance_stability = "Average"
    else:
        balance_stability = "Risky"
        
    # 3. Liquidity Strength (ratio of credits to debits)
    if total_debits == 0:
        liquidity_ratio = 2.0 # high liquidity
    else:
        liquidity_ratio = total_credits / total_debits
        
    if liquidity_ratio > 1.2:
        liquidity_strength = "Excellent"
    elif liquidity_ratio >= 1.0:
        liquidity_strength = "Good"
    elif liquidity_ratio >= 0.85:
        liquidity_strength = "Average"
    else:
        liquidity_strength = "Risky"
        
    # 4. Overall Profile (conservative approach: worst of the three)
    grades = [abb_status, balance_stability, liquidity_strength]
    if "Risky" in grades:
        overall_profile = "Risky"
    elif "Average" in grades:
        overall_profile = "Average"
    elif "Good" in grades:
        overall_profile = "Good"
    else:
        overall_profile = "Excellent"
        
    # Short explanations
    explanations = {
        "Excellent": "The applicant demonstrates a highly stable cash flow, substantial daily balances, and negligible risk. Highly recommended for premium credit offerings.",
        "Good": "The account shows positive cash flows, stable average monthly balances, and low default risk. Recommended for standard credit facilities.",
        "Average": "Moderate balance maintenance with occasional cash flow contractions. Suitable for collateralized loans or lower credit limits.",
        "Risky": "High variance in cash balances, frequent low/negative balance triggers, or high debit ratio. Not recommended or requires high interest/additional guarantees."
    }
    
    explanation = explanations[overall_profile]
    
    return {
        "days_covered": days_covered,
        "total_credits": total_credits,
        "total_debits": total_debits,
        "credit_count": credit_count,
        "debit_count": debit_count,
        "highest_balance": highest_balance,
        "lowest_balance": lowest_balance,
        "latest_balance": latest_balance,
        "avg_monthly_credit": avg_monthly_credit,
        "avg_monthly_debit": avg_monthly_debit,
        "highest_monthly_credit": highest_monthly_credit,
        "highest_monthly_debit": highest_monthly_debit,
        "abb_status": abb_status,
        "balance_stability": balance_stability,
        "liquidity_strength": liquidity_strength,
        "overall_profile": overall_profile,
        "explanation": explanation
    }
