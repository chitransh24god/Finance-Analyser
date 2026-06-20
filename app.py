import streamlit as st
import pandas as pd
import plotly.express as px
import os
import pypdf
from datetime import datetime

# Import custom packages
from extractors import detect_bank_and_get_extractor
from utils.abb_calculator import calculate_monthly_abb
from utils.credit_analyzer import analyze_credit_profile
from utils.report_generator import generate_excel_reports
from utils.validator import validate_transactions
from utils.logger import log_info, log_warning, log_error, get_logs, clear_logs

# Page configurations
st.set_page_config(
    page_title="MyBankLoan AI - Professional Loan Analyzer",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize Session States
if "logged_in" not in st.session_state:
    st.session_state["logged_in"] = False
if "active_page" not in st.session_state:
    st.session_state["active_page"] = "Dashboard"
if "parsed_data" not in st.session_state:
    st.session_state["parsed_data"] = None
if "pdf_password" not in st.session_state:
    st.session_state["pdf_password"] = ""
if "password_required" not in st.session_state:
    st.session_state["password_required"] = False
if "uploaded_file_bytes" not in st.session_state:
    st.session_state["uploaded_file_bytes"] = None
if "uploaded_file_name" not in st.session_state:
    st.session_state["uploaded_file_name"] = ""

# Injection of custom light theme CSS styling
st.markdown("""
<style>
    /* Google Fonts Inter */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
        color: #111827;
    }
    
    /* Background colors */
    .stApp {
        background-color: #FFFFFF;
    }
    
    /* Header bar */
    .app-header {
        background-color: #FFFFFF;
        padding: 15px 25px;
        border-bottom: 1px solid #E5E7EB;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 25px;
    }
    
    .app-title {
        font-size: 20px;
        font-weight: 700;
        color: #2563EB;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    /* Custom KPI Cards */
    .kpi-card {
        background-color: #F8F9FC;
        border: 1px solid #E5E7EB;
        border-radius: 10px;
        padding: 20px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        transition: all 0.2s ease;
    }
    
    .kpi-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border-color: #CBD5E1;
    }
    
    .kpi-title {
        font-size: 12px;
        color: #6B7280;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }
    
    .kpi-value {
        font-size: 26px;
        color: #111827;
        font-weight: 700;
    }
    
    .kpi-value.blue { color: #2563EB; }
    .kpi-value.green { color: #10B981; }
    .kpi-value.red { color: #EF4444; }
    .kpi-value.amber { color: #F59E0B; }
    
    /* Badge styling */
    .badge {
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        display: inline-block;
    }
    
    .badge-excellent { background-color: #D1FAE5; color: #065F46; }
    .badge-good { background-color: #DBEAFE; color: #1E40AF; }
    .badge-average { background-color: #FEF3C7; color: #92400E; }
    .badge-risky { background-color: #FEE2E2; color: #991B1B; }
    
    /* Sidebar styling overrides */
    section[data-testid="stSidebar"] {
        background-color: #F8F9FC;
        border-right: 1px solid #E5E7EB;
    }
    
    section[data-testid="stSidebar"] .stButton button {
        background-color: transparent;
        color: #374151;
        border: none;
        text-align: left;
        width: 100%;
        padding: 8px 12px;
        font-size: 15px;
        font-weight: 500;
    }
    
    section[data-testid="stSidebar"] .stButton button:hover {
        background-color: #E2E8F0;
        color: #111827;
    }
    
    /* Primary buttons */
    div.stButton > button:first-child {
        background-color: #2563EB;
        color: white;
        border-radius: 6px;
        border: none;
        font-weight: 500;
        padding: 8px 16px;
    }
    div.stButton > button:first-child:hover {
        background-color: #1D4ED8;
        color: white;
    }
    
    /* Input formatting */
    input {
        border-radius: 6px !important;
        border-color: #E5E7EB !important;
    }
</style>
""", unsafe_allow_html=True)

# Format currency helper
def fmt_currency(val):
    if val == "Data Unavailable":
        return val
    try:
        val_float = float(val)
        return f"₹{val_float:,.2f}"
    except (ValueError, TypeError):
        return str(val)

# ===================================================
# LOGIN PAGE
# ===================================================
def show_login_page():
    st.markdown("<div style='height: 100px;'></div>", unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 1.8, 1])
    
    with col2:
        st.markdown(
            """
            <div style='background-color: #F8F9FC; padding: 40px; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'>
                <h2 style='text-align: center; color: #2563EB; margin-bottom: 10px; font-weight: 800;'>MyBankLoan AI</h2>
                <p style='text-align: center; color: #6B7280; font-size: 14px; margin-bottom: 30px;'>Professional Loan Analyzer - Version V3.0</p>
            </div>
            """,
            unsafe_allow_html=True
        )
        
        # Streamlit input box inside card spacing
        with st.form("login_form"):
            password_input = st.text_input("Application Password", type="password", placeholder="Enter authorization key")
            submitted = st.form_submit_button("Authenticate & Enter")
            
            if submitted:
                if password_input == "Mybankloan.ai@2023":
                    st.session_state["logged_in"] = True
                    log_info("Successful user authentication.")
                    st.rerun()
                else:
                    st.error("Access Denied: Incorrect Password.")
                    log_error("Failed login attempt.")

