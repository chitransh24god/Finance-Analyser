// Global Application State
const state = {
    loggedIn: false,
    activePage: 'hub', // 'hub', 'analyzer', 'calculator'
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
        showPage('hub');
    }

    const loginForm = document.getElementById("login-form");
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
            showPage('hub');
        } else {
            errorDiv.classList.remove("hidden");
        }
    });

    const logoutBtn = document.getElementById("logout-btn");
    logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("mybankloan_auth");
        state.loggedIn = false;
        document.getElementById("login-gate").classList.remove("hidden");
        document.getElementById("main-workspace").classList.add("hidden");
        document.getElementById("password").value = "";
    });
}

// ==========================================
// ROUTING & NAVIGATION
// ==========================================
function initNavigation() {
    const navHub = document.getElementById("nav-hub");
    const navAnalyzer = document.getElementById("nav-analyzer");

    navHub.addEventListener("click", () => {
        setActiveNav(navHub);
        showPage('hub');
    });

    navAnalyzer.addEventListener("click", () => {
        setActiveNav(navAnalyzer);
        showPage('analyzer');
    });
}

function setActiveNav(activeBtn) {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    activeBtn.classList.add("active");
}

function showPage(pageId) {
    state.activePage = pageId;
    
    // Hide all main pages
    document.getElementById("section-hub").classList.add("hidden");
    document.getElementById("section-analyzer").classList.add("hidden");
    document.getElementById("section-calculator").classList.add("hidden");

    const pageTitle = document.getElementById("page-title");

    if (pageId === 'hub') {
        document.getElementById("section-hub").classList.remove("hidden");
        pageTitle.innerText = "Financial Hub";
    } else if (pageId === 'analyzer') {
        document.getElementById("section-analyzer").classList.remove("hidden");
        pageTitle.innerText = "Bank Statement Analyzer";
    } else if (pageId === 'calculator') {
        document.getElementById("section-calculator").classList.remove("hidden");
        pageTitle.innerText = `${getCalculatorName(state.activeCalculator)}`;
    }
}

function getCalculatorName(id) {
    const names = {
        emi: "EMI Calculator",
        bond: "Bond Valuation",
        sip: "SIP Calculator",
        fd: "Fixed Deposit Calculator",
        npv: "NPV & IRR Valuer"
    };
    return names[id] || "Calculator";
}

// ==========================================
// CALCULATOR INTERFACES ROUTER
// ==========================================
function openCalculator(calcId) {
    state.activeCalculator = calcId;
    showPage('calculator');
    renderCalculatorWorkspace(calcId);
}

function backToHub() {
    const navHub = document.getElementById("nav-hub");
    setActiveNav(navHub);
    showPage('hub');
}

// ==========================================
// SUB-TAB TOGGLES FOR ANALYZER
// ==========================================
function switchSubtab(subtabId) {
    state.activeSubtab = subtabId;

    // Subtab links active styles
    document.querySelectorAll("#analyzer-subtabs .subtab-item").forEach(item => {
        item.classList.remove("active");
    });
    
    // Find the clicked tab button
    const buttons = document.querySelectorAll("#analyzer-subtabs .subtab-item");
    buttons.forEach(btn => {
        if (btn.innerText.toLowerCase().includes(subtabId === 'abb' ? 'abb' : subtabId)) {
            btn.classList.add("active");
        }
    });

    // Content containers toggling
    document.querySelectorAll(".subtab-content").forEach(c => {
        c.classList.add("hidden");
    });
    document.getElementById(`subtab-${subtabId}`).classList.remove("hidden");

    // Redraw charts if switching back to dashboard or abb to ensure responsive dimensions are aligned
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
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        state.pendingFileName = file.name;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            state.pendingFileBytes = event.target.result;
            processUploadedStatement();
        };
        reader.readAsArrayBuffer(file);
    });
}

async function processUploadedStatement(password = "") {
    const loader = document.getElementById("analyzer-loader");
    const results = document.getElementById("analyzer-results");
    const errorModal = document.getElementById("pdf-password-modal");

    results.classList.add("hidden");
    loader.classList.remove("hidden");
    updateLoaderStatus("Extracting character layouts...");

    try {
        // Parse PDF in client-side using PDF.js
        const extractedTextAndLayout = await extractTextAndLayoutFromPdf(state.pendingFileBytes, password);
        
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
        // Sort and clean transaction rows
        const cleanedTransactions = rawTransactions.map(tx => ({
            Date: tx.Date,
            Particulars: tx.Particulars,
            Debit: parseFloat(tx.Debit) || 0.0,
            Credit: parseFloat(tx.Credit) || 0.0,
            Balance: parseFloat(tx.Balance) || 0.0
        })).sort((a, b) => new Date(a.Date) - new Date(b.Date));

        updateLoaderStatus("Computing average daily balances (ABB)...");
        // Calculate ABB
        const { monthly_abb, abb_summary } = calculateMonthlyAbbJS(
            cleanedTransactions, 
            metadata.start_date, 
            metadata.end_date
        );

        updateLoaderStatus("Evaluating credit risk variables...");
        // Credit assessment
        const assessment = analyzeCreditProfileJS(
            cleanedTransactions, 
            monthly_abb, 
            abb_summary
        );

        // Store calculations in global state
        state.parsedData = {
            metadata,
            transactions: cleanedTransactions,
            monthly_abb,
            abb_summary,
            assessment
        };

        // Render sections
        renderAnalyzerDashboard(state.parsedData);
        switchSubtab('dashboard');

        loader.classList.add("hidden");
        results.classList.remove("hidden");
        errorModal.classList.add("hidden");

        // Clear file input cache
        document.getElementById("statement-upload").value = "";

    } catch (err) {
        loader.classList.add("hidden");
        const errMsg = err.message || "";
        
        if (errMsg.includes("password") || errMsg.includes("decrypt") || errMsg.includes("encrypted")) {
            // Trigger password modal
            errorModal.classList.remove("hidden");
        } else {
            alert(`Processing Error: ${errMsg}`);
            console.error(err);
        }
    }
}

