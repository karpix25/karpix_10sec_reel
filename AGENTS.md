# Professional Modular Code Policy

Write code as a professional modular system, not as large monolithic files.

#Lessons

- Run repository-level scripts from the repository root or use a path relative to the command working directory.
- Preserve persisted 20, 30, and 40 second reel durations when deriving their 2, 3, or 4 segment plans.
- Run TypeScript smoke tests with the project compiler or a resolver that supports extensionless imports, not direct Node ESM imports.
- Re-read edited TypeScript expressions around changed parentheses before running validation.
- Keep internal anti-default guards out of provider prompts; render the chosen positive visual plan instead.
- Count the staged file list from Git output before reporting the number of files in a commit.
- Never use the VPS host localhost port as app health evidence until its owning process is verified; check inside the target container and through the public host.
- After staging code, run a repository build or inspect the exact staged file before pushing/deploying to catch stray typed characters.
- When validating Docker Compose config, do not print rendered environment values; write or grep only non-secret structural fields.
- Exclude local tunnel helper scripts such as `start_tunnels.sh` from broad repo searches unless explicitly auditing them.

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
- When the user provides provider documentation links, verify the exact endpoint, payload shape, and success response before implementing the integration.
- When running remote Docker commands with container environment variables, prevent local shell expansion before executing the command.
- Run production Node diagnostics from `/app/ui` when they require packages installed by the UI workspace.
- Persist exact prop colors, materials, shapes, and positions across every segment of one generated reel.
- Reject long dash characters and emoji at the script-generation boundary instead of relying only on prompt wording.
- Main-character and clothing contracts must be rendered explicitly in Omni prompts even when character_id and image_urls are already provided.
- Prefer talking-head with simple cutaways over continuous choreographed actions when Omni scene actions reduce visual stability.
- Do not leave forbidden default props in selectable Omni prompt paths after switching to a safer visual format.
- For KIE continuity screenshots or generated frame references, upload the image through KIE File Upload before passing it in `image_urls`.
- Keep provider-facing video prompts free of platform names or app-interface cues that can imprint unwanted social-media overlays.
- When auditing provider prompt imprint terms, exclude exact voiceover lines from matcher checks without rewriting the spoken text.
- Do not mutate or trim provider prompts at runtime to remove imprint terms; control that through prompt templates so the model receives the full intended prompt.
- When verifying container environment variables over SSH, use `docker exec env | grep NAME` or quote the in-container shell so the outer shell cannot expand them.
- For 10 second Omni segments, keep speech dense and montage-paced; do not stretch sparse text with filler actions or long silent beats.
- For remote Node diagnostics over SSH, avoid fragile heredoc quoting; send the script via stdin or a safely quoted temp file.
- Exclude `.env*` from broad searches unless explicitly inspecting environment shape, and never print secret values while debugging.
- Exclude local tunnel and shell helper scripts from broad searches unless explicitly auditing them, because they may contain sensitive operational values.
- When the user names a provider env with a non-doc spelling, support that alias explicitly instead of assuming the doc spelling is what production uses.
- Verify Telegram auth callback hosts, not only app health, because `WEBAPP_BASE_URL` can point to a different or dead domain.
- Escape SQL placeholders such as `$1` in remote `node -e` diagnostics so the outer shell cannot expand them away.
- When director analysis exists, use its scene, wardrobe, lighting, and environment props as the provider prompt source of truth, not preset visual-style props.
- Director-reference Omni prompts must follow the reference wardrobe, light, camera, and edit rhythm exactly, except removing overlays/subtitles and replacing the original product with ours.
- Do not copy unrelated reference B-roll into Omni prompts; map reference cutaway mechanics to the new product and send the product reference whenever the product should appear.
- Avoid type-only import hacks in prompt renderers; import shared TypeScript types explicitly.
- Re-open newly added shared modules before wiring imports when subagents or parallel work may have changed their public interface.
- Verify the production Docker Compose service name before build/up; do not assume the local workspace package name is a Compose service.
- Product-mention predicates must not include the product name in the searched text, or every segment becomes product-visible.
- Calibrate Omni speech budgets from delivered original words per second, not total transcribed words that may include duplicated hallucinated phrases.
- Count exact Omni voiceover repetitions only in provider-facing exact-replica lines, not in internal script beat guidance.
- Show original references as external Instagram links unless the user explicitly asks to embed or play the reference video.
- When a reference is a collage or picture-in-picture format, preserve that layout contract explicitly instead of reducing it to a generic talking-head scene.
- Quote bracketed Next.js route paths in shell commands so zsh does not expand them.
- Keep subtitle style controls in project/client settings; reel cards should only trigger or show subtitle render status.

# Project Skills

- For Omni Reels UI/UX work, follow `skills/omni-reels-product-ux/SKILL.md`.
