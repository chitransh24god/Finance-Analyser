// JavaScript client-side styled Excel Report Generator using ExcelJS

/**
 * Builds, styles, and initiates download of Excel files client-side.
 */
async function downloadReport(reportType) {
    if (!state.parsedData) {
        alert("No statement data available to export. Please parse a statement first.");
        return;
    }

    const { metadata, transactions, monthly_abb, abb_summary, assessment } = state.parsedData;
    const workbook = new ExcelJS.Workbook();
    let filename = "";

    // Style helper values
    const primaryBlue = "2563EB";
    const headerFontColor = "FFFFFF";
    const lightZebra = "F9FAFB";
    const fontName = "Segoe UI";

    if (reportType === "cleaned_transactions") {
        filename = "Cleaned_Transactions_Log";
        const ws = workbook.addWorksheet("Transactions");
        
        // Setup column headers
        ws.columns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Particulars", key: "particulars", width: 45 },
            { header: "Debit (₹)", key: "debit", width: 18 },
            { header: "Credit (₹)", key: "credit", width: 18 },
            { header: "Balance (₹)", key: "balance", width: 20 }
        ];

        // Add transaction data rows
        transactions.forEach(tx => {
            ws.addRow({
                date: tx.Date,
                particulars: tx.Particulars,
                debit: tx.Debit,
                credit: tx.Credit,
                balance: tx.Balance
            });
        });

        // Apply Styles
        styleTableHeaders(ws, primaryBlue, headerFontColor, fontName);
        styleDataGrid(ws, [3, 4, 5], fontName, lightZebra);

    } else if (reportType === "monthly_abb") {
        filename = "Monthly_ABB_Report";
        const ws = workbook.addWorksheet("Monthly ABB Breakdown");

        ws.columns = [
            { header: "Month Period", key: "month", width: 22 },
            { header: "5th Bal (₹)", key: "bal5", width: 16 },
            { header: "10th Bal (₹)", key: "bal10", width: 16 },
            { header: "15th Bal (₹)", key: "bal15", width: 16 },
            { header: "20th Bal (₹)", key: "bal20", width: 16 },
            { header: "25th Bal (₹)", key: "bal25", width: 16 },
            { header: "Month End (₹)", key: "balEnd", width: 18 },
            { header: "Calculated ABB (₹)", key: "abb", width: 22 }
        ];

        monthly_abb.forEach(row => {
            ws.addRow({
                month: row.monthName,
                bal5: row.bal5,
                bal10: row.bal10,
                bal15: row.bal15,
                bal20: row.bal20,
                bal25: row.bal25,
                balEnd: row.balEnd,
                abb: row.abb
            });
        });

        styleTableHeaders(ws, primaryBlue, headerFontColor, fontName);
        styleDataGrid(ws, [2, 3, 4, 5, 6, 7, 8], fontName, lightZebra);

        // Highlight ABB target column
        ws.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const cell = row.getCell(8);
                cell.font = { name: fontName, size: 10, bold: true, color: { argb: "1E3A8A" } };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EFF6FF" } };
            }
        });

    } else if (reportType === "overall_abb") {
        filename = "Rolling_ABB_Summary";
        const ws = workbook.addWorksheet("ABB Rolling Summary");

        ws.columns = [
            { header: "Rolling Period Metrical Type", key: "type", width: 32 },
            { header: "Calculated ABB Value (₹)", key: "value", width: 28 }
        ];

        ws.addRow({ type: "1-Month ABB (Latest Month)", value: abb_summary.abb_1m });
        ws.addRow({ type: "3-Month Rolling Average Daily Balance", value: abb_summary.abb_3m });
        ws.addRow({ type: "6-Month Rolling Average Daily Balance", value: abb_summary.abb_6m });

        styleTableHeaders(ws, primaryBlue, headerFontColor, fontName);
        styleDataGrid(ws, [2], fontName, lightZebra);

        // Make amounts prominent
        ws.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.getCell(2).font = { name: fontName, size: 11, bold: true, color: { argb: "2563EB" } };
            }
        });

    } else if (reportType === "loan_assessment") {
        filename = "Credit_Underwriting_Report";
        const ws = workbook.addWorksheet("Credit Suite Verdict");

        // Set columns
        ws.columns = [
            { header: "Risk Parameter Category", key: "param", width: 32 },
            { header: "Underwriting Score / Value", key: "val", width: 45 }
        ];

        ws.addRow({ param: "Bank Identity Name", val: metadata.bank_name });
        ws.addRow({ param: "Account Number Checked", val: metadata.account_number });
        ws.addRow({ param: "Customer Primary Name", val: metadata.customer_name });
        ws.addRow({ param: "Calculated 6-Month ABB", val: abb_summary.abb_6m });
        ws.addRow({ param: "Liquidity Ratio (Credits/Debits)", val: assessment.metrics.net_ratio });
        ws.addRow({ param: "Lowest Ledger Balance Event", val: assessment.metrics.min_bal });
        ws.addRow({ param: "Overdraft / Negative Balance Days", val: assessment.metrics.negative_count });
        ws.addRow({ param: "ABB Strength Grade", val: assessment.abb_grade });
        ws.addRow({ param: "Ledger Stability Grade", val: assessment.stability_grade });
        ws.addRow({ param: "Liquidity Flow Verdict", val: assessment.liquidity_grade });
        ws.addRow({ param: "OVERALL UNDERWRITING RATING", val: assessment.overall_grade });
        ws.addRow({ param: "ANALYST VERDICT DIRECTIVE", val: assessment.verdict });

        styleTableHeaders(ws, primaryBlue, headerFontColor, fontName);
        
        // Style specific cell structures for description and verdict layouts
        ws.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const cellParam = row.getCell(1);
                const cellVal = row.getCell(2);
                
                cellParam.font = { name: fontName, size: 10, bold: true };
                cellVal.font = { name: fontName, size: 10 };
                
                // Borders
                row.eachCell(cell => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'E5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'E5E7EB' } }
                    };
                });

                // Apply currency formatting to numeric values
                if ([4, 6].includes(rowNumber)) {
                    cellVal.numFmt = '"₹"#,##0.00';
                    cellVal.font = { name: fontName, size: 10, bold: true };
                }

                // Make Overall rating and Verdict bold
                if (rowNumber === 11) {
                    cellVal.font = { name: fontName, size: 11, bold: true, color: { argb: "1E3A8A" } };
                    cellVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "EFF6FF" } };
                }
                if (rowNumber === 12) {
                    cellVal.font = { name: fontName, size: 9, italic: true };
                    row.height = 40; // Expand for wrapping verdict text
                    cellVal.alignment = { wrapText: true, vertical: 'middle' };
                }
            }
        });
    }

    // Write file to buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.xlsx`;
    link.click();
}

