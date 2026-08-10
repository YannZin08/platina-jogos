import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copie .env.example para .env e preencha.',
  )
}

// Sem o generic Database: os tipos de tabela em lib/types.ts são usados
// manualmente em cada chamada, em vez de depender da inferência de joins
// do supabase-js (que exige metadados de Relationships gerados via CLI).
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
