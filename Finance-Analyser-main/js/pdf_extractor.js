// Client-side PDF Statement Extractor using PDF.js

/**
 * Loads a PDF file and extracts text + coordinates page-by-page.
 */
async function extractTextAndLayoutFromPdf(arrayBuffer, password = "") {
    let pdfDoc = null;
    try {
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            password: password
        });
        pdfDoc = await loadingTask.promise;
    } catch (err) {
        if (err.name === "PasswordException") {
            throw new Error("password"); // Prompt user for key
        }
        throw err;
    }

    const pagesData = [];
    let fullText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageItems = textContent.items.map(item => {
            // transform matrix [a, b, c, d, tx, ty]
            // tx = x coordinate (horizontal position)
            // ty = y coordinate (vertical position, usually starts at bottom of page)
            return {
                text: item.str,
                x0: item.transform[4],
                y0: item.transform[5],
                width: item.width,
                height: item.height
            };
        });

        // Group into lines by vertical coordinate
        const linesDict = {};
        pageItems.forEach(item => {
            const y = item.y0;
            let found = false;
            for (const lineY of Object.keys(linesDict)) {
                if (Math.abs(parseFloat(lineY) - y) < 4.0) {
                    linesDict[lineY].push(item);
                    found = true;
                    break;
                }
            }
            if (!found) {
                linesDict[y] = [item];
            }
        });

        const sortedTops = Object.keys(linesDict).sort((a, b) => parseFloat(b) - parseFloat(a));
        const structuredLines = [];

        sortedTops.forEach(top => {
            const lineItems = linesDict[top].sort((a, b) => a.x0 - b.x0);
            structuredLines.push({
                top: parseFloat(top),
                items: lineItems,
                lineText: lineItems.map(item => item.text).join(" ")
            });
        });

        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";

        pagesData.push({
            pageNumber: i,
            items: pageItems,
            lines: structuredLines,
            text: pageText
        });
    }

    return {
        fullText,
        pages: pagesData
    };
}

/**
 * Detects bank type and routes to the matching parser.
 */
async function routeAndExtractTransactions(pdfData, filename, selectedBank = "auto") {
    const filenameLower = filename.toLowerCase();
    const textLower = pdfData.fullText.toLowerCase();
    
    let bankName = "Generic / Unrecognized";
    let parser = parseGeneric;

    if (selectedBank && selectedBank !== "auto") {
        if (selectedBank === "axis") {
            bankName = "Axis Bank";
            parser = parseAxis;
        } else if (selectedBank === "canara") {
            bankName = "Canara Bank";
            parser = parseCanara;
        } else if (selectedBank === "hdfc") {
            bankName = "HDFC Bank";
            parser = parseHdfc;
        } else if (selectedBank === "icici") {
            bankName = "ICICI Bank";
            parser = parseIcici;
        } else if (selectedBank === "idfc") {
            bankName = "IDFC First Bank";
            parser = parseIdfc;
        } else if (selectedBank === "kalupur") {
            bankName = "Kalupur Cooperative Bank";
            parser = parseKalupur;
        } else if (selectedBank === "sbi") {
            bankName = "SBI Bank";
            parser = parseSbi;
        } else if (selectedBank === "yes") {
            bankName = "Yes Bank";
            parser = parseYes;
        }
    } else {
        // Route Bank formats automatically
        if (filenameLower.includes("hdfc") || textLower.includes("hdfc bank") || textLower.includes("hdfcbank")) {
            bankName = "HDFC Bank";
            parser = parseHdfc;
        } else if (filenameLower.includes("icici") || filenameLower.includes("ic bank") || textLower.includes("icici bank") || textLower.includes("icic")) {
            bankName = "ICICI Bank";
            parser = parseIcici;
        } else if (filenameLower.includes("sbi") || filenameLower.includes("state bank") || textLower.includes("state bank of india") || textLower.includes("sbi")) {
            bankName = "SBI Bank";
            parser = parseSbi;
        } else if (filenameLower.includes("axis") || filenameLower.includes("axix") || textLower.includes("axis bank") || textLower.includes("axis account")) {
            bankName = "Axis Bank";
            parser = parseAxis;
        } else if (filenameLower.includes("idfc") || textLower.includes("idfc")) {
            bankName = "IDFC First Bank";
            parser = parseIdfc;
        } else if (filenameLower.includes("yes bank") || filenameLower.includes("yes_bank") || textLower.includes("yes bank") || textLower.includes("yesbank")) {
            bankName = "Yes Bank";
            parser = parseYes;
        } else if (filenameLower.includes("canara") || textLower.includes("canara bank") || textLower.includes("canara")) {
            bankName = "Canara Bank";
            parser = parseCanara;
        } else if (filenameLower.includes("kalupur") || textLower.includes("kalupur")) {
            bankName = "Kalupur Cooperative Bank";
            parser = parseKalupur;
        }
    }

    console.log(`Routing ${filename} to ${bankName} parser.`);
    
    // Extract metadata & transaction lists
    const metadata = extractMetadata(pdfData.fullText, bankName);
    const rawTransactions = parser(pdfData);

    // If metadata dates are missing, fallback to transaction bounds
    if (rawTransactions.length > 0) {
        rawTransactions.sort((a, b) => new Date(a.Date) - new Date(b.Date));
        if (metadata.start_date === "Not Available") {
            metadata.start_date = rawTransactions[0].Date;
        }
        if (metadata.end_date === "Not Available") {
            metadata.end_date = rawTransactions[rawTransactions.length - 1].Date;
        }
    }

    return {
        metadata,
        rawTransactions
    };
}

