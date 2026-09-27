import { createKolmafiaMockLegacyData } from "data-of-loathing/legacy-mock";

const sqlitePath = process.env.KOLMAFIA_MOCK_DOL_SQLITE;
const legacy = await createKolmafiaMockLegacyData(
  sqlitePath ? { strategy: "local", path: sqlitePath } : {},
);

export const client = legacy.client;
export const data = legacy.data;
