import { supabase } from "../src/integrations/supabase/client";

async function checkLastTransactions() {
  const { data, error } = await supabase
    .from("transactions")
    .select("description, category, subcategory_id_v2, amount")
    .eq("category", "ANTECIPAÇÃO DE NOTAS")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Last 5 Factoring Transactions:", data);
    
    if (data && data.length > 0 && data[0].subcategory_id_v2) {
      const { data: sub } = await supabase
        .from("financial_subcategories")
        .select("name")
        .eq("id", data[0].subcategory_id_v2)
        .single();
      console.log("Subcategory Name for the last one:", sub?.name);
    }
  }
}

checkLastTransactions();
