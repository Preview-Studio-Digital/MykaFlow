import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jjypxgsfqbpoiwhjaovo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqeXB4Z3NmcWJwb2l3aGphb3ZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDM5NTAsImV4cCI6MjA5MzkxOTk1MH0.nGTeFuZ6F6imqiQjUuv4hDw4uk4Dq1seFNHO20KTpaU";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from("transactions").select("id").limit(10);
  console.log("Error:", error);
  console.log("Data:", data);
}

check();
