export type TipoGrupo = 'entrada' | 'saida' | 'retirada'
export type TipoFornecedor = 'fornecedor' | 'prestador' | 'cliente'
export type TipoEtiqueta = 'cac' | 'cortesia' | 'geral'
export type StatusLancamento = 'pago' | 'pendente'

export interface Grupo {
  id: string
  nome: string
  tipo: TipoGrupo
  ordem: number
  ativo: boolean
}

export interface Categoria {
  id: string
  grupo_id: string
  nome: string
  ordem: number
  ativo: boolean
}

export interface Fornecedor {
  id: string
  nome: string
  funcao: string | null
  tipo: TipoFornecedor
  observacao: string | null
  ativo: boolean
}

export interface Etiqueta {
  id: string
  nome: string
  tipo: TipoEtiqueta
  cor: string
  ativo: boolean
}

export interface Cadastros {
  grupos: Grupo[]
  categorias: Categoria[]
  fornecedores: Fornecedor[]
  etiquetas: Etiqueta[]
}

/** Lançamento como vem do banco. */
export interface LancamentoRow {
  id: string
  data: string // yyyy-mm-dd
  categoria_id: string
  fornecedor_id: string | null
  descricao: string | null
  valor: number
  observacao: string | null
  status: StatusLancamento // pendente = a pagar / a receber (data = vencimento)
  etiquetas: string[] // ids
}

/** Lançamento já ligado aos cadastros, pronto para relatórios. */
export interface Lancamento extends LancamentoRow {
  mes: number // 0..11
  tipo: TipoGrupo
  grupo: Grupo
  categoria: Categoria
  fornecedor: Fornecedor | null
  etiquetasObj: Etiqueta[]
}

export interface LancamentoInput {
  id: string | null
  data: string
  categoria_id: string
  fornecedor_id: string | null
  descricao: string
  valor: number
  observacao: string
  status: StatusLancamento
  etiquetas: string[]
}

export interface Importacao {
  lote: string
  quantidade: number
  total: number
  data_inicio: string
  data_fim: string
  importado_em: string
}

/** Item já resolvido (ids) pronto para importar_lancamentos. */
export interface ItemImportacao {
  data: string
  categoria_id: string
  fornecedor_id: string | null
  descricao: string
  valor: number
  observacao: string
  status: StatusLancamento
  etiquetas: string[]
}
