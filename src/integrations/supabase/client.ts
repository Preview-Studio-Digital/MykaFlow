import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// DIAGNÓSTICO: Chaves fixas para garantir o funcionamento imediato sem depender de .env
const supabaseUrl = "https://hdiovmutawqpqhqiwbns.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkaW92bXV0YXdxcHFocWl3Ym5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTgxNzEsImV4cCI6MjA5Mzk5NDE3MX0.hlaO0HNaeO7wOqA0BpFiGgvKAK9mvq68-YIDFRP2Qtc";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
