# Implementação global de UX/UI — 04/10/2026

## Escopo entregue

A aplicação existente recebeu a marca vetorial oficial, Manrope local, cores do manual e navegação por perfil. A identidade alcança login, conta, atendimento, cliente por QR, administração, PWA e recursos Android/iOS. Atendimento tem quatro caminhos fixos; gestão apresenta somente as áreas autorizadas.

| Área | Fluxo implementado |
| --- | --- |
| Atendimento e cliente | Catálogo, conferência, comandas, pedidos solicitados/aceitos/recusados/entregues, pagamentos por valor, comprovante, QR com expiração e revogação |
| Caixa | Caixa individual, abertura, entrada/retirada, fechamento e encaminhamento de diferença à supervisão |
| Gestão do bar | Indicador → lista paginada → comanda, pagamento, caixa ou movimento de estoque; período e atualização identificados |
| Produtos preparados | Receitas versionadas, rendimento e conversão de ingredientes; consumo conserva a versão aceita e entrega usa seu snapshot |
| Agenda e recepção | Quadras, reservas, bloqueios, chegada, grupos semanais finitos e capacidade compartilhada com aulas |
| Escola | Alunos, turmas, matrículas, presença, mensalidades com competência e origem própria |
| Financeiro operacional | Contas a receber/pagar, recebimentos e despesas registrados, previsão e links para origem em Escola, Locação ou Bar |
| Equipe e infraestrutura | Fichas de pessoas, materiais da arena, projetos/tarefas e manutenção com responsável e pendências |

Consumo, recebimento confirmado, dinheiro físico e saldo bancário não são intercambiáveis. O cadastro antigo de aluno não comprova mensalidade paga. Taxas sem conciliação e saldo bancário sem extrato aparecem como ainda não disponíveis. Vendas históricas são consultadas separadamente das novas comandas.

## Ensaio local integrado

O ensaio usa apenas contas e registros fictícios, PostgreSQL 17 local e API autenticada. Nenhum dado de produção foi importado ou alterado.

| Cenário | Evidência observada |
| --- | --- |
| Venda e pagamento parcial | Duas águas totalizaram R$ 10; recebimento de R$ 6 com R$ 10 entregues mostrou troco de R$ 4 e comprovante do pagamento específico |
| Pedido QR | Suco solicitado não entrou no total; após aceitar e entregar, consumo passou a R$ 19, recebido R$ 6 e saldo R$ 13 |
| Estoque | Entrega baixou água de 20 para 18 e suco de 20 para 19; pagamento não repetiu a baixa |
| Caixa | R$ 106 esperados, R$ 105 contados, diferença de −R$ 1 com motivo; a comanda permaneceu aberta após fechar o caixa |
| QR revogado | Após encerrar o acesso e consultar novamente, apareceu somente a mensagem de acesso indisponível, sem dados previamente carregados |
| Indicador e registro | Recebimentos de R$ 6 abriram a lista, o pagamento original e a comanda; retorno preservou o indicador |
| Capacidade | Reserva de 1 hora e aula de 1 hora compuseram a disponibilidade de 13 horas na quadra com funcionamento de 15 horas |
| Grupos semanais | Três domingos de 18h a 19h foram criados juntos; a lista filtrada e a ficha mostram os três vínculos, o retorno e o acesso às cobranças por ocorrência |
| Receita | Primeira versão fictícia registrada pela interface; uma nova comanda de R$ 9 conservou o link para a versão 1. A entrega retirou 1 água como ingrediente (18 → 17) e conservou o estoque próprio do suco em 19 |
| Gestão | Fichas de aluno/equipe, origem da cobrança de locação, materiais, manutenção e tarefa de projeto conferidos no navegador; conclusão da tarefa confirmada pela API |

Os valores acima identificam cada passo do ensaio, não um extrato de produção. Os registros antigos do próprio ensaio não foram recalculados ao cadastrar a receita.

Evidências visuais do sistema conectado à API: [gestão da arena](implantacao-gestao.jpg) e [entrega com receita aceita](implantacao-atendimento.jpg). Após cadastrar o grupo, a visão geral mostrou duas reservas no dia e 12 horas disponíveis; após o segundo pedido, mostrou R$ 28 de consumo e R$ 6 recebidos.

