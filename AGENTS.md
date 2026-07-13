# Professional Modular Code Policy

Write code as a professional modular system, not as large monolithic files.

#Lessons

- For KIE Gemini Omni generation, preserve and pass `image_urls` separately from saved avatar `character_ids`.
- For KIE Gemini Omni video, do not put the avatar reference into `image_urls`; send only product references there and send the avatar via `character_ids`.
- Apply CTA wording contracts at the script-generation seam, not only at downstream video prompt seams.
- Provider-facing UI copy must use the active or persisted generation provider label, never hardcoded "Omni" status text.
- Reel auto-run creation must pass the active generation provider, not rely on the default provider used by manual run fallbacks.
- After frontend deploys, account for already-open browser tabs still running old JavaScript before declaring provider-flow fixes verified.
- KIE Omni character creation must persist `data.characterId`; never treat `taskId` or `recordId` as a usable video `character_id`.
- KIE Omni character approval must retry failed character tasks until a real `characterId` is received or the configured retry budget is exhausted.
- KIE Omni requests should omit optional empty fields instead of sending empty arrays or blank strings.
- KIE Omni character creation must use `/api/v1/omni/character/create`, not the generic `/api/v1/jobs/createTask` marketplace endpoint.