# ===================================================
# PDF PARSING & PROCESSING PIPELINE
# ===================================================
def process_pdf_statement(file_bytes, filename, password=None):
    # Temp file write
    temp_dir = r"C:\Users\ThinkPad\Downloads\excel_file_management\ABB_Analyzer\output"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, "temp_uploaded_statement.pdf")
    
    with open(temp_path, "wb") as f:
        f.write(file_bytes)
        
    try:
        # Detect bank
        extractor = detect_bank_and_get_extractor(temp_path, password, original_filename=filename)
        
        # Parse PDF
        metadata, transactions = extractor.parse(temp_path, password)
        
        # Convert to DataFrame
        df_txs = pd.DataFrame(transactions)
        
        # Calculate ABB
        df_monthly_abb, abb_summary = calculate_monthly_abb(df_txs, metadata["start_date"], metadata["end_date"])
        
        # Run credit assessments
        assessment = analyze_credit_profile(df_txs, df_monthly_abb, abb_summary, metadata)
        
        # Run data validation engine
        validation = validate_transactions(df_txs, abb_summary)
        
        if not validation.is_valid:
            st.error(validation.error_message)
            st.session_state["parsed_data"] = None
            return False
            
        # Generate and save Excel files
        generate_excel_reports(metadata, transactions, df_monthly_abb, abb_summary, assessment)
        
        # Store in session state
        st.session_state["parsed_data"] = {
            "metadata": metadata,
            "transactions": transactions,
            "monthly_abb": df_monthly_abb,
            "abb_summary": abb_summary,
            "assessment": assessment
        }
        
        log_info(f"Successfully processed bank statement: {filename}")
        st.success("Bank statement successfully analyzed!")
        return True
        
    except Exception as e:
        log_error(f"Failed to process statement: {e}")
        st.error(f"Processing Error: {str(e)}")
        st.session_state["parsed_data"] = None
        return False
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

