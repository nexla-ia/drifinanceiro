import { hojeISO, normalizar, parseValor } from './format'
import type { Cadastros, Categoria, Fornecedor, Grupo, StatusLancamento, TipoGrupo } from './types'

/* ------------------------------------------------------------------ */
/* Leitura do arquivo                                                 */
/* ------------------------------------------------------------------ */

/** Lê o arquivo como UTF-8; se não for, cai para Windows-1252 (CSV salvo pelo Excel). */
export async function lerTexto(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** CSV com aspas, detectando o separador (; , ou tab) pela primeira linha. */
export function parseCSV(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const contar = (c: string) => primeira.split(c).length
  const sep = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0]

  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else aspas = false
      } else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  if (campo || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas.filter((l) => l.some((c) => c.trim()))
}

/* ------------------------------------------------------------------ */
/* Colunas                                                            */
/* ------------------------------------------------------------------ */

type Coluna = 'data' | 'tipo' | 'status' | 'grupo' | 'categoria' | 'centro' | 'fornecedor' | 'funcao' | 'descricao' | 'valor' | 'etiquetas' | 'observacao'

const ALIASES: Record<string, Coluna> = {
  data: 'data', datapagamento: 'data', datadopagamento: 'data', datarecebimento: 'data', vencimento: 'data', dt: 'data', datadevencimento: 'data',
  tipo: 'tipo', natureza: 'tipo', entradasaida: 'tipo',
  status: 'status', situacao: 'status',
  grupo: 'grupo',
  categoria: 'categoria', subcategoria: 'categoria',
  centrodecusto: 'centro', centrocusto: 'centro',
  fornecedor: 'fornecedor', fornecedorcliente: 'fornecedor', cliente: 'fornecedor', prestador: 'fornecedor', favorecido: 'fornecedor', clientefornecedor: 'fornecedor',
  funcao: 'funcao', cargo: 'funcao',
  descricao: 'descricao', historico: 'descricao', finalidade: 'descricao', descricaofinalidade: 'descricao',
  valor: 'valor', valorr: 'valor', valorrs: 'valor', total: 'valor',
  etiquetas: 'etiquetas', etiqueta: 'etiquetas', tags: 'etiquetas', marcadores: 'etiquetas',
  observacao: 'observacao', observacoes: 'observacao', obs: 'observacao',
}

const chave = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '')

export function mapearColunas(cabecalho: string[]): { mapa: Partial<Record<Coluna, number>>; ignoradas: string[] } {
  const mapa: Partial<Record<Coluna, number>> = {}
  const ignoradas: string[] = []
  cabecalho.forEach((h, i) => {
    const col = ALIASES[chave(h)]
    if (col && mapa[col] === undefined) mapa[col] = i
    else if (h.trim()) ignoradas.push(h.trim())
  })
  // Formato Acountech: Categoria → Centro de custo  ==  Grupo → Categoria
  if (mapa.centro !== undefined && mapa.grupo === undefined) {
    if (mapa.categoria !== undefined) mapa.grupo = mapa.categoria
    mapa.categoria = mapa.centro
  }
  return { mapa, ignoradas }
}

/* ------------------------------------------------------------------ */
/* Valores                                                            */
/* ------------------------------------------------------------------ */

