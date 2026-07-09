import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("KIE_API_KEY")
BASE_URL = "https://api.kie.ai" # Adjust if the exact endpoint differs

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

def create_video_task(prompt, character_id, audio_id, seed, reference_image_url=None, product_image_url=None):
    """
    Создает задачу на генерацию видео через Kie.ai (модель gemini-omni-video).
    """
    url = f"{BASE_URL}/api/v1/jobs/createTask"
    
    payload = {
        "model": "gemini-omni-video",
        "input": {
            "prompt": prompt,
            "character_ids": [character_id],
            "audio_ids": [audio_id],
            "seed": seed,
            "aspect_ratio": "9:16",
            "duration": "10"
        }
    }
    
    if reference_image_url or product_image_url:
        image_urls = []
        if reference_image_url:
            payload["input"]["image_url"] = reference_image_url
            image_urls.append(reference_image_url)
        if product_image_url:
            image_urls.append(product_image_url)
            
        payload["input"]["image_urls"] = image_urls

    
    print(f"[*] Отправка задачи: {prompt[:30]}... (Seed: {seed})")
    
    response = requests.post(url, headers=HEADERS, json=payload)
    
    if response.status_code != 200:
        raise Exception(f"Ошибка API: {response.status_code} - {response.text}")

    data = response.json()
    
    # Провайдеры обычно возвращают task_id или сразу url
    task_id = None
    if "data" in data and isinstance(data["data"], dict):
        task_id = data["data"].get("taskId") or data["data"].get("id") or data["data"].get("task_id")
    if not task_id:
        task_id = data.get("taskId") or data.get("id") or data.get("task_id")
        
    if not task_id:
        if "url" in data:
            return {"status": "COMPLETED", "url": data["url"]}
        raise Exception(f"Не удалось получить ID задачи из ответа: {data}")
        
    print(f"[*] Задача создана. ID: {task_id}")
    return task_id

def poll_task_status(task_id, timeout=300):
    """
    Опрашивает статус задачи, пока видео не будет готово.
    """
    url = f"{BASE_URL}/api/v1/jobs/recordInfo?taskId={task_id}"
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        response = requests.get(url, headers=HEADERS)
            
        if response.status_code != 200:
            print(f"[!] Ошибка проверки статуса: {response.text}")
            time.sleep(5)
            continue
                 
        data = response.json()
        
        status = ""
        video_url = ""
        if "data" in data and isinstance(data["data"], dict):
            status = data["data"].get("status") or data["data"].get("state") or ""
            video_url = data["data"].get("video_url") or data["data"].get("url") or data["data"].get("result") or data["data"].get("resultJson")
        else:
            status = data.get("status") or data.get("state") or ""
            video_url = data.get("video_url") or data.get("url") or data.get("result") or data.get("resultJson")
            
        status = str(status).upper()
        
        if status in ["COMPLETED", "SUCCESS", "DONE"]:
            # Parse if video_url is a JSON string
            if isinstance(video_url, str) and video_url.startswith("{"):
                import json
                try:
                    parsed = json.loads(video_url)
                    if "resultUrls" in parsed and parsed["resultUrls"]:
                        video_url = parsed["resultUrls"][0]
                except:
                    pass
            print(f"[*] Видео готово! URL: {video_url}")
            return video_url
        elif status in ["FAILED", "ERROR", "FAIL"]:
            fail_msg = data.get("data", {}).get("failMsg", "")
            raise Exception(f"Генерация не удалась: {status}, {fail_msg}")
            
        print(f"[*] Статус: {status}. Ждем 10 секунд...")
        time.sleep(10)
        
    raise Exception("Таймаут ожидания генерации видео.")

def download_video(url, output_path):
    print(f"[*] Скачивание видео в {output_path}...")
    response = requests.get(url, stream=True)
    if response.status_code == 200:
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024*1024):
                f.write(chunk)
        print(f"[*] Успешно сохранено: {output_path}")
def upload_image(image_path):
    """
    Загружает картинку через официальный API Kie.ai для получения безопасной ссылки.
    """
    print(f"[*] Загрузка картинки {image_path} на сервер Kie.ai...")
    url = "https://kieai.redpandaai.co/api/file-stream-upload"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    
    with open(image_path, "rb") as f:
        files = {"file": f}
        data = {"uploadPath": "images/reels"}
        response = requests.post(url, headers=headers, files=files, data=data)
        
    if response.status_code == 200:
        data = response.json()
        download_url = data.get("data", {}).get("downloadUrl")
        if not download_url:
            raise Exception(f"Не удалось найти downloadUrl в ответе: {data}")
        print(f"[*] Картинка успешно загружена: {download_url}")
        return download_url
    else:
        raise Exception(f"Ошибка загрузки картинки на Kie.ai: {response.text}")
