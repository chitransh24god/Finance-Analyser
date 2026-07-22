from typing import Any, Dict, List

import pandas as pd


def validate_statement(cleaned_df: pd.DataFrame, metadata: Dict[str, Any], monthly_abb_table: pd.DataFrame) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    if cleaned_df.empty:
        errors.append("No transactions were extracted from the statement.")
        return {"valid": False, "errors": errors, "warnings": warnings}

    required_columns = ["Date", "Balance"]
    missing_columns = [col for col in required_columns if col not in cleaned_df.columns]
    if missing_columns:
        errors.append(f"Missing required columns: {', '.join(missing_columns)}.")

    if not pd.api.types.is_datetime64_any_dtype(cleaned_df["Date"]):
        errors.append("Transaction dates are not parsed correctly.")

    invalid_dates = cleaned_df[cleaned_df["Date"].dt.year < 2020]
    if not invalid_dates.empty:
        errors.append("Statement contains dates earlier than 2020.")

    invalid_ratio = len(invalid_dates) / max(len(cleaned_df), 1)
    if invalid_ratio > 0.2:
        errors.append("More than 20% of extracted dates are invalid.")

    if metadata.get("statement_period_days") and metadata["statement_period_days"] > 500:
        errors.append("Statement period exceeds 500 days.")

    if monthly_abb_table["Monthly ABB"].dropna().empty:
        errors.append("ABB could not be calculated for any month.")

    if any(value is not None and value < 0 for value in [metadata.get("latest_abb")]):
        errors.append("Latest ABB is negative.")

    if errors:
        return {"valid": False, "errors": errors, "warnings": warnings}

    if metadata.get("customer_name") is None or metadata.get("customer_name") == "Not Available":
        warnings.append("Customer name could not be extracted.")

    return {"valid": True, "errors": errors, "warnings": warnings}