export function parseDataBR(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const p = (n: number) => String(n).padStart(2, '0')
  const valida = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${p(m)}-${p(d)}` : null
  }
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) {
    const ano = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return valida(ano, +m[2], +m[1])
  }
  // mm/aaaa (relatório mensal) → dia 1
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (m) return valida(+m[2], +m[1], 1)
  // Número de série do Excel
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000)
    return valida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  return null
}

function parseTipo(s: string): TipoGrupo | null {
  const t = chave(s)
  if (!t) return null
  if (/^(entrada|recebimento|receita|credito|recebido)/.test(t)) return 'entrada'
  if (/^(retirada|antecipacao|distribuicao)/.test(t)) return 'retirada'
  if (/^(saida|pagamento|despesa|debito|pago)/.test(t)) return 'saida'
  return null
}

function parseStatus(s: string): StatusLancamento | null {
  const t = chave(s)
  if (!t) return null
  if (/^(pendente|apagar|areceber|previsto|aberto|emaberto|vencido)/.test(t)) return 'pendente'
  if (/^(pago|recebido|realizado|quitado|baixado|liquidado)/.test(t)) return 'pago'
  return null
}

/* ------------------------------------------------------------------ */
/* Resolução contra os cadastros                                      */
/* ------------------------------------------------------------------ */

export interface FornecedorNovo {
  chave: string
  nome: string
  funcao: string | null
  tipo: 'cliente' | 'fornecedor'
}

export interface LinhaImportacao {
  numero: number // linha no arquivo (1 = cabeçalho)
  data: string | null
  tipo: TipoGrupo | null
  grupo: Grupo | null
  categoria: Categoria | null
  fornecedor: Fornecedor | null
  fornecedorNovo: FornecedorNovo | null
  descricao: string
  valor: number | null
  status: StatusLancamento
  etiquetas: string[]
  observacao: string
  erros: string[]
  avisos: string[]
}

export const chaveFornecedor = (nome: string, funcao: string | null) => `${normalizar(nome.trim())}|${normalizar((funcao ?? '').trim())}`

export function resolverLinhas(linhas: string[][], cad: Cadastros): { resultado: LinhaImportacao[]; faltando: string[]; ignoradas: string[] } {
  const [cab, ...corpo] = linhas
  const { mapa, ignoradas } = mapearColunas(cab ?? [])
  const faltando = (['data', 'categoria', 'valor'] as const).filter((c) => mapa[c] === undefined)
  if (faltando.length) return { resultado: [], faltando: [...faltando], ignoradas }

  const n = normalizar
  const gruposPorNome = new Map<string, Grupo[]>()
  for (const g of cad.grupos) gruposPorNome.set(n(g.nome), [...(gruposPorNome.get(n(g.nome)) ?? []), g])
  const grupoDe = new Map(cad.grupos.map((g) => [g.id, g]))
  const etiquetaPorNome = new Map(cad.etiquetas.map((e) => [n(e.nome), e]))
  const hoje = hojeISO()

  const resultado = corpo.map((cols, i): LinhaImportacao => {
    const v = (c: Coluna) => (mapa[c] !== undefined ? (cols[mapa[c]!] ?? '').trim() : '')
    const erros: string[] = []
    const avisos: string[] = []

    const data = parseDataBR(v('data'))
    if (!data) erros.push(v('data') ? `Data inválida: “${v('data')}”` : 'Sem data')

    const valorBruto = parseValor(v('valor').replace(/[()]/g, ''))
    const valor = valorBruto === null ? null : Math.abs(valorBruto)
    if (!valor) erros.push(v('valor') ? `Valor inválido: “${v('valor')}”` : 'Sem valor')

    let tipo = parseTipo(v('tipo'))
    if (v('tipo') && !tipo) avisos.push(`Tipo “${v('tipo')}” não reconhecido; usei o da categoria`)

    // Grupo → Categoria
    let candidatosGrupo: Grupo[] | null = null
    if (v('grupo')) {
      candidatosGrupo = (gruposPorNome.get(n(v('grupo'))) ?? []).filter((g) => !tipo || g.tipo === tipo)
      if (!candidatosGrupo.length) erros.push(`Grupo “${v('grupo')}” não existe`)
    }
    let categoria: Categoria | null = null
    const nomeCat = v('categoria')
    if (!nomeCat) erros.push('Sem categoria')
    else if (!candidatosGrupo || candidatosGrupo.length) {
      const ids = candidatosGrupo ? new Set(candidatosGrupo.map((g) => g.id)) : null
      const achadas = cad.categorias.filter(
        (c) => n(c.nome) === n(nomeCat) && (ids ? ids.has(c.grupo_id) : !tipo || grupoDe.get(c.grupo_id)?.tipo === tipo),
      )
      if (achadas.length === 1) categoria = achadas[0]
      else if (!achadas.length) erros.push(`Categoria “${nomeCat}” não encontrada${v('grupo') ? ` em “${v('grupo')}”` : ''}`)
      else erros.push(`“${nomeCat}” existe em ${achadas.map((c) => grupoDe.get(c.grupo_id)?.nome).join(' e ')}: preencha a coluna Grupo`)
    }
    const grupo = categoria ? grupoDe.get(categoria.grupo_id) ?? null : null
    if (grupo) {
      if (tipo && tipo !== grupo.tipo) avisos.push(`Tipo ajustado para o da categoria (${grupo.tipo})`)
      tipo = grupo.tipo
    }

    // Fornecedor
    let fornecedor: Fornecedor | null = null
    let fornecedorNovo: FornecedorNovo | null = null
    const nomeF = v('fornecedor')
    const funcaoF = v('funcao') || null
    if (nomeF) {
      const mesmoNome = cad.fornecedores.filter((f) => n(f.nome) === n(nomeF))
      const exatos = funcaoF ? mesmoNome.filter((f) => n(f.funcao ?? '') === n(funcaoF)) : mesmoNome
      if (exatos.length === 1) fornecedor = exatos[0]
      else if (exatos.length > 1)
        erros.push(`Há ${exatos.length} cadastros “${nomeF}” (${exatos.map((f) => f.funcao ?? 'sem função').join(', ')}): preencha a coluna Função`)
      else
        fornecedorNovo = {
          chave: chaveFornecedor(nomeF, funcaoF),
          nome: nomeF,
          funcao: funcaoF,
          tipo: tipo === 'entrada' ? 'cliente' : 'fornecedor',
        }
    }

    // Etiquetas
    const etiquetas: string[] = []
    for (const nome of v('etiquetas').split(/[,|]/).map((x) => x.trim()).filter(Boolean)) {
      const e = etiquetaPorNome.get(n(nome))
      if (e) etiquetas.push(e.id)
      else avisos.push(`Etiqueta “${nome}” não existe e foi ignorada`)
    }

    let status = parseStatus(v('status'))
    if (v('status') && !status) avisos.push(`Situação “${v('status')}” não reconhecida; considerei pago`)
    status ??= data && data > hoje ? 'pendente' : 'pago'

    return {
      numero: i + 2,
      data,
      tipo,
      grupo,
      categoria,
      fornecedor,
      fornecedorNovo,
      descricao: v('descricao'),
      valor,
      status,
      etiquetas: tipo === 'retirada' ? [] : etiquetas,
      observacao: v('observacao'),
      erros,
      avisos,
    }
  })

  return { resultado, faltando: [], ignoradas }
}

export const MODELO_CSV = [
  'Data;Situação;Tipo;Grupo;Categoria;Fornecedor/Cliente;Função;Descrição;Valor;Etiquetas;Observação',
  '05/01/2026;Pago;Pagamento;Despesas de Vendas e Marketing;Tráfego Pago;Rafael;Gestor de Tráfego;Meta Ads janeiro;2.500,00;CAC;',
  '10/01/2026;Recebido;Recebimento;Receitas de Serviços;Marketing Digital;Clínica Exemplo;;Mensalidade janeiro;8.000,00;;',
  '15/01/2026;Pago;Pagamento;Despesas Administrativas;Despesas com Cortesias;;;Kit Dia do Médico;640,00;Dia do Médico;Vinhos e embalagens',
  '10/02/2026;A pagar;Pagamento;Despesas Administrativas;Honorários Contábeis;Acountech;BPO Financeiro;BPO fevereiro;1.800,00;;',
].join('\r\n')
