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
    pendingFileBytes: null,
    pendingFileName: ""
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
// UPLOAD PIPELINE
// ==========================================
function initUploadListener() {
    const fileInput = document.getElementById("statement-upload");
    if (!fileInput) return;
    
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        state.pendingFileName = file.name;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            state.pendingFileBytes = new Uint8Array(event.target.result);
            processUploadedStatement();
        };
        reader.readAsArrayBuffer(file);
    });
}

async function processUploadedStatement(password = "") {
    const loader = document.getElementById("analyzer-loader");
    const results = document.getElementById("analyzer-results");
    const errorModal = document.getElementById("pdf-password-modal");

    if (!state.pendingFileBytes || state.pendingFileBytes.length === 0) {
        alert("File buffer empty. Please select your PDF statement again.");
        return;
    }

    results.classList.add("hidden");
    loader.classList.remove("hidden");
    updateLoaderStatus("Extracting character layouts...");

    try {
        const freshPdfBytes = new Uint8Array(state.pendingFileBytes);
        const extractedTextAndLayout = await extractTextAndLayoutFromPdf(freshPdfBytes, password);
        
        updateLoaderStatus("Identifying bank statement layout...");
        const selectedBank = document.getElementById("bank-selector").value;
        const { metadata, rawTransactions } = await routeAndExtractTransactions(
            extractedTextAndLayout, 
            state.pendingFileName,
            selectedBank
        );

        if (rawTransactions.length === 0) {
            throw new Error("No transactions extracted. Please ensure this is a supported bank statement.");
        }

        updateLoaderStatus("Running data integrity checks...");
        const cleanedTransactions = rawTransactions.map(tx => ({
            Date: tx.Date,
            Particulars: tx.Particulars,
            Debit: parseFloat(tx.Debit) || 0.0,
            Credit: parseFloat(tx.Credit) || 0.0,
            Balance: parseFloat(tx.Balance) || 0.0
        })).sort((a, b) => new Date(a.Date) - new Date(b.Date));

        updateLoaderStatus("Computing average daily balances (ABB)...");
        const { monthly_abb, abb_summary } = calculateMonthlyAbbJS(
            cleanedTransactions, 
            metadata.start_date, 
            metadata.end_date
        );

        updateLoaderStatus("Evaluating credit risk variables...");
        const assessment = analyzeCreditProfileJS(
            cleanedTransactions, 
            monthly_abb, 
            abb_summary
        );

        state.parsedData = {
            metadata,
            transactions: cleanedTransactions,
            monthly_abb,
            abb_summary,
            assessment
        };

        renderAnalyzerDashboard(state.parsedData);
        switchSubtab('dashboard');

        loader.classList.add("hidden");
        results.classList.remove("hidden");
        errorModal.classList.add("hidden");
        document.getElementById("pdf-password-error").classList.add("hidden");
        document.getElementById("statement-upload").value = "";

    } catch (err) {
        loader.classList.add("hidden");
        const errMsg = (err.message || "").toLowerCase();
        const errName = err.name || "";
        
        if (errName === "PasswordException" || errMsg.includes("password") || errMsg.includes("decrypt") || errMsg.includes("encrypted")) {
            errorModal.classList.remove("hidden");
            const pwdInput = document.getElementById("pdf-password-input");
            const errorDiv = document.getElementById("pdf-password-error");
            
            if (password) {
                errorDiv.innerText = "Incorrect password. Please enter the valid PDF password.";
                errorDiv.classList.remove("hidden");
            } else {
                errorDiv.innerText = "This bank statement is password protected. Please enter the password.";
                errorDiv.classList.remove("hidden");
            }
            pwdInput.focus();
            pwdInput.select();
        } else {
            alert(`Processing Error: ${err.message || err}`);
            console.error(err);
        }
    }
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

function submitPdfPassword() {
    const pwd = document.getElementById("pdf-password-input").value;
    if (!pwd) {
        document.getElementById("pdf-password-error").innerText = "Please enter a password.";
        document.getElementById("pdf-password-error").classList.remove("hidden");
        return;
    }
    document.getElementById("pdf-password-modal").classList.add("hidden");
    processUploadedStatement(pwd);
}

function closePasswordModal() {
    document.getElementById("pdf-password-modal").classList.add("hidden");
    document.getElementById("pdf-password-error").classList.add("hidden");
    document.getElementById("pdf-password-input").value = "";
    document.getElementById("statement-upload").value = "";
}

// ==========================================
// RENDERING & VISUALIZATION LOGIC
// ==========================================
function renderAnalyzerDashboard(data) {
    if (document.getElementById("meta-name")) document.getElementById("meta-name").innerText = data.metadata.customer_name;
    if (document.getElementById("meta-account")) document.getElementById("meta-account").innerText = data.metadata.account_number;
    if (document.getElementById("meta-bank")) document.getElementById("meta-bank").innerText = data.metadata.bank_name;
    if (document.getElementById("meta-period")) document.getElementById("meta-period").innerText = `${data.metadata.start_date} to ${data.metadata.end_date}`;

    const abb1mStr = formatCurrencyJS(data.abb_summary.abb_1m);
    const abb3mStr = formatCurrencyJS(data.abb_summary.abb_3m);
    const abb6mStr = formatCurrencyJS(data.abb_summary.abb_6m);

    if (document.getElementById("abb-1m")) document.getElementById("abb-1m").innerText = abb1mStr;
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

    if (document.getElementById("kpi-total-credits")) document.getElementById("kpi-total-credits").innerText = formatCurrencyJS(totalCredits);
    if (document.getElementById("kpi-credit-count")) document.getElementById("kpi-credit-count").innerHTML = `<i class="fa-solid fa-list-check"></i> ${crCount} credit entries detected`;
    
    if (document.getElementById("kpi-total-debits")) document.getElementById("kpi-total-debits").innerText = formatCurrencyJS(totalDebits);
    if (document.getElementById("kpi-debit-count")) document.getElementById("kpi-debit-count").innerHTML = `<i class="fa-solid fa-list-check"></i> ${drCount} debit entries detected`;

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