# ===================================================
# MAIN DASHBOARD INTERFACE
# ===================================================
def show_app_interface():
    # Header bar
    st.markdown(
        """
        <div class="app-header">
            <div class="app-title">
                <span>💳</span> MyBankLoan AI <span style="font-size:12px; font-weight:500; color:#6B7280; padding-left:10px; border-left:1px solid #E5E7EB;">PROFESSIONAL LOAN ANALYZER V3</span>
            </div>
            <div style="color: #6B7280; font-size: 14px; font-weight: 500;">
                Role: Credit Underwriter & Analyst
            </div>
        </div>
        """,
        unsafe_allow_html=True
    )
    
    # Sidebar layout
    with st.sidebar:
        st.markdown(
            """
            <div style='text-align: center; margin-bottom: 25px;'>
                <h3 style='color: #2563EB; font-weight: 800; margin:0;'>MyBankLoan AI</h3>
                <span class='badge badge-good'>Workspace Active</span>
            </div>
            <hr style='margin: 10px 0;'/>
            """,
            unsafe_allow_html=True
        )
        
        # Sidebar Menu Items
        pages = [
            ("📊 Dashboard", "Dashboard"),
            ("📝 Transactions", "Transactions"),
            ("📈 ABB Analysis", "ABB Analysis"),
            ("🛡️ Loan Assessment", "Loan Assessment"),
            ("📥 Downloads", "Downloads"),
            ("⚙️ Settings", "Settings")
        ]
        
        for label, page_id in pages:
            # Active styling indicator
            if st.session_state["active_page"] == page_id:
                st.markdown(f"**<div style='background-color:#E2E8F0; padding:6px 12px; border-radius:6px; color:#111827; font-weight:600;'>{label}</div>**", unsafe_allow_html=True)
            else:
                if st.button(label, key=f"nav_{page_id}"):
                    st.session_state["active_page"] = page_id
                    st.rerun()
                    
        st.markdown("<div style='height: 60px;'></div>", unsafe_allow_html=True)
        
        # Logout button
        if st.button("🚪 Logout", key="logout_btn"):
            st.session_state["logged_in"] = False
            st.session_state["parsed_data"] = None
            log_info("User logged out.")
            st.rerun()
            
    # Page routers
    if st.session_state["active_page"] == "Dashboard":
        render_dashboard_page()
    elif st.session_state["active_page"] == "Transactions":
        render_transactions_page()
    elif st.session_state["active_page"] == "ABB Analysis":
        render_abb_analysis_page()
    elif st.session_state["active_page"] == "Loan Assessment":
        render_loan_assessment_page()
    elif st.session_state["active_page"] == "Downloads":
        render_downloads_page()
    elif st.session_state["active_page"] == "Settings":
        render_settings_page()

# ===================================================
# PAGES RENDERING FUNCTIONS
# ===================================================

