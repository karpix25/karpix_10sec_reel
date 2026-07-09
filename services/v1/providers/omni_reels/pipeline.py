import os
import random
from kie_ai_client import create_video_task, poll_task_status, download_video, upload_image
from video_processor import concatenate_videos, extract_last_frame

CHARACTER_ID = "2eefe60357c743d3911f3f980fe8304a"
AUDIO_ID = "4a786461922c4383a2010d9b8a4b4f33"

# Утвержденный сценарий
SCENES = [
    'Персонаж находится в современном спортзале, смотрит в камеру и говорит на чистом русском языке: "Думаешь что протеин это всё что нужно после тренировки? А как насчет твоих суставов?" К концу сцены камера плавно отъезжает назад, чтобы последний кадр стал общим планом.',
    'Персонаж находится в спортзале и держит оранжевую банку коллагена. Персонаж начинает говорить с общего плана, камера плавно наезжает, а к концу сцены снова отъезжает назад. Речь на чистом русском языке: "Я перешел на коллаген с соком апельсина от Сонри. Шесть тысяч миллиграмм для связок кожи и волос." Последний кадр должен быть общим планом.',
    'Персонаж находится в спортзале с оранжевой банкой коллагена. Персонаж начинает говорить с общего плана, камера плавно наезжает, а к концу сцены снова отъезжает назад. Речь на чистом русском языке: "И на вкус это просто пушка никакого химозного привкуса. Забирай банку и тренируйся без хруста." Последний кадр должен быть общим планом.'
]

def main():
    if not os.path.exists("temp_videos"):
        os.makedirs("temp_videos")
        
    generated_videos = []
    
    print("=== Начало генерации Reels (Gemini Omni) ===")
    
    # Загружаем картинку коллагена (должна лежать рядом со скриптом)
    product_image_url = None
    if os.path.exists("collagen.jpg"):
        print("[*] Обнаружена картинка товара. Загружаем...")
        product_image_url = upload_image("collagen.jpg")
    else:
        print("[!] ВНИМАНИЕ: Файл collagen.jpg не найден. Продолжаем без него (нейросеть сгенерирует банку сама).")

    # Фиксируем сид для стабильности голоса
    FIXED_SEED = 999999
    last_frame_url = None
    
    for i, scene_text in enumerate(SCENES):
        scene_num = i + 1
        print(f"\n--- Сцена {scene_num}/{len(SCENES)} ---")
        
        print(f"Текст: {scene_text}")
        print(f"Seed: {FIXED_SEED}")
        if last_frame_url:
            print(f"Reference Image: {last_frame_url}")
            
        current_product_url = product_image_url if scene_num > 1 else None
        
        try:
            # 1. Запуск генерации
            task_result = create_video_task(
                prompt=scene_text, 
                character_id=CHARACTER_ID, 
                audio_id=AUDIO_ID, 
                seed=FIXED_SEED,
                reference_image_url=last_frame_url,
                product_image_url=current_product_url
            )
            
            # Если вернулась сразу ссылка
            if isinstance(task_result, dict) and task_result.get("url"):
                video_url = task_result["url"]
            else:
                # 2. Опрос статуса
                task_id = task_result
                video_url = poll_task_status(task_id)
                
            # 3. Скачивание видео
            video_filename = f"temp_videos/scene_{scene_num}.mp4"
            download_video(video_url, video_filename)
            
            generated_videos.append(video_filename)
            
            # Вырезаем последний кадр для следующей сцены
            if i < len(SCENES) - 1:
                frame_filename = f"temp_videos/frame_{scene_num}.jpg"
                extract_last_frame(video_filename, frame_filename)
                last_frame_url = upload_image(frame_filename)
                
        except Exception as e:
            print(f"[!] Ошибка при генерации сцены {scene_num}: {e}")
            print("Прерываем пайплайн.")
            return

    # 4. Склейка
    if generated_videos:
        print("\n--- Запуск склейки ---")
        final_output = "final_reel.mp4"
        concatenate_videos(generated_videos, final_output)
        print("=== Reels успешно создан! ===")
    else:
        print("Не удалось сгенерировать видео для склейки.")

if __name__ == "__main__":
    main()
