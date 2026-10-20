# ADR-012 — C6: saldo, extrato e Pix da Quadra

- **Status:** aceito para implementação; operação bancária depende de credenciais e homologação.
- **Data:** 2026-10-19.
- **Complementa:** ADR-001, ADR-003 e ADR-008.
- **Operação:** [runbook da integração C6](../operacao/c6-integracao.md).

## Contexto

O cadastro de conta de recebimento C6 identificava o destino do Pix, mas não consultava o banco nem confirmava pagamentos. A LongBeach precisa consultar sua conta PJ, conservar evidências bancárias e oferecer novas cobranças Pix avulsas da Quadra. O cadastro de desenvolvedor e as credenciais reais ainda são pendências externas.

## Decisão

### Conexão e isolamento

O backend .NET acessa somente os hosts oficiais C6, por OAuth2 client credentials e mTLS. O frontend não recebe credenciais, certificados nem tokens bancários. As configurações pertencem a `Integrations:C6`, com controles independentes para conexão (`Enabled`), coleta (`BankingEnabled`) e criação de cobranças (`PixEnabled`). A área de pagamentos também exige `Payments:Billing:Enabled`.

`Sandbox` só pode ser utilizado fora de produção; `Production` exige que a aplicação também esteja em produção. A identidade persistida combina provedor, ambiente e identificação interna estável da conta. Mudar essa identificação não transfere pagamentos antigos para outra conta. Não existe fallback automático de um pagamento já iniciado para outro banco.

Um cliente singleton compartilha token e limite de saída: no máximo 50 chamadas em qualquer janela de 60 segundos por processo, incluindo autenticação. A fila comporta 16 esperas, sujeitas ao timeout da operação. A implantação inicial utiliza uma única réplica da API; ampliar réplicas exige coordenar o limite por credencial. Erros não incluem corpo bancário, token, senha ou caminho do certificado.

### Evidência financeira

Documentos de saldo/extrato, lançamentos derivados, leituras de saldo e cursor de coleta têm armazenamento próprio. Documentos originais e seu hash permanecem preservados; a visão derivada de um período pode ser corrigida por uma resposta completa posterior. Reler o período não duplica lançamentos. Referências bancárias identificam movimentos; quando ausentes, usa-se hash de campos canônicos, rejeitando duplicatas indistinguíveis.

A primeira coleta cobre 30 dias corridos inclusive, de hoje menos 29 dias até hoje, em `America/Sao_Paulo`. O processo executa na inicialização e a cada dez minutos. A próxima janela parte do último dia concluído menos dois dias e contém no máximo 30 datas, permitindo recuperar atrasos em ciclos sucessivos. Uma trava transacional por conta e ambiente evita coletas concorrentes. Falhas aumentam o intervalo entre tentativas, até seis horas.

Saldo e extrato do ciclo normal são validados antes de persistir o período. Uma resposta parcial ou inválida não avança o cursor. O saldo mostrado usa `available`, excluindo limite de crédito; ausência de leitura é nula, nunca zero. Mais de 30 minutos desde a leitura ou data bancária anterior a hoje tornam o saldo atrasado.

Extrato não gera receita nem baixa uma cobrança. O vínculo de conciliação usa o identificador ponta a ponta de um Pix conhecido, dentro da mesma conta e ambiente. Transferências, liquidações e movimentos sem vínculo permanecem evidência para conferência. Essa decisão preserva a separação Bar/Quadra do ADR-008.

### Pix e recuperação

Novos Pix avulsos da Quadra usam C6 quando habilitado. Bar, cartões e assinaturas permanecem PagBank. Pagamentos remotos antigos recebem identidade PagBank na migration; recebimentos manuais do Bar não passam a ter provedor de API.

O `txid` deriva do identificador persistido da operação. Antes de criar, consulta-se esse mesmo `txid`; somente um 404 confirmado permite o PUT. Depois da criação, consulta-se o documento completo. Timeout ou resposta ambígua não autoriza nova cobrança. Referência da LongBeach, chave Pix, conta, identificadores e valores são conferidos antes da baixa, em BRL. Uma cobrança `ATIVA` continua em acompanhamento mesmo após vencer localmente; somente a confirmação bancária ou remoção altera seu resultado.

Devoluções usam o identificador da operação de devolução e o E2E original. O fluxo consulta o resultado existente, confere o acumulado e bloqueia uma nova devolução enquanto outra estiver em processamento. Consultas e recuperação continuam com `PixEnabled=false`, desde que a conexão permaneça habilitada.

O callback público é apenas um aviso para consultar um pagamento conhecido. Aceita o formato direto e o envelope C6 com `information` contendo JSON, mas não utiliza o status enviado para baixar contas. Avisos sem `txid` podem localizar um E2E já persistido; E2E desconhecido não provoca consulta bancária. A consulta periódica recupera notificações perdidas e confirmações iniciais sem referência utilizável. Há limite de corpo, profundidade, cinco candidatos por aviso e cinco avisos por minuto por processo.

## Interfaces e implantação

- `current-position` inclui origem, ambiente, data bancária e horário da leitura C6.
- `GET /api/v1/financial-history/c6` oferece períodos de até 30 dias e páginas de 50 lançamentos.
- `POST /api/v1/financial-history/c6/reprocess` relê extrato com período, responsável autenticado e motivo obrigatório. Essa ação não atualiza o saldo nem avança o cursor automático.
- O financeiro mantém acesso de Owner, Administrator e Manager. O callback é `POST /api/v1/integrations/c6/pix/webhook`.
- As migrations `20261020010000_C6Banking` e `20261020020000_C6PaymentProviders` são aplicadas por job único controlado antes da API. O frontend é publicado depois da API, inicialmente com todas as flags C6 desabilitadas.
- O retorno operacional começa suspendendo novas cobranças. Não se executa migration de reversão para apagar evidência ou identidade de pagamentos.

## Limites e consequências

Esta entrega não inclui Pix Automático, boletos, C6 Pay, pagamentos a fornecedores, transferências ou múltiplas contas C6 simultâneas. A chave Pix e o identificador da conta devem permanecer estáveis enquanto houver pagamentos vinculados; migração de conta/chave exige procedimento de conciliação próprio.

Os contratos públicos de autenticação, Pix, saldo/extrato e notificações foram consultados. Testes locais utilizam respostas simuladas. Isso não comprova autenticação real, recebimento, devolução, entrega de callback ou homologação pelo C6. A ativação deve cumprir o [roteiro operacional](../operacao/c6-integracao.md), com aceite de termos pelo responsável e aprovação de produção.