def render_dashboard_page():
    st.markdown("### 📊 Underwriting & Analysis Dashboard")
    
    # PDF Upload Area
    uploaded_file = st.file_uploader("Upload Bank Statement PDF (V1: HDFC Bank)", type=["pdf"])
    
    if uploaded_file:
        # Check if file changed
        if uploaded_file.name != st.session_state["uploaded_file_name"]:
            log_info(f"New file uploaded: {uploaded_file.name}")
            
            # Read bytes
            file_bytes = uploaded_file.read()
            st.session_state["uploaded_file_bytes"] = file_bytes
            st.session_state["uploaded_file_name"] = uploaded_file.name
            st.session_state["pdf_password"] = ""
            
            # Check encryption
            temp_path = "temp_check.pdf"
            with open(temp_path, "wb") as f:
                f.write(file_bytes)
            try:
                reader = pypdf.PdfReader(temp_path)
                st.session_state["password_required"] = reader.is_encrypted
            except Exception:
                st.session_state["password_required"] = False
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
            if not st.session_state["password_required"]:
                # Process automatically if not encrypted
                process_pdf_statement(file_bytes, uploaded_file.name)
                
    # Password Form if Required
    if st.session_state["password_required"] and not st.session_state["parsed_data"]:
        st.warning("This PDF file is password protected.")
        with st.form("password_entry"):
            pdf_pwd = st.text_input("Enter PDF Password", type="password")
            submit_pwd = st.form_submit_button("Unlock & Parse Statement")
            
            if submit_pwd:
                if pdf_pwd:
                    st.session_state["pdf_password"] = pdf_pwd
                    success = process_pdf_statement(
                        st.session_state["uploaded_file_bytes"],
                        st.session_state["uploaded_file_name"],
                        pdf_pwd
                    )
                    if success:
                        st.session_state["password_required"] = False
                        st.rerun()
                else:
                    st.error("Please enter a password.")

    # Show data dashboard if parsed statement is in session
    if st.session_state["parsed_data"]:
        data = st.session_state["parsed_data"]
        meta = data["metadata"]
        abb_sum = data["abb_summary"]
        assess = data["assessment"]
        txs = data["transactions"]
        
        # Section 1: Customer details
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Customer Name</div>
                    <div class="kpi-value">{meta.get('customer_name', 'N/A')}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with col2:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Account Number</div>
                    <div class="kpi-value">{meta.get('account_number', 'N/A')}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with col3:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Bank Name</div>
                    <div class="kpi-value" style="color:#2563EB;">{meta.get('bank_name', 'N/A')}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with col4:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Statement Period</div>
                    <div style="font-size: 15px; font-weight:600; color:#111827; margin-top:8px;">
                        Start: {meta.get('start_date', 'N/A')}<br/>
                        End: {meta.get('end_date', 'N/A')}
                    </div>
                </div>
                """,
                unsafe_allow_html=True
            )
            
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Section 2: ABB Summary (Custom Rules)
        st.markdown("#### 📈 Average Daily Balance (ABB) Details")
        k1, k2, k3 = st.columns(3)
        with k1:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Latest Month ABB (1M)</div>
                    <div class="kpi-value blue">{fmt_currency(abb_sum['1M'])}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with k2:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Average 3 Months ABB (3M)</div>
                    <div class="kpi-value blue">{fmt_currency(abb_sum['3M'])}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with k3:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Average 6 Months ABB (6M)</div>
                    <div class="kpi-value blue">{fmt_currency(abb_sum['6M'])}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
            
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Section 3: Account Summary Details
        st.markdown("#### 🏢 Account Flow Summary")
        s1, s2, s3, s4, s5 = st.columns(5)
        with s1:
            st.metric("Total Credits Value", fmt_currency(assess.get("total_credits", 0.0)))
        with s2:
            st.metric("Total Debits Value", fmt_currency(assess.get("total_debits", 0.0)))
        with s3:
            st.metric("Highest Balance", fmt_currency(assess.get("highest_balance", 0.0)))
        with s4:
            st.metric("Lowest Balance", fmt_currency(assess.get("lowest_balance", 0.0)))
        with s5:
            st.metric("Latest Balance", fmt_currency(assess.get("latest_balance", 0.0)))
            
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Transaction stats
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            st.metric("Credit Tx Count", int(assess.get("credit_count", 0)))
        with c2:
            st.metric("Debit Tx Count", int(assess.get("debit_count", 0)))
        with c3:
            st.metric("Avg Monthly Credit", fmt_currency(assess.get("avg_monthly_credit", 0.0)))
        with c4:
            st.metric("Avg Monthly Debit", fmt_currency(assess.get("avg_monthly_debit", 0.0)))
            
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Section 4: Loan Officer View (Risk Grading)
        st.markdown("#### 🛡️ Underwriting & Loan Assessment Profile")
        grade_cols = st.columns(4)
        
        badges = {
            "Excellent": "<span class='badge badge-excellent'>Excellent</span>",
            "Good": "<span class='badge badge-good'>Good</span>",
            "Average": "<span class='badge badge-average'>Average</span>",
            "Risky": "<span class='badge badge-risky'>Risky</span>"
        }
        
        with grade_cols[0]:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">ABB Strength Status</div>
                    <div style='margin-top:10px;'>{badges[assess.get('abb_status', 'Risky')]}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with grade_cols[1]:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Daily Balance Stability</div>
                    <div style='margin-top:10px;'>{badges[assess.get('balance_stability', 'Risky')]}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with grade_cols[2]:
            st.markdown(
                f"""
                <div class="kpi-card">
                    <div class="kpi-title">Net Liquidity strength</div>
                    <div style='margin-top:10px;'>{badges[assess.get('liquidity_strength', 'Risky')]}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
        with grade_cols[3]:
            st.markdown(
                f"""
                <div class="kpi-card" style="border: 2px solid #2563EB;">
                    <div class="kpi-title">Overall Risk Assessment</div>
                    <div style='margin-top:10px;'>{badges[assess.get('overall_profile', 'Risky')]}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
            
        st.markdown(
            f"""
            <div style='background-color: #F8F9FC; border-left: 4px solid #2563EB; padding: 20px; border-radius: 6px; border-top: 1px solid #E5E7EB; border-right: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB;'>
                <h5 style='margin-top:0; color:#2563EB; font-weight:700;'>Credit Risk Verdict</h5>
                <p style='margin-bottom:0; color:#111827; font-size:14px; font-weight:500;'>{assess.get('explanation', '')}</p>
            </div>
            """,
            unsafe_allow_html=True
        )
        
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Section 5: Daily Balance Trend Chart (Plotly)
        st.markdown("#### 📈 Daily Balance Trend")
        df_txs = pd.DataFrame(txs)
        df_txs["ParsedDate"] = pd.to_datetime(df_txs["Date"])
        
        # Group by date to get end-of-day balances
        df_daily = df_txs.groupby("ParsedDate").last().reset_index()
        
        fig = px.line(
            df_daily,
            x="ParsedDate",
            y="Balance",
            title="Daily Ledger Balance Trend",
            labels={"ParsedDate": "Date", "Balance": "Balance (INR)"},
            template="plotly_white"
        )
        # Custom color matching ACCENT BLUE #2563EB
        fig.update_traces(line_color="#2563EB", line_width=2)
        fig.update_layout(
            hovermode="x unified",
            margin=dict(l=20, r=20, t=40, b=20),
            xaxis_title="Date",
            yaxis_title="Balance (INR)"
        )
        st.plotly_chart(fig, use_container_width=True)
        
    else:
        st.info("Upload a bank statement PDF to view data assessments.")

# ===================================================
# TRANSACTIONS VIEW PAGE
# ===================================================
def render_transactions_page():
    st.markdown("### 📝 Processed Ledger Transactions")
    
    if st.session_state["parsed_data"]:
        data = st.session_state["parsed_data"]
        txs = data["transactions"]
        
        df = pd.DataFrame(txs)
        # Columns formatting
        df_display = df[["Date", "Particulars", "Debit", "Credit", "Balance"]].copy()
        
        # Filter and Search
        search_query = st.text_input("🔍 Search Transactions by Particulars / Reference Details")
        
        if search_query:
            df_display = df_display[df_display["Particulars"].str.contains(search_query, case=False, na=False)]
            
        # Amount range filters
        col1, col2 = st.columns(2)
        with col1:
            min_amt = st.number_input("Minimum Transaction Amount", min_value=0.0, step=1000.0)
        with col2:
            max_amt = st.number_input("Maximum Transaction Amount", min_value=0.0, step=1000.0)
            
        if min_amt > 0:
            df_display = df_display[(df_display["Debit"] >= min_amt) | (df_display["Credit"] >= min_amt)]
        if max_amt > 0:
            df_display = df_display[(df_display["Debit"] <= max_amt) | (df_display["Credit"] <= max_amt)]
            
        # Standard table show
        st.dataframe(
            df_display,
            column_config={
                "Debit": st.column_config.NumberColumn("Debit (₹)", format="%.2f"),
                "Credit": st.column_config.NumberColumn("Credit (₹)", format="%.2f"),
                "Balance": st.column_config.NumberColumn("Balance (₹)", format="%.2f"),
            },
            use_container_width=True,
            hide_index=True
        )
    else:
        st.info("Upload a bank statement first.")

# ===================================================
# ABB ANALYSIS VIEW PAGE
# ===================================================
def render_abb_analysis_page():
    st.markdown("### 📈 Monthly ABB Breakdown Analysis")
    
    if st.session_state["parsed_data"]:
        data = st.session_state["parsed_data"]
        df_monthly_abb = data["monthly_abb"]
        abb_sum = data["abb_summary"]
        
        # Rolling averages metrics
        k1, k2, k3 = st.columns(3)
        k1.metric("Latest Month ABB (1M)", fmt_currency(abb_sum["1M"]))
        k2.metric("Average 3 Months ABB (3M)", fmt_currency(abb_sum["3M"]))
        k3.metric("Average 6 Months ABB (6M)", fmt_currency(abb_sum["6M"]))
        
        st.markdown("<br/>", unsafe_allow_html=True)
        
        # Monthly details table
        st.markdown("#### Monthly Target Balances Table")
        df_out = df_monthly_abb.copy()
        if "YearMonth" in df_out.columns:
            df_out = df_out.drop(columns=["YearMonth"])
            
        st.dataframe(
            df_out,
            column_config={
                "5th Balance": st.column_config.NumberColumn("5th Balance (₹)", format="%.2f"),
                "10th Balance": st.column_config.NumberColumn("10th Balance (₹)", format="%.2f"),
                "15th Balance": st.column_config.NumberColumn("15th Balance (₹)", format="%.2f"),
                "20th Balance": st.column_config.NumberColumn("20th Balance (₹)", format="%.2f"),
                "25th Balance": st.column_config.NumberColumn("25th Balance (₹)", format="%.2f"),
                "Month End Balance": st.column_config.NumberColumn("Month End Balance (₹)", format="%.2f"),
                "Monthly ABB": st.column_config.NumberColumn("Monthly ABB (₹)", format="%.2f"),
            },
            use_container_width=True,
            hide_index=True
        )
        
        # Plotly chart comparing ABB over months
        st.markdown("<br/>", unsafe_allow_html=True)
        st.markdown("#### ABB Performance Over Time")
        
        fig = px.bar(
            df_monthly_abb,
            x="Month",
            y="Monthly ABB",
            text_auto=".2s",
            title="Monthly Calculated Average Daily Balance (ABB)",
            labels={"Monthly ABB": "ABB (INR)"},
            template="plotly_white"
        )
        fig.update_traces(marker_color="#2563EB", marker_line_color="#1D4ED8", marker_line_width=1.5, opacity=0.85)
        st.plotly_chart(fig, use_container_width=True)
        
    else:
        st.info("Upload a bank statement first.")

# ===================================================
# LOAN RISK ASSESSMENT PAGE
# ===================================================
def render_loan_assessment_page():
    st.markdown("### 🛡️ Credit Risk & Loan Eligibility Verdict")
    
    if st.session_state["parsed_data"]:
        data = st.session_state["parsed_data"]
        meta = data["metadata"]
        assess = data["assessment"]
        
        col1, col2 = st.columns([1, 1.5])
        
        with col1:
            st.markdown("#### Underwriting Metrics Summary")
            st.markdown(f"**Customer Name:** {meta.get('customer_name', 'N/A')}")
            st.markdown(f"**Account Number:** {meta.get('account_number', 'N/A')}")
            st.markdown(f"**Bank Name:** {meta.get('bank_name', 'N/A')}")
            st.markdown(f"**Days Covered:** {assess.get('days_covered', 'N/A')} days")
            
            st.markdown("<hr/>", unsafe_allow_html=True)
            
            st.markdown(f"**Total Credits:** {fmt_currency(assess.get('total_credits', 0.0))}")
            st.markdown(f"**Total Debits:** {fmt_currency(assess.get('total_debits', 0.0))}")
            st.markdown(f"**Transaction Count:** {assess.get('credit_count', 0)} Cr / {assess.get('debit_count', 0)} Dr")
            st.markdown(f"**Highest Balance:** {fmt_currency(assess.get('highest_balance', 0.0))}")
            st.markdown(f"**Lowest Balance:** {fmt_currency(assess.get('lowest_balance', 0.0))}")
            st.markdown(f"**Latest Balance:** {fmt_currency(assess.get('latest_balance', 0.0))}")
            
        with col2:
            st.markdown("#### Suitability Decisions")
            
            # CSS status classes
            colors = {
                "Excellent": "#D1FAE5",
                "Good": "#DBEAFE",
                "Average": "#FEF3C7",
                "Risky": "#FEE2E2"
            }
            text_colors = {
                "Excellent": "#065F46",
                "Good": "#1E40AF",
                "Average": "#92400E",
                "Risky": "#991B1B"
            }
            
            def risk_box(title, grade):
                return f"""
                <div style='background-color: {colors.get(grade, "#FFFFFF")}; color: {text_colors.get(grade, "#000000")}; padding: 12px 18px; border-radius: 8px; border: 1px solid #E5E7EB; margin-bottom: 12px;'>
                    <span style='font-size:12px; font-weight:600; text-transform:uppercase;'>{title}</span>
                    <h4 style='margin:0; font-weight:800;'>{grade}</h4>
                </div>
                """
                
            st.markdown(risk_box("ABB Level Strength Status", assess.get("abb_status", "Risky")), unsafe_allow_html=True)
            st.markdown(risk_box("Daily Balance Stability Status", assess.get("balance_stability", "Risky")), unsafe_allow_html=True)
            st.markdown(risk_box("Net Liquidity Flow Strength", assess.get("liquidity_strength", "Risky")), unsafe_allow_html=True)
            st.markdown(risk_box("Overall Credit Risk Grading", assess.get("overall_profile", "Risky")), unsafe_allow_html=True)
            
            st.markdown("<br/>", unsafe_allow_html=True)
            st.markdown(
                f"""
                <div style='border: 1px solid #E5E7EB; border-radius: 8px; padding: 15px; background-color: #F8F9FC;'>
                    <h5 style='margin-top:0; color:#2563EB;'>Analyst Explanatory Notes</h5>
                    <p style='margin-bottom:0; font-size:13px; font-weight:500;'>{assess.get('explanation', '')}</p>
                </div>
                """,
                unsafe_allow_html=True
            )
    else:
        st.info("Upload a bank statement first.")

# ===================================================
# DOWNLOADS PAGE
# ===================================================
def render_downloads_page():
    st.markdown("### 📥 Export Credit Reports & Data")
    
    if st.session_state["parsed_data"]:
        output_dir = r"C:\Users\ThinkPad\Downloads\excel_file_management\ABB_Analyzer\output"
        
        st.markdown("Select from the following compiled professional report spreadsheets to download:")
        
        def download_button_row(filename, label):
            file_path = os.path.join(output_dir, filename)
            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    data = f.read()
                st.download_button(
                    label=label,
                    data=data,
                    file_name=filename,
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    key=f"dl_{filename}"
                )
            else:
                st.error(f"Report not found on disk: {filename}")
                
        download_button_row("cleaned_transactions.xlsx", "📥 Download Cleaned Transactions Excel Log")
        st.markdown("<br/>", unsafe_allow_html=True)
        download_button_row("monthly_abb_report.xlsx", "📥 Download Monthly Target Balances & ABB Excel Report")
        st.markdown("<br/>", unsafe_allow_html=True)
        download_button_row("abb_report.xlsx", "📥 Download Rolling ABB Summary Assessment Report")
        st.markdown("<br/>", unsafe_allow_html=True)
        download_button_row("loan_assessment.xlsx", "📥 Download Credit Risk & Loan Suitability Report")
        
    else:
        st.info("Upload a bank statement first.")

# ===================================================
# SETTINGS PAGE (Logs & Session Audit)
# ===================================================
def render_settings_page():
    st.markdown("### ⚙️ System Logs & Workspace Auditing")
    
    # Audit log panel
    st.markdown("#### System Operations Log")
    logs = get_logs()
    
    # Textarea container for logs
    log_text = "\n".join(logs)
    st.text_area("Audit Details", value=log_text, height=300, disabled=True)
    
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🧹 Clear Operation Logs"):
            clear_logs()
            st.success("Operational logs successfully cleared.")
            st.rerun()
            
    # Display configuration parameters
    st.markdown("<br/>", unsafe_allow_html=True)
    st.markdown("#### Extraction System Details")
    st.markdown("**Version:** Professional Loan Analyzer V3")
    st.markdown("**Core Engines:** pdfplumber Table Extractor + Coordinate Align Engine")
    st.markdown("**Target Directory:** `C:\\Users\\ThinkPad\\Downloads\\excel_file_management\\ABB_Analyzer`")

# ===================================================
# APPLICATION INITIALIZER
# ===================================================
def main():
    if not st.session_state["logged_in"]:
        show_login_page()
    else:
        show_app_interface()

if __name__ == "__main__":
    main()
