import { createClient } from "@supabase/supabase-js";

const factoringUrl = "https://wzxrhkjyxpphrclravfz.supabase.co";
const factoringKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo";

const supabase = createClient(factoringUrl, factoringKey);

async function probe() {
  const { data, error } = await supabase.from("clients").select("*").limit(5);
  if (error) {
    console.log("Error reading clients:", error.message);
  } else {
    console.log("Clients sample data:", data);
  }
}

probe();
