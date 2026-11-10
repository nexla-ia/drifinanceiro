import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, Copy, Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useAviso, useDados } from '../context'
import { excluirLancamento } from '../lib/data'
import { soma } from '../lib/agg'
import { MESES_LONGOS, TIPO_GRUPO, fmtBRL, fmtData, fmtNum, nomeFornecedor, normalizar, proximoMes } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import type { Lancamento, TipoGrupo } from '../lib/types'
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, ChipEtiqueta, Modal, PillTipo, Vazio } from '../components/ui'
import { FormLancamento, type RascunhoLancamento } from '../components/FormLancamento'
import { ModalBaixa, PillPendente } from '../components/Baixa'

const FILTROS = ['mes', 'tipo', 'status', 'grupo', 'categoria', 'fornecedor', 'etiqueta', 'q'] as const
const PAGINA = 200

function baixarCSV(nome: string, linhas: Lancamento[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const cab = ['Data', 'Situação', 'Tipo', 'Grupo', 'Categoria', 'Fornecedor/Cliente', 'Função', 'Descrição', 'Valor', 'Etiquetas', 'Observação']
  const corpo = linhas.map((l) =>
    [
      fmtData(l.data),
      l.status === 'pago' ? 'Pago' : 'Pendente',
      TIPO_GRUPO[l.tipo],
      l.grupo.nome,
      l.categoria.nome,
      l.fornecedor?.nome ?? '',
      l.fornecedor?.funcao ?? '',
      l.descricao ?? '',
      fmtNum(l.valor),
      l.etiquetasObj.map((e) => e.nome).join(', '),
      l.observacao ?? '',
    ]
      .map((x) => esc(String(x)))
      .join(';'),
  )
  // BOM para o Excel abrir acentos corretamente
  const blob = new Blob(['\uFEFF' + [cab.join(';'), ...corpo].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}

export function Lancamentos() {
  const { ano, cadastros, mapas, todos: lancamentos, carregando, erro, recarregar } = useDados()
  const avisar = useAviso()
  const [params, setParams] = useSearchParams()
  const [rascunho, setRascunho] = useState<RascunhoLancamento | null>(null)
  const [excluindo, setExcluindo] = useState<Lancamento | null>(null)
  const [baixando, setBaixando] = useState<Lancamento | null>(null)
  const [limite, setLimite] = useState(PAGINA)

  const f = Object.fromEntries(FILTROS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTROS)[number], string>
  const definir = (k: (typeof FILTROS)[number], v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    // Trocar o grupo limpa a categoria, se ela não for do grupo
    if (k === 'grupo' && p.get('categoria') && mapas.categoria.get(p.get('categoria')!)?.grupo_id !== v) p.delete('categoria')
    setParams(p, { replace: true })
    setLimite(PAGINA)
  }
  const algumFiltro = FILTROS.some((k) => f[k])

  const filtrados = useMemo(() => {
    const termo = normalizar(f.q.trim())
    return lancamentos.filter((l) => {
      if (f.mes && l.mes !== Number(f.mes) - 1) return false
      if (f.tipo && l.tipo !== f.tipo) return false
      if (f.status && l.status !== f.status) return false
      if (f.grupo && l.grupo.id !== f.grupo) return false
      if (f.categoria && l.categoria.id !== f.categoria) return false
      if (f.fornecedor === 'sem' ? l.fornecedor_id : f.fornecedor && l.fornecedor_id !== f.fornecedor) return false
      if (f.etiqueta && !l.etiquetas.includes(f.etiqueta)) return false
      if (termo) {
        const alvo = normalizar(
          [l.descricao, l.observacao, l.categoria.nome, l.grupo.nome, l.fornecedor?.nome, l.fornecedor?.funcao, fmtNum(l.valor)].join(' '),
        )
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [lancamentos, f.mes, f.tipo, f.status, f.grupo, f.categoria, f.fornecedor, f.etiqueta, f.q])

  const totais = useMemo(() => {
    const t = (tipo: TipoGrupo) => soma(filtrados.filter((l) => l.tipo === tipo && l.status === 'pago').map((l) => l.valor))
    const pend = filtrados.filter((l) => l.status === 'pendente')
    return {
      entrada: t('entrada'),
      saida: t('saida'),
      retirada: t('retirada'),
      aReceber: soma(pend.filter((l) => l.tipo === 'entrada').map((l) => l.valor)),
      aPagar: soma(pend.filter((l) => l.tipo !== 'entrada').map((l) => l.valor)),
    }
  }, [filtrados])

  const categoriasFiltro = cadastros.categorias.filter((c) => {
    const g = mapas.grupo.get(c.grupo_id)
    return (!f.grupo || c.grupo_id === f.grupo) && (!f.tipo || g?.tipo === f.tipo)
  })

  const confirmarExclusao = async () => {
    if (!excluindo) return
    try {
      await excluirLancamento(excluindo.id)
      await recarregar()
      avisar('Lançamento excluído.')
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
    setExcluindo(null)
  }

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const novoComFiltros = (): RascunhoLancamento => ({
    tipo: (f.tipo as TipoGrupo) || undefined,
    categoria_id: f.categoria || undefined,
    fornecedor_id: f.fornecedor && f.fornecedor !== 'sem' ? f.fornecedor : undefined,
    etiquetas: f.etiqueta ? [f.etiqueta] : undefined,
  })

  return (
    <>
      <Cabecalho
        titulo="Lançamentos"
        subtitulo={`Todas as entradas e saídas de ${ano}. Clique em um valor nos relatórios para chegar aqui já filtrado.`}
        acoes={
          <>
            <Botao onClick={() => baixarCSV(`lancamentos-${ano}.csv`, filtrados)} disabled={!filtrados.length}>
              <Download size={16} /> Exportar CSV
            </Botao>
            <Botao variante="primario" onClick={() => setRascunho(novoComFiltros())}>
              <Plus size={16} /> Novo lançamento
            </Botao>
          </>
        }
      />

      <Cartao className="anima-subir mb-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="relative col-span-full">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3" />
            <input className="campo pl-9" placeholder="Buscar…" value={f.q} onChange={(e) => definir('q', e.target.value)} />
          </div>
          <select className="campo" value={f.mes} onChange={(e) => definir('mes', e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {MESES_LONGOS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select className="campo" value={f.tipo} onChange={(e) => definir('tipo', e.target.value)} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            <option value="entrada">Recebimentos</option>
            <option value="saida">Pagamentos</option>
            <option value="retirada">Retiradas</option>
          </select>
          <select className="campo" value={f.status} onChange={(e) => definir('status', e.target.value)} aria-label="Situação">
            <option value="">Pagos e pendentes</option>
            <option value="pago">Só pagos / recebidos</option>
            <option value="pendente">Só pendentes</option>
          </select>
          <select className="campo" value={f.grupo} onChange={(e) => definir('grupo', e.target.value)} aria-label="Grupo">
            <option value="">Todos os grupos</option>
            {cadastros.grupos
              .filter((g) => !f.tipo || g.tipo === f.tipo)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                  {g.nome === 'Eventos' ? ` (${TIPO_GRUPO[g.tipo].toLowerCase()})` : ''}
                </option>
              ))}
          </select>
          <select className="campo" value={f.categoria} onChange={(e) => definir('categoria', e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categoriasFiltro.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {f.grupo ? '' : ` — ${mapas.grupo.get(c.grupo_id)?.nome ?? ''}`}
              </option>
            ))}
          </select>
          <select className="campo" value={f.fornecedor} onChange={(e) => definir('fornecedor', e.target.value)} aria-label="Fornecedor">
            <option value="">Todos os fornecedores</option>
            <option value="sem">Sem fornecedor informado</option>
            {cadastros.fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {nomeFornecedor(x)}
              </option>
            ))}
          </select>
          <select className="campo" value={f.etiqueta} onChange={(e) => definir('etiqueta', e.target.value)} aria-label="Etiqueta">
            <option value="">Todas as etiquetas</option>
            {cadastros.etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-tinta-3">
            {filtrados.length} {filtrados.length === 1 ? 'lançamento' : 'lançamentos'}
          </span>
          {totais.entrada > 0 && (
            <span>
              <span className="text-tinta-3">Recebido </span>
              <span className="num font-medium text-entrada-texto">{fmtBRL(totais.entrada)}</span>
            </span>
          )}
          {totais.saida > 0 && (
            <span>
              <span className="text-tinta-3">Pago </span>
              <span className="num font-medium text-saida-texto">{fmtBRL(totais.saida)}</span>
            </span>
          )}
          {totais.retirada > 0 && (
            <span>
              <span className="text-tinta-3">Retirado </span>
              <span className="num font-medium text-retirada-texto">{fmtBRL(totais.retirada)}</span>
            </span>
          )}
          {totais.aReceber > 0 && (
            <span>
              <span className="text-tinta-3">A receber </span>
              <span className="num font-medium">{fmtBRL(totais.aReceber)}</span>
            </span>
          )}
          {totais.aPagar > 0 && (
            <span>
              <span className="text-tinta-3">A pagar </span>
              <span className="num font-medium">{fmtBRL(totais.aPagar)}</span>
            </span>
          )}
          {algumFiltro && (
            <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-cobalto hover:underline" onClick={() => setParams({})}>
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>
      </Cartao>

      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '80ms' }}>
        {filtrados.length === 0 ? (
          <Vazio titulo={lancamentos.length ? 'Nada encontrado com esses filtros.' : `Nenhum lançamento em ${ano} ainda.`}>
            {!lancamentos.length && 'Use “Novo lançamento” para registrar a primeira entrada ou saída.'}
          </Vazio>
        ) : (
          <div className="rolagem overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                  <th className="px-4 py-2.5 text-left font-semibold">Data</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Categoria</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Fornecedor / cliente</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Descrição</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                  <th className="w-36 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, limite).map((l) => (
                  <tr key={l.id} className="group border-t border-linha align-top hover:bg-cobalto-claro/25">
                    <td className="num whitespace-nowrap px-4 py-2.5 text-[13px] text-tinta-2">{fmtData(l.data)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <PillTipo tipo={l.tipo} />
                        {l.status === 'pendente' && <PillPendente l={l} />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{l.categoria.nome}</div>
                      <div className="text-xs text-tinta-3">{l.grupo.nome}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {l.fornecedor ? (
                        <>
                          <div>{l.fornecedor.nome}</div>
                          {l.fornecedor.funcao && <div className="text-xs text-tinta-3">{l.fornecedor.funcao}</div>}
                        </>
                      ) : (
                        <span className="text-tinta-3">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-3 py-2.5">
                      <div className="text-tinta-2">{l.descricao || <span className="text-tinta-3">—</span>}</div>
                      {l.etiquetasObj.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.etiquetasObj.map((e) => (
                            <ChipEtiqueta key={e.id} e={e} />
                          ))}
                        </div>
                      )}
                      {l.observacao && <div className="mt-1 text-xs italic text-tinta-3">{l.observacao}</div>}
                    </td>
                    <td
                      className={`num whitespace-nowrap px-3 py-2.5 text-right font-medium ${l.status === 'pendente' ? 'opacity-55' : ''} ${
                        l.tipo === 'entrada' ? 'text-entrada-texto' : l.tipo === 'saida' ? 'text-saida-texto' : 'text-retirada-texto'
                      }`}
                    >
                      {l.tipo === 'entrada' ? '+' : '−'} {fmtNum(l.valor)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex justify-end opacity-60 transition-opacity group-hover:opacity-100">
                        {l.status === 'pendente' && (
                          <BotaoIcone rotulo={l.tipo === 'entrada' ? 'Confirmar recebimento' : 'Confirmar pagamento'} className="!text-entrada-texto" onClick={() => setBaixando(l)}>
                            <CheckCheck size={15} />
                          </BotaoIcone>
                        )}
                        <BotaoIcone rotulo="Editar" onClick={() => setRascunho(l)}>
                          <Pencil size={15} />
                        </BotaoIcone>
                        <BotaoIcone
                          rotulo="Duplicar para o mês seguinte"
                          onClick={() => setRascunho({ ...l, id: undefined, status: undefined, data: proximoMes(l.data) })}
                        >
                          <Copy size={15} />
                        </BotaoIcone>
                        <BotaoIcone rotulo="Excluir" className="hover:!text-negativo" onClick={() => setExcluindo(l)}>
                          <Trash2 size={15} />
                        </BotaoIcone>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > limite && (
              <div className="border-t border-linha p-3 text-center">
                <Botao pequeno onClick={() => setLimite((x) => x + PAGINA)}>
                  Mostrar mais ({filtrados.length - limite} restantes)
                </Botao>
              </div>
            )}
          </div>
        )}
      </Cartao>

      <FormLancamento rascunho={rascunho} onFechar={() => setRascunho(null)} />
      <ModalBaixa lancamento={baixando} onFechar={() => setBaixando(null)} />

      <Modal
        titulo="Excluir lançamento?"
        aberto={!!excluindo}
        onFechar={() => setExcluindo(null)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setExcluindo(null)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={confirmarExclusao}>
              Excluir
            </Botao>
          </>
        }
      >
        {excluindo && (
          <p className="text-sm text-tinta-2">
            {fmtData(excluindo.data)} · {excluindo.categoria.nome} · <strong className="num">{fmtBRL(excluindo.valor)}</strong>
            <br />
            Essa ação não pode ser desfeita.
          </p>
        )}
      </Modal>
    </>
  )
}