// ==========================================
// METADATA PARSER RULES
// ==========================================
function extractMetadata(text, bankName) {
    const meta = {
        customer_name: "Not Available",
        account_number: "Not Available",
        start_date: "Not Available",
        end_date: "Not Available",
        bank_name: bankName
    };

    // 1. Account Number
    let accMatch = text.match(/(?:Account\s*No|Account\s*Number|A\/C\s*No|A\/c\s*Number|Account No\s*:|Account Number\s*:)[:\s]*([0-9A-Za-z]{8,20})/i);
    if (!accMatch) {
        accMatch = text.match(/Statement of (?:Axis )?Account No\s*:?\s*([0-9]{8,20})/i);
    }
    if (accMatch) meta.account_number = accMatch[1].trim();

    // 2. Date Range
    let periodMatch = text.match(/From\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})\s*To\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
    if (!periodMatch) {
        periodMatch = text.match(/Period\s*:\s*(\d{2}-[A-Za-z]{3}-\d{4})\s*to\s*(\d{2}-[A-Za-z]{3}-\d{4})/i);
    }
    if (!periodMatch) {
        periodMatch = text.match(/Period\s*:\s*(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})/i);
    }
    if (!periodMatch) {
        periodMatch = text.match(/Statement Period\s*:?\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i);
    }
    if (!periodMatch) {
        periodMatch = text.match(/From\s*(\d{2}[-\/]\d{2}[-\/]\d{4})\s*To\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
    }
    if (periodMatch) {
        meta.start_date = standardizeDate(periodMatch[1]);
        meta.end_date = standardizeDate(periodMatch[2]);
    }

    // 3. Customer Name
    // Rule A: Explicit Name / Account Name / Customer Name labels
    let nameMatch = text.match(/(?:Account\s*Name|Customer\s*Name|A\/c\s*Name)[:\s]+([A-Za-z0-9\s\.\,\&\-]+?)(?:\r?\n|Account|Branch|Statement|Phone|$)/i);
    if (!nameMatch) {
        nameMatch = text.match(/Statement of Transactions in (?:the Account of )?([A-Za-z0-9\s\.\,\&\-]+?)(?: for the period| from|$)/i);
    }
    if (!nameMatch) {
        nameMatch = text.match(/(?:^|\n)(?!Branch\s*Name)Name\s*:?\s*([A-Za-z0-9\s\-\&]{4,40})(?:\s*Phone|\s*Product|\s*Branch|\n|$)/i);
    }
    if (!nameMatch) {
        nameMatch = text.match(/(?:MR|MRS|MS|M\/S)\s+([A-Z\s]{4,30})/);
    }

    if (nameMatch) {
        let cand = nameMatch[1] ? nameMatch[1].trim() : nameMatch[0].trim();
        if (cand && cand.length >= 3 && !/transaction|statement|account|balance|opening|closing/i.test(cand)) {
            meta.customer_name = cand;
        }
    }

    // Rule B: Page 1 Header text before Customer ID / Joint Holder / Account Details
    if (meta.customer_name === "Not Available") {
        const page1Text = text.split("\n").slice(0, 20);
        for (let j = 0; j < page1Text.length; j++) {
            const line = page1Text[j].trim();
            if (line.includes("Joint Holder")) {
                const parts = line.split(/Joint\s*Holder/i);
                if (parts[0].trim().length >= 3) {
                    meta.customer_name = parts[0].trim();
                    break;
                } else if (j > 0 && page1Text[j-1].trim().length >= 3 && !/statement|report|account/i.test(page1Text[j-1])) {
                    meta.customer_name = page1Text[j-1].trim();
                    break;
                }
            }
            if (/Customer ID|IFSC Code|MICR Code|Scheme|Nominee/i.test(line)) {
                for (let k = 0; k < j; k++) {
                    const cand = page1Text[k].trim();
                    if (cand.length >= 3 && cand.length <= 50 && !/axis|bank|statement|account|flat|wing|road|thane|maharashtra|building|street/i.test(cand) && !/\d{5,}/.test(cand)) {
                        meta.customer_name = cand;
                        break;
                    }
                }
                if (meta.customer_name !== "Not Available") break;
            }
        }
    }

    // Rule C: Line before "ADDRESS" ONLY if it's on page 1 header (< 50 chars, no transaction keywords/dates)
    if (meta.customer_name === "Not Available") {
        const headerLines = text.split("\n").slice(0, 25).map(l => l.trim()).filter(l => l.length > 0);
        for (let j = 0; j < headerLines.length; j++) {
            if (headerLines[j].includes("ADDRESS") && !headerLines[j].includes("BRANCH ADDRESS")) {
                if (j > 0) {
                    const cand = headerLines[j-1];
                    if (cand.length >= 3 && cand.length <= 50 && !/\d{2}[-\/]\d{2}[-\/]\d{4}/.test(cand) && !/transaction|balance|opening|closing/i.test(cand)) {
                        meta.customer_name = cand;
                        break;
                    }
                }
            }
        }
    }

    return meta;
}

