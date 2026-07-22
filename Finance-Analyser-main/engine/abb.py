from datetime import date, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd


def build_daily_balance(cleaned_df: pd.DataFrame) -> pd.DataFrame:
    if cleaned_df.empty:
        raise ValueError("Cleaned transaction data is empty.")
    balance_df = (
        cleaned_df
        .dropna(subset=["Date", "Balance"])
        .sort_values("Date")
        .groupby("Date", as_index=False)
        .last()
    )
    min_date = balance_df["Date"].min()
    max_date = balance_df["Date"].max()
    all_dates = pd.date_range(start=min_date, end=max_date, freq="D")
    daily = pd.DataFrame({"Date": all_dates}).merge(balance_df, on="Date", how="left")
    daily["Balance"] = daily["Balance"].ffill()
    return daily


def get_balance_on_or_before(target_date: date, daily_balance: pd.DataFrame) -> Optional[float]:
    candidates = daily_balance[daily_balance["Date"] <= pd.to_datetime(target_date)]
    if candidates.empty:
        return None
    return float(candidates.iloc[-1]["Balance"])


def month_end(target_date: date) -> date:
    if target_date.month == 12:
        return date(target_date.year, 12, 31)
    next_month_first = date(target_date.year, target_date.month + 1, 1)
    return next_month_first - timedelta(days=1)


def build_monthly_abb_table(daily_balance: pd.DataFrame) -> pd.DataFrame:
    if daily_balance.empty:
        return pd.DataFrame(
            columns=[
                "Month",
                "5th Balance",
                "10th Balance",
                "15th Balance",
                "20th Balance",
                "25th Balance",
                "Month End Balance",
                "Monthly ABB",
            ]
        )

    start_date = daily_balance["Date"].min().date()
    end_date = daily_balance["Date"].max().date()
    months: List[date] = []
    current = date(start_date.year, start_date.month, 1)
    while current <= end_date:
        months.append(current)
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)

    rows = []
    for month_start in months:
        targets = [5, 10, 15, 20, 25]
        values: List[Optional[float]] = []
        valid = True
        for day in targets:
            day_of_month = min(day, month_end(month_start).day)
            target_date = date(month_start.year, month_start.month, day_of_month)
            balance_value = get_balance_on_or_before(target_date, daily_balance)
            if balance_value is None:
                valid = False
            values.append(balance_value)

        month_end_balance = get_balance_on_or_before(month_end(month_start), daily_balance)
        if month_end_balance is None:
            valid = False
        values.append(month_end_balance)

        monthly_abb = float(pd.NA)
        if valid and all(v is not None for v in values):
            monthly_abb = sum(values) / len(values)

        rows.append(
            {
                "Month": month_start.strftime("%Y-%m"),
                "5th Balance": values[0],
                "10th Balance": values[1],
                "15th Balance": values[2],
                "20th Balance": values[3],
                "25th Balance": values[4],
                "Month End Balance": values[5],
                "Monthly ABB": monthly_abb if pd.notna(monthly_abb) else None,
            }
        )

    return pd.DataFrame(rows)


def summarize_abb(monthly_abb_table: pd.DataFrame) -> Dict[str, Optional[float]]:
    valid_rows = monthly_abb_table.dropna(subset=["Monthly ABB"])
    summary: Dict[str, Optional[float]] = {
        "Latest Month ABB": None,
        "1 Month ABB": None,
        "3 Month ABB": None,
        "6 Month ABB": None,
    }
    if valid_rows.empty:
        return summary
    summary["Latest Month ABB"] = float(valid_rows.iloc[-1]["Monthly ABB"])
    summary["1 Month ABB"] = summary["Latest Month ABB"]
    if len(valid_rows) >= 3:
        summary["3 Month ABB"] = float(valid_rows["Monthly ABB"].iloc[-3:].mean())
    if len(valid_rows) >= 6:
        summary["6 Month ABB"] = float(valid_rows["Monthly ABB"].iloc[-6:].mean())
    return summary