function updateLoaderStatus(text) {
    document.getElementById("loader-status").innerText = text;
}

// Password modal submits
function submitPdfPassword() {
    const pwd = document.getElementById("pdf-password-input").value;
    if (!pwd) {
        alert("Please enter a decryption key.");
        return;
    }
    document.getElementById("pdf-password-modal").classList.add("hidden");
    processUploadedStatement(pwd);
}

function closePasswordModal() {
    document.getElementById("pdf-password-modal").classList.add("hidden");
    document.getElementById("statement-upload").value = "";
}

// ==========================================
// RENDERING & VISUALIZATION LOGIC
// ==========================================
function renderAnalyzerDashboard(data) {
    // 1. Metadata Headers
    document.getElementById("meta-name").innerText = data.metadata.customer_name;
    document.getElementById("meta-account").innerText = data.metadata.account_number;
    document.getElementById("meta-bank").innerText = data.metadata.bank_name;
    document.getElementById("meta-period").innerText = `${data.metadata.start_date} to ${data.metadata.end_date}`;

    // 2. Rolling ABB KPI Values
    document.getElementById("abb-1m").innerText = formatCurrencyJS(data.abb_summary.abb_1m);
    document.getElementById("abb-3m").innerText = formatCurrencyJS(data.abb_summary.abb_3m);
    document.getElementById("abb-6m").innerText = formatCurrencyJS(data.abb_summary.abb_6m);

    // 3. Flow metrics aggregates
    let totalCredits = 0;
    let totalDebits = 0;
    let maxBal = -Infinity;
    let minBal = Infinity;
    let crCount = 0;
    let drCount = 0;

    data.transactions.forEach(tx => {
        totalCredits += tx.Credit;
        totalDebits += tx.Debit;
        if (tx.Credit > 0) crCount++;
        if (tx.Debit > 0) drCount++;
        if (tx.Balance > maxBal) maxBal = tx.Balance;
        if (tx.Balance < minBal) minBal = tx.Balance;
    });

    const latestBal = data.transactions[data.transactions.length - 1].Balance;

    document.getElementById("flow-credits").innerText = formatCurrencyJS(totalCredits);
    document.getElementById("flow-debits").innerText = formatCurrencyJS(totalDebits);
    document.getElementById("flow-highest").innerText = formatCurrencyJS(maxBal);
    document.getElementById("flow-lowest").innerText = formatCurrencyJS(minBal);
    document.getElementById("flow-latest").innerText = formatCurrencyJS(latestBal);

    // 4. Fill Transactions Subtab (Init table rows)
    renderTransactionsTable(data.transactions);

    // 5. Fill Monthly ABB Targets Subtab Table
    const abbTbody = document.querySelector("#abb-months-table tbody");
    abbTbody.innerHTML = "";
    data.monthly_abb.forEach(row => {
        abbTbody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-4 font-bold text-gray-900">${row.monthName}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.bal5)}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.bal10)}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.bal15)}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.bal20)}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.bal25)}</td>
                <td class="p-4 text-right">${formatCurrencyJS(row.balEnd)}</td>
                <td class="p-4 text-right font-bold text-blue-600 bg-blue-50/20">${formatCurrencyJS(row.abb)}</td>
            </tr>
        `;
    });

    // 6. Fill Underwriting Assessment Suitability Subtab
    // Days covered
    const startDate = new Date(data.metadata.start_date);
    const endDate = new Date(data.metadata.end_date);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    document.getElementById("assess-days").innerText = `${totalDays} Days`;
    document.getElementById("assess-credits").innerText = formatCurrencyJS(totalCredits);
    document.getElementById("assess-debits").innerText = formatCurrencyJS(totalDebits);
    document.getElementById("assess-count").innerText = `${crCount} Credits / ${drCount} Debits`;
    document.getElementById("assess-highest").innerText = formatCurrencyJS(maxBal);
    document.getElementById("assess-lowest").innerText = formatCurrencyJS(minBal);
    document.getElementById("assess-latest").innerText = formatCurrencyJS(latestBal);

    // Underwriting verdicts
    document.getElementById("assess-val-abb").innerText = data.assessment.abb_grade;
    styleVerdictBadge("badge-assess-abb", data.assessment.abb_grade, data.assessment.abb_badge);

    document.getElementById("assess-val-stability").innerText = data.assessment.stability_grade;
    styleVerdictBadge("badge-assess-stability", data.assessment.stability_grade, data.assessment.stability_badge);

    document.getElementById("assess-val-liquidity").innerText = data.assessment.liquidity_grade;
    styleVerdictBadge("badge-assess-liquidity", data.assessment.liquidity_grade, data.assessment.liquidity_badge);

    // Overall Rating Card
    document.getElementById("assess-val-overall").innerText = data.assessment.overall_grade;
    styleVerdictBadge("badge-assess-overall", data.assessment.overall_grade, data.assessment.overall_badge);
    
    const overallCard = document.getElementById("status-card-overall");
    overallCard.className = `border-2 rounded-xl p-4 flex items-center justify-between ${data.assessment.overall_card}`;

    // Underwriting text commentary
    document.getElementById("assess-verdict-note").innerText = data.assessment.verdict;

    // Draw Dashboard Ledger Line chart
    drawLedgerChart(data.transactions);
}

function styleVerdictBadge(elementId, gradeText, badgeClass) {
    const badge = document.getElementById(elementId);
    badge.innerText = gradeText;
    badge.className = `px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}`;
}

// Render dynamic transactions grid
function renderTransactionsTable(txList) {
    const tbody = document.querySelector("#transactions-table tbody");
    tbody.innerHTML = "";

    txList.forEach(tx => {
        const debitText = tx.Debit > 0 ? formatCurrencyJS(tx.Debit) : "-";
        const creditText = tx.Credit > 0 ? formatCurrencyJS(tx.Credit) : "-";

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-4 font-medium text-gray-500 whitespace-nowrap">${tx.Date}</td>
                <td class="p-4 text-gray-900">${tx.Particulars}</td>
                <td class="p-4 text-right text-red-600 font-semibold">${debitText}</td>
                <td class="p-4 text-right text-green-700 font-semibold">${creditText}</td>
                <td class="p-4 text-right text-gray-900 font-bold">${formatCurrencyJS(tx.Balance)}</td>
            </tr>
        `;
    });

    document.getElementById("table-stats-footer").innerText = `Showing ${txList.length} of ${state.parsedData.transactions.length} transactions`;
}

