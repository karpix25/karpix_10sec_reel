import unittest

from services.v1.automation.omni_life_formats import GLOBAL_FORBIDDEN, select_life_format
from services.v1.automation.omni_prompt_validator import validate_omni_prompt
from services.v1.automation.omni_script_segmentation import (
    normalize_script_text,
    reconstruct_voice_parts,
    split_script_into_voice_parts,
)


class TestOmniLifeFormats(unittest.TestCase):
    def test_selector_prefers_habit_replacement_for_powder_problem(self):
        selected = select_life_format("Я больше не могу заставлять себя разводить этот порошок в шейкере")
        self.assertEqual(selected.format_id, "habit_replacement")

    def test_selector_prefers_post_workout_for_training_context(self):
        selected = select_life_format("После тренировки суставы напоминают о себе, и восстановление затягивается")
        self.assertEqual(selected.format_id, "post_workout")

    def test_selector_uses_neutral_fallback_without_format_signal(self):
        selected = select_life_format("Через месяц всё стало заметно лучше")
        self.assertEqual(selected.format_id, "moving_vlog")

    def test_habit_replacement_requires_explicit_replacement_story(self):
        selected = select_life_format("Я наконец нашла удобный продукт для обычного дня")
        self.assertNotEqual(selected.format_id, "habit_replacement")

    def test_global_contract_forbids_mirrors_and_driving(self):
        contract = " ".join(GLOBAL_FORBIDDEN).lower()
        self.assertIn("зеркала", contract)
        self.assertIn("за рулем", contract)

    def test_segmentation_keeps_cta_together(self):
        script = (
            "После тренировки я стала добавлять коллаген в воду. "
            "Суставы меньше беспокоят, а кожа выглядит свежее. "
            "Артикул оставлю в описании."
        )
        parts = split_script_into_voice_parts(script, 2)

        self.assertIn("Артикул оставлю в описании.", parts[-1])
        self.assertNotEqual(parts[-1], "описании.")
        self.assertEqual(reconstruct_voice_parts(parts), normalize_script_text(script))

    def test_validator_requires_zero_start_and_one_exact_quote(self):
        voiceover = "Я больше не развожу этот порошок по утрам."
        prompt = (
            "Первое слово точной реплики звучит в первом кадре на 0.0 секунде. "
            f'Точная реплика: "{voiceover}"'
        )
        result = validate_omni_prompt(
            prompt=prompt,
            exact_voiceover=voiceover,
            beat_actions=("отодвигает банку", "освобождает место", "кладет стик"),
            product_role="natural_use",
        )

        self.assertTrue(result.valid)
        self.assertEqual(result.score, 100)

    def test_validator_rejects_mirror_action(self):
        voiceover = "Я наконец нашла удобный формат."
        prompt = f'Первое слово звучит на 0.0 секунде. "{voiceover}"'
        result = validate_omni_prompt(
            prompt=prompt,
            exact_voiceover=voiceover,
            beat_actions=("говорит у зеркала", "берет продукт", "заканчивает мысль"),
            product_role="natural_use",
        )

        self.assertFalse(result.valid)
        self.assertIn("forbidden_visual_motif", result.errors)


if __name__ == "__main__":
    unittest.main()
