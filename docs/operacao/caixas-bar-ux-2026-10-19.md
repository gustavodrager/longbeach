# Caixas do Bar — implementação e validação local, 19/10/2026

Cinco pontos de UX publicados em produção após autorização do proprietário e CI aprovada. Revisão: https://github.com/gustavodrager/longbeach/pull/41.

## Comportamento

- Tela dedicada com caixas abertos/reabertos por padrão, identificação do responsável, caixa físico, turno, abertura, fundo inicial e saldo. Busca por responsável/caixa/turno e histórico de fechados com paginação no servidor, sem o corte anterior dos 100 registros na tela de gestão.
- Ações diretas Colocar dinheiro, Retirar dinheiro e Registrar despesa, disponíveis somente para o responsável pela sessão. Previsão do saldo após o movimento e validação de saldo insuficiente antes do envio; regras do servidor preservadas.
- Fechamento com esperado, contado, diferença, justificativa condicional e aviso de autorização do ajuste. Pagamento pendente bloqueia a confirmação. Atualizar saldo preserva a contagem digitada. Se o saldo mudar entre leitura e confirmação, a API exige nova conferência.
- Abertura com caixa preselecionado quando único e identificação do turno preenchida como Atendimento, editável. Cadastro de caixa físico fica recolhido. Outra abertura é desabilitada quando o usuário já tem sessão ativa.
- Movimentos e fechamentos consultáveis no cartão, valores confirmados após gravação, reabertura supervisionada e motivos preservados. Campos de moeda aceitam vírgula/ponto, exigem valor explícito e até duas casas; vazio não significa zero. Repetição do mesmo payload reutiliza a chave de operação. Gravação bloqueia dupla submissão e edição, e erros preservam o preenchimento.

## Integração

Novas leituras protegidas por `bar:supervise`: `/api/v1/bar/cash/history` e `/api/v1/bar/cash/sessions/{id}/details`. Histórico paginado em 20 registros; detalhes carregados ao expandir. O endpoint anterior de sessões prioriza o usuário atual e os abertos para não ocultar sua sessão atrás de turnos encerrados.

`CloseCashInput.Expected` é opcional: a nova tela envia o saldo conferido, verificado dentro da transação antes do fechamento. Clientes anteriores continuam aceitos; quando o campo não existe, o fingerprint de idempotência mantém a estrutura anterior. Nenhuma migration. Em futura publicação, promover API antes da interface; frontend anterior continua compatível com a API nova.

## Validação

- Frontend: 389 testes passaram em 43 arquivos; build TypeScript/PWA aprovado.
- Backend: 55 testes de autorização/compras/caixa passaram em PostgreSQL fictício; após o último ajuste de compatibilidade, 52 testes de autorização e histórico/fechamento passaram, sem ignorados. Build da API aprovado.
- Testes específicos: dinheiro explícito e decimais, somente movimentos do próprio caixa, outra abertura bloqueada, falha/repetição com mesma chave, rede lenta sem duplicação, diferença com motivo, pagamento pendente, envio de saldo conferido, histórico com 106 sessões, filtros antes da paginação, movimentos idempotentes, fechamento sobre saldo desatualizado rejeitado, fechamento e reabertura.
- Chrome local com API real e banco exclusivamente fictício: abertura R$100,00; suprimento R$25,50; retirada R$10,00; despesa R$5,50; esperado R$110,00; contado R$108,00; diferença -R$2,00. Reabertura e segundo fechamento em R$108,00, diferença zero. API confirmou seis movimentos, dois fechamentos e estado fechado; saldo igual à soma dos movimentos.
- Desktop 1470×900 e celular emulado 390×844/320×740: formulários, rolagem, histórico, rodapé, campos acima de 48 px e `inputmode=decimal`, sem overflow horizontal do documento. Atualização de saldo manteve o valor digitado.
- Emulação não substitui teste de teclado em aparelho físico. Nenhuma escrita de teste em produção.

Evidências locais fora do Git: `../../outputs/caixas-ux-2026-10-19/`, incluindo desktop, retirada em 390 px e fechamento final em 320/390 px.

## Publicação em produção — 19/10/2026

- API e web fixadas em `8e1eb31608dec8b6e5a921e11f912fe58e962e7f`, branch `codex/caixas-bar-ux-20261019`.
- CI [39304477876](https://github.com/gustavodrager/longbeach/actions/runs/39304477876) aprovada: 340 unitários, 309 integrações em cada PostgreSQL 17/18, 389 frontend, builds, saúde, auditoria e restauração fictícia.
- API deployment `0dea9412-0758-4644-bc86-a4aff5b8227a`: SUCCESS em 19:27:38 UTC; `/health/ready` Healthy.
- Web deployment `879eea5e-71cb-456e-98fb-5c1e588603a2`: SUCCESS em 19:34:02 UTC; `/healthz` ok; bundle público `index-CbLQtwdz.js`.
- Histórico anônimo responde 401. Fontes dos dois serviços confirmadas no commit aprovado, sem mudanças pendentes. Snapshot importado e plano sem divergências após cada etapa.
- Conferência autenticada em produção: nova listagem, responsável, abertura, saldo, movimentos existentes e painel de fechamento; desktop e celular emulado 320/390 px, teclado decimal configurado, sem overflow horizontal ou erros de console capturados. Atualização do PWA aplicada pela interface.
- Não foram digitadas contagens nem confirmados movimentos, abertura ou fechamento em produção. Caixa e saldo reais preservados. A página ficou aberta para validação manual do proprietário.
- Capturas privadas fora do Git: `../../outputs/caixas-producao-2026-10-19/`.

### Retorno

Restaurar primeiro a web ao commit `ec6d867b3f3a2529b318caffe4385d65d24abcd3`, branch `codex/compras-bar-ux-20261019`, deployment anterior `345545c0-4344-4331-bc2c-d746bbf90c68`. A API nova é compatível e pode permanecer. Se necessário, restaurar a API ao mesmo commit, deployment anterior `2c71a04f-02ef-42b6-af80-2851432476de`. Sem migration; preservar o banco e movimentos reais, conferir saúde e reimportar o snapshot.
