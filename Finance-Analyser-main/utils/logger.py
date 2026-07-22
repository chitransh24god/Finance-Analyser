import logging
import os

# Create log directory if it doesn't exist
log_dir = r"C:\Users\ThinkPad\Downloads\excel_file_management\ABB_Analyzer\output"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "app.log")

# Setup logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file, mode="a", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("ABB_Analyzer")

# Global memory log list to display in Streamlit if needed
memory_logs = []

def log_info(msg):
    logger.info(msg)
    memory_logs.append(f"INFO: {msg}")

def log_warning(msg):
    logger.warning(msg)
    memory_logs.append(f"WARNING: {msg}")

def log_error(msg):
    logger.error(msg)
    memory_logs.append(f"ERROR: {msg}")

def get_logs():
    return memory_logs

def clear_logs():
    global memory_logs
    memory_logs = []
    # Also clear log file
    try:
        with open(log_file, "w", encoding="utf-8") as f:
            f.write("")
    except Exception:
        pass
