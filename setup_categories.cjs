const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Carregar variaveis do .env
const envText = fs.readFileSync('.env', 'utf8');
const getVal = (key) => {
  const match = envText.match(new RegExp(key + '="(.*?)"'));
  return match ? match[1] : null;
};

const url = getVal('VITE_SUPABASE_URL');
const key = getVal('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!url || !key) {
  console.error('Erro: Credenciais nao encontradas no .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('--- DIAGNOSTICO DE TABELAS ---');
  
  // Tentar ler perfis
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, email').limit(1);
  if (pErr) {
    console.error('ERRO: A tabela PROFILES nao existe ou esta inacessivel:', pErr.message);
  } else {
    console.log('Sucesso: Tabela PROFILES encontrada.');
  }

  // Tentar ler categorias
  const { data: cats, error: cErr } = await supabase.from('categories').select('id').limit(1);
  if (cErr) {
    console.error('ERRO: A tabela CATEGORIES nao existe. Voce precisa rodar o SQL no Supabase:', cErr.message);
    return;
  }
  console.log('Sucesso: Tabela CATEGORIES encontrada.');

  if (!profiles || profiles.length === 0) {
    console.error('AVISO: Nenhum usuario cadastrado no banco ainda.');
    return;
  }

  const userId = profiles[0].id;
  console.log('Usando Usuario ID:', userId);

  const newCats = [
    { name: 'MANUTENÇÕES', type: 'income', user_id: userId },
    { name: 'EMPRÉSTIMOS', type: 'income', user_id: userId }
  ];

  for (const cat of newCats) {
    const { error } = await supabase.from('categories').insert(cat);
    if (error) {
      console.error('Erro ao criar ' + cat.name + ':', error.message);
    } else {
      console.log('SUCESSO: Categoria ' + cat.name + ' criada!');
    }
  }
}

run();
