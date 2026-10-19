# Caixas do Bar — implementação e validação local, 19/10/2026

Entrega local dos cinco pontos de UX, sem publicação nesta etapa.

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
