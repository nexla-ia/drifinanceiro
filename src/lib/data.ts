import { supabase } from './supabase'
import type { Cadastros, Importacao, ItemImportacao, LancamentoInput, LancamentoRow } from './types'

export async function carregarCadastros(): Promise<Cadastros> {
  const [g, c, f, e] = await Promise.all([
    supabase.from('grupos').select('*').order('ordem').order('nome'),
    supabase.from('categorias').select('*').order('ordem').order('nome'),
    supabase.from('fornecedores').select('*').order('nome').order('funcao'),
    supabase.from('etiquetas').select('*').order('tipo').order('nome'),
  ])
  for (const r of [g, c, f, e]) if (r.error) throw r.error
  return {
    grupos: g.data ?? [],
    categorias: c.data ?? [],
    fornecedores: f.data ?? [],
    etiquetas: e.data ?? [],
  }
}

interface LinhaBanco extends Omit<LancamentoRow, 'etiquetas' | 'valor'> {
  valor: number | string
  lancamento_etiquetas: { etiqueta_id: string }[]
}

const CAMPOS_LANCAMENTO =
  'id, data, categoria_id, fornecedor_id, descricao, valor, observacao, status, lancamento_etiquetas(etiqueta_id)'

function converter(linhas: LinhaBanco[]): LancamentoRow[] {
  return linhas.map(({ lancamento_etiquetas, valor, ...resto }) => ({
    ...resto,
    valor: Number(valor),
    etiquetas: lancamento_etiquetas.map((x) => x.etiqueta_id),
  }))
}

/** Busca todos os lançamentos do ano, paginando (o Supabase devolve no máx. 1000 por vez). */
export async function carregarLancamentosAno(ano: number): Promise<LancamentoRow[]> {
  const passo = 1000
  const todos: LancamentoRow[] = []
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase
      .from('lancamentos')
      .select(CAMPOS_LANCAMENTO)
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
      .order('id')
      .range(de, de + passo - 1)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaBanco[]
    todos.push(...converter(linhas))
    if (linhas.length < passo) break
  }
  return todos
}

/** Todas as contas pendentes (a pagar / a receber), de qualquer ano. */
export async function carregarPendentes(): Promise<LancamentoRow[]> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select(CAMPOS_LANCAMENTO)
    .eq('status', 'pendente')
    .order('data')
    .limit(2000)
  if (error) throw error
  return converter((data ?? []) as unknown as LinhaBanco[])
}

export async function salvarLancamento(l: LancamentoInput): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_lancamento', {
    p_id: l.id,
    p_data: l.data,
    p_categoria_id: l.categoria_id,
    p_fornecedor_id: l.fornecedor_id,
    p_descricao: l.descricao,
    p_valor: l.valor,
    p_observacao: l.observacao,
    p_etiquetas: l.etiquetas,
    p_status: l.status,
  })
  if (error) throw error
  return data as string
}

export async function excluirLancamento(id: string): Promise<void> {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id)
  if (error) throw error
}

type Tabela = 'grupos' | 'categorias' | 'fornecedores' | 'etiquetas'

export async function salvarCadastro(tabela: Tabela, valores: Record<string, unknown>, id?: string) {
  const q = id
    ? supabase.from(tabela).update(valores).eq('id', id)
    : supabase.from(tabela).insert(valores)
  const { error } = await q
  if (error) throw error
}

export async function criarFornecedor(valores: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.from('fornecedores').insert(valores).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function excluirCadastro(tabela: Tabela, id: string) {
  const { error } = await supabase.from(tabela).delete().eq('id', id)
  if (error) throw error
}

export async function baixarLancamento(id: string, data: string) {
  const { error } = await supabase.rpc('baixar_lancamento', { p_id: id, p_data: data })
  if (error) throw error
}

/* Novos clientes por mês (CAC por cliente) */
export async function carregarClientesNovos(ano: number): Promise<number[]> {
  const { data, error } = await supabase.from('clientes_novos').select('mes, quantidade').eq('ano', ano)
  if (error) throw error
  const v = Array(12).fill(0) as number[]
  for (const r of data ?? []) v[r.mes - 1] = r.quantidade
  return v
}

export async function salvarClientesNovos(ano: number, mes: number, quantidade: number) {
  const { error } = await supabase.from('clientes_novos').upsert({ ano, mes: mes + 1, quantidade })
  if (error) throw error
}

/* Importação */
export async function criarFornecedores(itens: { nome: string; funcao: string | null; tipo: string }[]) {
  if (!itens.length) return [] as { id: string; nome: string; funcao: string | null }[]
  const { data, error } = await supabase.from('fornecedores').insert(itens).select('id, nome, funcao')
  if (error) throw error
  return data as { id: string; nome: string; funcao: string | null }[]
}

export async function importarLancamentos(itens: ItemImportacao[]): Promise<string> {
  const { data, error } = await supabase.rpc('importar_lancamentos', { p_itens: itens })
  if (error) throw error
  return data as string
}

export async function listarImportacoes(): Promise<Importacao[]> {
  const { data, error } = await supabase.rpc('listar_importacoes')
  if (error) throw error
  return ((data ?? []) as Importacao[]).map((i) => ({ ...i, quantidade: Number(i.quantidade), total: Number(i.total) }))
}

export async function desfazerImportacao(lote: string) {
  const { error } = await supabase.from('lancamentos').delete().eq('lote_importacao', lote)
  if (error) throw error
}
