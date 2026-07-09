import os
import logging
from openai import AsyncOpenAI
from typing import Optional

logger = logging.getLogger(__name__)

async def generate_character_image(prompt: str) -> Optional[str]:
    """
    Generates a character image using DALL-E 3 (gpt image 2 equivalent) via OpenAI API.
    Returns the URL of the generated image.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY is not set.")
        return None

    try:
        client = AsyncOpenAI(api_key=api_key)
        
        # Enforce character style and aspect ratio if needed
        full_prompt = f"A photorealistic portrait of a single character looking directly at the camera. {prompt}. High quality, cinematic lighting, 8k resolution, photorealistic."
        
        response = await client.images.generate(
            model="dall-e-3",
            prompt=full_prompt,
            n=1,
            size="1024x1024",
            quality="standard",
        )
        
        if response.data and len(response.data) > 0:
            return response.data[0].url
        return None
    except Exception as e:
        logger.error(f"Failed to generate character image via OpenAI: {e}")
        return None