// Apply searches & limits
function applyTxFilters() {
    const query = document.getElementById("tx-search-input").value.toLowerCase();
    const minVal = parseFloat(document.getElementById("tx-filter-min").value) || 0.0;
    const maxVal = parseFloat(document.getElementById("tx-filter-max").value) || Infinity;

    const filtered = state.parsedData.transactions.filter(tx => {
        const matchesQuery = tx.Particulars.toLowerCase().includes(query);
        const maxAmount = Math.max(tx.Debit, tx.Credit);
        const matchesAmount = maxAmount >= minVal && maxAmount <= maxVal;
        return matchesQuery && matchesAmount;
    });

    renderTransactionsTable(filtered);
}

function resetTxFilters() {
    document.getElementById("tx-search-input").value = "";
    document.getElementById("tx-filter-min").value = "";
    document.getElementById("tx-filter-max").value = "";
    renderTransactionsTable(state.parsedData.transactions);
}

// ==========================================
// CHART DRAW LOOPS (Chart.js Configs)
// ==========================================
function drawLedgerChart(transactions) {
    if (ledgerChartInstance) {
        ledgerChartInstance.destroy();
    }

    const ctx = document.getElementById("ledger-trend-chart").getContext("2d");
    
    // Setup clean labels and values (limits display density if transaction list is very large)
    let step = 1;
    if (transactions.length > 300) {
        step = Math.ceil(transactions.length / 150);
    }
    
    const chartLabels = [];
    const chartValues = [];
    for (let i = 0; i < transactions.length; i += step) {
        chartLabels.push(transactions[i].Date);
        chartValues.push(transactions[i].Balance);
    }

    ledgerChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Account Ledger Balance',
                data: chartValues,
                borderColor: '#2563EB',
                borderWidth: 2,
                backgroundColor: 'rgba(37, 99, 235, 0.03)',
                fill: true,
                pointRadius: chartLabels.length > 50 ? 0 : 2,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}

function drawAbbChart(monthlyAbb) {
    if (abbChartInstance) {
        abbChartInstance.destroy();
    }

    const ctx = document.getElementById("abb-history-chart").getContext("2d");
    const labels = monthlyAbb.map(row => row.monthName);
    const values = monthlyAbb.map(row => row.abb);

    abbChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly ABB (₹)',
                data: values,
                backgroundColor: '#3B82F6',
                hoverBackgroundColor: '#2563EB',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}
