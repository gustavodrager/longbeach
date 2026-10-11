# Fechamento da rodada local — 10/10/2026

Status: cenários locais descritos abaixo aprovados; homologação externa PagBank e aceite humano pendentes. Não é autorização de produção.

## Escopo e ambiente

História: gestão cadastra um grupo → API confirma encontros mensais → agenda mostra ocupação e participantes → presença e consumo do bar persistem → mensalidade permanece separada do consumo. Em paralelo, um evento ocupa a quadra por bloqueio e seu cancelamento devolve o horário à disponibilidade.

Interface `http://localhost:5321`, API `http://localhost:5320`, PostgreSQL da prévia na porta 55439. Somente dados fictícios foram criados nesta rodada, usando a sessão administrativa já autorizada. Não foram alteradas contas reais, papéis, configurações Google, produção ou regras comerciais. Nenhuma cobrança externa, publicação, túnel ou envio ao repositório.

## Evidências da operação

| Cenário | Resultado observado |
| --- | --- |
| Grupo mensalista | Grupo fictício com vigência em 01/10/2026, quintas 20h–22h, um integrante e acordo mensal de R$ 400. |
| Quinto encontro pendente | Outubro apresentou 01, 08, 15, 22 e 29/10; total “A combinar”, com aviso sobre o quinto encontro e opção de cobrança desabilitada. |
| Geração sem cobrança | Cinco encontros confirmados no navegador e no banco; outubro permaneceu sem cobrança. A geração de datas passadas exibiu aviso e não marcou presença/pagamento. |
| Presença | Presença fictícia de 01/10 salva e mantida após recarregar. Seleção de 15/10 deixou o controle de presença desabilitado. |
| Geração com mensalidade | Novembro apresentou quatro encontros; opção de cobrança começou desmarcada. Confirmação explícita gerou quatro reservas e uma única mensalidade de R$ 400, vencimento 15/11, situação Pendente. |
| Agenda semanal | Encontro classificado como Mensalista; painel mostrou 1 encontro / 2 h. Detalhe exibiu responsável e participante registrado no mês, sem cobrança. |
| Conflito de evento | Tentativa de bloqueio em 15/10 20h–22h, sobre o mensalista, foi rejeitada com mensagem de horário ocupado. Nenhum bloqueio conflitante persistiu. |
| Bloqueio em data livre | Bloqueio fictício em 16/10 20h–22h aceito; dia exibiu livre 06h–20h e 22h–24h. Semana de 12–18/10: 119 h livres, 7 h ocupadas, incluindo 2 h de bloqueio. |
| Cancelamento | Evento cancelado pela ficha; registro preservado. Dia voltou a livre 06h–24h; semana passou a 121 h livres e 5 h ocupadas. |
| Consumo do grupo | Comanda fictícia #2, já encerrada na rodada anterior, vinculada ao encontro de 01/10. Painel exibiu R$ 10 de consumo, R$ 10 recebidos e saldo zero; nenhum novo pagamento foi registrado. |
| Celular | Ficha e agenda verificadas em viewport 390 × 844; cabeçalho também em 320 × 740. Após correção, sem transbordamento horizontal. Não equivale a teste em aparelho real. |
| Teclado | Menu móvel abriu com foco no botão de fechar; Escape fechou e devolveu o foco ao Menu. Edição de datas por teclado persistiu. |
| Saúde | API `/health/ready` = Healthy. Coletor do navegador sem erros/avisos na inspeção final. |

Banco final da prévia: dois meses, nove reservas de mensalistas, uma presença, um vínculo de comanda, uma cobrança fictícia de R$ 400 pendente e um evento cancelado. Dados anteriores preservados. Capturas estão na pasta de entregas, fora do Git.

## Correções e regressão

