import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.v1.automation.omni_smart_layer import process_scenario_for_omni
from services.v1.providers.omni_kie_client import create_video_task

def main():
    script = "Думаешь что протеин это всё что нужно после тренировки? А как насчет твоих суставов? Я перешел на коллаген с соком апельсина от Сонри. Шесть тысяч миллиграмм для связок кожи и волос. И на вкус это просто пушка никакого химозного привкуса. Забирай банку и тренируйся без хруста."
    clothing = "черной футболке"
    
    print("1. Запуск Omni Smart Layer...")
    prompts = process_scenario_for_omni(script, clothing=clothing)
    
    for i, p in enumerate(prompts):
        print(f"\n--- Сцена {i+1} ---")
        print(p)
        
    print("\n2. Отправка первой сцены в CometAPI Omni...")
    
    CHARACTER_ID = "2eefe60357c743d3911f3f980fe8304a"
    AUDIO_ID = "4a786461922c4383a2010d9b8a4b4f33"
    FIXED_SEED = 999999
    
    try:
        task_result = create_video_task(
            prompt=prompts[0],
            character_id=CHARACTER_ID,
            audio_id=AUDIO_ID,
            seed=FIXED_SEED,
            reference_image_url=None,
            product_image_url=None
        )
        print(f"\n✅ Задача успешно создана! Ответ API: {task_result}")
        print("Тест Omni Pipeline пройден успешно. Интеграция работает.")
    except Exception as e:
        print(f"\n❌ Ошибка при отправке в Omni: {e}")

if __name__ == "__main__":
    main()
