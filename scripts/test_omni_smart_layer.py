import unittest
import sys
import os

# Ensure the module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from services.v1.automation.omni_smart_layer import process_scenario_for_omni

class TestOmniSmartLayer(unittest.TestCase):
    def test_process_scenario_for_omni_cleaning(self):
        script = "Привет... Это тестовый скрипт — он проверяет работу-функции."
        prompts = process_scenario_for_omni(script, clothing="красной куртке")
        
        self.assertEqual(len(prompts), 1)
        self.assertNotIn("...", prompts[0])
        self.assertNotIn("—", prompts[0])
        self.assertNotIn("-", prompts[0])
        self.assertIn("часть 1 из 1 одного непрерывного Reels", prompts[0])
        self.assertIn("Один и тот же персонаж в красной куртке", prompts[0])
        self.assertIn("нужно озвучить только этот точный текст", prompts[0])
        self.assertIn("К концу сцены камера делает мягкий плавный наезд.", prompts[0])

    def test_process_scenario_chunking(self):
        # 40 words
        script = " ".join([f"слово{i}" for i in range(40)])
        prompts = process_scenario_for_omni(script)
        
        # 40 / 18 = 2.22 -> 3 chunks
        self.assertEqual(len(prompts), 3)
        self.assertIn("часть 1 из 3 одного непрерывного Reels", prompts[0])
        self.assertIn("часть 2 из 3 одного непрерывного Reels", prompts[1])
        self.assertIn("часть 3 из 3 одного непрерывного Reels", prompts[2])

    def test_each_part_has_own_exact_voice_text(self):
        script = " ".join([f"слово{i}" for i in range(20)])
        prompts = process_scenario_for_omni(script)

        self.assertIn('"слово0 слово1 слово2 слово3 слово4 слово5 слово6 слово7 слово8 слово9 слово10 слово11 слово12 слово13 слово14 слово15 слово16 слово17"', prompts[0])
        self.assertIn('"слово18 слово19"', prompts[1])
        self.assertIn("Не добавляй другие фразы", prompts[0])

if __name__ == '__main__':
    unittest.main()
