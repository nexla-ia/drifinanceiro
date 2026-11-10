import { useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useAviso, useDados } from '../context'
import { excluirCadastro, salvarCadastro } from '../lib/data'
import { TIPO_ETIQUETA, TIPO_FORNECEDOR, TIPO_GRUPO, normalizar } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import type { TipoGrupo } from '../lib/types'
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Campo, Modal } from '../components/ui'

type Tabela = 'grupos' | 'categorias' | 'fornecedores' | 'etiquetas'

interface CampoDef {
  nome: string
  rotulo: string
  tipo?: 'texto' | 'numero' | 'cor' | 'opcoes'
  opcoes?: { valor: string; rotulo: string }[]
  obrigatorio?: boolean
}

interface Edicao {
  tabela: Tabela
  titulo: string
  id?: string
  campos: CampoDef[]
  valores: Record<string, string>
  fixos?: Record<string, unknown>
}

const opcoes = (r: Record<string, string>) => Object.entries(r).map(([valor, rotulo]) => ({ valor, rotulo }))

/* Editor genérico para os quatro cadastros */
function Editor({ edicao, onFechar }: { edicao: Edicao | null; onFechar: () => void }) {
  const { recarregarCadastros, recarregar } = useDados()
  const avisar = useAviso()
  const [valores, setValores] = useState<Record<string, string>>({})
  const [aberto, setAberto] = useState<Edicao | null>(null)
  const [salvando, setSalvando] = useState(false)

  if (edicao !== aberto) {
    setAberto(edicao)
    setValores(edicao?.valores ?? {})
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!edicao) return
    const dados: Record<string, unknown> = { ...edicao.fixos }
    for (const c of edicao.campos) {
      const v = (valores[c.nome] ?? '').trim()
      dados[c.nome] = c.tipo === 'numero' ? Number(v) || 0 : v || null
    }
    setSalvando(true)
    try {
      await salvarCadastro(edicao.tabela, dados, edicao.id)
      await Promise.all([recarregarCadastros(), recarregar()])
      avisar('Salvo.')
      onFechar()
    } catch (err) {
      avisar(mensagemErro(err), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={edicao?.titulo ?? ''}
      aberto={!!edicao}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" type="submit" form="form-cadastro" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-cadastro" onSubmit={enviar} className="space-y-4">
        {edicao?.campos.map((c, i) => (
          <Campo key={c.nome} rotulo={c.rotulo}>
            {c.tipo === 'opcoes' ? (
              <select
                className="campo"
                value={valores[c.nome] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
                required={c.obrigatorio}
              >
                {c.opcoes!.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={c.tipo === 'cor' ? 'h-10 w-20 cursor-pointer rounded-lg border border-linha-forte bg-folha p-1' : 'campo'}
                type={c.tipo === 'cor' ? 'color' : c.tipo === 'numero' ? 'number' : 'text'}
                value={valores[c.nome] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
                required={c.obrigatorio}
                autoFocus={i === 0}
              />
            )}
          </Campo>
        ))}
      </form>
    </Modal>
  )
}

function useAcoes() {
  const { recarregarCadastros, recarregar } = useDados()
  const avisar = useAviso()
  const alternarAtivo = async (tabela: Tabela, id: string, ativo: boolean) => {
    try {
      await salvarCadastro(tabela, { ativo: !ativo }, id)
      await recarregarCadastros()
      avisar(ativo ? 'Desativado: não aparece mais em novos lançamentos.' : 'Reativado.')
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }
  const excluir = async (tabela: Tabela, id: string, nome: string) => {
    if (!window.confirm(`Excluir “${nome}”?`)) return
    try {
      await excluirCadastro(tabela, id)
      await Promise.all([recarregarCadastros(), recarregar()])
      avisar('Excluído.')
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }
  return { alternarAtivo, excluir }
}

function AcoesLinha({ ativo, onEditar, onAlternar, onExcluir }: { ativo: boolean; onEditar: () => void; onAlternar: () => void; onExcluir: () => void }) {
  return (
    <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100">
      <BotaoIcone rotulo="Editar" onClick={onEditar}>
        <Pencil size={14} />
      </BotaoIcone>
      <BotaoIcone rotulo={ativo ? 'Desativar' : 'Reativar'} onClick={onAlternar}>
        {ativo ? <Eye size={14} /> : <EyeOff size={14} />}
      </BotaoIcone>
      <BotaoIcone rotulo="Excluir" className="hover:!text-negativo" onClick={onExcluir}>
        <Trash2 size={14} />
      </BotaoIcone>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AbaPlano({ editar }: { editar: (e: Edicao) => void }) {
  const { cadastros, lancamentos } = useDados()
  const { alternarAtivo, excluir } = useAcoes()
  const usoNoAno = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lancamentos) m.set(l.categoria_id, (m.get(l.categoria_id) ?? 0) + 1)
    return m
  }, [lancamentos])

  const camposGrupo: CampoDef[] = [
    { nome: 'nome', rotulo: 'Nome do grupo', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: opcoes(TIPO_GRUPO), obrigatorio: true },
    { nome: 'ordem', rotulo: 'Ordem de exibição', tipo: 'numero' },
  ]
  const camposCategoria: CampoDef[] = [
    { nome: 'nome', rotulo: 'Nome da categoria', obrigatorio: true },
    { nome: 'ordem', rotulo: 'Ordem de exibição', tipo: 'numero' },
  ]

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Botao
          variante="primario"
          onClick={() => editar({ tabela: 'grupos', titulo: 'Novo grupo', campos: camposGrupo, valores: { tipo: 'saida', ordem: '50' } })}
        >
          <Plus size={16} /> Novo grupo
        </Botao>
      </div>
      {(['entrada', 'saida', 'retirada'] as TipoGrupo[]).map((tipo) => (
        <div key={tipo} className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">
            {tipo === 'entrada' ? 'Recebimentos' : tipo === 'saida' ? 'Pagamentos' : 'Retirada de lucro'}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cadastros.grupos
              .filter((g) => g.tipo === tipo)
              .map((g) => {
                const cats = cadastros.categorias.filter((c) => c.grupo_id === g.id)
                return (
                  <Cartao key={g.id} className={`overflow-hidden ${g.ativo ? '' : 'opacity-60'}`}>
                    <div className="group flex items-center justify-between gap-2 border-b border-linha bg-papel/50 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{g.nome}</div>
                        {!g.ativo && <div className="text-[11px] text-tinta-3">Inativo</div>}
                      </div>
                      <AcoesLinha
                        ativo={g.ativo}
                        onEditar={() =>
                          editar({
                            tabela: 'grupos',
                            titulo: 'Editar grupo',
                            id: g.id,
                            campos: camposGrupo,
                            valores: { nome: g.nome, tipo: g.tipo, ordem: String(g.ordem) },
                          })
                        }
                        onAlternar={() => alternarAtivo('grupos', g.id, g.ativo)}
                        onExcluir={() => excluir('grupos', g.id, g.nome)}
                      />
                    </div>
                    <ul>
                      {cats.map((c) => (
                        <li key={c.id} className={`group flex items-center justify-between gap-2 border-t border-linha px-4 py-1 first:border-t-0 ${c.ativo ? '' : 'text-tinta-3'}`}>
                          <span className="min-w-0 truncate text-sm" title={c.nome}>
                            {c.nome}
                            {!c.ativo && ' (inativa)'}
                            {usoNoAno.get(c.id) ? <span className="ml-2 text-[11px] text-tinta-3">{usoNoAno.get(c.id)} no ano</span> : null}
                          </span>
                          <AcoesLinha
                            ativo={c.ativo}
                            onEditar={() =>
                              editar({
                                tabela: 'categorias',
                                titulo: 'Editar categoria',
                                id: c.id,
                                campos: camposCategoria,
                                valores: { nome: c.nome, ordem: String(c.ordem) },
                              })
                            }
                            onAlternar={() => alternarAtivo('categorias', c.id, c.ativo)}
                            onExcluir={() => excluir('categorias', c.id, c.nome)}
                          />
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() =>
                        editar({
                          tabela: 'categorias',
                          titulo: `Nova categoria em ${g.nome}`,
                          campos: camposCategoria,
                          valores: { ordem: String(cats.length + 1) },
                          fixos: { grupo_id: g.id },
                        })
                      }
                      className="flex w-full items-center gap-1.5 border-t border-dashed border-linha-forte px-4 py-2 text-xs font-medium text-cobalto hover:bg-cobalto-claro/40"
                    >
                      <Plus size={13} /> Adicionar categoria
                    </button>
                  </Cartao>
                )
              })}
          </div>
        </div>
      ))}
    </>
  )
}

function AbaFornecedores({ editar }: { editar: (e: Edicao) => void }) {
  const { cadastros } = useDados()
  const { alternarAtivo, excluir } = useAcoes()
  const [busca, setBusca] = useState('')
  const campos: CampoDef[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'funcao', rotulo: 'Função / serviço' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: opcoes(TIPO_FORNECEDOR), obrigatorio: true },
    { nome: 'observacao', rotulo: 'Observação' },
  ]
  const termo = normalizar(busca)
  const lista = cadastros.fornecedores.filter((f) => !termo || normalizar(`${f.nome} ${f.funcao ?? ''}`).includes(termo))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3" />
          <input className="campo pl-9" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Botao variante="primario" onClick={() => editar({ tabela: 'fornecedores', titulo: 'Novo cadastro', campos, valores: { tipo: 'fornecedor' } })}>
          <Plus size={16} /> Novo fornecedor / cliente
        </Botao>
      </div>
      <Cartao className="overflow-hidden">
        <div className="rolagem overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                <th className="px-4 py-2.5 text-left font-semibold">Nome</th>
                <th className="px-3 py-2.5 text-left font-semibold">Função</th>
                <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                <th className="w-28 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id} className={`group border-t border-linha ${f.ativo ? '' : 'text-tinta-3'}`}>
                  <td className="px-4 py-2 font-medium">
                    {f.nome}
                    {!f.ativo && <span className="ml-2 text-[11px] font-normal">(inativo)</span>}
                  </td>
                  <td className="px-3 py-2 text-tinta-2">{f.funcao ?? '—'}</td>
                  <td className="px-3 py-2 text-tinta-2">{TIPO_FORNECEDOR[f.tipo]}</td>
                  <td className="px-3 py-1">
                    <div className="flex justify-end">
                      <AcoesLinha
                        ativo={f.ativo}
                        onEditar={() =>
                          editar({
                            tabela: 'fornecedores',
                            titulo: 'Editar cadastro',
                            id: f.id,
                            campos,
                            valores: { nome: f.nome, funcao: f.funcao ?? '', tipo: f.tipo, observacao: f.observacao ?? '' },
                          })
                        }
                        onAlternar={() => alternarAtivo('fornecedores', f.id, f.ativo)}
                        onExcluir={() => excluir('fornecedores', f.id, f.nome)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  )
}

function AbaEtiquetas({ editar }: { editar: (e: Edicao) => void }) {
  const { cadastros } = useDados()
  const { alternarAtivo, excluir } = useAcoes()
  const campos: CampoDef[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', opcoes: opcoes(TIPO_ETIQUETA), obrigatorio: true },
    { nome: 'cor', rotulo: 'Cor', tipo: 'cor' },
  ]
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="max-w-xl text-sm text-tinta-2">
          Etiquetas marcam lançamentos de qualquer categoria. As do tipo <strong>CAC</strong> alimentam o relatório de CAC; as de{' '}
          <strong>cortesia / finalidade</strong> alimentam o relatório de Cortesias.
        </p>
        <Botao variante="primario" onClick={() => editar({ tabela: 'etiquetas', titulo: 'Nova etiqueta', campos, valores: { tipo: 'geral', cor: '#7d7e74' } })}>
          <Plus size={16} /> Nova etiqueta
        </Botao>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(['cac', 'cortesia', 'geral'] as const).map((t) => (
          <Cartao key={t} className="overflow-hidden">
            <div className="border-b border-linha bg-papel/50 px-4 py-2.5 font-semibold">{TIPO_ETIQUETA[t]}</div>
            <ul>
              {cadastros.etiquetas
                .filter((e) => e.tipo === t)
                .map((e) => (
                  <li key={e.id} className={`group flex items-center justify-between gap-2 border-t border-linha px-4 py-1 first:border-t-0 ${e.ativo ? '' : 'text-tinta-3'}`}>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: e.cor }} />
                      {e.nome}
                      {!e.ativo && ' (inativa)'}
                    </span>
                    <AcoesLinha
                      ativo={e.ativo}
                      onEditar={() =>
                        editar({ tabela: 'etiquetas', titulo: 'Editar etiqueta', id: e.id, campos, valores: { nome: e.nome, tipo: e.tipo, cor: e.cor } })
                      }
                      onAlternar={() => alternarAtivo('etiquetas', e.id, e.ativo)}
                      onExcluir={() => excluir('etiquetas', e.id, e.nome)}
                    />
                  </li>
                ))}
              {!cadastros.etiquetas.some((e) => e.tipo === t) && <li className="px-4 py-3 text-sm text-tinta-3">Nenhuma.</li>}
            </ul>
          </Cartao>
        ))}
      </div>
    </>
  )
}

