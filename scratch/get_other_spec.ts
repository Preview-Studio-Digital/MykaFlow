const factoringUrl = "https://wzxrhkjyxpphrclravfz.supabase.co/rest/v1/";
const factoringKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo";

async function getSpec() {
  try {
    const res = await fetch(factoringUrl, {
      headers: {
        "apikey": factoringKey
      }
    });
    const text = await res.text();
    console.log("Response text:", text.substring(0, 500));
    const data = JSON.parse(text);
    if (data.paths) {
      console.log("Tables found in the other project:");
      const paths = Object.keys(data.paths);
      paths.forEach(p => {
        if (p !== "/" && !p.includes("rpc/")) {
          console.log(`- ${p.replace("/", "")}`);
        }
      });
    } else {
      console.log("No paths found in spec.");
    }
  } catch (err) {
    console.error("Error fetching spec:", err);
  }
}

getSpec();
