# Central WhatsApp — configuração e operação

Implementação local em 31/10/2026. Não é comprovante de ativação, pareamento, autorização de envio ou publicação em produção.

## Uso no app

WhatsApp aparece no menu principal, após Clientes. Conversas reúne busca/filtros, histórico, anexos, compositor e contexto do cliente; no celular a conversa abre em tela própria. Envios acompanha destinatário, finalidade, autor, horário e entrega. Automação permite à gestão aprovar respostas e ativar o bot/lembretes. Pendências desconhecidas seguem à equipe.

Assumir ou responder pausa o bot; Devolver ao bot retoma manualmente. Concluir não apaga mensagens; uma nova entrada reabre o atendimento. Não lidas na central é um marcador interno, separado dos recibos do WhatsApp. Mensagem sem recibo de leitura não é falha. Mensagens do celular aparecem como WhatsApp da arena, sem atribuição individual presumida.

Novas conversas usam Clientes cadastrados. Contato recebido desconhecido pode ser atendido sem vinculação automática. Só a gestão confere vínculo e consentimento para lembretes. O contato informado no cadastro não basta para acessar contas ou agenda privada. Contas exigem usuário responsável financeiro já vinculado; não conferir por telefone.

Confirmar participação registra intenção para a ocorrência especificada; não registra Presente/Ausente nem cancela quadra. Mudança de horário/quadra ou cancelamento exige conferir novamente. Lembretes são individuais, às 18h da véspera no fuso America/Sao_Paulo; após 19h não há recuperação daquele lote. Áudios recebidos podem ser ouvidos; envio inicial aceita texto, PNG/JPEG e PDF de até 10 MB. Gravação de voz não faz parte desta versão.

## Configuração da API

| Configuração | Valor inicial / finalidade |
| --- | --- |
| `Messaging__Enabled` | `false`; habilita o worker somente quando a operação for admitida |
| `Messaging__BridgeUrl` | URL privada do transporte, exemplo `http://whatsapp-bridge:8091` |
| `Messaging__BridgeSecret` | Segredo aleatório com pelo menos 32 bytes, igual ao do transporte |
| `Messaging__Ai__Enabled` | `false`; opt-in independente para chamadas de IA |
| `Messaging__Ai__ApiKey` | Credencial própria do ambiente, fora do repositório |
| `Messaging__Ai__Model` | `gpt-6-luna` inicialmente |

Na VM, esses nomes correspondem à seção `Messaging` do `appsettings.Production.json` privado, montado somente leitura na API. Não exportar `BridgeSecret` nem credencial de IA em variáveis de ambiente ou argumentos: seu conteúdo não deve aparecer em `docker inspect`. Manter `Messaging.Enabled=false` e `Messaging.Ai.Enabled=false` durante a primeira conexão.

O worker também respeita `BackgroundJobs__Enabled`. Com serviços desligados, a página permite consultar histórico e preparar mensagens, sem afirmar entrega. **Colocar na fila** grava o envio; mensagens manuais pendentes serão despachadas quando a conexão e o worker forem ativados. Conferir ou cancelar essa fila antes de ativar o serviço. Sem IA configurada, correspondências exatas de respostas aprovadas e confirmações simples funcionam; outras perguntas seguem à equipe. Não há treinamento automático com conversas antigas.

Os endpoints ficam em `/api/v1/messaging`. Leitura exige `messaging:read`; comandos exigem `messaging:operate`; conexão/vínculos/configuração exigem `messaging:manage`. A entrega interna de eventos usa Bearer específico e não aceita cookie de funcionário como autenticação do transporte. Anexos são recuperados autenticados, com `no-store`, e reproduzidos por Blob privado. A CSP permite `media-src 'self' blob:`.

## Transporte e migrations

Leia [README da bridge](../../backend/whatsapp-bridge/README.md) para variáveis, contrato HTTP, compilação e testes. A sessão contém chaves criptográficas. Não expor a porta 8091 nem compartilhar o segredo com o navegador; não copiar sessão para outro processo ativo. Use login distinto para migrar e para executar. A migração EF `MessagingCentral` é aditiva e seu Down recusa histórico existente. A migração sqlstore também é comando explícito, nunca startup.

O arquivo `deploy/google/vm/runtime/compose.whatsapp.yaml` é overlay opcional para a composição da VM, com bridge no profile `whatsapp` e sem porta publicada. A imagem `WHATSAPP_BRIDGE_IMAGE` é identificada por digest. Segredo e conexão não entram em environment: o host prepara JSON privado root:65532, modo 0640, montado somente leitura em `/run/secrets/whatsapp-bridge.json`; a imagem roda como 65532:65532. O único seletor de configuração é `WABRIDGE_CONFIG_FILE`. A API continua usando seu `appsettings.Production.json` privado. Integrar o overlay à operação requer os gates do host, admissão dos dois artefatos e dos schemas, e atualização explícita da unit de inicialização; o YAML isolado não efetua essa integração.

