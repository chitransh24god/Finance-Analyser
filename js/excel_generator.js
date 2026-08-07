// JavaScript client-side styled Excel Report Generator using ExcelJS

/**
 * Builds, styles, and initiates download of Excel files client-side.
 */
async function downloadReport(reportType = "consolidated_full") {
    if (!state.parsedData) {
        alert("No statement data available to export. Please parse a statement first.");
        return;
    }

    const { metadata, transactions, monthly_abb, abb_summary, assessment, statementsList } = state.parsedData;
    const workbook = new ExcelJS.Workbook();
    let filename = "Consolidated_Financial_Analysis_Report";

    // Style helper values
    const primaryBlue = "FF5E7E";
    const headerFontColor = "FFFFFF";
    const lightZebra = "FFF9FA";
    const fontName = "Segoe UI";

    // SHEET 1: Consolidated Transactions Ledger
    const wsTx = workbook.addWorksheet("Consolidated Ledger");
    wsTx.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Particulars / Description", key: "particulars", width: 48 },
        { header: "Debit (Out ₹)", key: "debit", width: 18 },
        { header: "Credit (In ₹)", key: "credit", width: 18 },
        { header: "Balance (₹)", key: "balance", width: 20 },
        { header: "Statement Source PDF", key: "source", width: 32 }
    ];

    transactions.forEach(tx => {
        wsTx.addRow({
            date: tx.Date,
            particulars: tx.Particulars,
            debit: tx.Debit,
            credit: tx.Credit,
            balance: tx.Balance,
            source: tx.StatementSource || "Statement 1"
        });
    });

    styleTableHeaders(wsTx, primaryBlue, headerFontColor, fontName);
    styleDataGrid(wsTx, [3, 4, 5], fontName, lightZebra);

    // SHEET 2: Monthly ABB Breakdown
    const wsAbb = workbook.addWorksheet("Monthly ABB Analysis");
    wsAbb.columns = [
        { header: "Month Period", key: "month", width: 22 },
        { header: "5th Bal (₹)", key: "bal5", width: 16 },
        { header: "10th Bal (₹)", key: "bal10", width: 16 },
        { header: "15th Bal (₹)", key: "bal15", width: 16 },
        { header: "20th Bal (₹)", key: "bal20", width: 16 },
        { header: "25th Bal (₹)", key: "bal25", width: 16 },
        { header: "Month End (₹)", key: "balEnd", width: 18 },
        { header: "Calculated ABB (₹)", key: "abb", width: 22 }
    ];

    if (monthly_abb && monthly_abb.length > 0) {
        monthly_abb.forEach(row => {
            wsAbb.addRow({
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
    }

    styleTableHeaders(wsAbb, primaryBlue, headerFontColor, fontName);
    styleDataGrid(wsAbb, [2, 3, 4, 5, 6, 7, 8], fontName, lightZebra);

    wsAbb.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            const cell = row.getCell(8);
            cell.font = { name: fontName, size: 10, bold: true, color: { argb: "991B1B" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F3" } };
        }
    });

    // SHEET 3: Credit Risk Suite Verdict & Executive Summary
    const wsRisk = workbook.addWorksheet("Executive Risk Summary");
    wsRisk.columns = [
        { header: "Consolidated Executive Metric", key: "param", width: 36 },
        { header: "Evaluated Result / Value", key: "val", width: 48 }
    ];

    wsRisk.addRow({ param: "Account Holder Name(s)", val: metadata.customer_name });
    wsRisk.addRow({ param: "Account Number(s)", val: metadata.account_number });
    wsRisk.addRow({ param: "Bank Institution(s)", val: metadata.bank_name });
    wsRisk.addRow({ param: "Total Statements Consolidated", val: metadata.statements_count || (statementsList ? statementsList.length : 1) });
    wsRisk.addRow({ param: "Consolidated Period Range", val: `${metadata.start_date} to ${metadata.end_date}` });
    wsRisk.addRow({ param: "1-Month ABB (Latest Month)", val: abb_summary.abb_1m });
    wsRisk.addRow({ param: "3-Month Rolling ABB", val: abb_summary.abb_3m });
    wsRisk.addRow({ param: "6-Month Rolling ABB", val: abb_summary.abb_6m });
    wsRisk.addRow({ param: "OVERALL CREDIT RATING", val: `${assessment.overall_grade} (${assessment.abb_grade})` });
    wsRisk.addRow({ param: "ESTIMATED LOAN ELIGIBILITY (12x ABB)", val: abb_summary.abb_6m * 12 });
    wsRisk.addRow({ param: "UNDERWRITING DIRECTIVE VERDICT", val: assessment.verdict });

    styleTableHeaders(wsRisk, primaryBlue, headerFontColor, fontName);

    wsRisk.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            const cellParam = row.getCell(1);
            const cellVal = row.getCell(2);
            
            cellParam.font = { name: fontName, size: 10, bold: true };
            cellVal.font = { name: fontName, size: 10 };
            
            row.eachCell(cell => {
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'F3E8EE' } }
                };
            });

            if ([6, 7, 8, 10].includes(rowNumber)) {
                cellVal.numFmt = '"₹"#,##0.00';
                cellVal.font = { name: fontName, size: 10, bold: true };
            }

            if (rowNumber === 9) {
                cellVal.font = { name: fontName, size: 11, bold: true, color: { argb: "991B1B" } };
                cellVal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F3" } };
            }
            if (rowNumber === 11) {
                cellVal.font = { name: fontName, size: 9.5, italic: true };
                row.height = 36;
                cellVal.alignment = { wrapText: true, vertical: 'middle' };
            }
        }
    });

    // SHEET 4: Individual Statements Breakdown (if multi-statement)
    if (statementsList && statementsList.length > 0) {
        const wsBreakdown = workbook.addWorksheet("Statements Breakdown");
        wsBreakdown.columns = [
            { header: "Uploaded PDF File Name", key: "file", width: 35 },
            { header: "Detected Bank Name", key: "bank", width: 25 },
            { header: "Account Number", key: "acc", width: 22 },
            { header: "Extracted Transactions Count", key: "count", width: 28 }
        ];

        statementsList.forEach(st => {
            wsBreakdown.addRow({
                file: st.filename,
                bank: st.metadata.bank_name || "Auto-Detected",
                acc: st.metadata.account_number || "N/A",
                count: st.rawTransactions ? st.rawTransactions.length : 0
            });
        });

        styleTableHeaders(wsBreakdown, primaryBlue, headerFontColor, fontName);
        styleDataGrid(wsBreakdown, [4], fontName, lightZebra);
    }

    // Write file to buffer and trigger download
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

            if (isEven) {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: zebraColor }
                };
            }

            cell.border = {
                bottom: { style: "thin", color: { argb: "F1F5F9" } }
            };

            if (numericColIndexes.includes(colNumber)) {
                cell.alignment = { horizontal: "right", vertical: "middle" };
                cell.numFmt = '"₹"#,##0.00';
            } else {
                cell.alignment = { horizontal: "left", vertical: "middle" };
            }
        });
    });
}

function exportExcel() {
    if (typeof downloadReport === "function") {
        downloadReport("consolidated_full");
    } else {
        alert("Excel generator module loading...");
    }
}
