import requests
import os
from dotenv import load_dotenv
import json

load_dotenv()
API_KEY = os.getenv("KIE_API_KEY")

os.system("echo 'fake image' > dummy.jpg")

url = "https://kieai.redpandaai.co/api/file-stream-upload"
headers = {"Authorization": f"Bearer {API_KEY}"}

with open("dummy.jpg", "rb") as f:
    r = requests.post(url, headers=headers, files={"file": f}, data={"uploadPath": "images/reels"})
    
print("Status:", r.status_code)
print("Response:", r.text)
