# Magnética · Financeiro

Sistema financeiro interno da agência: lançamentos de entradas e saídas, resumo mensal,
recebimentos, pagamentos, analítico por fornecedor, CAC e cortesias.

React + Vite + TypeScript + Tailwind, com Supabase (banco + login).

## Primeira instalação

1. **Banco** — no painel do Supabase, abra *SQL Editor → New query*, cole todo o
   conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em *Run*.
   Isso cria as tabelas, as regras de segurança e o plano de categorias completo.
   Em seguida, faça o mesmo com
   [`supabase/002_contas_cac_importacao.sql`](supabase/002_contas_cac_importacao.sql)
   (contas a pagar/receber, CAC por cliente e importação).
2. **Usuários** — em *Authentication → Users → Add user*, crie o login de cada pessoa
   (marque *Auto Confirm User*).
3. **Liberar acesso** — no SQL Editor, rode (com os e-mails reais):
   ```sql
   insert into public.membros (email, nome) values
     ('cliente@exemplo.com', 'Nome da cliente');
   ```
   Só e-mails presentes em `membros` enxergam os dados, mesmo que alguém crie conta.
4. **Recomendado** — em *Authentication → Sign In / Providers*, desligue
   *Allow new users to sign up*.

## Rodar localmente

```bash
npm install
npm run dev
```

As chaves ficam em `.env.local` (modelo em `.env.example`).

## Publicar

`npm run build` gera a pasta `dist/`. Funciona na Vercel ou na Netlify sem ajustes
(`vercel.json` e `public/_redirects` já tratam as rotas). Configure as variáveis
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no painel da hospedagem.

## Como o sistema organiza os dados

- **Grupo → Categoria → Fornecedor**, igual para entradas e saídas.
  Uma mesma categoria pode existir em grupos diferentes (ex.: *Ferramentas e Aplicativos*
  em Administrativas e em Operacionais).
- **Tipo do grupo**: `entrada` (Recebimentos), `saida` (Pagamentos) ou `retirada`
  (Antecipação de lucros). A retirada **não** entra no Resultado:
  `Resultado = Recebimentos − Pagamentos` e `Saldo = Resultado − Retirada`.
- **Etiquetas** marcam lançamentos de qualquer categoria:
  - tipo `cac` → aparecem no relatório de CAC;
  - tipo `cortesia` (Mimo cliente, Dia do Médico, LTV…) → aparecem em Cortesias,
    junto com tudo que estiver em *Despesas com Cortesias* ou *Brindes para Clientes*.
- **Situação**: cada lançamento é `pago` ou `pendente`. Pendentes (a pagar / a receber)
  aparecem só em *A pagar e receber*, com a data como vencimento; ao dar baixa, a data
  passa a ser a do pagamento e o valor entra nos relatórios.
- **CAC por cliente** = soma dos lançamentos com etiqueta CAC ÷ clientes novos do mês,
  informados na própria tela de CAC.
- **Importação**: CSV (o modelo está na tela *Importar histórico*). Cada importação
  fica registrada e pode ser desfeita inteira.
- Categorias, fornecedores e etiquetas já usados não podem ser excluídos — desative-os.
