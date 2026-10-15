import { createClient } from "@supabase/supabase-js";
import { resilientFetch } from "./dbFetch.js";

/** Client « service_role » du projet Supabase de CE module (jamais exposé au navigateur). */
export const db = createClient(
  process.env.DATA_SUPABASE_URL,
  process.env.DATA_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: resilientFetch() } },
);