- `app/src/styles.css`: a marca do cabeçalho móvel agora pode encolher, mantendo os botões visíveis. Antes, o conteúdo chegava a 409 px em viewport de 390 px; depois ficou contido, inclusive em 320 px. Não se ocultou o excesso com corte de conteúdo.
- Fixture de `GoogleClientRegistrationTests`: registros operacionais fictícios agora incluem `id` e `name` no payload, como os cadastros persistidos pela API. A ausência de `id` fazia dois testes de importação falharem quando a suíte rodava inteira. Nenhuma falha correspondente foi encontrada nos dados gerados pela aplicação.
- `scripts/verificar-pagbank.py`: consulta da chave de notificações alinhada ao endpoint `public-keys?type=webhook`, já usado pelo adaptador e pela documentação oficial. O verificador recusou a configuração sem credencial, sem chamar o provedor. A consulta autenticada ainda depende do token.

Regressão final: **709 testes aprovados, zero falhas e zero ignorados** — 191 unitários, 252 de integração e 266 da interface. API compilada na execução dos testes; build web/PWA aprovado. Backend repetido em `longbeach_acceptance_remaining_v2_test`, separado da prévia, após corrigir a fixture. `git diff --check` sem problemas. Não foram repetidos os testes da interface após o ajuste exclusivamente CSS; a correção visual foi conferida no navegador e pelo build.

## Limites de eventos

O produto atual não tem módulo específico de eventos. Esta rodada aprova somente ocupação por reserva/bloqueio, conflito, detalhe e cancelamento. Inscrições, participantes, ingressos, capacidade de evento, chaves de torneio e pagamentos de inscrições não foram implementados nem homologados. Definir essas necessidades com a gestão antes de criar um módulo adicional; um bloqueio não deve ser apresentado como evento completo.

## PagBank: preparação concluída, ensaio externo bloqueado

Inspeção restrita à configuração de homologação e aos caminhos conhecidos do projeto: tokens de Pedidos e Recorrência ausentes; URL e chave pública de notificação ausentes; flags de pagamentos desligadas. Nenhum segredo foi exibido ou procurado indiscriminadamente no computador.

Os testes da suíte usam provedores simulados. Não resolvem os resultados históricos do sandbox: repetição Pix com HTTP 500, estorno de cartão pendente e notificações sem assinatura. Para repetir, é necessário localizar as credenciais próprias da Long Beach, verificar autenticação e executar a sequência de `proxima-rodada-google-pagbank.md`. A entrega real de notificações ao computador requer endereço HTTPS acessível; eventual túnel temporário continua sujeito à aprovação específica anterior.

Referências oficiais reconferidas: [ambientes e Sandbox](https://developer.pagbank.com.br/docs/ambientes-disponiveis), [assinatura das notificações](https://developer.pagbank.com.br/reference/validacao-de-autenticidade) e [autenticação de Recorrência](https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes). Preservar a validação de assinatura e a consulta autoritativa antes da baixa financeira.

## Itens que dependem do responsável

| Item | Entrada necessária | Aceite |
| --- | --- | --- |
| Outras contas da equipe | E-mail Google e perfil autorizado de cada proprietário, professor e atendente. | Cada pessoa entra com sua própria conta, abre a área correta e confirma as restrições. Não assumir a identidade de terceiros. |
| PagBank externo | Localização privada das credenciais sandbox de Pedidos e Recorrência. | Pix/cartão, pendências, retomada, estorno e ciclos verificados contra o provedor; assinatura e entrega de notificações comprovadas. |
| Aparelhos reais | Acesso aos celulares usados na operação. | Entrar pelo Google, abrir agenda e detalhes, operar presença/atendimento, verificar toque, teclado e reconexão. |
| Aceite da gestão | Revisão humana das regras de funcionamento, quinto encontro, mensalidades e permissões. | Responsáveis aprovam os cenários e registram eventuais ajustes. Testes automatizados não dão esse aceite em nome da equipe. |
| Produção | Aprovação específica de envio/publicação, após as pendências anteriores. | Cliente Google do domínio real, configuração de pagamentos aprovada e plano de retorno revisado. |

As solicitações de localização das credenciais e definição das contas foram apresentadas nesta rodada; nenhuma resposta foi presumida.
