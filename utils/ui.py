import streamlit as st


def inject_styles() -> None:
    st.markdown(
        """
        <style>
        body {
            background-color: #ffffff;
            color: #111827;
        }
        .block-container {
            padding: 1.5rem 2rem 2rem 2rem !important;
            background-color: #ffffff !important;
        }
        .stApp, .main {
            background-color: #ffffff !important;
        }
        .metric-card, .section-card, .download-card {
            background: #f8fafc !important;
            border: 1px solid #e5e7eb !important;
            border-radius: 22px !important;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
            color: #111827 !important;
            padding: 1rem !important;
        }
        .section-title {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 0.75rem;
        }
        .subheading {
            font-size: 16px;
            color: #6b7280;
            margin-bottom: 1rem;
        }
        .kpi-value {
            font-size: 28px;
            font-weight: 700;
            color: #111827;
            margin: 0;
        }
        .kpi-label {
            font-size: 13px;
            color: #6b7280;
            margin: 0 0 0.5rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .top-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .top-header-title {
            font-size: 32px;
            font-weight: 700;
            margin: 0;
            color: #111827;
        }
        .top-header-actions {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        @media (max-width: 768px) {
            .top-header { flex-direction: column; align-items: flex-start; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_top_header(app_name: str) -> None:
    col1, col2, col3 = st.columns([2.5, 3, 1])
    with col1:
        st.markdown(f"<div class='top-header-title'>{app_name}</div>", unsafe_allow_html=True)
    with col2:
        st.text_input("Search", placeholder="Search transactions or insights", key="top_search")
    with col3:
        if st.button("Logout", key="logout_button"):
            st.session_state["logout_click"] = True
