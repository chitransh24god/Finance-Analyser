// JavaScript client-side Credit Suitability & Underwriting Verdict System

/**
 * Evaluates the parsed ledger history and monthly ABB performance to assign underwriting suitability scores.
 */
function analyzeCreditProfileJS(transactions, monthlyAbb, abbSummary) {
    let totalCredits = 0.0;
    let totalDebits = 0.0;
    let minBalance = Infinity;
    let maxBalance = -Infinity;
    let negativeBalCount = 0;

    transactions.forEach(tx => {
        totalCredits += tx.Credit;
        totalDebits += tx.Debit;
        if (tx.Balance < minBalance) minBalance = tx.Balance;
        if (tx.Balance > maxBalance) maxBalance = tx.Balance;
        if (tx.Balance < 0.0) negativeBalCount++;
    });

    if (minBalance === Infinity) minBalance = 0.0;
    if (maxBalance === -Infinity) maxBalance = 0.0;

    const netSavingsRatio = totalDebits > 0 ? totalCredits / totalDebits : 1.5;
    const abb6M = abbSummary.abb_6m;

    // 1. Grade ABB Strength
    let abbGrade = "Risky";
    let abbBadgeClass = "badge-grade-risky";
    if (abb6M >= 100000) {
        abbGrade = "Excellent";
        abbBadgeClass = "badge-grade-excellent";
    } else if (abb6M >= 50000) {
        abbGrade = "Good";
        abbBadgeClass = "badge-grade-good";
    } else if (abb6M >= 15000) {
        abbGrade = "Average";
        abbBadgeClass = "badge-grade-average";
    }

    // 2. Grade Balance Stability (Min balance comparison to average)
    let stabilityGrade = "Average";
    let stabilityBadgeClass = "badge-grade-average";
    const minToAbbRatio = abb6M > 0 ? minBalance / abb6M : 0.0;

    if (negativeBalCount > 2) {
        stabilityGrade = "Risky";
        stabilityBadgeClass = "badge-grade-risky";
    } else if (minBalance >= 15000 && minToAbbRatio >= 0.3) {
        stabilityGrade = "Excellent";
        stabilityBadgeClass = "badge-grade-excellent";
    } else if (minBalance >= 5000 && minToAbbRatio >= 0.15) {
        stabilityGrade = "Good";
        stabilityBadgeClass = "badge-grade-good";
    } else if (negativeBalCount > 0) {
        stabilityGrade = "Risky";
        stabilityBadgeClass = "badge-grade-risky";
    }

    // 3. Grade Liquidity Flow (Credits vs. Debits)
    let liquidityGrade = "Average";
    let liquidityBadgeClass = "badge-grade-average";
    if (netSavingsRatio >= 1.15) {
        liquidityGrade = "Excellent";
        liquidityBadgeClass = "badge-grade-excellent";
    } else if (netSavingsRatio >= 1.02) {
        liquidityGrade = "Good";
        liquidityBadgeClass = "badge-grade-good";
    } else if (netSavingsRatio < 0.90) {
        liquidityGrade = "Risky";
        liquidityBadgeClass = "badge-grade-risky";
    }

    // 4. Overall Underwriting verdict
    let overallGrade = "Average";
    let overallBadgeClass = "badge-grade-average";
    let overallCardClass = "border-amber-200 bg-amber-50/30";
    let verdictText = "";

    const scores = { "Excellent": 4, "Good": 3, "Average": 2, "Risky": 1 };
    const minScore = Math.min(scores[abbGrade], scores[stabilityGrade], scores[liquidityGrade]);

    if (minScore === 4) {
        overallGrade = "Excellent";
        overallBadgeClass = "badge-grade-excellent";
        overallCardClass = "border-green-300 bg-green-50/30 text-green-900";
        verdictText = "CRITICAL VERDICT: Highly recommended for credit approval. The account exhibits robust average daily balances (ABB), exceptional liquidity margins with credit values consistently outpacing debit volumes, and a highly stable ledger with no negative/overdraft marks. Minimum balance levels remain well above institutional thresholds, indicating substantial repayment buffer capacity.";
    } else if (minScore === 3) {
        overallGrade = "Good";
        overallBadgeClass = "badge-grade-good";
        overallCardClass = "border-blue-300 bg-blue-50/30 text-blue-900";
        verdictText = "CRITICAL VERDICT: Recommended for loan approval. The account shows healthy rolling average daily balances, positive cash accumulations, and low ledger volatility. No overdraft events were detected in the statement timeline. The risk profile is clean and aligned with standard consumer lending requirements.";
    } else if (minScore === 2) {
        overallGrade = "Average";
        overallBadgeClass = "badge-grade-average";
        overallCardClass = "border-amber-300 bg-amber-50/30 text-amber-900";
        verdictText = "CRITICAL VERDICT: Borderline credit profile. While average daily balances are satisfactory, the customer exhibits tight cash flow margins (credit-to-debit ratio near parity) or occasional dip indicators. Recommendation is to approve with collateral, require co-signers, or cap the loan amount to reduce credit default exposure.";
    } else {
        overallGrade = "Risky";
        overallBadgeClass = "badge-grade-risky";
        overallCardClass = "border-red-300 bg-red-50/30 text-red-900";
        verdictText = "CRITICAL VERDICT: Deferral recommended due to high credit risk. The statement reveals structural weaknesses: average daily balances fall below threshold margins, or the account shows frequent overdraft events (balances dipping negative), or cash outflows outpace incoming revenues. Repayment capabilities are compromised.";
    }

    return {
        abb_grade: abbGrade,
        abb_badge: abbBadgeClass,
        stability_grade: stabilityGrade,
        stability_badge: stabilityBadgeClass,
        liquidity_grade: liquidityGrade,
        liquidity_badge: liquidityBadgeClass,
        overall_grade: overallGrade,
        overall_badge: overallBadgeClass,
        overall_card: overallCardClass,
        verdict: verdictText,
        metrics: {
            net_ratio: netSavingsRatio.toFixed(2),
            min_bal: minBalance,
            max_bal: maxBalance,
            negative_count: negativeBalCount
        }
    };
}
