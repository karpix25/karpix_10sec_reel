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
        self.assertTrue(prompts[0].startswith('Персонаж в красной куртке смотрит в камеру'))
        self.assertIn('К концу сцены камера плавно наезжает.', prompts[0])

    def test_process_scenario_chunking(self):
        # 40 words
        script = " ".join([f"слово{i}" for i in range(40)])
        prompts = process_scenario_for_omni(script)
        
        # 40 / 18 = 2.22 -> 3 chunks
        self.assertEqual(len(prompts), 3)
        self.assertTrue(prompts[0].startswith('Персонаж смотрит в камеру'))

if __name__ == '__main__':
    unittest.main()
