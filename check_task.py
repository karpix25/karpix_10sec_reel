import requests
import os
from dotenv import load_dotenv
import json

load_dotenv()
API_KEY = os.getenv("KIE_API_KEY")
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
task_id = "9bff146a3f936d139efb6b8fff6914ee"

url = f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}"
r = requests.get(url, headers=HEADERS)
print("Response code:", r.status_code)
print("Response JSON:")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))
