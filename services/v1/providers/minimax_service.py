import logging
import os
import re
import uuid

import requests
from dotenv import load_dotenv

from services.v1.providers.elevenlabs_service import (
    apply_elevenlabs_replacements,
    normalize_elevenlabs_pronunciation_overrides,
)

logger = logging.getLogger(__name__)

load_dotenv(override=True)

DEFAULT_MINIMAX_VOICE_ID = "Russian_Engaging_Podcaster_v1"
MINIMAX_TTS_MODEL = "speech-2.8-hd"

PRONUNCIATION_RULES = [
    {"source": "Airbnb", "target": "Эйрбиэнби", "aliases": ["airbnb"]},
    {"source": "Booking", "target": "Букинг", "aliases": ["booking.com", "Booking.com", "booking"]},
    {
        "source": "7-Eleven",
        "target": "севен илевен",
        "aliases": ["7-11", "7 eleven", "seven eleven", "Seven Eleven", "семь-одиннадцать", "семь одиннадцать"],
    },
    {"source": "Instagram", "target": "Инстаграм", "aliases": ["instagram"]},
    {"source": "WhatsApp", "target": "Вотсап", "aliases": ["Whatsapp", "whatsapp"]},
    {"source": "Telegram", "target": "Телеграм", "aliases": ["telegram"]},
    {"source": "PayPal", "target": "Пэйпэл", "aliases": ["Paypal", "paypal"]},
    {"source": "Wise", "target": "Вайз", "aliases": ["wise"]},
    {"source": "Payoneer", "target": "Пайонир", "aliases": ["payoneer"]},
    {"source": "Revolut", "target": "Револют", "aliases": ["revolut"]},
    {"source": "Binance", "target": "Байнэнс", "aliases": ["binance"]},
    {"source": "Mastercard", "target": "Мастеркард", "aliases": ["mastercard", "MasterCard"]},
]


def _escape_regexp(value):
    return re.escape(value)


def _build_pronunciation_tone(text):
    entries = []
    seen = set()

    for rule in PRONUNCIATION_RULES:
        variants = [rule["source"], *(rule.get("aliases") or [])]
        for variant in variants:
            regex = re.compile(
                rf"(^|[^A-Za-zА-Яа-яЁё])({_escape_regexp(variant)})(?=$|[^A-Za-zА-Яа-яЁё])",
                re.IGNORECASE,
            )
            match = regex.search(text or "")
            if not match:
                continue

            source = match.group(2)
            entry = f"{source}/{rule['target']}"
            if entry not in seen:
                entries.append(entry)
                seen.add(entry)

    return entries


def prepare_text_for_minimax_tts(text, pronunciation_overrides=None):
    prepared = text or ""
    replacement_rules = normalize_elevenlabs_pronunciation_overrides(pronunciation_overrides)
    prepared = apply_elevenlabs_replacements(prepared, replacement_rules)
    prepared = re.sub(r"\s+([,.;:!?])", r"\1", prepared)
    prepared = re.sub(r"\s+", " ", prepared).strip()
    return prepared


def text_to_speech_minimax(text, voice_id=DEFAULT_MINIMAX_VOICE_ID, speed=1.1, pronunciation_overrides=None):
    voice_id = voice_id or DEFAULT_MINIMAX_VOICE_ID
    api_key = os.getenv("MINIMAX_API_KEY")
    group_id = os.getenv("MINIMAX_GROUP_ID")

    if not api_key or not group_id or api_key.startswith("your_"):
        logger.error("MINIMAX_API_KEY or MINIMAX_GROUP_ID missing or not configured")
        raise ValueError("MiniMax API keys are not configured in .env")

    url = "https://api.minimax.io/v1/t2a_v2"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    prepared_text = prepare_text_for_minimax_tts(text, pronunciation_overrides=pronunciation_overrides)
    payload = {
        "model": MINIMAX_TTS_MODEL,
        "text": prepared_text,
        "stream": False,
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "vol": 1.0,
            "pitch": 0,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
        },
    }

    pronunciation_tone = _build_pronunciation_tone(prepared_text)
    if pronunciation_tone:
        payload["pronunciation_dict"] = {"tone": pronunciation_tone}

    logger.info("Connecting to MiniMax for TTS (Text length: %s characters)", len(text or ""))
    response = requests.post(url, headers=headers, json=payload, timeout=45)
    if response.status_code != 200:
        logger.error("MiniMax API HTTP Error: %s - %s", response.status_code, response.text)
        raise Exception(f"MiniMax HTTP error {response.status_code}")

    result = response.json()
    if "base_resp" in result and result["base_resp"]["status_code"] != 0:
        error_code = result["base_resp"]["status_code"]
        error_msg = result["base_resp"]["status_msg"]
        logger.error("MiniMax API Error Code %s: %s", error_code, error_msg)

        if error_code == 1004:
            raise Exception("MiniMax Authorization failed. Please check your API key.")
        if error_code == 1001:
            raise Exception("MiniMax Group ID is incorrect.")
        if error_code == 2013:
            raise Exception(f"MiniMax Voice ID '{voice_id}' not found.")
        raise Exception(f"MiniMax Error: {error_msg}")

    if "data" not in result or "audio" not in result["data"]:
        logger.error("Incomplete response from MiniMax: %s", result)
        raise Exception("MiniMax failed to return audio data.")

    audio_data = bytes.fromhex(result["data"]["audio"])
    output_path = f"/tmp/tts_{uuid.uuid4().hex[:8]}.mp3"
    with open(output_path, "wb") as file:
        file.write(audio_data)

    logger.info("Successfully generated TTS to: %s", output_path)
    return output_path
