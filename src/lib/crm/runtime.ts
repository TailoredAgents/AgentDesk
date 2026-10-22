import { getDatabase } from "../db";
import { loftyConfiguration } from "./config";
import { LoftyProvider } from "./lofty";
import { CrmService } from "./service";
export async function crmService() {
  const { db } = await getDatabase();
  return new CrmService(
    db,
    new LoftyProvider({
      clientId: process.env.LOFTY_CLIENT_ID || "",
      clientSecret: process.env.LOFTY_CLIENT_SECRET || "",
      callbackUrl: loftyConfiguration().callbackUrl,
    }),
  );
}
