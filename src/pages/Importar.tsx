import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Download, FileUp, Undo2, Upload } from 'lucide-react'
import { useAviso, useDados } from '../context'
import { criarFornecedores, desfazerImportacao, importarLancamentos, listarImportacoes } from '../lib/data'
import { MODELO_CSV, chaveFornecedor, lerTexto, parseCSV, resolverLinhas, type LinhaImportacao } from '../lib/importacao'
import { fmtBRL, fmtData, fmtNum } from '../lib/format'
import { soma } from '../lib/agg'
import { mensagemErro } from '../lib/supabase'
import type { Importacao, ItemImportacao } from '../lib/types'
import { Botao, Cabecalho, Carregando, Cartao, PillTipo, Vazio } from '../components/ui'

const LIMITE = 5000

const COLUNAS = [
  ['Data', 'obrigatória', '05/01/2026 ou 2026-01-05. Para totais mensais use 01/mm/aaaa.'],
  ['Categoria', 'obrigatória', 'Nome igual ao cadastro (ex.: Tráfego Pago). Acentos e maiúsculas não importam.'],
  ['Valor', 'obrigatória', '1.234,56 — sinal de menos é ignorado; o tipo vem da categoria.'],
  ['Grupo', 'quando ambígua', 'Necessária quando a categoria existe em dois grupos (ex.: Ferramentas e Aplicativos).'],
  ['Fornecedor/Cliente', 'opcional', 'Se não existir, é cadastrado na importação.'],
  ['Função', 'opcional', 'Diferencia cadastros de mesmo nome (ex.: Rafael · Gestor de Tráfego).'],
  ['Situação', 'opcional', 'Pago / Recebido / A pagar / A receber. Vazio = pago (ou pendente, se a data for futura).'],
  ['Descrição, Etiquetas, Observação, Tipo', 'opcionais', 'Várias etiquetas separadas por vírgula.'],
] as const

