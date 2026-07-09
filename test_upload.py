import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("KIE_API_KEY")
BASE_URL = "https://api.kie.ai"

# Create dummy image
os.system("touch dummy.jpg")

headers = {"Authorization": f"Bearer {API_KEY}"}

# Try uploading
try:
    with open("dummy.jpg", "rb") as f:
        r = requests.post(f"{BASE_URL}/api/v1/files/upload", headers=headers, files={"file": f})
    print("/api/v1/files/upload status:", r.status_code, r.text)
except Exception as e:
    print(e)
    
try:
    with open("dummy.jpg", "rb") as f:
        r = requests.post(f"{BASE_URL}/api/v1/upload", headers=headers, files={"file": f})
    print("/api/v1/upload status:", r.status_code, r.text)
except Exception as e:
    print(e)
