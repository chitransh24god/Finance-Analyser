// Utility: Format numbers as Indian Rupee (₹) currency string
function formatCurrencyJS(val) {
    if (val === null || val === undefined || isNaN(val)) return "₹0.00";
    const num = parseFloat(val) || 0.0;
    return "₹" + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Global Application State
const state = {
    loggedIn: false,
    activePage: 'analyzer',
    activeSubtab: 'dashboard',
    activeCalculator: null,
    parsedData: null,
    pendingFilesQueue: [],
    currentEncryptedFileIndex: 0,
    parsedStatementsList: []
};

// Global chart references to allow clean redraws
let ledgerChartInstance = null;
let abbChartInstance = null;
let comparisonChartInstance = null;

function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar-container");
    const icon = document.getElementById("toggle-sidebar-icon");
    if (!sidebar) return;

    sidebar.classList.toggle("collapsed");
    
    if (sidebar.classList.contains("collapsed")) {
        if (icon) icon.className = "fa-solid fa-chevron-right text-xs";
    } else {
        if (icon) icon.className = "fa-solid fa-chevron-left text-xs";
    }
}

// ==========================================
// INITIALIZER
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initAuth();
    initNavigation();
    initUploadListener();
});

// ==========================================
// AUTHENTICATION MANAGEMENT
// ==========================================
function initAuth() {
    const isAuth = sessionStorage.getItem("mybankloan_auth");
    if (isAuth === "true") {
        state.loggedIn = true;
        document.getElementById("login-gate").classList.add("hidden");
        document.getElementById("main-workspace").classList.remove("hidden");
        showPage('analyzer');
    }

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const passwordInput = document.getElementById("password").value;
            const errorDiv = document.getElementById("login-error");

            if (passwordInput === "Mybankloan.ai@2023") {
                sessionStorage.setItem("mybankloan_auth", "true");
                state.loggedIn = true;
                errorDiv.classList.add("hidden");
                document.getElementById("login-gate").classList.add("hidden");
                document.getElementById("main-workspace").classList.remove("hidden");
                showPage('analyzer');
            } else {
                errorDiv.classList.remove("hidden");
            }
        });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            sessionStorage.removeItem("mybankloan_auth");
            state.loggedIn = false;
            document.getElementById("login-gate").classList.remove("hidden");
            document.getElementById("main-workspace").classList.add("hidden");
            document.getElementById("password").value = "";
        });
    }
}

// ==========================================
// ROUTING & NAVIGATION
// ==========================================
function initNavigation() {
    const navAnalyzer = document.getElementById("nav-analyzer");
    if (navAnalyzer) {
        navAnalyzer.addEventListener("click", () => {
            setActiveNav(navAnalyzer);
            showPage('analyzer');
        });
    }
}

function setActiveNav(activeBtn) {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    if (activeBtn) activeBtn.classList.add("active");
}

function showPage(pageId) {
    state.activePage = pageId;
    const sectionAnalyzer = document.getElementById("section-analyzer");
    if (sectionAnalyzer) sectionAnalyzer.classList.remove("hidden");
}

// ==========================================
// SUB-TAB TOGGLES FOR ANALYZER
// ==========================================
function switchSubtab(subtabId) {
    state.activeSubtab = subtabId;

    document.querySelectorAll(".nav-pill-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(subtabId)) {
            btn.classList.add("active");
        }
    });

    document.querySelectorAll(".sidebar-tab-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(subtabId)) {
            btn.classList.add("active");
        }
    });

    document.querySelectorAll(".subtab-content").forEach(c => {
        c.classList.add("hidden");
    });
    
    const targetSection = document.getElementById(`subtab-${subtabId}`);
    if (targetSection) {
        targetSection.classList.remove("hidden");
    }

    if (state.parsedData) {
        if (subtabId === 'dashboard') {
            drawLedgerChart(state.parsedData.transactions);
        } else if (subtabId === 'abb') {
            drawAbbChart(state.parsedData.monthly_abb);
        } else if (subtabId === 'comparison') {
            renderAccountComparisonTab();
        }
    }
}

// ==========================================
// MULTI-STATEMENT UPLOAD PIPELINE
// ==========================================
function initUploadListener() {
    const fileInput = document.getElementById("statement-upload");

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            handleSelectedFiles(Array.from(e.target.files || []));
        });
    }

    // Attach drag & drop listeners to full workspace window
    ['dragenter', 'dragover'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    window.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return;
        
        const files = Array.from(dt.files || []).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
        if (files.length > 0) {
            handleSelectedFiles(files);
        } else {
            alert("Please drop valid PDF bank statement file(s).");
        }
    });
}

