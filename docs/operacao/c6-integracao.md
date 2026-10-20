# Integração C6 — configuração, homologação e operação

**Situação deste registro:** implementação publicada com recursos C6 desabilitados; testes, backup, migrations e deployments registrados na [evidência de 19/10/2026](c6-validacao-2026-10-19.md). Credenciais, homologação e execução bancária reais continuam pendentes. Este documento não comprova aprovação de cadastro ou conexão autenticada.

Decisão de arquitetura: [ADR-012](../adr/ADR-012-c6-saldo-extrato-pix.md). Permanecem vigentes o isolamento standalone e as regras de produção dos ADRs 001 e 003.

## 1. Solicitação de acesso

1. Abrir o [cadastro C6 Developers](https://developers.c6bank.com.br/create-access), selecionar **Cliente Final** e solicitar **Saldo & Extrato** e **Pix** para a conta PJ da LongBeach.
2. Conferir CNPJ, razão social, nome fantasia, responsável, contato, atividade e volume mensal com o responsável. Não inventar dados ausentes nem armazenar dados reais no repositório ou no chat.
3. O responsável conclui os passos que envolvem termos, identidade ou criação de acesso. Não declarar cadastro concluído sem confirmação do C6.
4. Após recebimento das credenciais de sandbox, provisioná-las exclusivamente no servidor de homologação. Executar o roteiro exigido pelo banco, conservar os protocolos e solicitar homologação.
5. Produção exige conta PJ ativa, liberação pelo C6, credenciais próprias e aceite de termos pelo responsável, além da aprovação do environment de produção da LongBeach. Consultar a [jornada oficial](https://developers.c6bank.com.br/get-started).

O [FAQ oficial](https://developers.c6bank.com.br/faq) informa retorno em até cinco dias úteis após cadastro. Isso é uma orientação do banco, não uma garantia desta integração. O portal de autenticação informa funcionamento do sandbox de segunda a sexta, das 07h às 22h; confirmar disponibilidade com o C6 antes do ensaio.

## 2. Configuração exclusiva do servidor

Os nomes abaixo correspondem à seção .NET `Integrations:C6`; o [`.env.example`](../../.env.example) contém somente campos vazios e padrões desabilitados. O arquivo de exemplo não instala credenciais nem configura automaticamente o ambiente hospedado.

| Variável de ambiente | Uso |
|---|---|
| `Integrations__C6__Enabled` | Conexão para todas as consultas e operações C6. Padrão `false`. |
| `Integrations__C6__BankingEnabled` | Coleta de saldo/extrato; também exige `Enabled=true`. Padrão `false`. |
| `Integrations__C6__PixEnabled` | Criação de novos Pix da Quadra. Padrão `false`. |
| `Integrations__C6__Environment` | Exatamente `Sandbox` ou `Production`. Padrão `Sandbox`. |
| `Integrations__C6__AccountId` | Identificação interna estável, sem dados pessoais, até 80 caracteres. Não é token nem número usado para autenticar no banco. |
| `Integrations__C6__ClientId` / `ClientSecret` | Credenciais próprias do ambiente. |
| `Integrations__C6__CertificatePath` | Caminho absoluto do certificado montado no servidor. |
| `Integrations__C6__CertificatePassword` | Senha do PFX, quando aplicável. |
| `Integrations__C6__CertificateKeyPath` | Caminho da chave privada PEM; vazio quando o certificado for PFX. |
| `Integrations__C6__PixKey` | Chave Pix da conta C6; obrigatória para cobranças e consulta dos Pix vinculados. |
| `Integrations__C6__TimeoutSeconds` | Timeout total de cada operação do cliente, incluindo fila e autenticação; padrão 30, entre 1 e 120. |
| `Payments__Billing__Enabled` | Libera criação pela área de contas; exigido adicionalmente para novos pagamentos. |

Há duas formas de montar o certificado: PFX contendo certificado e chave privada, com senha opcional, ou certificado PEM com chave privada PEM em arquivo separado. O usuário do processo deve conseguir ler os arquivos; o frontend não deve ter acesso. O cliente rejeita certificado expirado, ainda não válido ou sem chave privada. Rotação de certificado/credencial exige provisionamento no ambiente correto e reinício controlado para recarregar o cliente.

Não colocar certificados, chaves, tokens, documentos reais, dados pessoais ou extratos em Git, imagem pública, variáveis `VITE_*`, browser storage, logs ou anexos de PR. Os documentos bancários originais ficam no PostgreSQL privado da LongBeach e podem conter informações financeiras sensíveis; manter acesso restrito e backups conforme a política do produto. Relatórios de teste devem usar identificadores sintéticos ou referências internas e resultados, sem copiar payloads reais.

`Production` só funciona com a aplicação em produção; os demais ambientes só usam `Sandbox`. Bancos, arquivos de certificado e segredos devem ser diferentes. Não renomear `AccountId`, trocar ambiente ou chave para contornar pagamento pendente: o histórico é vinculado à configuração de origem.

## 3. Contratos e limites oficiais

Hosts permitidos: `https://baas-api-sandbox.c6bank.info` e `https://baas-api.c6bank.info`. Não são configuráveis. TLS do servidor continua validado e redirects são recusados.

| Operação | Caminho |
|---|---|
| Autenticação | `POST /v1/auth/`, formulário `client_id`, `client_secret`, `grant_type=client_credentials` |
| Extrato | `GET /v1/statement/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| Saldo disponível | `GET /v1/statement/balance` |
| Criar/consultar cobrança imediata | `PUT` / `GET /v2/pix/cob/{txid}` |
| Consultar/solicitar devolução | `GET` / `PUT /v2/pix/pix/{e2eid}/devolucao/{id}` |
| Registrar callback da chave | `PUT /v2/pix/webhook/{chave}`, corpo com `webhookUrl` |

Referências consultadas: [autenticação v1.1.2](https://developers.c6bank.com.br/apis/auth), [saldo/extrato v2.0.0](https://developers.c6bank.com.br/apis/statement), [Pix v3.0.1](https://developers.c6bank.com.br/apis/pix) e [notificações v1.0.10](https://developers.c6bank.com.br/apis/webhook). Versões e comportamento devem ser reconferidos na homologação.

O limite publicado no [FAQ C6](https://developers.c6bank.com.br/faq) é de 60 requisições por minuto por chave, somando as APIs, sujeito a janelas dinâmicas. O cliente mantém margem com uma janela móvel de 50 chamadas/minuto por processo, incluindo autenticação, novas consultas e operações de escrita. A fila aceita 16 esperas, canceláveis e sujeitas ao timeout. Fila cheia devolve erro seguro 429; 429 bancário não provoca repetição automática de uma gravação.

**Operar inicialmente com uma réplica da API.** O limite é compartilhado dentro do processo, não entre réplicas nem com ferramentas externas usando a mesma credencial. Não aumentar réplicas ou executar coletores externos em paralelo sem coordenar o orçamento por chave. A trava PostgreSQL evita coleta financeira concorrente, mas não substitui esse controle de tráfego.

## 4. Saldo, extrato e conferência

- Na primeira inicialização habilitada, coletar os 30 dias inclusive, de hoje menos 29 dias até hoje. Datas da aplicação usam `America/Sao_Paulo`.
- Executar ciclos a cada dez minutos. Retomar do último dia concluído menos dois dias; períodos atrasados são recuperados em blocos de até 30 datas por ciclo. Falhas aplicam espera crescente, limitada a seis horas.
- O ciclo normal só persiste após validar extrato e saldo. Resposta inválida não avança o cursor. A coleta usa trava transacional por ambiente/conta e prazo de 90 segundos, além dos timeouts individuais.
- Conservar documentos originais e hashes. Deduplicar por `reference`, depois `local_reference`; na ausência de ambas, usar hash canônico. Duplicatas indistinguíveis invalidam o lote. Resposta completa posterior substitui a visão derivada daquele período, preservando os documentos anteriores.
- Usar `available`, em BRL, sem somar crédito disponível. Saldo negativo é permitido; ausência de leitura é nula. Mais de 30 minutos ou data bancária anterior a hoje exibem atraso. `created_at` do extrato é preservado como recebido, sem atribuir UTC ao horário sem fuso fornecido pelo banco.
- Conferir lançamentos em `GET /api/v1/financial-history/c6?from=YYYY-MM-DD&through=YYYY-MM-DD&page=1`. A paginação local tem 50 registros; o contrato externo de extrato consultado não publica paginação.
- Para reconsulta manual: `POST /api/v1/financial-history/c6/reprocess` com `from`, `through` e `reason` de 3 a 500 caracteres, usando usuário autorizado. Período máximo de 30 datas, sem futuro. A reconsulta relê somente o extrato, é auditada e não altera o saldo/cursor automático.

Essas consultas respeitam Owner, Administrator e Manager. O extrato não cria receita, confirma pagamento nem classifica automaticamente toda entrada como Quadra. O vínculo visual utiliza E2E de pagamento C6 conhecido na mesma conta e ambiente; o que não puder ser vinculado com segurança fica para conferência.

## 5. Cobranças, notificações e devoluções

O provedor é salvo antes da chamada bancária. Novas cobranças Pix avulsas da Quadra selecionam C6 quando habilitado; Bar, cartões e assinaturas continuam PagBank. O mesmo identificador de operação sempre produz o mesmo `txid`. Nunca usar nova operação ou trocar de banco para resolver uma resposta ambígua.

A criação consulta o `txid` antes do PUT e só grava após ausência confirmada. Depois do PUT, lê a cobrança completa, confere a referência e aguarda o copia e cola. Suspender `PixEnabled` permite recuperar uma cobrança existente com a mesma operação, mas impede criar uma nova. Cobrança `ATIVA` vencida localmente continua pendente até confirmação ou remoção pelo C6; conferir o banco antes de tentar substituí-la.

O registro do callback é uma etapa externa de homologação, não é executado automaticamente pela aplicação. Usar a URL HTTPS pública do ambiente com caminho **`/api/v1/integrations/c6/pix/webhook`**. A documentação de registro descreve a chamada da URL fornecida em `webhookUrl`; não documenta acrescentar `/pix`. Confirmar método, caminho efetivamente chamado e requisitos de transporte no sandbox antes de ativar produção.

O endpoint trata o callback como aviso não autenticado, não como prova de pagamento. As páginas consultadas não especificam assinatura ou cadeia de confiança mTLS de entrada para esse callback. Não desabilitar validação TLS nem presumir autenticação por conhecer a chave Pix.

O C6 documenta envelope com `service: "PIX"`, `key` representando a chave Pix e `information` como uma string JSON contendo `pix`. A aplicação também aceita o formato direto `pix`. Ignora valores/status como prova, confere a chave quando fornecida e só consulta candidatos já conhecidos no escopo da conta. O exemplo oficial pode não trazer `txid`; E2E já conhecido pode localizar o pagamento, enquanto E2E desconhecido é ignorado sem chamada ao banco. O acompanhamento de pagamentos pendentes, a cada minuto, recupera essa confirmação inicial ou notificações perdidas.

Proteções de entrada: corpo de até 64 KiB, profundidade JSON até 16, no máximo cinco linhas/candidatos e cinco requisições por minuto por processo. Excesso pode ser recusado; a consulta periódica continua necessária.

Uma devolução conserva a operação original de devolução e o E2E recebido. Só contabilizar `DEVOLVIDO`; `EM_PROCESSAMENTO` exige nova consulta da mesma operação. Uma devolução pendente bloqueia outra, e divergência entre total devolvido no banco e histórico local exige conciliação. Não apagar pagamentos ou estornos para destravar a operação.

## 6. Publicação, homologação e retorno

1. Verificar build da API e do frontend, suítes afetadas, autorização e migrations. Manter todas as flags C6 em `false` durante a publicação inicial.
2. Fazer backup segundo o procedimento do ambiente e aplicar, por job único controlado no predeploy, as migrations `20261020010000_C6Banking.cs` e `20261020020000_C6PaymentProviders.cs`. Elas criam as tabelas C6 e adicionam identidade do provedor aos pagamentos existentes. Não executar migrations concorrentes nas réplicas.
3. Publicar API antes do frontend. Confirmar health checks, permissões do financeiro, manutenção de PagBank e diagnóstico C6 desativado. Em produção, usar a aprovação do environment e artefato identificado por commit/digest.
4. No sandbox, montar credenciais/certificado e habilitar `Enabled=true`, `BankingEnabled=true`, mantendo `PixEnabled=false`. Conferir a primeira leitura, saldo disponível, sinal dos movimentos, período e ausência de duplicação após reconsulta. Validar também falhas sem perda da última leitura confirmada.
5. Após essa conferência, habilitar `PixEnabled=true` e `Payments:Billing:Enabled=true` no sandbox. Executar cobrança → consulta bancária → baixa → vínculo com extrato, incluindo repetição da mesma operação, notificação repetida/falsa, perda de resposta, vencimento e devolução. Códigos e valores reais de teste devem seguir o roteiro fornecido pelo C6.
6. Validar o callback real e a recuperação sem callback, completar o roteiro do banco e conservar evidência privada de homologação. Confirmar continuidade de cartões, Bar e assinaturas PagBank.
7. Somente após liberação do C6, aceite de termos pelo responsável e aprovação interna, provisionar credenciais de produção. Ativar primeiro saldo/extrato; conferir amostra com extrato oficial; depois liberar novos Pix, com uma única réplica.

**Retorno operacional:** colocar `PixEnabled=false` interrompe novas cobranças C6. Manter `Enabled=true`, a chave/conta de origem e o acompanhamento dos pagamentos existentes. `BankingEnabled` controla a coleta de extrato separadamente. Novas operações futuras podem seguir a seleção PagBank existente, mas operações C6 já iniciadas continuam vinculadas ao C6.

Se for necessário desabilitar toda a conexão por incidente, registrar explicitamente a interrupção de consultas e conciliar os pagamentos assim que o acesso for restaurado. Não reduzir o schema: os métodos `Down` dessas migrations recusam reversão destrutiva. Enquanto houver pagamentos C6, usar uma versão de retorno que compreenda a identidade do provedor e mantenha a recuperação C6; voltar a binário anterior à integração não substitui o acompanhamento bancário.

## 7. Evidências de testes e pendências

- Última execução direcionada desta frente: **57 testes aprovados** de cliente/gateway C6 e diagnóstico de pagamentos, com banco simulado. Cobre orçamento compartilhado de chamadas, cancelamento da fila, certificados, autenticação, isolamento, referências, repetição, timeout ambíguo, devoluções e flags.
- Interface: **409 testes aprovados** e build concluído. Backend: build concluído e suíte final aprovada em banco PostgreSQL local limpo, com **413 testes unitários e 336 de integração**. CI também aprovado em PostgreSQL 17, PostgreSQL 18 e React/PWA: [execução 39346680034](https://github.com/gustavodrager/longbeach/actions/runs/39346680034). A publicação deve ter evidência própria. Esses testes não representam validação bancária real.
- Verificação local com usuário fictício: dashboard → extrato C6, requisições de extrato e integrações HTTP 200, conta não configurada e controles de conexão desativados. Nenhuma chamada bancária real foi realizada.
- Permanecem pendentes: confirmação do cadastro, credenciais/certificado, autenticação real, homologação do banco, callback real e conferência de saldo/extrato/Pix em cada ambiente.

Diagnóstico “Configurado; validar operação” significa somente presença e formato básico da configuração. Nunca utilizá-lo como evidência de conexão ou homologação.