const ABAS = [
  { id: 'plano', rotulo: 'Grupos e categorias' },
  { id: 'fornecedores', rotulo: 'Fornecedores e clientes' },
  { id: 'etiquetas', rotulo: 'Etiquetas' },
] as const

export function CadastrosPagina() {
  const { carregando, erro } = useDados()
  const [aba, setAba] = useState<(typeof ABAS)[number]['id']>('plano')
  const [edicao, setEdicao] = useState<Edicao | null>(null)

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  return (
    <>
      <Cabecalho
        titulo="Cadastros"
        subtitulo="Plano de contas no formato Grupo → Categoria → Fornecedor. Itens já usados em lançamentos não podem ser excluídos — desative-os."
      />
      <div role="tablist" className="mb-6 inline-flex flex-wrap gap-1 rounded-xl border border-linha bg-folha p-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            type="button"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${aba === a.id ? 'bg-noite text-papel' : 'text-tinta-2 hover:bg-papel'}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'plano' && <AbaPlano editar={setEdicao} />}
      {aba === 'fornecedores' && <AbaFornecedores editar={setEdicao} />}
      {aba === 'etiquetas' && <AbaEtiquetas editar={setEdicao} />}
      <Editor edicao={edicao} onFechar={() => setEdicao(null)} />
    </>
  )
}