function handleSelectedFiles(files) {
    if (!files || files.length === 0) return;

    const bankSelector = document.getElementById("bank-selector");
    if (!bankSelector || !bankSelector.value) {
        alert("⚠️ Please select your Bank from the top dropdown before uploading your statement PDF(s).");
        if (bankSelector) {
            bankSelector.focus();
            bankSelector.classList.add("ring-4", "ring-indigo-500", "animate-pulse");
            setTimeout(() => {
                bankSelector.classList.remove("ring-4", "ring-indigo-500", "animate-pulse");
            }, 3000);
        }
        document.getElementById("statement-upload").value = "";
        return;
    }

    state.pendingFilesQueue = files;
    state.parsedStatementsList = [];
    state.currentEncryptedFileIndex = 0;
    
    processUploadedStatementsQueue(0, "");
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = err => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

async function processUploadedStatementsQueue(fileIndex = 0, currentPassword = "") {
    const loader = document.getElementById("analyzer-loader");
    const results = document.getElementById("analyzer-results");
    const errorModal = document.getElementById("pdf-password-modal");

    const landing = document.getElementById("landing-phase");
    if (landing) landing.classList.add("hidden");
    results.classList.add("hidden");
    loader.classList.remove("hidden");

    for (let i = fileIndex; i < state.pendingFilesQueue.length; i++) {
        const file = state.pendingFilesQueue[i];
        updateLoaderStatus(`Parsing Statement ${i + 1} of ${state.pendingFilesQueue.length}: ${file.name}...`);
        
        try {
            const fileBytes = await readFileAsArrayBuffer(file);
            const pwd = (i === fileIndex) ? currentPassword : "";
            const extractedLayout = await extractTextAndLayoutFromPdf(new Uint8Array(fileBytes), pwd);
            
            updateLoaderStatus(`Routing Bank Format for ${file.name}...`);
            const selectedBank = document.getElementById("bank-selector").value;
            const { metadata, rawTransactions } = await routeAndExtractTransactions(
                extractedLayout, 
                file.name,
                selectedBank
            );

            if (rawTransactions && rawTransactions.length > 0) {
                state.parsedStatementsList.push({
                    filename: file.name,
                    metadata,
                    rawTransactions
                });
            } else {
                console.warn(`0 transactions extracted from ${file.name}`);
            }
        } catch (err) {
            const errMsg = (err.message || "").toLowerCase();
            const errName = err.name || "";
            if (errName === "PasswordException" || errMsg.includes("password") || errMsg.includes("decrypt") || errMsg.includes("encrypted")) {
                loader.classList.add("hidden");
                state.currentEncryptedFileIndex = i;
                showPasswordModalForFile(file.name, currentPassword ? "Incorrect password. Please enter valid password." : "");
                return;
            } else {
                console.error(`Error processing file ${file.name}:`, err);
            }
        }
    }

    finalizeConsolidatedStatements();
}

function showPasswordModalForFile(filename, errorMsg = "") {
    const errorModal = document.getElementById("pdf-password-modal");
    const errorDiv = document.getElementById("pdf-password-error");
    const pwdInput = document.getElementById("pdf-password-input");

    errorModal.classList.remove("hidden");
    if (errorMsg) {
        errorDiv.innerText = errorMsg;
        errorDiv.classList.remove("hidden");
    } else {
        errorDiv.innerText = `File "${filename}" is encrypted. Please enter its password.`;
        errorDiv.classList.remove("hidden");
    }
    pwdInput.value = "";
    pwdInput.focus();
}

function submitPdfPassword() {
    const pwd = document.getElementById("pdf-password-input").value;
    if (!pwd) {
        document.getElementById("pdf-password-error").innerText = "Please enter a password.";
        document.getElementById("pdf-password-error").classList.remove("hidden");
        return;
    }
    document.getElementById("pdf-password-modal").classList.add("hidden");
    processUploadedStatementsQueue(state.currentEncryptedFileIndex, pwd);
}

function closePasswordModal() {
    document.getElementById("pdf-password-modal").classList.add("hidden");
    document.getElementById("pdf-password-error").classList.add("hidden");
    document.getElementById("pdf-password-input").value = "";
    document.getElementById("statement-upload").value = "";
}

function evaluateAccountSuperiority(statementsList) {
    if (!statementsList || statementsList.length === 0) return [];

    const evaluated = statementsList.map((st, idx) => {
        const cleanedTx = (st.rawTransactions || []).map(tx => ({
            Date: tx.Date,
            Particulars: tx.Particulars,
            Debit: parseFloat(tx.Debit) || 0.0,
            Credit: parseFloat(tx.Credit) || 0.0,
            Balance: parseFloat(tx.Balance) || 0.0
        })).sort((a, b) => new Date(a.Date) - new Date(b.Date));

        const startDate = cleanedTx.length > 0 ? cleanedTx[0].Date : "2025-01-01";
        const endDate = cleanedTx.length > 0 ? cleanedTx[cleanedTx.length - 1].Date : "2025-06-30";

        const { monthly_abb, abb_summary } = calculateMonthlyAbbJS(cleanedTx, startDate, endDate);
        const assessment = analyzeCreditProfileJS(cleanedTx, monthly_abb, abb_summary);

        let totalCredits = 0;
        let totalDebits = 0;
        cleanedTx.forEach(tx => {
            totalCredits += tx.Credit;
            totalDebits += tx.Debit;
        });
        const netCashFlow = totalCredits - totalDebits;

        let score = 50;
        const abbVal = abb_summary.abb_6m || abb_summary.abb_1m || 0;
        
        if (abbVal >= 200000) score += 30;
        else if (abbVal >= 100000) score += 20;
        else if (abbVal >= 50000) score += 10;

        if (netCashFlow > 0) score += 15;
        if (assessment.metrics.negative_count === 0) score += 5;

        score = Math.min(99, Math.max(35, score));

        return {
            index: idx + 1,
            filename: st.filename,
            bank_name: st.metadata.bank_name || "Auto-Detected",
            account_number: st.metadata.account_number || "N/A",
            customer_name: st.metadata.customer_name || "N/A",
            txCount: cleanedTx.length,
            totalCredits,
            totalDebits,
            netCashFlow,
            abb_1m: abb_summary.abb_1m,
            abb_3m: abb_summary.abb_3m,
            abb_6m: abb_summary.abb_6m,
            overall_grade: assessment.overall_grade,
            healthScore: score
        };
    });

    evaluated.sort((a, b) => {
        if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
        return b.abb_6m - a.abb_6m;
    });

    evaluated.forEach((acc, rankIdx) => {
        acc.rank = rankIdx + 1;
        if (rankIdx === 0) {
            acc.rankTitle = "#1 Superior Account";
            acc.badgeColor = "amber";
            acc.icon = "fa-trophy";
        } else if (rankIdx === 1) {
            acc.rankTitle = "#2 Secondary Performer";
            acc.badgeColor = "slate";
            acc.icon = "fa-medal";
        } else {
            acc.rankTitle = `#${rankIdx + 1} Underperforming`;
            acc.badgeColor = "rose";
            acc.icon = "fa-triangle-exclamation";
        }
    });

    return evaluated;
}

function finalizeConsolidatedStatements() {
    const loader = document.getElementById("analyzer-loader");
    const results = document.getElementById("analyzer-results");
    const errorModal = document.getElementById("pdf-password-modal");

    if (!state.parsedStatementsList || state.parsedStatementsList.length === 0) {
        loader.classList.add("hidden");
        alert("No transactions extracted from the uploaded PDF statement(s). Please ensure these are supported bank statements.");
        return;
    }

    updateLoaderStatus("Merging & Consolidating Transaction Ledgers...");

    let allTxList = [];
    let bankNamesSet = new Set();
    let accNumbersSet = new Set();
    let customerNamesSet = new Set();

    state.parsedStatementsList.forEach(st => {
        if (st.metadata.bank_name && st.metadata.bank_name !== "Generic / Unrecognized") {
            bankNamesSet.add(st.metadata.bank_name);
        }
        if (st.metadata.account_number && st.metadata.account_number !== "Not Available") {
            accNumbersSet.add(st.metadata.account_number);
        }
        if (st.metadata.customer_name && st.metadata.customer_name !== "Not Available") {
            customerNamesSet.add(st.metadata.customer_name);
        }
        
        st.rawTransactions.forEach(tx => {
            allTxList.push({
                Date: tx.Date,
                Particulars: tx.Particulars,
                Debit: parseFloat(tx.Debit) || 0.0,
                Credit: parseFloat(tx.Credit) || 0.0,
                Balance: parseFloat(tx.Balance) || 0.0,
                StatementSource: st.filename
            });
        });
    });

    allTxList.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const uniqueTxMap = new Map();
    const deduplicatedTxList = [];
    allTxList.forEach(tx => {
        const key = `${tx.Date}|${tx.Particulars}|${tx.Debit}|${tx.Credit}|${tx.Balance}`;
        if (!uniqueTxMap.has(key)) {
            uniqueTxMap.set(key, true);
            deduplicatedTxList.push(tx);
        }
    });

    const earliestDate = deduplicatedTxList[0].Date;
    const latestDate = deduplicatedTxList[deduplicatedTxList.length - 1].Date;

    const consolidatedMetadata = {
        customer_name: customerNamesSet.size > 0 ? Array.from(customerNamesSet).join(", ") : "Not Available",
        account_number: accNumbersSet.size > 0 ? Array.from(accNumbersSet).join(", ") : "Not Available",
        bank_name: bankNamesSet.size > 0 ? Array.from(bankNamesSet).join(", ") : "Consolidated Bank Statements",
        start_date: earliestDate,
        end_date: latestDate,
        statements_count: state.parsedStatementsList.length
    };

    updateLoaderStatus("Computing Consolidated Monthly ABB...");
    const { monthly_abb, abb_summary } = calculateMonthlyAbbJS(
        deduplicatedTxList,
        earliestDate,
        latestDate
    );

    updateLoaderStatus("Evaluating Consolidated Credit Risk Variables...");
    const assessment = analyzeCreditProfileJS(
        deduplicatedTxList,
        monthly_abb,
        abb_summary
    );

    updateLoaderStatus("Evaluating Account Superiority & Comparative Rankings...");
    const evaluatedAccounts = evaluateAccountSuperiority(state.parsedStatementsList);

    state.parsedData = {
        metadata: consolidatedMetadata,
        transactions: deduplicatedTxList,
        monthly_abb,
        abb_summary,
        assessment,
        statementsList: state.parsedStatementsList,
        evaluatedAccounts
    };

    populateAccountViewSelector(state.parsedStatementsList);
    renderAnalyzerDashboard(state.parsedData);
    renderAccountComparisonTab();

    if (state.parsedStatementsList && state.parsedStatementsList.length > 1) {
        switchSubtab('comparison');
    } else {
        switchSubtab('dashboard');
    }

    loader.classList.add("hidden");
    results.classList.remove("hidden");
    errorModal.classList.add("hidden");
    document.getElementById("statement-upload").value = "";
}

function populateAccountViewSelector(statementsList) {
    const selector = document.getElementById("account-view-selector");
    const pillsContainer = document.getElementById("dashboard-bank-pills");

    if (selector) {
        selector.innerHTML = `<option value="consolidated">🌐 All Accounts (Consolidated View)</option>`;
    }

    if (pillsContainer) {
        pillsContainer.innerHTML = `
            <button class="subtab-pill active" onclick="switchDashboardBankFilter('consolidated', this)">
                🌐 All Banks (Consolidated)
            </button>
        `;
    }

    if (statementsList && statementsList.length > 0) {
        statementsList.forEach((st, idx) => {
            const bankName = st.metadata.bank_name || "Bank Statement";
            const accNum = st.metadata.account_number || "N/A";
            
            if (selector) {
                const option = document.createElement("option");
                option.value = st.filename;
                option.innerText = `🏦 Account ${idx + 1}: ${bankName} (${accNum})`;
                selector.appendChild(option);
            }

            if (pillsContainer) {
                const pillBtn = document.createElement("button");
                pillBtn.className = "subtab-pill";
                pillBtn.innerHTML = `🏦 ${bankName} (${accNum})`;
                pillBtn.onclick = function() {
                    switchDashboardBankFilter(st.filename, this);
                };
                pillsContainer.appendChild(pillBtn);
            }
        });
    }
}

function switchDashboardBankFilter(val, element) {
    document.querySelectorAll("#dashboard-bank-pills .subtab-pill").forEach(btn => {
        btn.classList.remove("active");
    });
    if (element) {
        element.classList.add("active");
    }

    const selector = document.getElementById("account-view-selector");
    if (selector) {
        selector.value = val;
    }

    const badge = document.getElementById("active-bank-badge");
    if (badge) {
        if (val === "consolidated") {
            badge.innerText = "Showing Consolidated Full Report";
        } else {
            badge.innerText = `Filtered: ${element ? element.innerText : val}`;
        }
    }

    filterDashboardByAccount(val);
}

function filterDashboardByAccount(selectedValue) {
    if (!state.parsedData) return;

    if (selectedValue === "consolidated") {
        renderAnalyzerDashboard(state.parsedData);
        return;
    }

    const selectedSt = state.parsedData.statementsList.find(st => st.filename === selectedValue);
    if (!selectedSt) {
        renderAnalyzerDashboard(state.parsedData);
        return;
    }

    const cleanedTx = (selectedSt.rawTransactions || []).map(tx => ({
        Date: tx.Date,
        Particulars: tx.Particulars,
        Debit: parseFloat(tx.Debit) || 0.0,
        Credit: parseFloat(tx.Credit) || 0.0,
        Balance: parseFloat(tx.Balance) || 0.0,
        StatementSource: selectedSt.filename
    })).sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const startDate = cleanedTx.length > 0 ? cleanedTx[0].Date : "2025-01-01";
    const endDate = cleanedTx.length > 0 ? cleanedTx[cleanedTx.length - 1].Date : "2025-06-30";

    const { monthly_abb, abb_summary } = calculateMonthlyAbbJS(cleanedTx, startDate, endDate);
    const assessment = analyzeCreditProfileJS(cleanedTx, monthly_abb, abb_summary);

    const individualData = {
        metadata: {
            ...selectedSt.metadata,
            statements_count: 1
        },
        transactions: cleanedTx,
        monthly_abb,
        abb_summary,
        assessment,
        statementsList: [selectedSt]
    };

    renderAnalyzerDashboard(individualData);
}

function renderAccountComparisonTab() {
    if (!state.parsedData || !state.parsedData.evaluatedAccounts) return;

    const evaluated = state.parsedData.evaluatedAccounts;
    if (evaluated.length === 0) return;

    const winner = evaluated[0];
    if (document.getElementById("winner-account-name")) {
        document.getElementById("winner-account-name").innerText = `${winner.bank_name} (${winner.account_number})`;
    }
    if (document.getElementById("winner-bank-badge")) {
        document.getElementById("winner-bank-badge").innerText = winner.filename;
    }
    if (document.getElementById("winner-score-val")) {
        document.getElementById("winner-score-val").innerText = `${winner.healthScore} / 100`;
    }
    if (document.getElementById("winner-rationale-text")) {
        document.getElementById("winner-rationale-text").innerText = `Ranked #1 Superior Account with highest 6-Month ABB of ${formatCurrencyJS(winner.abb_6m)} and positive net cashflow of ${formatCurrencyJS(winner.netCashFlow)}.`;
    }
    if (document.getElementById("comparison-count-badge")) {
        document.getElementById("comparison-count-badge").innerText = `${evaluated.length} Account${evaluated.length > 1 ? 's' : ''} Evaluated`;
    }

    const grid = document.getElementById("comparison-cards-grid");
    if (grid) {
        grid.innerHTML = "";
        evaluated.forEach(acc => {
            const isWinner = acc.rank === 1;
            const badgeClass = isWinner ? "bg-amber-100 text-amber-700" : (acc.rank === 2 ? "bg-slate-100 text-slate-700" : "bg-rose-100 text-rose-700");
            const netColor = acc.netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600";

            grid.innerHTML += `
                <div class="aesthetic-card space-y-4 relative ${isWinner ? 'border-2 border-amber-400 shadow-lg shadow-amber-500/10' : ''}">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-extrabold px-3 py-1 rounded-full ${badgeClass}">
                            <i class="fa-solid ${acc.icon} mr-1"></i> ${acc.rankTitle}
                        </span>
                        <span class="text-xs font-bold text-slate-400 truncate max-w-[120px]">${acc.filename}</span>
                    </div>

                    <div>
                        <h4 class="font-extrabold text-slate-900 text-base">${acc.bank_name}</h4>
                        <div class="text-xs font-semibold text-slate-400 mt-0.5">Acc #: ${acc.account_number}</div>
                    </div>

                    <div class="space-y-2 pt-2 border-t border-rose-100/50">
                        <div class="flex justify-between text-xs">
                            <span class="font-semibold text-slate-500">6-Month ABB</span>
                            <span class="font-extrabold text-slate-900">${formatCurrencyJS(acc.abb_6m)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="font-semibold text-slate-500">Total Inflows</span>
                            <span class="font-bold text-emerald-600">${formatCurrencyJS(acc.totalCredits)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="font-semibold text-slate-500">Total Outflows</span>
                            <span class="font-bold text-rose-500">${formatCurrencyJS(acc.totalDebits)}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="font-semibold text-slate-500">Net Cash Flow</span>
                            <span class="font-extrabold ${netColor}">${formatCurrencyJS(acc.netCashFlow)}</span>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-rose-100/50 flex items-center justify-between text-xs">
                        <span class="font-bold text-slate-500">Credit Rating</span>
                        <span class="font-black text-rose-500">${acc.overall_grade} (${acc.healthScore}/100)</span>
                    </div>
                </div>
            `;
        });
    }

    drawComparisonChart(evaluated);
}

function drawComparisonChart(evaluatedAccounts) {
    const ctx = document.getElementById("comparisonChart");
    if (!ctx) return;

    if (comparisonChartInstance) {
        comparisonChartInstance.destroy();
    }

    const labels = evaluatedAccounts.map(a => `${a.bank_name}\n(${a.account_number})`);
    const abbValues = evaluatedAccounts.map(a => a.abb_6m);
    const inflowValues = evaluatedAccounts.map(a => a.totalCredits);

    comparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '6-Month ABB (₹)',
                    data: abbValues,
                    backgroundColor: 'rgba(255, 94, 126, 0.85)',
                    borderRadius: 10
                },
                {
                    label: 'Total Inflow Volume (₹)',
                    data: inflowValues,
                    backgroundColor: 'rgba(56, 182, 255, 0.85)',
                    borderRadius: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Outfit', size: 12, weight: 'bold' } } }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11, family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(240, 220, 226, 0.4)' },
                    ticks: { font: { size: 11, family: 'Outfit' } }
                }
            }
        }
    });
}

