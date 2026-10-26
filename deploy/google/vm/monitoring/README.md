# Monitor mínimo da VM LongBeach

Preparação para instalação **depois do corte**, com domínio/TLS público e backups conferidos. Este diretório é separado do bundle congelado; não modifica o bootstrap, PostgreSQL, API, Caddy ou credenciais. Não instala Ops Agent, pacote Python, SDK nem chave de conta de serviço.

`emit.py` roda uma vez por minuto no host e envia um único ponto `0` ou `1` de `custom.googleapis.com/longbeach/vm/operational_ok`. As condições para `1` são API pronta em HTTPS loopback, disco de dados montado, discos de dados/boot abaixo de85%, último check de backup com até10min, full com até26h, WAL aprovado nesse check e nenhuma falha posterior ao sucesso. A margem de10min acompanha o timer de backup de5min; um full demorado pode produzir alerta conservador até o próximo check. O monitor não executa backup nem SQL e não prova restauração recente ou sete dias completos de histórico.

O HTTPS conecta somente a127.0.0.1:443, com Host/SNI canônico e CA pública do sistema. Não segue redirect nem aceita certificado fictício. Usa o recibo `last-success.json`, que já traz o full mais recente consultado pelo runner; não exige novo full só para alimentar o monitor. O journald recebe somente nomes fixos de checks e booleanos. O Cloud Monitoring recebe apenas o bit e timestamp, sem logs, dados de clientes, e-mail, segredos ou labels variáveis.

O único papel novo da VM é `roles/monitoring.metricWriter`, no projeto exato e no principal de `metric-writer.tf.example`. Ele permite enviar métricas; o exemplo é deliberadamente inativo até ser integrado ao root Terraform e revisado. Não conceder Monitoring Editor à VM. O acesso usa o token temporário do Metadata Server, somente na memória. API/Caddy continuam bloqueados no acesso HTTP à metadata. [Permissões oficiais](https://docs.cloud.google.com/iam/docs/roles-permissions/monitoring#monitoring.metricWriter), [API de escrita](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.timeSeries/create).

Há uma política para `0` persistente por2min **ou** ausência por10min e outra para falha HTTPS externa em pelo menos2localizações por2min. A métrica usa resource `global`, vinculado ao projeto, para não depender do estado de vida de um recurso GCE. A ausência só começa a funcionar depois de um ponto emitido após criar/alterar a política. O uptime externo cobre também DNS, certificado e queda da VM. [Ausência](https://docs.cloud.google.com/monitoring/alerts/metric-absence), [uptime e alertas](https://docs.cloud.google.com/monitoring/uptime-checks/uptime-alerting-policies).

## Plano de instalação do operador

1. Conferir corte, TLS, backup final e `run.py check` aprovado. Integrar somente o binding IAM do exemplo e revisar um plano sem alterações de VM/discos. Habilitar a API Monitoring caso esteja desativada.
2. Renderizar os corpos REST com `render.py --email EMAIL_AUTORIZADO --out PASTA_PRIVADA_NOVA`. O e-mail real fica apenas nessa pasta0600, fora do código. Criar/conferir o canal e sua entrega, o descriptor da métrica e o uptime check. O renderer não envia nada. Os arquivos de política ficam desativados enquanto os IDs não forem fornecidos.
3. Renderizar novamente em outra pasta nova com `--notification-channel projects/parsero-prod-20261022/notificationChannels/ID --uptime-check-id ID_REAL`. Conferir filtros/IDs/e-mail e criar as duas políticas. O uptime usa somente GET anônimo de `/health/ready`, SSL validado,3localizações e nenhum log de respostas.
4. Copiar `emit.py` para `/opt/longbeach/monitoring/emit.py` (root:root0644, diretório0750) e as duas units para `/etc/systemd/system` (root:root0644). Rodar `systemd-analyze verify`, `python3 -I -B /opt/longbeach/monitoring/emit.py --check-local` e conferir tudo verde. Em seguida, `systemctl daemon-reload`, `systemctl enable --now longbeach-monitor.timer` e `systemctl start longbeach-monitor.service`. Isto não reinicia a aplicação. A unit limita o emissor a64MiB e10% de uma CPU.
5. Conferir um ponto `1` depois da criação das políticas, check público aprovado e canal funcionando. Para testar ausência sem afetar aplicação/backups, combinar um teste controlado que pare apenas o timer do monitor por mais de10min e o reative; confirmar o alerta recebido e a recuperação. Não encher discos nem interromper WAL/backups para testar. Até validar a entrega, não registrar os alertas como conferidos. Incidentes notificados seguem as mudanças de estado; não há mensagens periódicas de rotina.

Falha ao publicar gera saída fixa sem detalhes do token; a política de ausência é o caminho de aviso. Falha parcial do Google/email ou da própria Internet pode atrasar alertas. O uptime e o heartbeat usam Cloud Monitoring e o mesmo canal, portanto não constituem dois provedores independentes.

## Custo e validação local

Em30dias, o gauge de1min gera43.200pontos escalares:345.600bytes, cerca de0,33MiB. Um check de1min em3localizações gera cerca de129.600execuções. A tabela consultada em26/10/2026 informa150MiB gratuitos por conta de cobrança para ingestão,1milhão de execuções de uptime gratuitas por projeto e escrita da API sem cobrança. Este acréscimo cabe nessas franquias quando disponíveis; conferir uso agregado e faturamento, sem prometer custo zero. A cobrança de referências de métricas em alertas está anunciada para01/09/2027. [Preço oficial](https://cloud.google.com/products/observability/pricing).

```sh
python3 -B -m unittest discover -s deploy/google/vm/monitoring -p test_monitor.py
python3 -B deploy/google/vm/monitoring/emit.py
```

O segundo comando apenas descreve. `--check-local` consulta o host; `--send` é o único modo que obtém token e escreve a métrica. Os testes usam dados/transportes sintéticos e não fazem requisições.
