import { createClient } from "@supabase/supabase-js";

const factoringUrl = "https://wzxrhkjyxpphrclravfz.supabase.co";
const factoringKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo";

const supabase = createClient(factoringUrl, factoringKey);

async function probe() {
  const { data, error } = await supabase.from("invoices").select("*").limit(1);
  if (error) {
    console.log("Error reading invoices:", error.message);
  } else if (data && data.length > 0) {
    console.log("Columns in 'invoices':", Object.keys(data[0]));
    console.log("Sample row:", data[0]);
  } else {
    console.log("Invoices table is empty or RLS is blocking it.");
  }
}

probe();