function updateLoaderStatus(text) {
    const el = document.getElementById("loader-status");
    if (el) el.innerText = text;
}

function updateISTClock() {
    const timeEl = document.getElementById("header-live-time");
    const dateEl = document.getElementById("header-live-date");

    const now = new Date();
    
    // Format Options for Indian Standard Time (IST)
    const timeOptions = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    };

    const dateOptions = {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        weekday: 'short'
    };

    if (timeEl) {
        timeEl.innerText = now.toLocaleTimeString('en-IN', timeOptions);
    }
    if (dateEl) {
        dateEl.innerText = `${now.toLocaleDateString('en-IN', dateOptions)} (IST)`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateISTClock();
    setInterval(updateISTClock, 1000);

    const pwdInput = document.getElementById("pdf-password-input");
    if (pwdInput) {
        pwdInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitPdfPassword();
            }
        });
    }
});

// ==========================================
// RENDERING & VISUALIZATION LOGIC
// ==========================================
function renderAnalyzerDashboard(data) {
    if (document.getElementById("meta-name")) document.getElementById("meta-name").innerText = data.metadata.customer_name;
    if (document.getElementById("meta-account")) document.getElementById("meta-account").innerText = data.metadata.account_number;
    if (document.getElementById("meta-bank")) document.getElementById("meta-bank").innerText = data.metadata.bank_name;
    if (document.getElementById("meta-period")) document.getElementById("meta-period").innerText = `${data.metadata.start_date} to ${data.metadata.end_date}`;
    if (document.getElementById("meta-statements-count")) {
        const count = data.metadata.statements_count || (data.statementsList ? data.statementsList.length : 1);
        document.getElementById("meta-statements-count").innerText = `${count} Statement${count > 1 ? 's Consolidated' : ''}`;
    }

    const abb1mStr = formatCurrencyJS(data.abb_summary.abb_1m);
    const abb3mStr = formatCurrencyJS(data.abb_summary.abb_3m);
    const abb6mStr = formatCurrencyJS(data.abb_summary.abb_6m);

    if (document.getElementById("hero-abb-1m")) document.getElementById("hero-abb-1m").innerText = abb1mStr;
    if (document.getElementById("hero-abb-3m")) document.getElementById("hero-abb-3m").innerText = abb3mStr;
    if (document.getElementById("hero-abb-6m")) document.getElementById("hero-abb-6m").innerText = abb6mStr;

    if (document.getElementById("summary-abb-1m")) document.getElementById("summary-abb-1m").innerText = abb1mStr;
    if (document.getElementById("abb-3m")) document.getElementById("abb-3m").innerText = abb3mStr;
    if (document.getElementById("abb-6m")) document.getElementById("abb-6m").innerText = abb6mStr;

    if (document.getElementById("bento-abb-1m")) document.getElementById("bento-abb-1m").innerText = abb1mStr;
    if (document.getElementById("bento-abb-3m")) document.getElementById("bento-abb-3m").innerText = abb3mStr;
    if (document.getElementById("bento-abb-6m")) document.getElementById("bento-abb-6m").innerText = abb6mStr;

    // Update SVG Donut Gauge Score
    let healthScore = 75;
    if (data.assessment && data.assessment.abb_grade) {
        if (data.assessment.abb_grade === "EXCELLENT") healthScore = 92;
        else if (data.assessment.abb_grade === "GOOD") healthScore = 80;
        else if (data.assessment.abb_grade === "MODERATE") healthScore = 65;
        else healthScore = 48;
    }
    if (document.getElementById("donut-percentage-val")) {
        document.getElementById("donut-percentage-val").innerText = `${healthScore}%`;
    }
    if (document.getElementById("donut-fill-ring")) {
        // Circumference is 2 * PI * 42 = ~264
        const strokeOffset = 264 - (264 * healthScore / 100);
        document.getElementById("donut-fill-ring").style.strokeDashoffset = strokeOffset;
    }

    // Update Risk Alerts Counter Badge
    if (document.getElementById("alerts-count-badge")) {
        const alertsCount = (data.assessment && data.assessment.metrics) ? (data.assessment.metrics.negative_count || 0) : 0;
        document.getElementById("alerts-count-badge").innerText = alertsCount;
    }

    let totalCredits = 0;
    let totalDebits = 0;
    let crCount = 0;
    let drCount = 0;

    data.transactions.forEach(tx => {
        totalCredits += tx.Credit;
        totalDebits += tx.Debit;
        if (tx.Credit > 0) crCount++;
        if (tx.Debit > 0) drCount++;
    });

    // Calculate Underwriting KPIs (Max Sanction & Net Surplus)
    const abb6mVal = (data.abb_summary && data.abb_summary.abb_6m) ? data.abb_summary.abb_6m : 0;
    const maxSanction = Math.round(abb6mVal * 6.5);
    const netSurplus = totalCredits - totalDebits;

    if (document.getElementById("kpi-sanction-limit")) {
        document.getElementById("kpi-sanction-limit").innerText = formatCurrencyJS(maxSanction);
    }
    if (document.getElementById("kpi-net-surplus")) {
        document.getElementById("kpi-net-surplus").innerText = (netSurplus >= 0 ? "+" : "") + formatCurrencyJS(netSurplus);
    }

    // Extract Latest Balance, Highest Balance, and Lowest Balance with zero-defensive filtering
    if (data.transactions && data.transactions.length > 0) {
        const validBalances = data.transactions
            .map(tx => tx.Balance)
            .filter(b => typeof b === 'number' && !isNaN(b));
            
        const latestBal = validBalances.length > 0 ? validBalances[validBalances.length - 1] : 0.0;
        const highestBal = validBalances.length > 0 ? Math.max(...validBalances) : 0.0;
        const lowestBal = validBalances.length > 0 ? Math.min(...validBalances) : 0.0;

        if (document.getElementById("kpi-latest-balance")) {
            document.getElementById("kpi-latest-balance").innerText = formatCurrencyJS(latestBal);
        }
        if (document.getElementById("kpi-highest-balance")) {
            document.getElementById("kpi-highest-balance").innerText = formatCurrencyJS(highestBal);
        }
        if (document.getElementById("kpi-lowest-balance")) {
            document.getElementById("kpi-lowest-balance").innerText = formatCurrencyJS(lowestBal);
            
            const lowestBadge = document.getElementById("lowest-balance-badge");
            if (lowestBadge) {
                if (lowestBal < 0) {
                    lowestBadge.className = "text-[10px] font-extrabold bg-rose-600 text-white px-2 py-0.5 rounded-full animate-pulse";
                    lowestBadge.innerText = "Overdraft Deficit";
                } else if (lowestBal < 1000) {
                    lowestBadge.className = "text-[10px] font-extrabold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full";
                    lowestBadge.innerText = "Low Reserve Dip";
                } else {
                    lowestBadge.className = "text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full";
                    lowestBadge.innerText = "Safe Reserve";
                }
            }
        }
    }

    if (document.getElementById("kpi-total-credits")) document.getElementById("kpi-total-credits").innerText = formatCurrencyJS(totalCredits);
    if (document.getElementById("kpi-total-debits")) document.getElementById("kpi-total-debits").innerText = formatCurrencyJS(totalDebits);

    if (document.getElementById("side-total-credit")) document.getElementById("side-total-credit").innerText = `+${formatCurrencyJS(totalCredits)}`;
    if (document.getElementById("side-total-debit")) document.getElementById("side-total-debit").innerText = `-${formatCurrencyJS(totalDebits)}`;

    // Populate Recent Transactions List in Bento Row 3
    const recentBentoList = document.getElementById("recent-transactions-bento-list");
    if (recentBentoList && data.transactions.length > 0) {
        const recent3 = data.transactions.slice(-3).reverse();
        recentBentoList.innerHTML = "";
        recent3.forEach(tx => {
            const isCredit = tx.Credit > 0;
            const amtText = isCredit ? `+${formatCurrencyJS(tx.Credit)}` : `-${formatCurrencyJS(tx.Debit)}`;
            const badgeClass = isCredit ? "text-emerald-600 font-bold" : "text-rose-500 font-bold";
            const shortDesc = tx.Particulars.length > 24 ? tx.Particulars.substring(0, 24) + "..." : tx.Particulars;

            recentBentoList.innerHTML += `
                <div class="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between">
                    <div class="truncate pr-2">
                        <div class="font-bold text-slate-800 text-xs truncate">${shortDesc}</div>
                        <div class="text-[10px] text-slate-400 font-medium">${tx.Date}</div>
                    </div>
                    <span class="text-xs ${badgeClass} flex-shrink-0">${amtText}</span>
                </div>
            `;
        });
    }

    renderTransactionsTable(data.transactions);

    if (document.getElementById("credit-score-badge")) {
        document.getElementById("credit-score-badge").innerText = `${data.assessment.overall_grade} (${data.assessment.abb_grade})`;
    }
    if (document.getElementById("credit-risk-desc")) {
        document.getElementById("credit-risk-desc").innerText = data.assessment.verdict;
    }
    if (document.getElementById("loan-eligibility-val")) {
        const estLoan = data.abb_summary.abb_6m * 12;
        document.getElementById("loan-eligibility-val").innerText = formatCurrencyJS(estLoan);
    }

    drawLedgerChart(data.transactions);
}