def build_account_summary(cleaned_df: pd.DataFrame) -> Dict[str, Optional[float]]:
    credits = cleaned_df["Credit"].fillna(0)
    debits = cleaned_df["Debit"].fillna(0)
    highest_balance = cleaned_df["Balance"].max()
    lowest_balance = cleaned_df["Balance"].min()
    latest_balance = cleaned_df.sort_values("Date", ascending=False)["Balance"].iloc[0]

    monthly_credit = cleaned_df.set_index("Date").groupby(pd.Grouper(freq="M"))["Credit"].sum()
    monthly_debit = cleaned_df.set_index("Date").groupby(pd.Grouper(freq="M"))["Debit"].sum()

    return {
        "Total Credits": float(credits.sum()),
        "Total Debits": float(debits.sum()),
        "Highest Balance": float(highest_balance) if pd.notna(highest_balance) else None,
        "Lowest Balance": float(lowest_balance) if pd.notna(lowest_balance) else None,
        "Latest Balance": float(latest_balance) if pd.notna(latest_balance) else None,
        "Credit Transaction Count": int(cleaned_df["Credit"].dropna().shape[0]),
        "Debit Transaction Count": int(cleaned_df["Debit"].dropna().shape[0]),
        "Average Monthly Credit": float(monthly_credit.mean()) if not monthly_credit.empty else None,
        "Average Monthly Debit": float(monthly_debit.mean()) if not monthly_debit.empty else None,
        "Highest Monthly Credit": float(monthly_credit.max()) if not monthly_credit.empty else None,
        "Highest Monthly Debit": float(monthly_debit.max()) if not monthly_debit.empty else None,
    }


def build_loan_assessment(monthly_abb_table: pd.DataFrame, daily_balance: pd.DataFrame) -> Dict[str, str]:
    summary = summarize_abb(monthly_abb_table)
    latest_abb = summary.get("Latest Month ABB")
    balances = daily_balance["Balance"].dropna()
    stability_ratio = float(balances.std() / balances.mean()) if len(balances) > 1 and balances.mean() != 0 else 0.0
    if latest_abb is None:
        category = "Risky"
        explanation = "Insufficient ABB history to generate a reliable assessment."
    elif latest_abb >= 200000 and stability_ratio < 0.35:
        category = "Excellent"
        explanation = "Strong ABB and stable balance behavior indicate low credit risk."
    elif latest_abb >= 100000 and stability_ratio < 0.55:
        category = "Good"
        explanation = "The account demonstrates healthy balance levels and moderate stability."
    elif latest_abb >= 50000 and stability_ratio < 0.8:
        category = "Average"
        explanation = "The account is acceptable, but balance volatility requires monitoring."
    else:
        category = "Risky"
        explanation = "The account shows weak ABB and balance volatility, increasing credit risk."

    return {
        "ABB Status": category,
        "Balance Stability": f"{stability_ratio:.2f}",
        "Liquidity Strength": "Good" if latest_abb and latest_abb >= 100000 else "Weak",
        "Overall Profile": explanation,
    }


def generate_reports(cleaned_df: pd.DataFrame, monthly_abb_table: pd.DataFrame, abb_summary: Dict[str, Optional[float]], output_dir: Path) -> Dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    cleaned_path = output_dir / "cleaned_transactions.xlsx"
    abb_path = output_dir / "abb_report.xlsx"
    monthly_path = output_dir / "monthly_abb_report.xlsx"

    cleaned_df.to_excel(cleaned_path, index=False)

    with pd.ExcelWriter(abb_path, engine="xlsxwriter") as writer:
        pd.DataFrame([abb_summary]).to_excel(writer, sheet_name="ABB Summary", index=False)
        monthly_abb_table.to_excel(writer, sheet_name="Monthly ABB Table", index=False)

    with pd.ExcelWriter(monthly_path, engine="xlsxwriter") as writer:
        monthly_abb_table.to_excel(writer, sheet_name="Monthly ABB Table", index=False)

    return {
        "cleaned": cleaned_path,
        "abb": abb_path,
        "monthly": monthly_path,
    }