function baixarModelo() {
  const blob = new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'modelo-importacao-magnetica.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

function Historico({ versao }: { versao: number }) {
  const { recarregar } = useDados()
  const avisar = useAviso()
  const [lista, setLista] = useState<Importacao[] | null>(null)

  const carregar = useCallback(() => {
    listarImportacoes()
      .then(setLista)
      .catch((e) => avisar(mensagemErro(e), 'erro'))
  }, [avisar])

  useEffect(carregar, [carregar, versao])

  const desfazer = async (imp: Importacao) => {
    if (!window.confirm(`Desfazer a importação de ${imp.quantidade} lançamentos (${fmtBRL(imp.total)})? Eles serão excluídos.`)) return
    try {
      await desfazerImportacao(imp.lote)
      await recarregar()
      carregar()
      avisar('Importação desfeita.')
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }

  if (!lista) return <Carregando />
  if (!lista.length) return <Vazio titulo="Nenhuma importação feita ainda." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
          <th className="px-5 py-2 text-left font-semibold">Importado em</th>
          <th className="px-3 py-2 text-left font-semibold">Período</th>
          <th className="px-3 py-2 text-right font-semibold">Lançamentos</th>
          <th className="px-3 py-2 text-right font-semibold">Soma</th>
          <th className="px-5 py-2" />
        </tr>
      </thead>
      <tbody>
        {lista.map((imp) => (
          <tr key={imp.lote} className="border-t border-linha">
            <td className="px-5 py-2.5">{new Date(imp.importado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td className="num px-3 py-2.5 text-[13px] text-tinta-2">
              {fmtData(imp.data_inicio)} a {fmtData(imp.data_fim)}
            </td>
            <td className="num px-3 py-2.5 text-right">{imp.quantidade}</td>
            <td className="num px-3 py-2.5 text-right">{fmtNum(imp.total)}</td>
            <td className="px-5 py-1.5 text-right">
              <Botao pequeno variante="fantasma" className="hover:!text-negativo" onClick={() => desfazer(imp)}>
                <Undo2 size={14} /> Desfazer
              </Botao>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Importar() {
  const { cadastros, carregando, recarregar, recarregarCadastros } = useDados()
  const avisar = useAviso()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<string[][] | null>(null)
  const [soErros, setSoErros] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [versao, setVersao] = useState(0)

  const analise = useMemo(() => (linhas ? resolverLinhas(linhas, cadastros) : null), [linhas, cadastros])
  const validas = analise?.resultado.filter((l) => !l.erros.length) ?? []
  const comErro = analise?.resultado.filter((l) => l.erros.length) ?? []
  const novos = useMemo(() => {
    const m = new Map<string, NonNullable<LinhaImportacao['fornecedorNovo']>>()
    for (const l of validas) if (l.fornecedorNovo) m.set(l.fornecedorNovo.chave, l.fornecedorNovo)
    return [...m.values()]
  }, [validas])

  const abrir = async (f: File | undefined) => {
    if (!f) return
    if (/\.xlsx?$/i.test(f.name)) {
      avisar('Arquivo do Excel: abra no Excel e use Arquivo → Salvar como → CSV (separado por vírgulas ou ponto e vírgula).', 'erro')
      return
    }
    try {
      const l = parseCSV(await lerTexto(f))
      if (l.length < 2) return avisar('O arquivo não tem linhas para importar.', 'erro')
      if (l.length - 1 > LIMITE) return avisar(`Máximo de ${LIMITE} linhas por importação. Divida o arquivo.`, 'erro')
      setArquivo(f.name)
      setLinhas(l)
      setSoErros(false)
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setArrastando(false)
    abrir(e.dataTransfer.files[0])
  }

  const limpar = () => {
    setArquivo(null)
    setLinhas(null)
    if (entrada.current) entrada.current.value = ''
  }

  const importar = async () => {
    if (!validas.length) return
    const msg =
      `Importar ${validas.length} lançamentos (${fmtBRL(soma(validas.map((l) => l.valor ?? 0)))})` +
      (novos.length ? ` e cadastrar ${novos.length} fornecedores/clientes novos` : '') +
      (comErro.length ? `? As ${comErro.length} linhas com erro ficarão de fora.` : '?')
    if (!window.confirm(msg)) return
    setImportando(true)
    try {
      const criados = await criarFornecedores(novos.map(({ nome, funcao, tipo }) => ({ nome: nome.trim(), funcao: funcao?.trim() || null, tipo })))
      const idNovo = new Map(criados.map((f) => [chaveFornecedor(f.nome, f.funcao), f.id]))
      const itens: ItemImportacao[] = validas.map((l) => ({
        data: l.data!,
        categoria_id: l.categoria!.id,
        fornecedor_id: l.fornecedor?.id ?? (l.fornecedorNovo ? idNovo.get(l.fornecedorNovo.chave) ?? null : null),
        descricao: l.descricao,
        valor: l.valor!,
        observacao: l.observacao,
        status: l.status,
        etiquetas: l.etiquetas,
      }))
      await importarLancamentos(itens)
      await Promise.all([recarregarCadastros(), recarregar()])
      avisar(`${itens.length} lançamentos importados.`)
      limpar()
      setVersao((v) => v + 1)
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
      // Fornecedores podem ter sido criados; recarrega para a próxima tentativa reaproveitá-los
      recarregarCadastros()
    } finally {
      setImportando(false)
    }
  }

  if (carregando) return <Carregando />

  const mostradas = (soErros ? comErro : analise?.resultado ?? []).slice(0, 500)

  return (
    <>
      <Cabecalho
        titulo="Importar histórico"
        subtitulo="Traga lançamentos de uma planilha (CSV). Nada é gravado antes de você conferir a prévia, e cada importação pode ser desfeita."
        acoes={
          <Botao onClick={baixarModelo}>
            <Download size={16} /> Baixar modelo
          </Botao>
        }
      />

      {!analise ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setArrastando(true)
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={soltar}
            className={`anima-subir flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              arrastando ? 'border-cobalto bg-cobalto-claro/60' : 'border-linha-forte bg-folha hover:border-cobalto'
            }`}
          >
            <FileUp size={36} className="text-cobalto" strokeWidth={1.5} />
            <span className="mt-3 font-display text-xl font-semibold">Solte o arquivo CSV aqui</span>
            <span className="mt-1 text-sm text-tinta-3">ou clique para escolher</span>
            <input ref={entrada} type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => abrir(e.target.files?.[0])} />
          </label>

          <Cartao className="anima-subir p-5" style={{ animationDelay: '80ms' }}>
            <h2 className="font-display text-lg font-semibold">Colunas reconhecidas</h2>
            <p className="mb-3 text-xs text-tinta-3">A ordem não importa. Também aceita o formato da Acountech (Categoria → Centro de custo).</p>
            <dl className="divide-y divide-linha text-sm">
              {COLUNAS.map(([nome, obrig, dica]) => (
                <div key={nome} className="grid grid-cols-[150px_1fr] gap-3 py-2">
                  <dt>
                    <div className="font-medium">{nome}</div>
                    <div className={`text-[11px] ${obrig === 'obrigatória' ? 'font-semibold text-cobalto' : 'text-tinta-3'}`}>{obrig}</div>
                  </dt>
                  <dd className="text-tinta-2">{dica}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
        </div>
      ) : analise.faltando.length ? (
        <Cartao className="p-6">
          <p className="font-display text-lg font-semibold text-negativo">Faltam colunas obrigatórias em “{arquivo}”</p>
          <p className="mt-2 text-sm text-tinta-2">
            Não encontrei: <strong>{analise.faltando.join(', ')}</strong>. A primeira linha precisa ter os nomes das colunas. Baixe o modelo para
            ver o formato.
          </p>
          <Botao className="mt-4" onClick={limpar}>
            Escolher outro arquivo
          </Botao>
        </Cartao>
      ) : (
        <>
          <Cartao className="anima-subir mb-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-tinta-3">{arquivo}</div>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span>
                    <strong className="num">{validas.length}</strong> prontas para importar
                  </span>
                  {comErro.length > 0 && (
                    <span className="text-negativo">
                      <strong className="num">{comErro.length}</strong> com erro (ficam de fora)
                    </span>
                  )}
                  {novos.length > 0 && (
                    <span className="text-tinta-2">
                      <strong className="num">{novos.length}</strong> fornecedores/clientes novos
                    </span>
                  )}
                  <span className="text-tinta-2">
                    Soma <strong className="num">{fmtBRL(soma(validas.map((l) => l.valor ?? 0)))}</strong>
                  </span>
                </div>
                {analise.ignoradas.length > 0 && (
                  <p className="mt-1 text-xs text-tinta-3">Colunas ignoradas: {analise.ignoradas.join(', ')}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Botao variante="fantasma" onClick={limpar} disabled={importando}>
                  Cancelar
                </Botao>
                <Botao variante="primario" onClick={importar} disabled={importando || !validas.length}>
                  <Upload size={16} /> {importando ? 'Importando…' : `Importar ${validas.length}`}
                </Botao>
              </div>
            </div>
            {novos.length > 0 && (
              <p className="mt-3 border-t border-linha pt-3 text-xs text-tinta-2">
                <span className="font-semibold">Serão cadastrados:</span> {novos.map((f) => (f.funcao ? `${f.nome} (${f.funcao})` : f.nome)).join(', ')}
              </p>
            )}
          </Cartao>

          <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center justify-between border-b border-linha px-5 py-3">
              <h2 className="font-display text-lg font-semibold">Prévia</h2>
              {comErro.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-tinta-2">
                  <input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} className="accent-cobalto" />
                  Mostrar só as linhas com erro
                </label>
              )}
            </div>
            <div className="rolagem max-h-[60vh] overflow-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="sticky top-0 z-[1] bg-folha">
                  <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                    <th className="px-4 py-2 text-left font-semibold">Linha</th>
                    <th className="px-3 py-2 text-left font-semibold">Data</th>
                    <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-left font-semibold">Categoria</th>
                    <th className="px-3 py-2 text-left font-semibold">Fornecedor / cliente</th>
                    <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                    <th className="px-3 py-2 text-right font-semibold">Valor</th>
                    <th className="px-4 py-2 text-left font-semibold">Conferência</th>
                  </tr>
                </thead>
                <tbody>
                  {mostradas.map((l) => (
                    <tr key={l.numero} className={`border-t border-linha align-top ${l.erros.length ? 'bg-negativo/[0.04]' : ''}`}>
                      <td className="num px-4 py-2 text-[12px] text-tinta-3">{l.numero}</td>
                      <td className="num px-3 py-2 text-[13px]">{l.data ? fmtData(l.data) : '—'}</td>
                      <td className="px-3 py-2">{l.tipo ? <PillTipo tipo={l.tipo} /> : '—'}</td>
                      <td className="px-3 py-2">
                        {l.categoria ? (
                          <>
                            <div>{l.categoria.nome}</div>
                            <div className="text-xs text-tinta-3">{l.grupo?.nome}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {l.fornecedor?.nome ?? l.fornecedorNovo?.nome ?? <span className="text-tinta-3">—</span>}
                        {l.fornecedorNovo && (
                          <span className="ml-1.5 rounded-full bg-cobalto-claro px-1.5 py-0.5 text-[10px] font-semibold text-cobalto-escuro">novo</span>
                        )}
                      </td>
                      <td className="max-w-56 px-3 py-2 text-tinta-2">
                        {l.descricao || '—'}
                        {l.status === 'pendente' && <div className="text-[11px] font-semibold text-tinta-3">◷ pendente</div>}
                      </td>
                      <td className="num px-3 py-2 text-right">{l.valor ? fmtNum(l.valor) : '—'}</td>
                      <td className="px-4 py-2 text-xs">
                        {l.erros.map((e) => (
                          <div key={e} className="font-medium text-negativo">
                            ✕ {e}
                          </div>
                        ))}
                        {l.avisos.map((a) => (
                          <div key={a} className="text-[#8a5a00]">
                            ! {a}
                          </div>
                        ))}
                        {!l.erros.length && !l.avisos.length && <span className="text-entrada-texto">✓ ok</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(soErros ? comErro : analise.resultado).length > mostradas.length && (
                <p className="border-t border-linha px-5 py-3 text-xs text-tinta-3">
                  Mostrando as primeiras {mostradas.length} linhas. Todas as válidas serão importadas.
                </p>
              )}
            </div>
          </Cartao>
        </>
      )}

      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold">Importações anteriores</h2>
      <Cartao className="overflow-hidden">
        <Historico versao={versao} />
      </Cartao>
    </>
  )
}