// Helper: Style column headers
function styleTableHeaders(ws, bgColor, fontColor, fontName) {
    ws.getRow(1).height = 28;
    ws.getRow(1).eachCell(cell => {
        cell.font = {
            name: fontName,
            size: 10,
            bold: true,
            color: { argb: fontColor }
        };
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: bgColor }
        };
        cell.alignment = {
            horizontal: "left",
            vertical: "middle"
        };
    });
}

// Helper: Apply zebra backgrounds, borders, alignments, and formats
function styleDataGrid(ws, numericColIndexes, fontName, zebraColor) {
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip headers
        row.height = 20;

        const isEven = rowNumber % 2 === 0;

        row.eachCell((cell, colNumber) => {
            cell.font = {
                name: fontName,
                size: 9.5
            };

            // Zebra backgrounds
            if (isEven) {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: zebraColor }
                };
            }

            // Cell borders
            cell.border = {
                bottom: { style: "thin", color: { argb: "F1F5F9" } }
            };

            // Format numbers to currency and right-align
            if (numericColIndexes.includes(colNumber)) {
                cell.alignment = { horizontal: "right", vertical: "middle" };
                cell.numFmt = '"₹"#,##0.00';
            } else {
                cell.alignment = { horizontal: "left", vertical: "middle" };
            }
        });
    });
}
