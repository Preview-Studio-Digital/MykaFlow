import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://rbrqcncojnzmvebtznaf.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicnFjbmNvam56bXZlYnR6bmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5Nzg2MTYsImV4cCI6MjA5MzkxOTk1MH0.AJArYP7yHBiNu8GgxZYl4Bcga378drJMK75i32zvQAs";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
