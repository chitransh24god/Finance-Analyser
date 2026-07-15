// JavaScript client-side implementation of ABB (Average Daily Balance) Carry-Forward & Rollback Calculator

/**
 * Computes monthly and rolling ABB from sorted ledger transactions.
 */
function calculateMonthlyAbbJS(transactions, startDateStr, endDateStr) {
    if (transactions.length === 0) {
        return { monthly_abb: [], abb_summary: { abb_1m: 0, abb_3m: 0, abb_6m: 0 } };
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    // 1. Create a day-by-day mapping of ledger balances
    const ledgerBalances = {};
    transactions.forEach(tx => {
        // Since transactions are sorted, this naturally keeps the last transaction's balance for each date
        ledgerBalances[tx.Date] = tx.Balance;
    });

    // 2. Daily carry-forward / rollback loop to fill all calendar dates
    const dailyBalances = {};
    let lastKnownBalance = null;

    // Find first available transaction balance in statement to use for rollback initialization
    const firstTxBalance = transactions[0].Balance;

    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + dayOffset);
        const dateStr = currentDate.toISOString().split('T')[0];

        if (ledgerBalances[dateStr] !== undefined) {
            dailyBalances[dateStr] = ledgerBalances[dateStr];
            lastKnownBalance = ledgerBalances[dateStr];
        } else {
            if (lastKnownBalance !== null) {
                // Carry forward last available ledger balance
                dailyBalances[dateStr] = lastKnownBalance;
            } else {
                // Rollback: no transaction has occurred yet, look forward to first transaction balance
                dailyBalances[dateStr] = firstTxBalance;
            }
        }
    }

    // 3. Group dates by Month & Year, and extract balances for target dates (5th, 10th, 15th, 20th, 25th, Month End)
    const monthlyGroups = {}; // Key: "YYYY-MM"

    Object.keys(dailyBalances).forEach(dateStr => {
        const date = new Date(dateStr);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;

        if (!monthlyGroups[key]) {
            monthlyGroups[key] = [];
        }
        monthlyGroups[key].push({
            dateStr: dateStr,
            day: date.getDate(),
            balance: dailyBalances[dateStr]
        });
    });

    const monthlyAbbList = [];

    Object.keys(monthlyGroups).sort().forEach(monthKey => {
        const dayList = monthlyGroups[monthKey].sort((a, b) => a.day - b.day);
        
        // Find month end
        const monthEndDay = dayList[dayList.length - 1];

        // Find closest balances for target dates (5, 10, 15, 20, 25, monthEnd)
        const getBalForDay = (targetDay) => {
            const match = dayList.find(d => d.day === targetDay);
            if (match) return match.balance;
            // If the statement period cuts off before the target day (e.g. statement ends on May 24th),
            // return the last day's balance
            if (targetDay > monthEndDay.day) {
                return monthEndDay.balance;
            }
            // Otherwise, get closest preceding day's balance
            let closest = dayList[0];
            for (const d of dayList) {
                if (d.day <= targetDay && d.day > closest.day) {
                    closest = d;
                }
            }
            return closest.balance;
        };

        const bal5 = getBalForDay(5);
        const bal10 = getBalForDay(10);
        const bal15 = getBalForDay(15);
        const bal20 = getBalForDay(20);
        const bal25 = getBalForDay(25);
        const balEnd = monthEndDay.balance;

        const sum = bal5 + bal10 + bal15 + bal20 + bal25 + balEnd;
        const abb = sum / 6.0;

        // Month Display Name (e.g., "September 2025")
        const dateObj = new Date(monthKey + "-02"); // Add offset to avoid timezone shifts
        const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        monthlyAbbList.push({
            monthKey: monthKey,
            monthName: monthName,
            bal5: bal5,
            bal10: bal10,
            bal15: bal15,
            bal20: bal20,
            bal25: bal25,
            balEnd: balEnd,
            abb: abb
        });
    });

    // 4. Compute rolling averages (1M, 3M, 6M)
    const count = monthlyAbbList.length;
    let abb_1m = 0.0;
    let abb_3m = 0.0;
    let abb_6m = 0.0;

    if (count > 0) {
        abb_1m = monthlyAbbList[count - 1].abb;
        
        // 3M
        const slice3 = monthlyAbbList.slice(Math.max(0, count - 3));
        abb_3m = slice3.reduce((sum, item) => sum + item.abb, 0.0) / slice3.length;
        
        // 6M
        const slice6 = monthlyAbbList.slice(Math.max(0, count - 6));
        abb_6m = slice6.reduce((sum, item) => sum + item.abb, 0.0) / slice6.length;
    }

    return {
        monthly_abb: monthlyAbbList,
        abb_summary: {
            abb_1m: abb_1m,
            abb_3m: abb_3m,
            abb_6m: abb_6m
        }
    };
}
