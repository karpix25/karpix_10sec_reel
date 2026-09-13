import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ensureFolderTreeExists, yandexRequest } from "./yandex-disk";

type DeliveryMetadata = { path?: string; size?: number; md5?: string; public_url?: string };

export function buildYandexDeliveryPath(folderPath: string, fileName: string) {
  if (!folderPath.startsWith("disk:/") || /[\\\u0000-\u001f]/u.test(folderPath) || folderPath.split("/").includes("..")) {
    throw new Error("Яндекс Диск: неверный путь папки доставки.");
  }
  if (!fileName || /[\\/\u0000-\u001f]/u.test(fileName) || fileName === "." || fileName === "..") {
    throw new Error("Яндекс Диск: неверное имя файла доставки.");
  }
  // Match the legacy uploader exactly so recovery addresses the original target.
  const storedName = fileName.replace(/[<>:"|?*]/gu, "_").replace(/\s+/gu, "_").trim().slice(0, 180);
  return `${folderPath.replace(/\/+$/u, "")}/${storedName}`;
}

export async function deliverVideoToYandex(input: { localFilePath: string; filePath: string }) {
  const buffer = await readFile(input.localFilePath);
  const checksum = createHash("md5").update(buffer).digest("hex");
  let metadata = await deliveryStage("проверка файла", () => readDeliveryMetadata(input.filePath));
  const matches = (meta: DeliveryMetadata | null) => Boolean(meta && meta.size === buffer.length && meta.md5 === checksum);
  if (metadata && !matches(metadata)) throw new Error("Яндекс Диск: по целевому пути уже существует другой файл. Он не перезаписан.");
  if (!metadata) {
    const folderPath = input.filePath.slice(0, input.filePath.lastIndexOf("/"));
    await deliveryStage("подготовка папки", () => ensureFolderTreeExists(folderPath));
    const uploadUrl = await deliveryStage("получение адреса загрузки", async () => {
      const response = await yandexRequest(`/resources/upload?path=${encodeURIComponent(input.filePath)}&overwrite=false`);
      assertResponse(response);
      const data = await response.json() as { href?: string };
      if (!data.href || !data.href.startsWith("https://")) throw new Error("не получен HTTPS адрес загрузки");
      return data.href;
    });
    try {
      await deliveryStage("загрузка видео", async () => {
        const response = await fetch(uploadUrl, {
          method: "PUT", body: buffer, headers: { "Content-Type": "video/mp4" },
          cache: "no-store", signal: AbortSignal.timeout(90_000),
        });
        assertResponse(response);
      });
    } catch (error) {
      // The remote upload may have completed after the local request timed out.
      metadata = await deliveryStage("проверка после сбоя загрузки", () => readDeliveryMetadata(input.filePath));
      if (!matches(metadata)) throw error;
    }
    metadata = await deliveryStage("проверка целостности", () => readDeliveryMetadata(input.filePath));
    if (!matches(metadata)) throw new Error("Яндекс Диск: целостность загруженного файла ещё не подтверждена. Повторная отправка сначала проверит его состояние.");
  }
  if (!metadata?.public_url) {
    await deliveryStage("публикация ссылки", async () => {
      const response = await yandexRequest(`/resources/publish?path=${encodeURIComponent(input.filePath)}`, { method: "PUT" });
      if (response.status !== 409) assertResponse(response);
    });
    metadata = await deliveryStage("получение публичной ссылки", () => readDeliveryMetadata(input.filePath));
    if (!matches(metadata) || !metadata?.public_url) throw new Error("Яндекс Диск: файл сохранён, публичная ссылка пока не подтверждена.");
  }
  return { filePath: input.filePath, publicUrl: metadata!.public_url! };
}

async function readDeliveryMetadata(filePath: string): Promise<DeliveryMetadata | null> {
  const response = await yandexRequest(`/resources?path=${encodeURIComponent(filePath)}&fields=path,size,md5,public_url`);
  if (response.status === 404) return null;
  assertResponse(response);
  return response.json();
}

function assertResponse(response: Response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function deliveryStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    const message = error instanceof Error && /^(HTTP \d+|Яндекс Диск:)/u.test(error.message)
      ? error.message : error instanceof Error && /timeout|abort/iu.test(`${error.name} ${error.message}`)
        ? "истекло время ожидания" : "операция не завершена";
    throw new Error(`Яндекс Диск — ${stage}: ${message}`);
  }
}
