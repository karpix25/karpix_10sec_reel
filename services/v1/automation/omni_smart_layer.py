import re
from typing import List

def process_scenario_for_omni(script: str, clothing: str = "") -> List[str]:
    # Clean punctuation that might break TTS
    cleaned = script.replace("-", " ").replace("—", " ")
    cleaned = re.sub(r'\.{2,}', '', cleaned)
    
    # Split into words to roughly measure 15-20 words per scene
    words = cleaned.split()
    scenes = []
    
    chunk_size = 18
    for i in range(0, len(words), chunk_size):
        chunk_words = words[i:i+chunk_size]
        scene_text = " ".join(chunk_words)
        
        clothing_text = f"в {clothing} " if clothing else ""
        
        prompt = f'Персонаж {clothing_text}смотрит в камеру и говорит на чистом русском языке: "{scene_text}"\nК концу сцены камера плавно наезжает.'
        scenes.append(prompt)
        
    return scenes
