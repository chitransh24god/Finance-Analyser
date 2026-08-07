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
        }
    }
}

// ==========================================
// MULTI-STATEMENT UPLOAD PIPELINE
// ==========================================
function initUploadListener() {
    const fileInput = document.getElementById("statement-upload");
    if (!fileInput) return;
    
    fileInput.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        state.pendingFilesQueue = files;
        state.parsedStatementsList = [];
        state.currentEncryptedFileIndex = 0;
        
        processUploadedStatementsQueue(0, "");
    });
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

    if (!state.pendingFilesQueue || state.pendingFilesQueue.length === 0) {
        alert("No statement files selected. Please select your PDF statement(s) again.");
        return;
    }

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

    // Sort all transactions chronologically by Date
    allTxList.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    // Deduplicate exact duplicate transaction rows
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

    state.parsedData = {
        metadata: consolidatedMetadata,
        transactions: deduplicatedTxList,
        monthly_abb,
        abb_summary,
        assessment,
        statementsList: state.parsedStatementsList
    };

    renderAnalyzerDashboard(state.parsedData);
    switchSubtab('dashboard');

    loader.classList.add("hidden");
    results.classList.remove("hidden");
    errorModal.classList.add("hidden");
    document.getElementById("statement-upload").value = "";
}

function updateLoaderStatus(text) {
    const el = document.getElementById("loader-status");
    if (el) el.innerText = text;
}

document.addEventListener("DOMContentLoaded", () => {
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

    if (document.getElementById("summary-abb-1m")) document.getElementById("summary-abb-1m").innerText = abb1mStr;
    if (document.getElementById("abb-3m")) document.getElementById("abb-3m").innerText = abb3mStr;
    if (document.getElementById("abb-6m")) document.getElementById("abb-6m").innerText = abb6mStr;

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

    if (document.getElementById("side-total-credit")) document.getElementById("side-total-credit").innerText = `+${formatCurrencyJS(totalCredits)}`;
    if (document.getElementById("side-total-debit")) document.getElementById("side-total-debit").innerText = `-${formatCurrencyJS(totalDebits)}`;

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