function renderTransactionsTable(txList) {
    const tbody = document.querySelector("#ledger-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    txList.forEach(tx => {
        const debitText = tx.Debit > 0 ? formatCurrencyJS(tx.Debit) : "-";
        const creditText = tx.Credit > 0 ? formatCurrencyJS(tx.Credit) : "-";

        tbody.innerHTML += `
            <tr>
                <td class="whitespace-nowrap font-medium text-slate-500">${tx.Date}</td>
                <td class="font-bold text-slate-800">${tx.Particulars}</td>
                <td class="text-right text-rose-500 font-bold">${debitText}</td>
                <td class="text-right text-emerald-600 font-bold">${creditText}</td>
                <td class="text-right text-slate-900 font-black">${formatCurrencyJS(tx.Balance)}</td>
            </tr>
        `;
    });
}

function drawLedgerChart(transactions) {
    const ctx = document.getElementById("ledgerChart");
    if (!ctx) return;

    if (ledgerChartInstance) {
        ledgerChartInstance.destroy();
    }

    const labels = transactions.map(tx => tx.Date);
    const dataPoints = transactions.map(tx => tx.Balance);

    ledgerChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Running Balance (₹)',
                data: dataPoints,
                borderColor: '#FF5E7E',
                backgroundColor: 'rgba(255, 94, 126, 0.08)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: '#FF5E7E'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 11, family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(240, 220, 226, 0.4)' },
                    ticks: { font: { size: 11, family: 'Outfit' } }
                }
            }
        }
    });
}

function drawAbbChart(monthlyAbb) {
    const ctx = document.getElementById("abbChart");
    if (!ctx) return;

    if (abbChartInstance) {
        abbChartInstance.destroy();
    }

    const labels = monthlyAbb.map(m => m.monthName);
    const abbValues = monthlyAbb.map(m => m.abb);

    abbChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Average Daily Balance (₹)',
                data: abbValues,
                backgroundColor: 'rgba(255, 94, 126, 0.85)',
                borderRadius: 12,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11, family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(240, 220, 226, 0.4)' },
                    ticks: { font: { size: 11, family: 'Outfit' } }
                }
            }
        }
    });
}
