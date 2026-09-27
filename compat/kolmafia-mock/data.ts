import { createKolmafiaMockLegacyData } from "data-of-loathing/legacy-mock";

const legacy = await createKolmafiaMockLegacyData();

export const client = legacy.client;
export const data = legacy.data;
