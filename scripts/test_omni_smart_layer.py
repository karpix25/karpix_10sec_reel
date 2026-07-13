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
        self.assertNotIn("работу-функции", prompts[0])
        self.assertIn("часть 1 из 1 одного непрерывного Reels", prompts[0])
        self.assertIn("один и тот же человек в красной куртке", prompts[0])
        self.assertIn("ТОЧНАЯ РЕПЛИКА", prompts[0])
        self.assertIn("ЖИЗНЕННАЯ СИТУАЦИЯ", prompts[0])

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

        self.assertIn('ТОЧНАЯ РЕПЛИКА: "слово0', prompts[0])
        self.assertIn('слово19"', prompts[1])
        self.assertEqual(sum(prompt.count("ТОЧНАЯ РЕПЛИКА:") for prompt in prompts), 2)
        self.assertIn("не добавлять и не повторять слова", prompts[0])

    def test_first_part_gets_visual_hook_direction(self):
        script = "Коллаген после тренировки помогает суставам и коже. Я беру стакан воды утром и объясняю почему это удобно."
        prompts = process_scenario_for_omni(script)

        self.assertIn("первое слово точной реплики звучит в первом кадре на 0.0 секунде", prompts[0])
        self.assertIn("0.0-3.0 сек", prompts[0])
        self.assertIn("нет паузы", prompts[0])
        self.assertNotIn("говорит у зеркала", prompts[0])

    def test_parts_have_different_directed_actions(self):
        script = " ".join([f"тренировка суставы спорт движение слово{i}" for i in range(12)])
        prompts = process_scenario_for_omni(script)

        self.assertGreaterEqual(len(prompts), 3)
        self.assertIn("ТРИ СОСТОЯНИЯ ОДНОГО ДЕЙСТВИЯ", prompts[0])
        self.assertIn("без сброса сцены продолжает", prompts[1])
        self.assertIn("без дополнительного CTA", prompts[-1])

    def test_hidden_product_never_introduces_compact_replacement(self):
        script = "Я ношу с собой слишком много вещей. Теперь собираюсь быстрее и ничего не забываю."
        prompts = process_scenario_for_omni(script)
        positive_beats = "\n".join(
            line for prompt in prompts for line in prompt.splitlines() if "сек:" in line
        ).lower()

        self.assertNotIn("компактный предмет", positive_beats)
        self.assertNotIn("компактный продукт", positive_beats)
        self.assertNotIn("более удобный предмет", positive_beats)

    def test_cta_is_not_split_or_rewritten(self):
        script = "После тренировки я стала добавлять коллаген в воду. Суставы меньше беспокоят. Артикул оставлю в описании."
        prompts = process_scenario_for_omni(script)

        self.assertIn("Артикул оставлю в описании.", prompts[-1])
        self.assertNotIn('ТОЧНАЯ РЕПЛИКА: "описании.', prompts[-1])
        self.assertEqual(sum(prompt.count("Артикул оставлю в описании.") for prompt in prompts), 1)

    def test_every_part_repeats_identical_prop_passport(self):
        script = "Я ношу с собой слишком много вещей. " + " ".join(
            f"сумка ключи блокнот слово{i}" for i in range(10)
        )
        prompts = process_scenario_for_omni(script)
        passports = [
            next(line for line in prompt.splitlines() if line.startswith("ПАСПОРТ РЕКВИЗИТА"))
            for prompt in prompts
        ]

        self.assertGreater(len(passports), 1)
        self.assertEqual(len(set(passports)), 1)
        self.assertIn("матовая черная нейлоновая сумка", passports[0])

    def test_script_contract_removes_long_dashes_and_emoji(self):
        prompts = process_scenario_for_omni("Это тест — без тире и emoji 😊. Артикул в описании.")

        self.assertNotIn("—", prompts[0])
        self.assertNotIn("😊", prompts[0])

if __name__ == '__main__':
    unittest.main()
