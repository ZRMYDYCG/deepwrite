import { expect, it } from "vitest";
import { decompositionTaskUnitIds } from "./job";

const units = [
  "chunk:ab12",
  "character:lin",
  "character:lin-yue",
  "world:realm.levels"
];

it("只认任务说明里完整写出的单元 id", () => {
  expect(
    decompositionTaskUnitIds("处理 character:lin-yue，侧重师门关系。", units)
  ).toEqual(["character:lin-yue"]);
  expect(
    decompositionTaskUnitIds("单元：character:lin；character:lin-yue", units)
  ).toEqual(["character:lin", "character:lin-yue"]);
});

it("不区分大小写，id 里的点按字面匹配", () => {
  expect(decompositionTaskUnitIds("world:Realm.Levels", units)).toEqual([
    "world:realm.levels"
  ]);
  expect(decompositionTaskUnitIds("world:realmXlevels", units)).toEqual([]);
});

it("id 只是更长标识的一部分时不算写明", () => {
  expect(decompositionTaskUnitIds("xchunk:ab12 与 chunk:ab123", units)).toEqual(
    []
  );
  expect(decompositionTaskUnitIds("", units)).toEqual([]);
});
