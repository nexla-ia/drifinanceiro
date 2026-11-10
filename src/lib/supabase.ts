import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local')
}

export const supabase = createClient(url, key)

/** Traduz erros comuns do Postgres para mensagens legíveis. */
export function mensagemErro(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  if (!err) return 'Erro desconhecido'
  if (err.code === '23503') return 'Este item está em uso em lançamentos. Desative-o em vez de excluir.'
  if (err.code === '23505') return 'Já existe um item com esse nome.'
  if (err.code === '42501') return 'Sem permissão. Verifique se seu e-mail está liberado em "membros".'
  return err.message ?? String(e)
}
