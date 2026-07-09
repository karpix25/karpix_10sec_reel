import requests
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("KIE_API_KEY")
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
task_id = "e5bb7eb6ec374e96ea54812c69a1ec59"

# Try GET
url1 = f"https://api.kie.ai/api/v1/jobs/getTask?taskId={task_id}"
r1 = requests.get(url1, headers=HEADERS)
print("GET", r1.status_code, r1.text)

# Try POST
url2 = "https://api.kie.ai/api/v1/jobs/getTask"
r2 = requests.post(url2, headers=HEADERS, json={"taskId": task_id})
print("POST", r2.status_code, r2.text)

# Try recordId endpoint
url3 = "https://api.kie.ai/api/v1/jobs/record"
r3 = requests.post(url3, headers=HEADERS, json={"recordId": task_id})
print("POST record", r3.status_code, r3.text)
