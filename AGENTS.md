# Professional Modular Code Policy

Write code as a professional modular system, not as large monolithic files.

#Lessons

- For KIE Gemini Omni generation, preserve and pass `image_urls` separately from saved avatar `character_ids`.
- For KIE Gemini Omni video, do not put the avatar reference into `image_urls`; send only product references there and send the avatar via `character_ids`.
- Apply CTA wording contracts at the script-generation seam, not only at downstream video prompt seams.
