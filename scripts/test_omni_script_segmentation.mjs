import assert from "node:assert/strict";
import { splitScriptIntoVoiceSegments } from "../ui/src/lib/server/omni/omni-script-segmentation.ts";

const script = "Сидеть в all inclusive в Турции? Это что то нереальное. Мы вот брали машину и сразу рванули в Каппадокию, смотрели на отели в скалах, воздушные шары. С Плати по миру виртуальная карта ты можешь выпустить виртуальную карту и платить за границей. Ссылка в профиле. Дальше можно проехать около Стамбула, а еще есть соленое озеро и пляж Олюдениз, где можно и в трекинг пойти, и на пляже почилить. Турцию нужно смотреть, а не сидеть в отеле.";

assert.throws(() => splitScriptIntoVoiceSegments(script, 3, 25, 8));

const segments = splitScriptIntoVoiceSegments(script, 4, 25, 8);
assert.equal(segments.length, 4);
for (const segment of segments.slice(0, -1)) {
  assert.doesNotMatch(segment.text, /(?:^|\s)(?:а|и|но|в|на|по|для|из|к|с|у)[,.!?;:»"]?$/iu);
}
