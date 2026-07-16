// JavaScript Financial Calculators Module (EMI, Bond, SIP, FD, NPV/IRR, GST)

let activeChart1 = null;
let activeChart2 = null;

/**
 * Renders the HTML form layout for the selected calculator inside the workspace.
 */
function renderCalculatorWorkspace(calcId) {
    const ws = document.getElementById("calculator-workspace");
    ws.innerHTML = ""; // Clear

    // Destroy existing charts to prevent memory leak
    if (activeChart1) activeChart1.destroy();
    if (activeChart2) activeChart2.destroy();
    activeChart1 = null;
    activeChart2 = null;

    if (calcId === "emi") {
        ws.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in">
                <!-- Inputs column -->
                <div class="bg-[#F8F9FC] border border-gray-200 rounded-2xl p-6 lg:col-span-1 space-y-6">
                    <h3 class="font-extrabold text-gray-900 text-lg border-b pb-2">EMI Parameters</h3>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Loan Amount (₹)</label>
                        <input type="number" id="emi-principal" value="1000000" min="1000" step="5000" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Annual Interest Rate (%)</label>
                        <input type="number" id="emi-rate" value="8.5" min="0.1" max="50" step="0.05" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Loan Tenure (Years)</label>
                        <input type="number" id="emi-tenure" value="5" min="1" max="40" step="1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <button onclick="calculateEmi()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">
                        Calculate EMI
                    </button>
                </div>

                <!-- Outputs column -->
                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Monthly Installment</span>
                            <span id="emi-val-monthly" class="text-2xl font-extrabold text-blue-600 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Total Interest Payable</span>
                            <span id="emi-val-interest" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Total Payment (Principal + Int)</span>
                            <span id="emi-val-total" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                    </div>

                    <!-- Charts container -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-gray-200 rounded-2xl p-6">
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Principal vs Interest Breakdown</h4>
                            <div class="w-full h-full"><canvas id="emi-pie-chart"></canvas></div>
                        </div>
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Loan Balance Depreciation</h4>
                            <div class="w-full h-full"><canvas id="emi-line-chart"></canvas></div>
                        </div>
                    </div>

                    <!-- Schedule Breakdown -->
                    <div class="bg-white border border-gray-200 rounded-2xl p-6">
                        <h4 class="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider">Amortization Schedule</h4>
                        <div class="overflow-y-auto max-h-60 border rounded-xl text-xs">
                            <table class="w-full text-left border-collapse" id="emi-schedule-table">
                                <thead class="bg-gray-50 border-b font-semibold text-gray-500 sticky top-0">
                                    <tr>
                                        <th class="p-3">Month</th>
                                        <th class="p-3 text-right">Beginning Bal</th>
                                        <th class="p-3 text-right">EMI Payment</th>
                                        <th class="p-3 text-right">Interest Paid</th>
                                        <th class="p-3 text-right">Principal Repaid</th>
                                        <th class="p-3 text-right">Ending Balance</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 text-gray-700">
                                    <!-- Dynamic Amortization rows -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        calculateEmi(); // Trigger initial calc

    } else if (calcId === "bond") {
        ws.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in">
                <div class="bg-[#F8F9FC] border border-gray-200 rounded-2xl p-6 lg:col-span-1 space-y-6">
                    <h3 class="font-extrabold text-gray-900 text-lg border-b pb-2">Bond Parameters</h3>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Face Value (₹)</label>
                        <input type="number" id="bond-face" value="1000" min="10" step="50" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coupon Rate (%)</label>
                        <input type="number" id="bond-coupon" value="6.0" min="0" max="100" step="0.1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Market Rate / Yield YTM (%)</label>
                        <input type="number" id="bond-yield" value="8.0" min="0" max="100" step="0.1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tenure (Years)</label>
                        <input type="number" id="bond-years" value="10" min="1" max="100" step="1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Coupon Frequency</label>
                        <select id="bond-freq" class="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white">
                            <option value="1">Annual</option>
                            <option value="2" selected>Semi-Annual</option>
                        </select>
                    </div>

                    <button onclick="calculateBond()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">
                        Valuate Bond
                    </button>
                </div>

                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Fair Price of Bond</span>
                            <span id="bond-val-price" class="text-2xl font-extrabold text-blue-600 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Periodic Coupon Payment</span>
                            <span id="bond-val-payment" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Bond Pricing Status</span>
                            <span id="bond-val-status" class="text-2xl font-extrabold text-gray-900 block mt-2">Discount Bond</span>
                        </div>
                    </div>

                    <div class="bg-white border border-gray-200 rounded-2xl p-6">
                        <h4 class="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider">Bond Valuation Formula Details</h4>
                        <div class="bg-gray-50 p-4 rounded-xl text-sm leading-relaxed text-gray-600 font-medium">
                            <p><strong>Pricing Equation:</strong></p>
                            <div class="my-3 text-center font-mono font-bold text-gray-800 text-base">
                                Price = ∑ [ C / (1 + r)<sup>t</sup> ] + [ Face Value / (1 + r)<sup>N</sup> ]
                            </div>
                            <p class="text-xs text-gray-400">Where <em>C</em> is periodic coupon payment, <em>r</em> is periodic discount rate, and <em>N</em> is total compounding coupon counts.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        calculateBond();

    } else if (calcId === "sip") {
        ws.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in">
                <div class="bg-[#F8F9FC] border border-gray-200 rounded-2xl p-6 lg:col-span-1 space-y-6">
                    <h3 class="font-extrabold text-gray-900 text-lg border-b pb-2">SIP Parameters</h3>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Monthly Installment (₹)</label>
                        <input type="number" id="sip-monthly" value="5000" min="100" step="500" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Expected Return Rate (%)</label>
                        <input type="number" id="sip-rate" value="12" min="0.1" max="100" step="0.1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Investment Period (Years)</label>
                        <input type="number" id="sip-years" value="10" min="1" max="40" step="1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <button onclick="calculateSip()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">
                        Calculate SIP Returns
                    </button>
                </div>

                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Total Future Value</span>
                            <span id="sip-val-future" class="text-2xl font-extrabold text-blue-600 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Invested Amount</span>
                            <span id="sip-val-invested" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Wealth Gain Amount</span>
                            <span id="sip-val-gain" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-gray-200 rounded-2xl p-6">
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Investment vs Wealth Gained</h4>
                            <div class="w-full h-full"><canvas id="sip-pie-chart"></canvas></div>
                        </div>
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Wealth Projection Curve</h4>
                            <div class="w-full h-full"><canvas id="sip-line-chart"></canvas></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        calculateSip();

    } else if (calcId === "fd") {
        ws.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in">
                <div class="bg-[#F8F9FC] border border-gray-200 rounded-2xl p-6 lg:col-span-1 space-y-6">
                    <h3 class="font-extrabold text-gray-900 text-lg border-b pb-2">Deposit Parameters</h3>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Principal Deposit (₹)</label>
                        <input type="number" id="fd-principal" value="100000" min="500" step="1000" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Annual Interest Rate (%)</label>
                        <input type="number" id="fd-rate" value="7.1" min="0.1" max="30" step="0.05" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tenure (Years)</label>
                        <input type="number" id="fd-years" value="3" min="1" max="25" step="1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Compounding Frequency</label>
                        <select id="fd-comp" class="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white">
                            <option value="12">Monthly</option>
                            <option value="4" selected>Quarterly</option>
                            <option value="2">Half-Yearly</option>
                            <option value="1">Yearly</option>
                        </select>
                    </div>

                    <button onclick="calculateFd()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">
                        Calculate FD Returns
                    </button>
                </div>

                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Total Maturity Value</span>
                            <span id="fd-val-maturity" class="text-2xl font-extrabold text-blue-600 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Invested Principal</span>
                            <span id="fd-val-principal" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Interest Earned</span>
                            <span id="fd-val-interest" class="text-2xl font-extrabold text-gray-900 block mt-2">₹0.00</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-gray-200 rounded-2xl p-6">
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Deposit Structure</h4>
                            <div class="w-full h-full"><canvas id="fd-pie-chart"></canvas></div>
                        </div>
                        <div class="h-60 relative flex flex-col items-center">
                            <h4 class="text-xs font-bold text-gray-400 uppercase mb-2">Maturity Progress Timeline</h4>
                            <div class="w-full h-full"><canvas id="fd-line-chart"></canvas></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        calculateFd();

    } else if (calcId === "npv") {
        ws.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in">
                <div class="bg-[#F8F9FC] border border-gray-200 rounded-2xl p-6 lg:col-span-1 space-y-6">
                    <h3 class="font-extrabold text-gray-900 text-lg border-b pb-2">Cash Flow Settings</h3>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Initial Cost / Outflow (₹)</label>
                        <input type="number" id="npv-initial" value="100000" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                        <span class="text-[10px] text-gray-400 font-semibold mt-1 block uppercase">Represented as negative outflow</span>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Annual Discount Rate (%)</label>
                        <input type="number" id="npv-rate" value="10.0" min="0" max="100" step="0.1" class="w-full px-4 py-2 border rounded-lg focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Subsequent Cash Inflows (Comma-Separated)</label>
                        <textarea id="npv-flows" rows="3" class="w-full px-4 py-2 border rounded-lg focus:outline-none bg-white">20000, 30000, 40000, 45000, 50000</textarea>
                        <span class="text-[10px] text-gray-400 font-semibold mt-1 block uppercase">List year 1, year 2, etc.</span>
                    </div>

                    <button onclick="calculateNpvIrr()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-all">
                        Evaluate Capital Project
                    </button>
                </div>

                <div class="lg:col-span-2 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Net Present Value (NPV)</span>
                            <span id="npv-val-npv" class="text-2xl font-extrabold text-blue-600 block mt-2">₹0.00</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Internal Rate of Return (IRR)</span>
                            <span id="npv-val-irr" class="text-2xl font-extrabold text-gray-900 block mt-2">0.00%</span>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-xl p-5 text-center">
                            <span class="text-xs font-semibold text-gray-400 block">Investment Viability</span>
                            <span id="npv-val-status" class="text-2xl font-extrabold text-gray-900 block mt-2">Viable</span>
                        </div>
                    </div>

                    <div class="bg-white border border-gray-200 rounded-2xl p-6">
                        <h4 class="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider">Cash Flow Amortization Chart</h4>
                        <div class="h-64 relative"><canvas id="npv-chart"></canvas></div>
                    </div>
                </div>
            </div>
        `;
        calculateNpvIrr();
    }
}

// Helper: Format Currency
function formatCurrencyJS(num) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(num);
}

// ==========================================
// 1. EMI CALCULATOR MATH
// ==========================================
function calculateEmi() {
    const P = parseFloat(document.getElementById("emi-principal").value) || 0.0;
    const rate = parseFloat(document.getElementById("emi-rate").value) || 0.0;
    const tenureYears = parseFloat(document.getElementById("emi-tenure").value) || 0.0;

    const R = rate / 12 / 100;
    const N = tenureYears * 12;

    let emi = 0.0;
    if (R > 0) {
        emi = P * R * Math.pow(1 + R, N) / (Math.pow(1 + R, N) - 1);
    } else {
        emi = P / N;
    }

    const totalPayment = emi * N;
    const totalInterest = totalPayment - P;

    document.getElementById("emi-val-monthly").innerText = formatCurrencyJS(emi);
    document.getElementById("emi-val-interest").innerText = formatCurrencyJS(totalInterest);
    document.getElementById("emi-val-total").innerText = formatCurrencyJS(totalPayment);

    // Amortization Schedule
    const tbody = document.querySelector("#emi-schedule-table tbody");
    tbody.innerHTML = "";

    let balance = P;
    const months = [];
    const balancesForChart = [P];

    for (let i = 1; i <= N; i++) {
        const interest = balance * R;
        const principal = emi - interest;
        const endingBal = Math.max(0, balance - principal);

        months.push(i);
        balancesForChart.push(endingBal);

        if (i <= 180) { // Limit display rows to avoid DOM overload
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-3 font-semibold text-gray-500">Month ${i}</td>
                    <td class="p-3 text-right">${formatCurrencyJS(balance)}</td>
                    <td class="p-3 text-right">${formatCurrencyJS(emi)}</td>
                    <td class="p-3 text-right">${formatCurrencyJS(interest)}</td>
                    <td class="p-3 text-right">${formatCurrencyJS(principal)}</td>
                    <td class="p-3 text-right">${formatCurrencyJS(endingBal)}</td>
                </tr>
            `;
        }
        balance = endingBal;
    }

    if (N > 180) {
        tbody.innerHTML += `
            <tr class="border-b bg-gray-50">
                <td colspan="6" class="p-3 text-center font-medium text-gray-400">... Schedule truncated at 180 months. View full records in CSV ...</td>
            </tr>
        `;
    }

    // Render Charts
    if (activeChart1) activeChart1.destroy();
    if (activeChart2) activeChart2.destroy();

    activeChart1 = new Chart(document.getElementById("emi-pie-chart"), {
        type: 'pie',
        data: {
            labels: ['Principal Amount', 'Interest Component'],
            datasets: [{
                data: [P, totalInterest],
                backgroundColor: ['#2563EB', '#F87171'],
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    activeChart2 = new Chart(document.getElementById("emi-line-chart"), {
        type: 'line',
        data: {
            labels: [0, ...months],
            datasets: [{
                label: 'Outstanding Principal',
                data: balancesForChart,
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                borderWidth: 2.5,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}

// ==========================================
// 2. BOND VALUATION MATH
// ==========================================
function calculateBond() {
    const F = parseFloat(document.getElementById("bond-face").value) || 0.0;
    const couponRate = parseFloat(document.getElementById("bond-coupon").value) || 0.0;
    const marketYield = parseFloat(document.getElementById("bond-yield").value) || 0.0;
    const tenureYears = parseFloat(document.getElementById("bond-years").value) || 0.0;
    const M = parseInt(document.getElementById("bond-freq").value) || 1;

    const couponPaid = (F * (couponRate / 100)) / M;
    const r = (marketYield / 100) / M;
    const N = tenureYears * M;

    let fairPrice = 0.0;
    for (let t = 1; t <= N; t++) {
        fairPrice += couponPaid / Math.pow(1 + r, t);
    }
    fairPrice += F / Math.pow(1 + r, N);

    let status = "Par Bond";
    let statusColor = "text-gray-900";
    if (marketYield > couponRate) {
        status = "Discount Bond";
        statusColor = "text-red-500";
    } else if (marketYield < couponRate) {
        status = "Premium Bond";
        statusColor = "text-emerald-500";
    }

    document.getElementById("bond-val-price").innerText = formatCurrencyJS(fairPrice);
    document.getElementById("bond-val-payment").innerText = formatCurrencyJS(couponPaid);
    const statusSpan = document.getElementById("bond-val-status");
    statusSpan.innerText = status;
    statusSpan.className = `text-lg font-extrabold block mt-2 ${statusColor}`;
}

// ==========================================
// 3. SIP CALCULATOR MATH
// ==========================================
function calculateSip() {
    const P = parseFloat(document.getElementById("sip-monthly").value) || 0.0;
    const rate = parseFloat(document.getElementById("sip-rate").value) || 0.0;
    const tenureYears = parseFloat(document.getElementById("sip-years").value) || 0.0;

    const r = rate / 12 / 100;
    const N = tenureYears * 12;

    const futureValue = P * ((Math.pow(1 + r, N) - 1) / r) * (1 + r);
    const invested = P * N;
    const gain = futureValue - invested;

    document.getElementById("sip-val-future").innerText = formatCurrencyJS(futureValue);
    document.getElementById("sip-val-invested").innerText = formatCurrencyJS(invested);
    document.getElementById("sip-val-gain").innerText = formatCurrencyJS(gain);

    // Build timeline for chart
    const labels = [];
    const investedProg = [];
    const wealthProg = [];
    
    let cumInvested = 0;
    let cumWealth = 0;
    for (let yr = 1; yr <= tenureYears; yr++) {
        labels.push(`Year ${yr}`);
        cumInvested = P * 12 * yr;
        const currentMonths = yr * 12;
        const fValAtYr = P * ((Math.pow(1 + r, currentMonths) - 1) / r) * (1 + r);
        investedProg.push(cumInvested);
        wealthProg.push(fValAtYr);
    }

    if (activeChart1) activeChart1.destroy();
    if (activeChart2) activeChart2.destroy();

    activeChart1 = new Chart(document.getElementById("sip-pie-chart"), {
        type: 'pie',
        data: {
            labels: ['Total Invested', 'Wealth Earned'],
            datasets: [{
                data: [invested, gain],
                backgroundColor: ['#2563EB', '#34D399'],
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    activeChart2 = new Chart(document.getElementById("sip-line-chart"), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Value',
                    data: wealthProg,
                    borderColor: '#34D399',
                    backgroundColor: 'rgba(52, 211, 153, 0.05)',
                    borderWidth: 2.5,
                    fill: true
                },
                {
                    label: 'Invested Capital',
                    data: investedProg,
                    borderColor: '#2563EB',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}

// ==========================================
// 4. FD CALCULATOR MATH
// ==========================================
function calculateFd() {
    const P = parseFloat(document.getElementById("fd-principal").value) || 0.0;
    const rate = parseFloat(document.getElementById("fd-rate").value) || 0.0;
    const tenureYears = parseFloat(document.getElementById("fd-years").value) || 0.0;
    const compoundingFreq = parseInt(document.getElementById("fd-comp").value) || 4;

    const r = rate / 100;
    const maturityVal = P * Math.pow(1 + r / compoundingFreq, compoundingFreq * tenureYears);
    const interest = maturityVal - P;

    document.getElementById("fd-val-maturity").innerText = formatCurrencyJS(maturityVal);
    document.getElementById("fd-val-principal").innerText = formatCurrencyJS(P);
    document.getElementById("fd-val-interest").innerText = formatCurrencyJS(interest);

    // Timeline progress data
    const labels = [];
    const progress = [];
    for (let yr = 1; yr <= tenureYears; yr++) {
        labels.push(`Year ${yr}`);
        const mAtYr = P * Math.pow(1 + r / compoundingFreq, compoundingFreq * yr);
        progress.push(mAtYr);
    }

    if (activeChart1) activeChart1.destroy();
    if (activeChart2) activeChart2.destroy();

    activeChart1 = new Chart(document.getElementById("fd-pie-chart"), {
        type: 'pie',
        data: {
            labels: ['Principal Deposit', 'Interest Earned'],
            datasets: [{
                data: [P, interest],
                backgroundColor: ['#2563EB', '#C084FC'],
                borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    activeChart2 = new Chart(document.getElementById("fd-line-chart"), {
        type: 'line',
        data: {
            labels: ['Start', ...labels],
            datasets: [{
                label: 'Account Valuation',
                data: [P, ...progress],
                borderColor: '#C084FC',
                backgroundColor: 'rgba(192, 132, 252, 0.05)',
                borderWidth: 2.5,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}

// ==========================================
// 5. NPV & IRR CALCULATOR MATH
// ==========================================
function calculateNpvIrr() {
    const initialOutflow = Math.abs(parseFloat(document.getElementById("npv-initial").value)) || 0.0;
    const discountRate = parseFloat(document.getElementById("npv-rate").value) || 0.0;
    const cashFlowsStr = document.getElementById("npv-flows").value;

    // Parse list of cash flows
    const inflows = cashFlowsStr.split(",").map(val => parseFloat(val.trim()) || 0.0);
    const r = discountRate / 100;

    // 1. Calculate NPV
    let npv = -initialOutflow;
    for (let t = 0; t < inflows.length; t++) {
        npv += inflows[t] / Math.pow(1 + r, t + 1);
    }

    // 2. Solve for IRR (Bisection method)
    const solveIrr = () => {
        let low = -0.9999;
        let high = 2.0;
        let precision = 0.00001;

        const npvFunc = (rate) => {
            let sum = -initialOutflow;
            for (let t = 0; t < inflows.length; t++) {
                sum += inflows[t] / Math.pow(1 + rate, t + 1);
            }
            return sum;
        };

        const yLow = npvFunc(low);
        const yHigh = npvFunc(high);

        // Check if a sign change exists
        if (yLow * yHigh > 0) {
            // Check if we need to expand boundaries (high return)
            if (npvFunc(high) > 0) {
                high = 5.0; // expand boundary
            } else {
                return null; // No solution in normal ranges
            }
        }

        for (let iter = 0; iter < 100; iter++) {
            const mid = (low + high) / 2;
            const yMid = npvFunc(mid);

            if (Math.abs(yMid) < precision) {
                return mid;
            }

            if (npvFunc(low) * yMid < 0) {
                high = mid;
            } else {
                low = mid;
            }
        }
        return (low + high) / 2;
    };

    const irr = solveIrr();
    const irrStr = irr !== null ? (irr * 100).toFixed(2) + '%' : 'N/A (No Convergence)';

    let status = "Unviable Project";
    let statusColor = "text-red-500";
    if (npv > 0) {
        status = "Viable Project";
        statusColor = "text-emerald-500";
    }

    document.getElementById("npv-val-npv").innerText = formatCurrencyJS(npv);
    document.getElementById("npv-val-irr").innerText = irrStr;
    const statusSpan = document.getElementById("npv-val-status");
    statusSpan.innerText = status;
    statusSpan.className = `text-lg font-extrabold block mt-2 ${statusColor}`;

    // Bar chart of Cash Flows
    if (activeChart1) activeChart1.destroy();

    const labels = ['Initial Cost', ...inflows.map((_, i) => `Year ${i+1}`)];
    const cashFlowSeries = [-initialOutflow, ...inflows];

    activeChart1 = new Chart(document.getElementById("npv-chart"), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cash Flow (₹)',
                data: cashFlowSeries,
                backgroundColor: cashFlowSeries.map(val => val < 0 ? '#F87171' : '#34D399'),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: v => '₹' + v.toLocaleString() } }
            }
        }
    });
}


