// Client-side PDF Statement Extractor using PDF.js

/**
 * Loads a PDF file and extracts text + coordinates page-by-page.
 * Handles encrypted / password-protected PDF files cleanly.
 */
async function extractTextAndLayoutFromPdf(pdfBytes, password = "") {
    let pdfDoc = null;
    try {
        const bytesForPdfjs = (pdfBytes instanceof Uint8Array) ? new Uint8Array(pdfBytes) : (pdfBytes && pdfBytes.slice ? new Uint8Array(pdfBytes.slice(0)) : pdfBytes);
        
        const loadingTask = pdfjsLib.getDocument({
            data: bytesForPdfjs,
            password: password || "",
            onPassword: function(updatePassword, reason) {
                if (password) {
                    updatePassword(password);
                } else {
                    const err = new Error("This PDF is password-protected. Please enter the password.");
                    err.name = "PasswordException";
                    throw err;
                }
            }
        });
        pdfDoc = await loadingTask.promise;
    } catch (err) {
        const errStr = (err && (err.message || err.toString()) || "").toLowerCase();
        if (err.name === "PasswordException" || errStr.includes("password") || errStr.includes("encrypted") || errStr.includes("decrypt")) {
            const pwdErr = new Error("This PDF is password-protected. Please enter the password.");
            pwdErr.name = "PasswordException";
            throw pwdErr;
        }
        throw err;
    }

    const pagesData = [];
    let fullText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageItems = textContent.items.map(item => {
            return {
                text: item.str,
                x0: item.transform[4],
                y0: item.transform[5],
                width: item.width,
                height: item.height
            };
        });

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
 * Detects the inherent bank signature inside PDF text layout or filename.
 */
function detectPdfInherentBank(fullText, filename) {
    const textLower = (fullText || "").toLowerCase();
    const fnLower = (filename || "").toLowerCase();

    if (fnLower.includes("hdfc") || textLower.includes("hdfc bank") || textLower.includes("hdfcbank") || textLower.includes("hdfc0")) {
        return { id: "hdfc", name: "HDFC Bank" };
    }
    if (fnLower.includes("icici") || textLower.includes("icici bank") || textLower.includes("icic0")) {
        return { id: "icici", name: "ICICI Bank" };
    }
    if (fnLower.includes("sbi") || textLower.includes("state bank of india") || textLower.includes("sbin0") || textLower.includes("sbi bank")) {
        return { id: "sbi", name: "State Bank of India (SBI)" };
    }
    if (fnLower.includes("axis") || textLower.includes("axis bank") || textLower.includes("utib0")) {
        return { id: "axis", name: "Axis Bank" };
    }
    if (fnLower.includes("idfc") || textLower.includes("idfc first bank") || textLower.includes("idfb0")) {
        return { id: "idfc", name: "IDFC First Bank" };
    }
    if (fnLower.includes("canara") || textLower.includes("canara bank") || textLower.includes("cnrb0")) {
        return { id: "canara", name: "Canara Bank" };
    }
    if (fnLower.includes("kotak") || textLower.includes("kotak mahindra") || textLower.includes("kkbk0")) {
        return { id: "kotak", name: "Kotak Mahindra Bank" };
    }
    if (fnLower.includes("pnb") || textLower.includes("punjab national bank") || textLower.includes("punb0")) {
        return { id: "pnb", name: "Punjab National Bank (PNB)" };
    }
    if (fnLower.includes("bob") || textLower.includes("bank of baroda") || textLower.includes("barb0")) {
        return { id: "bob", name: "Bank of Baroda" };
    }
    if (fnLower.includes("union") || textLower.includes("union bank of india") || textLower.includes("ubin0")) {
        return { id: "union", name: "Union Bank of India" };
    }
    if (fnLower.includes("indusind") || textLower.includes("indusind bank") || textLower.includes("indb0")) {
        return { id: "indusind", name: "IndusInd Bank" };
    }
    if (fnLower.includes("cbi") || textLower.includes("central bank of india") || textLower.includes("cbin0")) {
        return { id: "cbi", name: "Central Bank of India" };
    }
    if (fnLower.includes("boi") || textLower.includes("bank of india") || textLower.includes("bkid0")) {
        return { id: "boi", name: "Bank of India" };
    }
    if (fnLower.includes("yes") || textLower.includes("yes bank") || textLower.includes("yesb0")) {
        return { id: "yes", name: "Yes Bank" };
    }
    if (fnLower.includes("kalupur") || textLower.includes("kalupur")) {
        return { id: "kalupur", name: "Kalupur Cooperative Bank" };
    }
    return null;
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
        if (selectedBank === "axis") { bankName = "Axis Bank"; parser = parseAxis; }
        else if (selectedBank === "canara") { bankName = "Canara Bank"; parser = parseCanara; }
        else if (selectedBank === "hdfc") { bankName = "HDFC Bank"; parser = parseHdfc; }
        else if (selectedBank === "icici") { bankName = "ICICI Bank"; parser = parseIcici; }
        else if (selectedBank === "idfc") { bankName = "IDFC First Bank"; parser = parseIdfc; }
        else if (selectedBank === "kalupur") { bankName = "Kalupur Cooperative Bank"; parser = parseKalupur; }
        else if (selectedBank === "sbi") { bankName = "State Bank of India (SBI)"; parser = parseSbi; }
        else if (selectedBank === "yes") { bankName = "Yes Bank"; parser = parseYes; }
        else if (selectedBank === "kotak") { bankName = "Kotak Mahindra Bank"; parser = parseKotak; }
        else if (selectedBank === "pnb") { bankName = "Punjab National Bank"; parser = parsePnb; }
        else if (selectedBank === "bob") { bankName = "Bank of Baroda"; parser = parseBob; }
        else if (selectedBank === "union") { bankName = "Union Bank of India"; parser = parseUnion; }
        else if (selectedBank === "indusind") { bankName = "IndusInd Bank"; parser = parseIndusind; }
        else if (selectedBank === "cbi") { bankName = "Central Bank of India"; parser = parseCbi; }
        else if (selectedBank === "boi") { bankName = "Bank of India"; parser = parseBoi; }

        // Perform Bank Mismatch Check against inherent PDF contents
        const detected = detectPdfInherentBank(pdfData.fullText, filename);
        if (detected && detected.id !== selectedBank) {
            const err = new Error(`Bank Selection Mismatch!\n\nYou selected "${bankName}" from the top dropdown, but the uploaded file "${filename}" is a ${detected.name} statement.\n\nPlease select "${detected.name}" from the bank dropdown or upload an official ${bankName} statement.`);
            err.name = "BankMismatchException";
            err.selectedBankName = bankName;
            err.detectedBankName = detected.name;
            throw err;
        }
    } else {
        const detected = detectPdfInherentBank(pdfData.fullText, filename);
        if (detected) {
            if (detected.id === "hdfc") { bankName = "HDFC Bank"; parser = parseHdfc; }
            else if (detected.id === "icici") { bankName = "ICICI Bank"; parser = parseIcici; }
            else if (detected.id === "sbi") { bankName = "State Bank of India (SBI)"; parser = parseSbi; }
            else if (detected.id === "axis") { bankName = "Axis Bank"; parser = parseAxis; }
            else if (detected.id === "idfc") { bankName = "IDFC First Bank"; parser = parseIdfc; }
            else if (detected.id === "canara") { bankName = "Canara Bank"; parser = parseCanara; }
            else if (detected.id === "kotak") { bankName = "Kotak Mahindra Bank"; parser = parseKotak; }
            else if (detected.id === "pnb") { bankName = "Punjab National Bank"; parser = parsePnb; }
            else if (detected.id === "bob") { bankName = "Bank of Baroda"; parser = parseBob; }
            else if (detected.id === "union") { bankName = "Union Bank of India"; parser = parseUnion; }
            else if (detected.id === "indusind") { bankName = "IndusInd Bank"; parser = parseIndusind; }
            else if (detected.id === "cbi") { bankName = "Central Bank of India"; parser = parseCbi; }
            else if (detected.id === "boi") { bankName = "Bank of India"; parser = parseBoi; }
            else if (detected.id === "yes") { bankName = "Yes Bank"; parser = parseYes; }
            else if (detected.id === "kalupur") { bankName = "Kalupur Cooperative Bank"; parser = parseKalupur; }
        }
    }

    console.log(`Routing ${filename} to ${bankName} parser.`);
    const metadata = extractMetadata(pdfData.fullText, bankName);
    let rawTransactions = parser(pdfData);

    // Dynamic fallback to Generic Parser if specific parser returns 0 rows
    if ((!rawTransactions || rawTransactions.length === 0) && parser !== parseGeneric) {
        console.warn(`${bankName} specific parser extracted 0 rows. Falling back to Generic Regex parser.`);
        rawTransactions = parseGeneric(pdfData);
    }

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

// Metadata Extraction (Hyper-Robust Multi-Strategy Parser for Real-Time Users)
function extractMetadata(text, bankName) {
    const meta = {
        customer_name: "Valued Customer",
        account_number: "Not Available",
        start_date: "Not Available",
        end_date: "Not Available",
        bank_name: bankName
    };

    const cleanText = text.replace(/\r/g, '');

    // -------------------------------------------------------------
    // 1. ACCOUNT NUMBER EXTRACTION
    // -------------------------------------------------------------
    let accMatch = cleanText.match(/(?:Account\s*(?:No|Num|Number|#)|A\/C\s*(?:No|Num|Number|#)|Acc\s*No|A\/c\s*:|Account\s*:|A\/C\s*:)\s*[:\.]?\s*([0-9X\*\-]{8,24})/i);
    if (!accMatch) {
        accMatch = cleanText.match(/(?:Statement of|Account Statement for|Savings A\/c|Current A\/c|Account Details|Primary A\/C)[^\n]*?([0-9]{8,20})/i);
    }
    if (!accMatch) {
        // Look for digit sequences on lines containing IFSC, Branch, CIF, MICR, or Customer
        const lines = cleanText.split('\n');
        for (const line of lines) {
            if (/IFSC|Branch|CIF|MICR|Customer|Savings|Current|Statement|Account/i.test(line)) {
                const numMatch = line.match(/\b([0-9]{9,20})\b/);
                if (numMatch) {
                    accMatch = numMatch;
                    break;
                }
            }
        }
    }
    if (!accMatch) {
        accMatch = cleanText.match(/\b([0-9]{10,18})\b/);
    }

    if (accMatch) {
        let candidateAcc = accMatch[1] ? accMatch[1].replace(/[\s\-]/g, '') : accMatch[0].replace(/[\s\-]/g, '');
        // Clean leading zeroes if string length > 12
        if (candidateAcc.length > 12 && candidateAcc.startsWith("00")) {
            candidateAcc = candidateAcc.replace(/^0+/, '');
        }
        if (candidateAcc.length >= 7 && !/^\d{4}$/.test(candidateAcc)) {
            meta.account_number = candidateAcc;
        }
    }

    // -------------------------------------------------------------
    // 2. STATEMENT PERIOD EXTRACTION
    // -------------------------------------------------------------
    let periodMatch = cleanText.match(/(?:Account\s*)?Statement\s*(?:from|for the period)\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})\s*(?:to|till|-)\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/i);
    if (!periodMatch) {
        periodMatch = cleanText.match(/Period\s*:\s*(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})/i);
    }
    if (!periodMatch) {
        periodMatch = cleanText.match(/Statement Period\s*:?\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i);
    }
    if (!periodMatch) {
        periodMatch = cleanText.match(/From\s*:\s*(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})\s*To\s*:\s*(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})/i);
    }
    if (periodMatch) {
        meta.start_date = standardizeDate(periodMatch[1]);
        meta.end_date = standardizeDate(periodMatch[2]);
    }

    // -------------------------------------------------------------
    // 3. CUSTOMER NAME EXTRACTION
    // -------------------------------------------------------------
    let nameMatch = cleanText.match(/(?:Account\s*Holder\s*Name|Customer\s*Name|Account\s*Name|A\/c\s*Name|Name\s*of\s*Account\s*Holder|Name\s*of\s*Customer|Name)[:\s]+([A-Za-z0-9\s\.\,\&\-]+?)(?:\n|Account|Branch|Statement|Phone|Address|CIF|IFSC|$)/i);
    if (!nameMatch) {
        nameMatch = cleanText.match(/Statement of (?:Transactions in )?(?:the Account of )?([A-Z\s\.\,\&\-]{4,40})(?: for the period| from| Account|$)/i);
    }
    if (!nameMatch) {
        nameMatch = cleanText.match(/(?:MR|MRS|MS|M\/S|SHRI|SMT|DR)\.?\s+([A-Z\s]{4,35})/i);
    }
    if (!nameMatch) {
        // Inspect top 20 lines of text for a capitalized name candidate
        const lines = cleanText.split('\n').slice(0, 20);
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^[A-Z\s\.\,]{4,35}$/.test(trimmed) && 
                !/STATEMENT|BANK|ACCOUNT|BRANCH|IFSC|DATE|PERIOD|BALANCE|INDIAN|INR|TRANSACTION|PAGE|HOME|SAVINGS|CURRENT|LIMITED|DETAILS|REGISTERED/i.test(trimmed)) {
                nameMatch = [trimmed, trimmed];
                break;
            }
        }
    }

    if (nameMatch) {
        let cand = nameMatch[1] ? nameMatch[1].trim() : nameMatch[0].trim();
        cand = cand.replace(/^(MR|MRS|MS|M\/S|SHRI|SMT|DR)\.?\s+/i, '');
        // Clean out address numbers or trailing punctuation
        cand = cand.replace(/[:\.\,]+$/, '').trim();
        if (cand && cand.length >= 3 && !/transaction|statement|account|balance|opening|closing|summary|page|details/i.test(cand)) {
            meta.customer_name = cand;
        }
    }

    return meta;
}

