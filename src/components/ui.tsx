import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Etiqueta, TipoGrupo } from '../lib/types'
import { TIPO_GRUPO } from '../lib/format'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-cobalto text-white hover:bg-cobalto-escuro shadow-[0_1px_0_rgb(0_0_0/0.15)]',
  secundario: 'bg-folha text-tinta border border-linha-forte hover:border-tinta-3',
  fantasma: 'text-tinta-2 hover:bg-tinta/5',
  perigo: 'bg-negativo text-white hover:bg-negativo/90',
}

export function Botao({
  variante = 'secundario',
  pequeno,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; pequeno?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        pequeno ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
      } ${VARIANTES[variante]} ${className}`}
    />
  )
}

export function BotaoIcone({
  rotulo,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      {...props}
      className={`inline-flex size-8 items-center justify-center rounded-lg text-tinta-3 transition-colors hover:bg-tinta/5 hover:text-tinta ${className}`}
    />
  )
}

export function Campo({ rotulo, children, dica, className = '' }: { rotulo: string; children: ReactNode; dica?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-tinta-2">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-tinta-3">{dica}</span>}
    </label>
  )
}

export function Modal({
  titulo,
  aberto,
  onFechar,
  children,
  rodape,
  largo,
}: {
  titulo: string
  aberto: boolean
  onFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  largo?: boolean
}) {
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, onFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-noite/45 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="fixed inset-0" onClick={onFechar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`anima-modal relative my-8 w-full rounded-2xl border border-linha bg-folha shadow-2xl ${largo ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-linha px-5 py-4">
          <h2 className="font-display text-xl font-semibold">{titulo}</h2>
          <BotaoIcone rotulo="Fechar" onClick={onFechar}>
            <X size={18} />
          </BotaoIcone>
        </div>
        <div className="px-5 py-5">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-linha px-5 py-4">{rodape}</div>}
      </div>
    </div>
  )
}

export function Cartao({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`rounded-2xl border border-linha bg-folha shadow-[0_1px_2px_rgb(23_32_27/0.04)] ${className}`} style={style}>
      {children}
    </section>
  )
}

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="anima-subir mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 max-w-2xl text-sm text-tinta-2">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-display text-lg italic text-tinta-2">{titulo}</p>
      {children && <div className="mt-2 text-sm text-tinta-3">{children}</div>}
    </div>
  )
}

export function Carregando() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-tinta-3">
      <span className="mr-3 inline-block size-4 animate-spin rounded-full border-2 border-linha-forte border-t-cobalto" />
      Carregando…
    </div>
  )
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  cor,
  destaque,
  atraso = 0,
}: {
  rotulo: string
  valor: string
  detalhe?: ReactNode
  cor?: string
  destaque?: boolean
  atraso?: number
}) {
  return (
    <div
      className={`anima-subir rounded-2xl border p-4 ${destaque ? 'border-noite bg-noite text-papel' : 'border-linha bg-folha'}`}
      style={{ animationDelay: `${atraso}ms` }}
    >
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${destaque ? 'text-papel/70' : 'text-tinta-2'}`}>
        {cor && <span className="size-2.5 rounded-sm" style={{ background: cor }} />}
        {rotulo}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight [font-variant-numeric:tabular-nums] sm:text-[1.7rem]">{valor}</div>
      {detalhe && <div className={`mt-1 text-xs ${destaque ? 'text-papel/60' : 'text-tinta-3'}`}>{detalhe}</div>}
    </div>
  )
}

export function ChipEtiqueta({ e }: { e: Etiqueta }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-linha bg-papel/60 px-2 py-0.5 text-[11px] font-medium text-tinta-2">
      <span className="size-1.5 rounded-full" style={{ background: e.cor }} />
      {e.nome}
    </span>
  )
}

const PILL: Record<TipoGrupo, string> = {
  entrada: 'text-entrada-texto bg-entrada/10',
  saida: 'text-saida-texto bg-saida/10',
  retirada: 'text-retirada-texto bg-retirada/10',
}
const SETA: Record<TipoGrupo, string> = { entrada: '↓', saida: '↑', retirada: '→' }

export function PillTipo({ tipo }: { tipo: TipoGrupo }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[tipo]}`}>
      <span aria-hidden>{SETA[tipo]}</span>
      {TIPO_GRUPO[tipo]}
    </span>
  )
}

