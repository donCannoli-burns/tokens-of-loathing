import { expect, test, vi } from "vitest";
import {
  AscensionClass,
  Familiar,
  Item,
  Path,
  Skill,
} from "./schema.js";
import type { Client } from "./node.js";
import { kolmafiaMockLegacyDataFromClient } from "./legacy-mock.js";

test("projects current entities into the legacy kolmafia-mock shape", async () => {
  const rows = new Map<unknown, unknown[]>([
    [
      Item,
      [
        {
          id: 1,
          name: "seal tooth",
          plural: "seal teeth",
          descid: 123,
          image: "tooth.gif",
          quest: false,
          gift: false,
          tradeable: true,
          discardable: true,
          autosell: 1,
          ambiguous: false,
          consumable: {
            stomach: 0,
            liver: 0,
            spleen: 0,
            quality: "none",
            levelRequirement: 0,
            adventureRange: "",
            adventures: 0,
            muscle: 0,
            muscleRange: "",
            mysticality: 0,
            mysticalityRange: "",
            moxie: 0,
            moxieRange: "",
            notes: undefined,
          },
        },
      ],
    ],
    [
      AscensionClass,
      [
        {
          id: 1,
          name: "Seal Clubber",
          enumName: "SEAL_CLUBBER",
          image: "club.gif",
          primeStatIndex: 0,
          stun: "",
          path: { id: 7 },
          stomachCapacity: 15,
          liverCapacity: 15,
          spleenCapacity: 15,
        },
      ],
    ],
    [
      Path,
      [
        {
          id: 7,
          name: "Trendy",
          enumName: "TRENDY",
          image: "trendy.gif",
          isAvatar: false,
          article: "",
          pointsPreference: "",
          maximumPoints: 0,
          bucket: false,
          stomachCapacity: 15,
          liverCapacity: 15,
          spleenCapacity: 15,
        },
      ],
    ],
    [
      Skill,
      [
        {
          id: 10,
          name: "Lunge Smack",
          image: "skill.gif",
          mpCost: 1,
          duration: 0,
          guildLevel: 1,
          maxLevel: 0,
          permable: true,
          ambiguous: false,
        },
      ],
    ],
    [
      Familiar,
      [
        {
          id: 2,
          name: "Mosquito",
          image: "mosquito.gif",
          equipment: { id: 200 },
          larva: { id: 201 },
          cageMatch: 0,
          scavengerHunt: 0,
          hideAndSeek: 0,
          obstacleCourse: 0,
          attributes: ["combat"],
        },
      ],
    ],
  ]);

  const find = vi.fn(async (entity: unknown) => rows.get(entity) ?? []);
  const client = { query: { find } } as unknown as Client;

  const data = await kolmafiaMockLegacyDataFromClient(client);

  expect(data.allItems.nodes[0]).toMatchObject({
    id: 1,
    name: "seal tooth",
    descid: "123",
    consumableById: { id: 1, quality: "none" },
  });
  expect(data.allClasses.nodes[0].path).toBe(7);
  expect(data.allPaths.nodes[0].name).toBe("Trendy");
  expect(data.allSkills.nodes[0].name).toBe("Lunge Smack");
  expect(data.allFamiliars.nodes[0]).toMatchObject({
    equipment: 200,
    larva: 201,
    attributes: ["combat"],
  });
  expect(find).toHaveBeenCalledTimes(5);
});