function standardizeDate(dateStr) {
    if (!dateStr) return "";
    const cleanStr = dateStr.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        return cleanStr;
    }
    
    const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

    const formats = [
        { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parse: m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\-(\d{1,2})\-(\d{4})$/, parse: m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, parse: m => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, parse: m => `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\-(\d{1,2})\-(\d{2})$/, parse: m => `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/, parse: m => `${m[3]}-${months[m[2].substring(0,3).toLowerCase()] || "01"}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\-([A-Za-z]{3,9})\-(\d{4})$/, parse: m => `${m[3]}-${months[m[2].substring(0,3).toLowerCase()] || "01"}-${m[1].padStart(2, '0')}` },
        { regex: /^(\d{1,2})\-([A-Za-z]{3,9})\-(\d{2})$/, parse: m => `20${m[3]}-${months[m[2].substring(0,3).toLowerCase()] || "01"}-${m[1].padStart(2, '0')}` }
    ];

    for (const fmt of formats) {
        const m = cleanStr.match(fmt.regex);
        if (m) {
            return fmt.parse(m);
        }
    }
    try {
        const d = new Date(cleanStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch(e) {}
    
    return "";
}

function cleanAmountJS(val) {
    if (val === null || val === undefined) return 0.0;
    let valStr = String(val).trim().replace(/,/g, "");
    if (!valStr || valStr === "." || valStr === "-") return 0.0;
    
    const isDr = valStr.toLowerCase().includes("dr");
    const hasNeg = valStr.includes("-") || (valStr.includes("(") && valStr.includes(")"));
    
    let cleaned = valStr.replace(/[^\d\.]/g, "");
    if (!cleaned) return 0.0;
    
    let amount = parseFloat(cleaned) || 0.0;
    if (hasNeg || isDr) {
        amount = -amount;
    }
    return amount;
}

// 1. HDFC Parser
function parseHdfc(pdfData) {
    const transactions = [];
    let isSavings = false;
    if (pdfData.pages[0] && pdfData.pages[0].text) {
        const text = pdfData.pages[0].text.toLowerCase().replace(/\s/g, "");
        if (text.includes("closingbalance") && text.includes("withdrawalamt")) {
            isSavings = true;
        }
    }

    if (isSavings) {
        pdfData.pages.forEach(page => {
            let currentTx = null;
            page.lines.forEach(line => {
                if (line.top < 80 || line.top > 780) return;
                const dateWords = [], narrationWords = [], refWords = [], valWords = [], withWords = [], depWords = [], balWords = [];
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
        const dateRegex = /(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})|(\d{1,2}\-[A-Za-z]{3,9}\-\d{2,4})/g;
        return parseViaRegex(pdfData, dateRegex);
    }
}

// 2. ICICI Parser
function parseIcici(pdfData) {
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\-[A-Za-z]{3}\-\d{2,4})|(\d{1,2}\/[A-Za-z]{3}\/\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 3. SBI Parser (Hybrid Spatial + Multi-Format Regex Fallback)
function parseSbi(pdfData) {
    console.log("Parsing SBI statement via hybrid parser.");
    let txs = parseSbiSpatial(pdfData);
    if (txs && txs.length > 0) {
        return txs;
    }
    console.log("SBI spatial parser returned 0 rows. Using SBI multi-date regex fallback.");
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})|(\d{1,2}\-[A-Za-z]{3,9}\-\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

function parseSbiSpatial(pdfData) {
    const transactions = [];
    const dateElementRegex = /^\d{1,2}\s+[A-Za-z]{3,9}$|^\d{1,2}$|^[A-Za-z]{3,9}$|^\d{4}$|^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$|^\d{1,2}\-[A-Za-z]{3,9}\-\d{2,4}$/;
    
    pdfData.pages.forEach(page => {
        const words = page.items.map(item => ({
            x: item.x0,
            y: item.y0,
            text: item.text.trim()
        })).filter(w => w.text.length > 0);
        
        words.sort((a, b) => b.y - a.y || a.x - b.x);
        
        const dateAnchors = [];
        words.forEach(w => {
            if (w.x < 150 && dateElementRegex.test(w.text)) {
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
            
            const descWords = [];
            const numbers = [];
            
            rowWords.forEach(w => {
                const text = w.text.trim();
                if (!text) return;
                
                const isNum = /^-?[\d,\.]+(?:\s*(?:cr|dr))?$/i.test(text);
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
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 5. IDFC Parser
function parseIdfc(pdfData) {
    const dateRegex = /(\d{4}\-\d{2}\-\d{2})|(\d{2}\-[A-Za-z]{3}\-\d{4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 6. Yes Bank Parser
function parseYes(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 7. Canara Bank Parser
function parseCanara(pdfData) {
    const colSplits = [100, 310, 400, 510];
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
            if (w.x < colSplits[0] && (/^\d{2}\-\d{2}\-\d{4}$/.test(w.text) || /^\d{2}\-[A-Za-z]{3}\-\d{4}$/.test(w.text))) {
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

    if (transactions.length === 0) {
        const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})|(\d{2}-[A-Za-z]{3}-\d{4})/g;
        return parseViaRegex(pdfData, dateRegex);
    }
    
    return transactions;
}

// 8. Kalupur Parser
function parseKalupur(pdfData) {
    const colSplits = [180, 360, 440, 520];
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

    if (transactions.length === 0) {
        const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})|(\d{2}-[A-Za-z]{3}-\d{4})/g;
        return parseViaRegex(pdfData, dateRegex);
    }
    
    return transactions;
}

// 9. Kotak Parser
function parseKotak(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 10. PNB Parser
function parsePnb(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 11. Bank of Baroda Parser
function parseBob(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 12. Union Bank Parser
function parseUnion(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 13. IndusInd Parser
function parseIndusind(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 14. Central Bank Parser
function parseCbi(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// 15. Bank of India Parser
function parseBoi(pdfData) {
    const dateRegex = /(\d{2}[-\/.]\d{2}[-\/.]\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}

// Shared Regex Delta-Balance Parser
function parseViaRegex(pdfData, dateRegex) {
    const transactions = [];
    let currentTx = null;
    let partBuffer = [];

    let openingBalance = null;
    const opMatch = pdfData.fullText.match(/(?:Opening\s*Balance|Bal\s*as\s*on)[^\d]*?([\d,]+(?:\.\d{1,2})?)/i);
    if (opMatch) {
        openingBalance = cleanAmountJS(opMatch[1]);
    }

    pdfData.pages.forEach(page => {
        page.lines.forEach(line => {
            const lineText = line.lineText.trim();
            if (/^\s*page\s+\d+/i.test(lineText) || /statement summary/i.test(lineText)) {
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
                if (/bank limited|registered office|disclaimer/i.test(lineText)) {
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
                if (idx < 0 || idx > 60) continue;

                const parsed = standardizeDate(mStr);
                if (parsed) {
                    bestDate = parsed;
                    bestDateStr = mStr;
                    break;
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
            const numbers = trailingText.match(/[\d,]+(?:\.\d{1,2})?(?:\s*(?:cr|dr))?/gi) || [];

            const validNumbers = numbers.filter(n => {
                const cleaned = cleanAmountJS(n);
                return cleaned > 0 || n.includes(".");
            });

            if (validNumbers.length === 0) {
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

            if (validNumbers.length >= 2) {
                balance = cleanAmountJS(validNumbers[validNumbers.length - 1]);
                amount = cleanAmountJS(validNumbers[validNumbers.length - 2]);
                const firstNumIdx = trailingText.indexOf(validNumbers[validNumbers.length - 2]);
                particulars = trailingText.substring(0, firstNumIdx).trim();
            } else if (validNumbers.length === 1) {
                balance = cleanAmountJS(validNumbers[0]);
                const firstNumIdx = trailingText.indexOf(validNumbers[0]);
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

// Generic Parser (Fallback)
function parseGeneric(pdfData) {
    console.log("Parsing via Generic regex delta fallback.");
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})|(\d{1,2}\-[A-Za-z]{3,9}\-\d{2,4})/g;
    return parseViaRegex(pdfData, dateRegex);
}
