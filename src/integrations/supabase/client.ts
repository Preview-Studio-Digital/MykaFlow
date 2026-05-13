import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// No Lovable Cloud, estas variáveis são injetadas automaticamente.
// Usamos import.meta.env para garantir compatibilidade com o Vite.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
