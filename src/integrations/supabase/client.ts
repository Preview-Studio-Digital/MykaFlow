import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://jjypxgsfqbpoiwhjaovo.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqeXB4Z3NmcWJwb2l3aGphb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDM5NTAsImV4cCI6MjA5MzkxOTk1MH0.nGTeFuZ6F6imqiQjUuv4hDw4uk4Dq1seFNHO20KTpaU";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