## Verificação automática final

| Verificação | Resultado |
| --- | --- |
| Interface React | 109 testes aprovados em 9 arquivos |
| Servidor em Release | 184 testes aprovados: 76 unitários e 108 de integração; nenhum ignorado |
| PostgreSQL 17 | Migrations da baseline e aditivas, entrega única, receita/conversão congeladas, grupos atômicos, concorrência, permissões por objeto e replay verificados |
| Pix controlado | Entrada inválida sem alocação retorna 400; falha externa após intenção persistida retorna 502 e mantém parcela; repetição recupera a mesma cobrança |
| Builds | TypeScript, PWA e publicação local da API Release concluídos |
| Recursos nativos | 30 imagens da identidade oficial exportadas; bundle final sincronizado em Android e iOS |

A checagem NuGet durante o build emitiu `NU1900` por restrição de rede. Na preparação da publicação, a consulta autorizada a `api.nuget.org` verificou os sete projetos com dependências transitivas, sem vulnerabilidades conhecidas. `pnpm audit --prod` verificou 17 dependências de produção, também sem avisos. Nenhum pacote foi alterado nessa checagem.

## Promoção hospedada

A implementação e o ensaio local, isoladamente, não publicam a versão em produção. Após aprovação explícita do responsável, a promoção usa o upload direto aos serviços standalone existentes, como na [publicação anterior](../bar/publicacao-2026-10-03.md). O checkout está sem remote Git; o commit local revisado e os digests/deployments Railway identificam os artefatos. Não vincular o checkout automaticamente ao repositório dos outros serviços.

A publicação aprovada de 04/10/2026 foi concluída nos serviços oficiais, com migrations e smoke de leitura verificados. Commit, digests, backup, acesso e limites estão registrados em [publicacao-ux-2026-10-04.md](publicacao-ux-2026-10-04.md).

Aplicar as migrations aditivas por um único job controlado, incluindo a verificação de caixas abertos duplicados descrita no [runbook do bar](../bar/comandas-operacao-e-migracao.md). Preservar dados históricos e rollback de aplicação compatível com o schema. Não executar migrations destrutivas para retornar a interface.

Antes de qualquer mudança Railway, seguir [deploy-railway-production.md](deploy-railway-production.md): obter o estado live com `railway config pull`, revisar drift, variáveis públicas, origens CORS e fase dos domínios. O snapshot local não prova o estado live. Produção deve usar `VITE_DEMO_MODE=false`, `VITE_OPERATIONAL_STORAGE=postgres`, a URL pública correta da API e o Google client ID do ambiente quando esse login estiver habilitado. O modo público operacional é ignorado em Production.

O build mobile deve incorporar a URL da API da trilha antes da sincronização. A sincronização local verifica a cópia dos recursos; não comprova conectividade de dispositivo ou geração de pacote assinado.

O build final local incorporou `https://api.longbeach.quebranunca.com.br` como URL pública, modo de demonstração desativado e persistência PostgreSQL. Essa configuração foi copiada aos projetos Capacitor. Isso prepara os recursos para o aplicativo e não envia dados à API de produção durante a compilação.

## Validações restantes para liberar operação real

- Aplicar e ensaiar o artefato exato em staging, com configuração e contas próprias; reconciliar importação real pelo processo de staging autorizado.
- Homologar Pix PagBank, webhook, recuperação de interrupção e estorno com credenciais do ambiente. Os testes automatizados de confirmação usam provedores controlados.
- Executar o roteiro com cinco atendentes representativos e registrar resultados. Nenhum participante foi presumido como aprovado.
- Compilar e testar Android/iOS no dispositivo e toolchain apropriados. Android SDK e Xcode completo não estavam disponíveis neste ambiente; não foi produzido APK/IPA assinado.

Os novos módulos da arena ainda consultam snapshots dos cadastros autorizados. A limitação de volume e vazão está explícita no [ADR-005](../adr/ADR-005-arena-registros-tipados-e-persistencia-autorizada.md); as consultas administrativas de comandas já são paginadas no servidor.
