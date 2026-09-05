import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pool from "@/lib/db";
import { getReadableS3Url } from "@/lib/server/s3-storage";
import { isYandexDiskConfigured } from "@/lib/server/yandex-disk";
import { buildYandexDeliveryPath, deliverVideoToYandex, deliveryStage } from "@/lib/server/yandex-disk-delivery";
import { getOmniReel } from "./reels";
import { getOmniProject } from "./projects";
import { requireOmniProductInProject } from "./products";
import { resolveOmniYandexFolderPath } from "./omni-video-storage";
import { withOmniReelExecutionLock } from "./omni-reel-execution-lock";

export async function retryOmniYandexDelivery(reelId: number) {
  return withOmniReelExecutionLock(reelId, {
    onLocked: async () => { throw new Error("Доставка этого ролика уже выполняется."); },
    run: async () => {
      const reel = await getOmniReel(reelId);
      if (!reel) throw new Error("Ролик не найден.");
      if (reel.yandex_status === "completed") return reel;
      if (reel.status !== "completed" || reel.stitch_status !== "completed" || !reel.final_s3_url || reel.yandex_status !== "failed") {
        throw new Error("Повтор доставки доступен только для готового ролика с ошибкой Яндекс Диска.");
      }
      if (!isYandexDiskConfigured()) throw new Error("Яндекс Диск не настроен.");
      const workdir = await mkdtemp(join(tmpdir(), "omni-yandex-delivery-"));
      try {
        // Reuse the original S3 basename, including its saved timestamp. Never generate a new filename.
        let filePath = reel.yandex_disk_path;
        if (!filePath) {
          const project = await getOmniProject(reel.project_id);
          if (!project) throw new Error("Проект не найден.");
          const product = await requireOmniProductInProject(reel.project_id, reel.product_id);
          const folderPath = await resolveOmniYandexFolderPath({ project, product, reel });
          const fileName = decodeURIComponent(new URL(reel.final_s3_url).pathname.split("/").at(-1) || "");
          filePath = buildYandexDeliveryPath(folderPath, fileName);
          await pool.query("UPDATE omni_reels SET yandex_disk_path = $2 WHERE id = $1", [reelId, filePath]);
        }
        const localFilePath = join(workdir, "final.mp4");
        await deliveryStage("чтение готового видео из S3", async () => {
          const readableUrl = await getReadableS3Url(reel.final_s3_url);
          if (!readableUrl) throw new Error("нет адреса готового видео");
          const response = await fetch(readableUrl, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          if (!buffer.length) throw new Error("пустой файл");
          await writeFile(localFilePath, buffer);
        });
        const delivered = await deliverVideoToYandex({ localFilePath, filePath });
        await pool.query(
          "UPDATE omni_reels SET yandex_status = 'completed', yandex_disk_path = $2, yandex_public_url = $3, yandex_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [reelId, delivered.filePath, delivered.publicUrl],
        );
      } catch (error) {
        await pool.query(
          "UPDATE omni_reels SET yandex_status = 'failed', yandex_error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [reelId, error instanceof Error ? error.message : "Яндекс Диск: доставка не завершена."],
        );
      } finally { await rm(workdir, { recursive: true, force: true }); }
      return getOmniReel(reelId);
    },
  });
}
