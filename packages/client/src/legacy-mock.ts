import {
  AscensionClass,
  Familiar,
  Item,
  Path,
  Skill,
} from "./schema.js";
import { createClient, type Client, type Strategy } from "./node.js";

export interface LegacyConsumable {
  nodeId: string;
  __typename: "Consumable";
  id: number;
  stomach: number;
  liver: number;
  spleen: number;
  quality: string;
  levelRequirement: number;
  adventureRange: string;
  adventures: number;
  muscle: number;
  muscleRange: string;
  mysticality: number;
  mysticalityRange: string;
  moxie: number;
  moxieRange: string;
  notes: string | null;
}

export interface LegacyItem {
  id: number;
  name: string;
  plural: string;
  descid: string;
  image: string;
  quest: boolean;
  gift: boolean;
  tradeable: boolean;
  discardable: boolean;
  autosell: number;
  ambiguous: boolean;
  consumableById: LegacyConsumable | null;
}

export interface LegacyClass {
  id: number;
  name: string;
  enumName: string;
  image: string;
  primeStatIndex: number;
  stun: string;
  path: number;
  stomachCapacity: number;
  liverCapacity: number;
  spleenCapacity: number;
}

export interface LegacyPath {
  id: number;
  name: string;
  enumName: string;
  image: string;
  isAvatar: boolean;
  article: string;
  pointsPreference: string;
  maximumPoints: number;
  bucket: boolean;
  stomachCapacity: number;
  liverCapacity: number;
  spleenCapacity: number;
}

export interface LegacySkill {
  id: number;
  name: string;
  image: string;
  mpCost: number;
  duration: number;
  guildLevel: number;
  maxLevel: number;
  permable: boolean;
  ambiguous: boolean;
}

export interface LegacyFamiliar {
  id: number;
  name: string;
  image: string;
  equipment: number;
  larva: number;
  cageMatch: number;
  scavengerHunt: number;
  hideAndSeek: number;
  obstacleCourse: number;
  attributes: string[];
}

export interface KolmafiaMockLegacyData {
  allItems: { nodes: LegacyItem[] };
  allClasses: { nodes: LegacyClass[] };
  allPaths: { nodes: LegacyPath[] };
  allSkills: { nodes: LegacySkill[] };
  allFamiliars: { nodes: LegacyFamiliar[] };
}

/**
 * Project the current SQLite-backed entity model into the narrow GraphQL-shaped
 * object consumed by loathers/kolmafia-mock at commit
 * 5c53bf4a5ee64d84710e7788409862bd8d2a1661.
 *
 * This is a compatibility projection only. It does not emulate the retired
 * /graphql service and it never reads live KoLmafia state.
 */
export async function kolmafiaMockLegacyDataFromClient(
  client: Client,
): Promise<KolmafiaMockLegacyData> {
  const [items, classes, paths, skills, familiars] = await Promise.all([
    client.query.find(Item, {}, {
      orderBy: { id: "ASC" },
      populate: ["consumable"],
    }),
    client.query.find(AscensionClass, {}, {
      orderBy: { id: "ASC" },
      populate: ["path"],
    }),
    client.query.find(Path, {}, { orderBy: { id: "ASC" } }),
    client.query.find(Skill, {}, { orderBy: { id: "ASC" } }),
    client.query.find(Familiar, {}, {
      orderBy: { id: "ASC" },
      populate: ["larva", "equipment"],
    }),
  ]);

  return {
    allItems: {
      nodes: items.map((item) => ({
        id: item.id,
        name: item.name,
        plural: item.plural ?? "",
        descid: item.descid === undefined ? "" : String(item.descid),
        image: item.image,
        quest: item.quest,
        gift: item.gift,
        tradeable: item.tradeable,
        discardable: item.discardable,
        autosell: item.autosell,
        ambiguous: item.ambiguous,
        consumableById: item.consumable
          ? {
              nodeId: `Consumable:${item.id}`,
              __typename: "Consumable",
              id: item.id,
              stomach: item.consumable.stomach,
              liver: item.consumable.liver,
              spleen: item.consumable.spleen,
              quality: item.consumable.quality ?? "",
              levelRequirement: item.consumable.levelRequirement,
              adventureRange: item.consumable.adventureRange,
              adventures: item.consumable.adventures,
              muscle: item.consumable.muscle,
              muscleRange: item.consumable.muscleRange,
              mysticality: item.consumable.mysticality,
              mysticalityRange: item.consumable.mysticalityRange,
              moxie: item.consumable.moxie,
              moxieRange: item.consumable.moxieRange,
              notes: item.consumable.notes ?? null,
            }
          : null,
      })),
    },
    allClasses: {
      nodes: classes.map((clazz) => ({
        id: clazz.id,
        name: clazz.name,
        enumName: clazz.enumName,
        image: clazz.image ?? "",
        primeStatIndex: clazz.primeStatIndex,
        stun: clazz.stun ?? "",
        path: clazz.path?.id ?? 0,
        stomachCapacity: clazz.stomachCapacity ?? 0,
        liverCapacity: clazz.liverCapacity ?? 0,
        spleenCapacity: clazz.spleenCapacity ?? 0,
      })),
    },
    allPaths: {
      nodes: paths.map((path) => ({
        id: path.id,
        name: path.name,
        enumName: path.enumName,
        image: path.image ?? "",
        isAvatar: path.isAvatar,
        article: path.article ?? "",
        pointsPreference: path.pointsPreference ?? "",
        maximumPoints: path.maximumPoints,
        bucket: path.bucket,
        stomachCapacity: path.stomachCapacity,
        liverCapacity: path.liverCapacity,
        spleenCapacity: path.spleenCapacity,
      })),
    },
    allSkills: {
      nodes: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        image: skill.image,
        mpCost: skill.mpCost,
        duration: skill.duration,
        guildLevel: skill.guildLevel ?? 0,
        maxLevel: skill.maxLevel ?? 0,
        permable: skill.permable,
        ambiguous: skill.ambiguous,
      })),
    },
    allFamiliars: {
      nodes: familiars.map((familiar) => ({
        id: familiar.id,
        name: familiar.name,
        image: familiar.image,
        equipment: familiar.equipment?.id ?? 0,
        larva: familiar.larva?.id ?? 0,
        cageMatch: familiar.cageMatch,
        scavengerHunt: familiar.scavengerHunt,
        hideAndSeek: familiar.hideAndSeek,
        obstacleCourse: familiar.obstacleCourse,
        attributes: familiar.attributes,
      })),
    },
  };
}

export async function createKolmafiaMockLegacyData(
  strategy: Strategy = {},
): Promise<{ client: Client; data: KolmafiaMockLegacyData }> {
  const client = createClient(strategy);
  await client.load();
  return {
    client,
    data: await kolmafiaMockLegacyDataFromClient(client),
  };
}