// Helper: Standardize date to YYYY-MM-DD
function standardizeDate(dateStr) {
    if (!dateStr) return "";
    const cleanStr = dateStr.trim();
    
    const formats = [
        { regex: /^\d{2}\/\d{2}\/\d{4}$/, parse: s => s.split("/").reverse().join("-") }, // DD/MM/YYYY
        { regex: /^\d{2}\/\d{2}\/\d{2}$/, parse: s => {
            const parts = s.split("/");
            return `20${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YY
        }},
        { regex: /^\d{2}-[A-Za-z]{3}-\d{4}$/, parse: s => {
            const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
            const parts = s.split("-");
            const mm = months[parts[1].toLowerCase()] || "01";
            return `${parts[2]}-${mm}-${parts[0]}`; // DD-Mmm-YYYY
        }},
        { regex: /^\d{2}\.[\d]{2}\.[\d]{4}$/, parse: s => s.split(".").reverse().join("-") } // DD.MM.YYYY
    ];

    for (const fmt of formats) {
        if (fmt.regex.test(cleanStr)) {
            return fmt.parse(cleanStr);
        }
    }
    // Final fallback: try standard browser parsing
    try {
        const d = new Date(cleanStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch(e) {}
    
    return "";
}

// Helper: Parse amount string (clean commas, handles Dr/Cr indicator)
function cleanAmountJS(val) {
    if (val === null || val === undefined) return 0.0;
    let valStr = String(val).trim().replace(/,/g, "");
    if (!valStr || valStr === "." || valStr === "-") return 0.0;
    
    const isDr = valStr.toLowerCase().includes("dr");
    const isCr = valStr.toLowerCase().includes("cr");
    const hasNeg = valStr.includes("-") || (valStr.includes("(") && valStr.includes(")"));
    
    let cleaned = valStr.replace(/[^\d\.]/g, "");
    if (!cleaned) return 0.0;
    
    let amount = parseFloat(cleaned) || 0.0;
    if (hasNeg || isDr) {
        amount = -amount;
    }
    return amount;
}

// ==========================================
// BANK-SPECIFIC PARSER RULES (HDFC, ICICI, etc.)
// ==========================================

// 1. HDFC Parser
function parseHdfc(pdfData) {
    const transactions = [];
    
    // Check savings account structure
    let isSavings = false;
    if (pdfData.pages[0] && pdfData.pages[0].text) {
        const text = pdfData.pages[0].text.toLowerCase().replace(/\s/g, "");
        if (text.includes("closingbalance") && text.includes("withdrawalamt")) {
            isSavings = true;
        }
    }

    if (isSavings) {
        console.log("Parsing HDFC Savings statement via coordinate bounds.");
        pdfData.pages.forEach(page => {
            let currentTx = null;
            
            page.lines.forEach(line => {
                if (line.top < 80 || line.top > 780) return;
                
                const dateWords = [];
                const narrationWords = [];
                const refWords = [];
                const valWords = [];
                const withWords = [];
                const depWords = [];
                const balWords = [];

                line.items.forEach(item => {
                    const x = item.x0;
                    if (x >= 30 && x < 65) dateWords.push(item.text);
                    else if (x >= 65 && x < 270) narrationWords.push(item.text);
                    else if (x >= 270 && x < 355) refWords.push(item.text);
                    else if (x >= 355 && x < 395) valWords.push(item.text);
                    else if (x >= 395 && x < 480) withWords.push(item.text);
                    else if (x >= 480 && x < 560) depWords.push(item.text);
                    else if (x >= 560 && x < 630) balWords.push(item.text);
                });

                const dateStr = dateWords.join(" ").trim();
                const narrationStr = narrationWords.join(" ").trim();
                const refStr = refWords.join(" ").trim();
                const valStr = valWords.join(" ").trim();
                const withStr = withWords.join(" ").trim();
                const depStr = depWords.join(" ").trim();
                const balStr = balWords.join(" ").trim();

                if (dateStr && /^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
                    if (currentTx) transactions.push(currentTx);
                    currentTx = {
                        Date: standardizeDate(dateStr),
                        Particulars: narrationStr,
                        Debit: cleanAmountJS(withStr),
                        Credit: cleanAmountJS(depStr),
                        Balance: cleanAmountJS(balStr)
                    };
                } else {
                    if (currentTx && narrationStr) {
                        currentTx.Particulars += " " + narrationStr;
                    }
                }
            });
            if (currentTx) transactions.push(currentTx);
        });
        return transactions;
    } else {
        console.log("Parsing HDFC Corporate statement via strict regex delta.");
        const dateRegex = /(\d{2}\-[A-Za-z]{3}\-\d{2,4})/g;
        return parseViaRegex(pdfData, dateRegex);
    }
}

// 2. ICICI Parser
function parseIcici(pdfData) {
    console.log("Parsing ICICI statement via strict regex delta.");
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\-[A-Za-z]{3}\-\d{2,4})|(\d{1,2}\/[A-Za-z]{3}\/\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 3. SBI Parser (Handles split dates)
function parseSbi(pdfData) {
    console.log("Parsing SBI statement via split date spatial coordinates.");
    const dateCol = 0;
    const colSplits = [65]; // Only need Date split to collect date anchors
    
    const transactions = [];
    const dateElementRegex = /^\d{1,2}\s+[A-Za-z]{3}$|^\d{1,2}$|^[A-Za-z]{3}$|^\d{4}$/;
    
    pdfData.pages.forEach(page => {
        const words = page.items.map(item => ({
            x: item.x0,
            y: item.y0,
            text: item.text.trim()
        })).filter(w => w.text.length > 0);
        
        words.sort((a, b) => b.y - a.y || a.x - b.x);
        
        const dateAnchors = [];
        words.forEach(w => {
            if (w.x < colSplits[0] && dateElementRegex.test(w.text)) {
                dateAnchors.push(w);
            }
        });
        
        dateAnchors.sort((a, b) => b.y - a.y);
        
        const validAnchors = [];
        let currentAnchor = null;
        dateAnchors.forEach(w => {
            const isYear = /^\d{4}$/.test(w.text);
            if (isYear) {
                if (currentAnchor && !currentAnchor.hasYear && Math.abs(currentAnchor.y - w.y) < 18.0) {
                    currentAnchor.text += " " + w.text;
                    currentAnchor.hasYear = true;
                }
            } else {
                if (currentAnchor) {
                    validAnchors.push(currentAnchor);
                }
                currentAnchor = {
                    y: w.y,
                    text: w.text,
                    hasYear: false
                };
            }
        });
        if (currentAnchor) {
            validAnchors.push(currentAnchor);
        }
        
        const parsedAnchors = [];
        validAnchors.forEach(anchor => {
            const parsed = standardizeDate(anchor.text);
            if (parsed) {
                parsedAnchors.push({ y: anchor.y, date: parsed });
            }
        });
        
        parsedAnchors.sort((a, b) => b.y - a.y);
        if (parsedAnchors.length === 0) return;
        
        const rowBounds = [];
        for (let idx = 0; idx < parsedAnchors.length; idx++) {
            const anchor = parsedAnchors[idx];
            const yTop = anchor.y;
            const yBottom = (idx === parsedAnchors.length - 1) ? 40.0 : parsedAnchors[idx + 1].y;
            rowBounds.push({
                date: anchor.date,
                yMin: yBottom + 4.0,
                yMax: yTop + 8.0
            });
        }
        
        const pageRows = rowBounds.map(rb => ({
            date: rb.date,
            words: [],
            yMin: rb.yMin,
            yMax: rb.yMax
        }));
        
        words.forEach(w => {
            if (/opening balance|statement|particulars/i.test(w.text)) return;
            
            for (let rIdx = 0; rIdx < pageRows.length; rIdx++) {
                const r = pageRows[rIdx];
                if (w.y >= r.yMin && w.y < r.yMax) {
                    r.words.push(w);
                    break;
                }
            }
        });
        
        pageRows.forEach(r => {
            const rowWords = r.words;
            rowWords.sort((a, b) => a.x - b.x);
            
            // Reconstruct wrapped/split decimal digits
            for (let i = 0; i < rowWords.length; i++) {
                const w1 = rowWords[i];
                const text1 = w1.text.trim();
                if (/\.\d$/.test(text1)) {
                    for (let j = 0; j < rowWords.length; j++) {
                        const w2 = rowWords[j];
                        const text2 = w2.text.trim();
                        if (/^\d$/.test(text2)) {
                            if (w2.x > w1.x && w2.y < w1.y && (w2.x - w1.x) < 70.0) {
                                w1.text = text1 + text2;
                                w2.text = "";
                                break;
                            }
                        }
                    }
                }
            }
            
            // Filter words into description text and numbers
            const descWords = [];
            const numbers = [];
            
            rowWords.forEach(w => {
                const text = w.text.trim();
                if (!text) return;
                
                const isNum = /^-?[\d,\.]+$/.test(text);
                const yearStr = r.date.split("-")[0];
                const isDateYearOrMonthName = (text === yearStr) || 
                    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].includes(text);
                    
                if (isNum && !isDateYearOrMonthName) {
                    numbers.push(w);
                } else {
                    if (!["Debit", "Credit", "Balance", "Txn", "Value", "Date", "Description", "Ref", "No./Cheque", "Branch", "Code", "/"].includes(text)) {
                        descWords.push(w);
                    }
                }
            });
            
            let debitVal = 0.0;
            let creditVal = 0.0;
            let balanceVal = 0.0;
            
            numbers.sort((a, b) => a.x - b.x);
            const validNums = numbers.filter(n => cleanAmountJS(n.text) > 0 || n.text.includes("."));
            
            if (validNums.length >= 1) {
                const balNode = validNums[validNums.length - 1];
                balanceVal = cleanAmountJS(balNode.text);
                
                if (validNums.length >= 2) {
                    const amountNode = validNums[validNums.length - 2];
                    const amountVal = cleanAmountJS(amountNode.text);
                    const endX = amountNode.x + amountNode.text.trim().length * 5.5;
                    
                    if (endX < 435) {
                        debitVal = amountVal;
                    } else {
                        creditVal = amountVal;
                    }
                }
            }
            
            const particulars = descWords.map(w => w.text).join(" ").trim();
            
            transactions.push({
                Date: r.date,
                Particulars: particulars,
                Debit: debitVal,
                Credit: creditVal,
                Balance: balanceVal
            });
        });
    });
    
    return transactions;
}

// 4. Axis Parser
function parseAxis(pdfData) {
    console.log("Parsing Axis statement via strict regex delta.");
    const dateRegex = /(\d{2}\-\d{2}\-\d{4})|(\d{2}\/\d{2}\/\d{4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 5. IDFC Parser
function parseIdfc(pdfData) {
    console.log("Parsing IDFC statement via strict regex delta.");
    const dateRegex = /(\d{4}\-\d{2}\-\d{2})|(\d{2}\-[A-Za-z]{3}\-\d{4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 6. Yes Bank Parser
function parseYes(pdfData) {
    console.log("Parsing Yes Bank statement via strict regex delta.");
    const dateRegex = /(\d{2}\-\d{2}\-\d{4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 7. Canara Bank Parser
function parseCanara(pdfData) {
    console.log("Parsing Canara statement via upward spatial cell layout.");
    const colSplits = [100, 310, 400, 510];
    const dateCol = 0;
    const partCol = 1;
    const creditCol = 2;
    const debitCol = 3;
    const balanceCol = 4;
    const numCols = colSplits.length + 1;
    
    const transactions = [];
    
    pdfData.pages.forEach(page => {
        const words = page.items.map(item => ({
            x: item.x0,
            y: item.y0,
            text: item.text.trim()
        })).filter(w => w.text.length > 0);
        
        words.sort((a, b) => b.y - a.y || a.x - b.x);
        
        const dateAnchors = [];
        words.forEach(w => {
            if (w.x < colSplits[0] && /^\d{2}\-\d{2}\-\d{4}$/.test(w.text)) {
                dateAnchors.push(w);
            }
        });
        
        dateAnchors.sort((a, b) => b.y - a.y);
        
        const rowBounds = [];
        for (let idx = 0; idx < dateAnchors.length; idx++) {
            const anchor = dateAnchors[idx];
            const yBottom = anchor.y;
            const yTop = (idx === 0) ? 800.0 : dateAnchors[idx - 1].y;
            rowBounds.push({
                date: standardizeDate(anchor.text),
                yMin: yBottom - 2.0,
                yMax: yTop - 2.0
            });
        }
        
        const pageRows = rowBounds.map(rb => ({
            date: rb.date,
            cells: Array.from({ length: numCols }, () => [])
        }));
        
        words.forEach(w => {
            if (w.y < 100 || w.y > 760) return;
            let colIdx = numCols - 1;
            for (let idx = 0; idx < colSplits.length; idx++) {
                if (w.x < colSplits[idx]) {
                    colIdx = idx;
                    break;
                }
            }
            for (let rIdx = 0; rIdx < rowBounds.length; rIdx++) {
                const rb = rowBounds[rIdx];
                if (w.y >= rb.yMin && w.y < rb.yMax) {
                    pageRows[rIdx].cells[colIdx].push(w);
                    break;
                }
            }
        });
        
        pageRows.forEach(r => {
            const cellStrings = [];
            for (let colIdx = 0; colIdx < numCols; colIdx++) {
                const colWords = r.cells[colIdx];
                colWords.sort((a, b) => b.y - a.y || a.x - b.x);
                cellStrings.push(colWords.map(w => w.text).join(" ").trim());
            }
            
            transactions.push({
                Date: r.date,
                Particulars: cellStrings[partCol],
                Debit: cleanAmountJS(cellStrings[debitCol]),
                Credit: cleanAmountJS(cellStrings[creditCol]),
                Balance: cleanAmountJS(cellStrings[balanceCol])
            });
        });
    });
    
    return transactions;
}

// 8. Kalupur Parser
function parseKalupur(pdfData) {
    console.log("Parsing Kalupur statement via downward spatial cell layout.");
    const colSplits = [180, 360, 440, 520];
    const dateCol = 0;
    const partCol = 1;
    const debitCol = 2;
    const creditCol = 3;
    const balanceCol = 4;
    const numCols = colSplits.length + 1;
    
    const transactions = [];
    
    pdfData.pages.forEach(page => {
        const words = page.items.map(item => ({
            x: item.x0,
            y: item.y0,
            text: item.text.trim()
        })).filter(w => w.text.length > 0);
        
        words.sort((a, b) => b.y - a.y || a.x - b.x);
        
        const dateAnchors = [];
        words.forEach(w => {
            if (w.x < colSplits[0] && /^\d{2}\-[A-Za-z]{3}\-\d{4}$/.test(w.text)) {
                dateAnchors.push(w);
            }
        });
        
        dateAnchors.sort((a, b) => b.y - a.y);
        
        const rowBounds = [];
        for (let idx = 0; idx < dateAnchors.length; idx++) {
            const anchor = dateAnchors[idx];
            const yTop = anchor.y;
            const yBottom = (idx === dateAnchors.length - 1) ? 40.0 : dateAnchors[idx + 1].y;
            rowBounds.push({
                date: standardizeDate(anchor.text),
                yMin: yBottom - 2.0,
                yMax: yTop + 8.0
            });
        }
        
        const pageRows = rowBounds.map(rb => ({
            date: rb.date,
            cells: Array.from({ length: numCols }, () => [])
        }));
        
        words.forEach(w => {
            if (w.y < 120 || w.y > 785) return;
            let colIdx = numCols - 1;
            for (let idx = 0; idx < colSplits.length; idx++) {
                if (w.x < colSplits[idx]) {
                    colIdx = idx;
                    break;
                }
            }
            for (let rIdx = 0; rIdx < rowBounds.length; rIdx++) {
                const rb = rowBounds[rIdx];
                if (w.y >= rb.yMin && w.y < rb.yMax) {
                    pageRows[rIdx].cells[colIdx].push(w);
                    break;
                }
            }
        });
        
        pageRows.forEach(r => {
            const cellStrings = [];
            for (let colIdx = 0; colIdx < numCols; colIdx++) {
                const colWords = r.cells[colIdx];
                colWords.sort((a, b) => b.y - a.y || a.x - b.x);
                cellStrings.push(colWords.map(w => w.text).join(" ").trim());
            }
            
            transactions.push({
                Date: r.date,
                Particulars: cellStrings[partCol],
                Debit: cleanAmountJS(cellStrings[debitCol]),
                Credit: cleanAmountJS(cellStrings[creditCol]),
                Balance: cleanAmountJS(cellStrings[balanceCol])
            });
        });
    });
    
    return transactions;
}

// 9. Shared Regex Delta-Balance Parser
function parseViaRegex(pdfData, dateRegex) {
    const transactions = [];
    let currentTx = null;
    let partBuffer = [];

    let openingBalance = null;
    const opMatch = pdfData.fullText.match(/(?:Opening\s*Balance|Bal\s*as\s*on)[^\d]*?([\d,]+\.\d{2})/i);
    if (opMatch) {
        openingBalance = cleanAmountJS(opMatch[1]);
    }

    pdfData.pages.forEach(page => {
        page.lines.forEach(line => {
            const lineText = line.lineText.trim();
            if (/txn date|value date|opening balance|closing balance|page/i.test(lineText)) {
                return;
            }

            const matches = [];
            let match;
            dateRegex.lastIndex = 0;
            while ((match = dateRegex.exec(lineText)) !== null) {
                matches.push(match[0]);
                if (dateRegex.lastIndex === match.index) {
                    dateRegex.lastIndex++;
                }
            }

            if (matches.length === 0) {
                if (/bank limited|registered office|disclaimer|statement summary/i.test(lineText)) {
                    return;
                }
                if (currentTx) {
                    currentTx.Particulars += " " + lineText;
                    currentTx.Particulars = currentTx.Particulars.replace(/\s+/g, " ").trim();
                } else {
                    partBuffer.push(lineText);
                }
                return;
            }

            let bestDate = null;
            let bestDateStr = null;

            for (const mStr of matches) {
                const idx = lineText.indexOf(mStr);
                if (idx < 0 || idx > 30) continue;

                const parsed = standardizeDate(mStr);
                if (parsed) {
                    const yearPart = mStr.split(/[/\-]/).pop();
                    if (yearPart.length === 4) {
                        bestDate = parsed;
                        bestDateStr = mStr;
                        break;
                    }
                    if (!bestDate) {
                        bestDate = parsed;
                        bestDateStr = mStr;
                    }
                }
            }

            if (!bestDate) {
                if (currentTx) {
                    currentTx.Particulars += " " + lineText;
                    currentTx.Particulars = currentTx.Particulars.replace(/\s+/g, " ").trim();
                } else {
                    partBuffer.push(lineText);
                }
                return;
            }

            const idx = lineText.indexOf(bestDateStr);
            const trailingText = lineText.substring(idx + bestDateStr.length).trim();
            const numbers = trailingText.match(/[\d,]+\.\d{2}/g) || [];

            if (numbers.length === 0) {
                if (currentTx) {
                    currentTx.Particulars += " " + lineText;
                    currentTx.Particulars = currentTx.Particulars.replace(/\s+/g, " ").trim();
                } else {
                    partBuffer.push(lineText);
                }
                return;
            }

            let particulars = trailingText;
            let balance = 0.0;
            let amount = 0.0;

            if (numbers.length >= 2) {
                balance = cleanAmountJS(numbers[numbers.length - 1]);
                amount = cleanAmountJS(numbers[numbers.length - 2]);
                const firstNumIdx = trailingText.indexOf(numbers[numbers.length - 2]);
                particulars = trailingText.substring(0, firstNumIdx).trim();
            } else if (numbers.length === 1) {
                balance = cleanAmountJS(numbers[0]);
                const firstNumIdx = trailingText.indexOf(numbers[0]);
                particulars = trailingText.substring(0, firstNumIdx).trim();
            }

            if (partBuffer.length > 0) {
                particulars = partBuffer.join(" ") + " " + particulars;
                partBuffer = [];
            }

            if (currentTx) {
                transactions.push(currentTx);
            }

            currentTx = {
                Date: bestDate,
                Particulars: particulars.trim(),
                Debit: 0.0,
                Credit: 0.0,
                Balance: balance,
                Amount: amount,
                LineText: lineText
            };
        });
    });

    if (currentTx) {
        transactions.push(currentTx);
    }

    if (transactions.length > 0) {
        let currentBal = openingBalance;
        if (currentBal === null || currentBal === undefined) {
            if (transactions[0].Amount > 0) {
                if (transactions.length > 1) {
                    const delta2 = transactions[1].Balance - transactions[0].Balance;
                    if (delta2 > 0) {
                        currentBal = transactions[0].Balance - transactions[0].Amount;
                    } else {
                        currentBal = transactions[0].Balance + transactions[0].Amount;
                    }
                } else {
                    currentBal = transactions[0].Balance;
                }
            } else {
                currentBal = transactions[0].Balance;
            }
        }

        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            const bal = tx.Balance;
            const amt = tx.Amount;
            const delta = bal - currentBal;

            const isCr = /cr|credit/i.test(tx.LineText);
            const isDr = /dr|debit/i.test(tx.LineText);

            if (Math.abs(delta) > 0.01) {
                if (delta > 0) {
                    tx.Credit = delta;
                    tx.Debit = 0.0;
                } else {
                    tx.Debit = Math.abs(delta);
                    tx.Credit = 0.0;
                }
            } else {
                if (amt > 0) {
                    if (isCr) {
                        tx.Credit = amt;
                    } else if (isDr) {
                        tx.Debit = amt;
                    } else {
                        tx.Debit = amt;
                    }
                }
            }
            currentBal = bal;
        }
    }

    return transactions;
}

// 10. Generic Parser (Fallback)
function parseGeneric(pdfData) {
    console.log("Parsing via Generic regex delta fallback.");
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