O JSON usa os campos tipados `enabled`, `address`, `secret`, `databaseUrl`, `schema`, `runtimeRole`, `accountId`, `backendUrl` e `backendHost`. Ele é autoritativo: com arquivo configurado, as variáveis antigas `WABRIDGE_*` não alteram valores nem fornecem segredos ausentes. Para a VM, usar `address=0.0.0.0:8091`, `schema=whatsapp_transport`, `runtimeRole=longbeach_whatsapp_bridge`, `accountId=arena`, login distinto `longbeach_whatsapp_runtime` e segredo igual a `Messaging:BridgeSecret` da API. Não gravar seus valores em evidências ou logs.

O runtime inclui `runtime-compose.py` e `longbeach-whatsapp-secrets.service`. A referência numérica ao Secret Manager fica em `/etc/longbeach/whatsapp-bootstrap.json`; o serviço refaz os dois JSON privados após o bootstrap existente, antes dos gates e do start. `runtime.env` contém apenas `WHATSAPP_ENABLED` e a imagem por digest. O [contrato completo do runtime](../../deploy/google/vm/runtime/README.md) descreve a instalação explícita e a admissão dos schemas, da imagem e do login restrito. Transporte ativo com `messagingEnabled=false` permite parear mantendo os envios suspensos.

O callback conecta pela rede privada a `http://api:8080/api/v1/messaging/bridge/events`, mas envia o Host canônico pelo campo `backendHost=api.longbeach.quebranunca.com.br`. Isso preserva o `AllowedHosts` restrito e não altera DNS ou destino TCP. Antes do pareamento, conferir que um evento sintético de conexão recebe HTTP 2xx e sai da fila; saúde HTTP 200 do processo, isoladamente, não prova que o callback passa pela filtragem de Host.

1. Validar localmente builds, testes e migrations em banco descartável, sem sessão real.
2. Na operação hospedada aprovada, aplicar EF com o migrador do LongBeach. Executar `whatsapp-bridge migrate` como job único, usando outro JSON privado com `enabled:false` e conexão do migrador; nunca entregar essa conexão ao serviço contínuo. Conferir `bridge_version=1`, `whatsmeow_version=16`, schema de sessão próprio e login restrito sem acesso às tabelas operacionais.
3. Conferir backup da sessão no banco, papéis, imagens por digest e perfil único ativo. No JSON do transporte, `enabled:true` permite conectar; na API, manter `Messaging:Enabled=false` e `Messaging:Ai:Enabled=false`, e no banco manter bot e ambos os lembretes desligados. Assim pareamento e ingresso de eventos funcionam sem despachar a fila. Conferir ou cancelar todos os envios manuais pendentes antes de habilitar o worker em etapa posterior.
4. Iniciar pelo caminho controlado da unit, com JSON protegido e overlay admitido. Conferir o callback interno; depois usar Gerenciar conexão para o responsável escanear o QR com o celular da arena. QR/chaves não vão para logs ou documentos.
5. Esperar conexão e sincronização concluídas. Testar mensagem individual de contatos autorizados, leitura/anexo e intervenção pelo celular/painel antes de ativar automação.
6. Conferir os vínculos e consentimentos, aprovar conteúdo, testar uma turma e um mensalista, e só então ampliar para cerca de 50 pessoas. Medir IA, latência e memória.

Não apagar/desregistrar a conta ou tentar contornar suspensão. Queda transitória admite reconexão; logout requer pareamento pelo responsável. Sessão substituída, restrição ou perda do lock suspende envios. A integração usa WhatsApp Web de forma não oficial e pode sofrer interrupção/restrição do número.

## Conferência de falhas e retorno

Na fila, mensagens Agendadas/Na fila podem ser canceladas antes de o envio começar. Falha confirmada permite nova tentativa explícita. Conferindo envio preserva o mesmo ID; consultar a operação, sem criar outra mensagem só porque houve timeout. Enviado é reconhecimento do servidor, distinto de Entregue/Lido. Reconexão não dispara histórico nem lembretes vencidos.

Para interromper, pausar o bot e lembretes na gestão, desligar `Messaging__Enabled` e o transporte na operação controlada. Preservar schemas, sessão e histórico. Não iniciar dois processos para ensaiar retorno. Uma restauração antiga pode exigir novo pareamento; nunca reapresentar a fila como mensagens novas. Retornar imagens exige preservar compatibilidade com o schema atual e o gate de release.
