import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useAviso, useDados } from '../context'
import { criarFornecedor, salvarLancamento } from '../lib/data'
import { TIPO_ETIQUETA, fmtValorCampo, hojeISO, nomeFornecedor, parseValor, proximoMes } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import type { Etiqueta, LancamentoRow, StatusLancamento, TipoEtiqueta, TipoGrupo } from '../lib/types'
import { Botao, Campo, Modal } from './ui'

export type RascunhoLancamento = Partial<LancamentoRow> & { tipo?: TipoGrupo }

const TIPOS: { tipo: TipoGrupo; rotulo: string; ativo: string }[] = [
  { tipo: 'entrada', rotulo: '↓ Recebimento', ativo: 'bg-entrada-texto text-white' },
  { tipo: 'saida', rotulo: '↑ Pagamento', ativo: 'bg-saida-texto text-white' },
  { tipo: 'retirada', rotulo: '→ Retirada', ativo: 'bg-retirada-texto text-white' },
]

export function FormLancamento({
  rascunho,
  onFechar,
}: {
  rascunho: RascunhoLancamento | null
  onFechar: () => void
}) {
  const { cadastros, mapas, lancamentos, recarregar, recarregarCadastros } = useDados()
  const avisar = useAviso()

  const [tipo, setTipo] = useState<TipoGrupo>('saida')
  const [data, setData] = useState(hojeISO())
  const [categoriaId, setCategoriaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valorTxt, setValorTxt] = useState('')
  const [observacao, setObservacao] = useState('')
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [novoFornecedor, setNovoFornecedor] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusLancamento>('pago')
  const [statusManual, setStatusManual] = useState(false)
  const [repetir, setRepetir] = useState(0)
  const [salvando, setSalvando] = useState(false)

  // Preenche o formulário sempre que abrir
  useEffect(() => {
    if (!rascunho) return
    const cat = rascunho.categoria_id ? mapas.categoria.get(rascunho.categoria_id) : undefined
    const grp = cat ? mapas.grupo.get(cat.grupo_id) : undefined
    setTipo(grp?.tipo ?? rascunho.tipo ?? 'saida')
    setData(rascunho.data ?? hojeISO())
    setCategoriaId(rascunho.categoria_id ?? '')
    setFornecedorId(rascunho.fornecedor_id ?? '')
    setDescricao(rascunho.descricao ?? '')
    setValorTxt(rascunho.valor ? fmtValorCampo(rascunho.valor) : '')
    setObservacao(rascunho.observacao ?? '')
    setEtiquetas(rascunho.etiquetas ?? [])
    setNovoFornecedor(null)
    setStatus(rascunho.status ?? ((rascunho.data ?? hojeISO()) > hojeISO() ? 'pendente' : 'pago'))
    setStatusManual(!!rascunho.id || !!rascunho.status)
    setRepetir(0)
    // Só reinicia quando abre outro lançamento (não quando os cadastros recarregam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho])

  const gruposDoTipo = useMemo(
    () => cadastros.grupos.filter((g) => g.tipo === tipo && (g.ativo || cadastros.categorias.some((c) => c.grupo_id === g.id && c.id === categoriaId))),
    [cadastros, tipo, categoriaId],
  )

  const fornecedoresOrdenados = useMemo(() => {
    // Recebimentos mostram clientes primeiro; pagamentos, fornecedores/prestadores
    const peso = (t: string) => (tipo === 'entrada' ? (t === 'cliente' ? 0 : 1) : t === 'cliente' ? 1 : 0)
    return cadastros.fornecedores
      .filter((f) => f.ativo || f.id === fornecedorId)
      .sort((a, b) => peso(a.tipo) - peso(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [cadastros.fornecedores, tipo, fornecedorId])

  const etiquetasPorTipo = useMemo(() => {
    const m = new Map<TipoEtiqueta, Etiqueta[]>()
    for (const e of cadastros.etiquetas) {
      if (!e.ativo && !etiquetas.includes(e.id)) continue
      m.set(e.tipo, [...(m.get(e.tipo) ?? []), e])
    }
    return m
  }, [cadastros.etiquetas, etiquetas])

  const trocarTipo = (t: TipoGrupo) => {
    setTipo(t)
    const cat = mapas.categoria.get(categoriaId)
    if (cat && mapas.grupo.get(cat.grupo_id)?.tipo !== t) setCategoriaId('')
  }

  // Ao escolher um fornecedor, sugere a última categoria usada com ele
  const escolherFornecedor = (id: string) => {
    setFornecedorId(id)
    if (categoriaId || !id) return
    const ultimo = lancamentos.find((l) => l.fornecedor_id === id && l.tipo === tipo)
    if (ultimo) setCategoriaId(ultimo.categoria_id)
  }

  // Data futura num lançamento novo sugere "pendente" (até a pessoa escolher manualmente)
  const trocarData = (d: string) => {
    setData(d)
    if (!statusManual && d) setStatus(d > hojeISO() ? 'pendente' : 'pago')
  }

  const alternarEtiqueta = (id: string) =>
    setEtiquetas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const criarNovoFornecedor = async () => {
    const nome = novoFornecedor?.trim()
    if (!nome) return
    try {
      const id = await criarFornecedor({ nome, tipo: tipo === 'entrada' ? 'cliente' : 'fornecedor' })
      await recarregarCadastros()
      setFornecedorId(id)
      setNovoFornecedor(null)
      avisar(`“${nome}” cadastrado.`)
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const valor = parseValor(valorTxt)
    if (!categoriaId) return avisar('Escolha a categoria.', 'erro')
    if (!valor || valor <= 0) return avisar('Informe um valor maior que zero.', 'erro')
    if (!data) return avisar('Informe a data.', 'erro')
    setSalvando(true)
    try {
      const base = {
        id: rascunho?.id ?? null,
        data,
        categoria_id: categoriaId,
        fornecedor_id: fornecedorId || null,
        descricao,
        valor,
        observacao,
        status,
        etiquetas: tipo === 'retirada' ? [] : etiquetas,
      }
      await salvarLancamento(base)
      // Repetição mensal: cópias futuras entram como pendentes
      let d = data
      for (let i = 0; i < repetir; i++) {
        d = proximoMes(d)
        await salvarLancamento({ ...base, id: null, data: d, status: d > hojeISO() ? 'pendente' : status })
      }
      await recarregar()
      avisar(
        rascunho?.id ? 'Lançamento atualizado.' : repetir ? `Lançamento salvo e repetido por mais ${repetir} meses.` : 'Lançamento salvo.',
      )
      onFechar()
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={rascunho?.id ? 'Editar lançamento' : 'Novo lançamento'}
      aberto={!!rascunho}
      onFechar={onFechar}
      largo
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" type="submit" form="form-lancamento" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <form id="form-lancamento" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-xl border border-linha bg-papel p-1">
            {TIPOS.map((t) => (
              <button
                key={t.tipo}
                type="button"
                role="radio"
                aria-checked={tipo === t.tipo}
                onClick={() => trocarTipo(t.tipo)}
                className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${
                  tipo === t.tipo ? t.ativo : 'text-tinta-2 hover:bg-folha'
                }`}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          {tipo === 'retirada' && (
            <p className="mt-2 text-xs text-tinta-3">Retiradas (antecipação de lucros) não entram no Resultado — aparecem à parte no Resumo.</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <div role="radiogroup" aria-label="Situação" className="grid grid-cols-2 gap-1 rounded-xl border border-linha bg-papel p-1">
            {(['pago', 'pendente'] as StatusLancamento[]).map((st) => (
              <button
                key={st}
                type="button"
                role="radio"
                aria-checked={status === st}
                onClick={() => {
                  setStatus(st)
                  setStatusManual(true)
                }}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  status === st ? 'bg-noite text-papel' : 'text-tinta-2 hover:bg-folha'
                }`}
              >
                {st === 'pago'
                  ? tipo === 'entrada'
                    ? '✓ Já recebido'
                    : '✓ Já pago'
                  : tipo === 'entrada'
                    ? '◷ A receber'
                    : '◷ A pagar'}
              </button>
            ))}
          </div>
          {status === 'pendente' && (
            <p className="mt-2 text-xs text-tinta-3">
              Pendentes ficam em “A pagar e receber” e só entram nos relatórios quando você der baixa.
            </p>
          )}
        </div>

        <Campo rotulo={status === 'pendente' ? 'Vencimento' : tipo === 'entrada' ? 'Data do recebimento' : 'Data do pagamento'}>
          <input type="date" className="campo" value={data} onChange={(e) => trocarData(e.target.value)} required />
        </Campo>
        <Campo rotulo="Valor (R$)">
          <input
            className="campo num text-right"
            inputMode="decimal"
            placeholder="0,00"
            value={valorTxt}
            onChange={(e) => setValorTxt(e.target.value)}
            onBlur={() => {
              const v = parseValor(valorTxt)
              if (v) setValorTxt(fmtValorCampo(v))
            }}
            required
            autoFocus
          />
        </Campo>

        <Campo rotulo="Categoria" className="sm:col-span-2">
          <select className="campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">Selecione…</option>
            {gruposDoTipo.map((g) => (
              <optgroup key={g.id} label={g.nome}>
                {cadastros.categorias
                  .filter((c) => c.grupo_id === g.id && (c.ativo || c.id === categoriaId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Campo>

        <Campo rotulo={tipo === 'entrada' ? 'Cliente / origem' : 'Fornecedor / prestador'} className="sm:col-span-2">
          {novoFornecedor === null ? (
            <div className="flex gap-2">
              <select className="campo" value={fornecedorId} onChange={(e) => escolherFornecedor(e.target.value)}>
                <option value="">— Não informado —</option>
                {fornecedoresOrdenados.map((f) => (
                  <option key={f.id} value={f.id}>
                    {nomeFornecedor(f)}
                  </option>
                ))}
              </select>
              <Botao onClick={() => setNovoFornecedor('')} title="Cadastrar novo">
                <Plus size={16} /> Novo
              </Botao>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                className="campo"
                placeholder="Nome do novo cadastro"
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    criarNovoFornecedor()
                  }
                }}
                autoFocus
              />
              <Botao variante="primario" onClick={criarNovoFornecedor}>
                Criar
              </Botao>
              <Botao variante="fantasma" onClick={() => setNovoFornecedor(null)}>
                Cancelar
              </Botao>
            </div>
          )}
        </Campo>

        <Campo rotulo="Descrição" className="sm:col-span-2">
          <input
            className="campo"
            placeholder="Ex.: Mensalidade março, kit Dia do Médico…"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </Campo>

        {tipo !== 'retirada' && (
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-tinta-2">Etiquetas</span>
            <div className="space-y-2">
              {(['cac', 'cortesia', 'geral'] as TipoEtiqueta[]).map((t) => {
                const lista = etiquetasPorTipo.get(t)
                if (!lista?.length) return null
                return (
                  <div key={t} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-full text-[11px] text-tinta-3 sm:w-36">{TIPO_ETIQUETA[t]}</span>
                    {lista.map((e) => {
                      const on = etiquetas.includes(e.id)
                      return (
                        <button
                          key={e.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => alternarEtiqueta(e.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            on ? 'border-tinta bg-tinta text-papel' : 'border-linha-forte bg-folha text-tinta-2 hover:border-tinta-3'
                          }`}
                        >
                          <span className="size-2 rounded-full" style={{ background: e.cor }} />
                          {e.nome}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Campo rotulo="Observação" className={rascunho?.id ? 'sm:col-span-2' : ''}>
          <textarea className="campo min-h-16" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>

        {!rascunho?.id && (
          <Campo rotulo="Repetir nos meses seguintes" dica="Para contas fixas. As cópias futuras entram como pendentes.">
            <select className="campo" value={repetir} onChange={(e) => setRepetir(Number(e.target.value))}>
              <option value={0}>Não repetir</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Mais {n} {n === 1 ? 'mês' : 'meses'}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </form>
    </Modal>
  )
}
