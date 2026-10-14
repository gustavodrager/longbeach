# Notas recebidas — importação de XML

Preparado para publicação em 14/10/2026 sobre a versão financeira em produção. Decisão: [ADR-011](../adr/ADR-011-notas-recebidas.md).

## Uso

1. Em **Financeiro → Notas recebidas**, abra a caixa geral da Arena (`/notas-recebidas`). O endereço antigo `/bar/notas-recebidas` redireciona para a caixa geral.
2. Selecione o XML processado da NF-e fornecido pelo emitente (até 2 MiB). Confira o destinatário, fornecedor, itens e valores na prévia; a prévia não grava a nota.
3. Clique em **Salvar nota para conferência**. O arquivo original fica preservado para consulta/download. Reimportar o mesmo arquivo não cria duplicata; outro conteúdo para a mesma chave é recusado.
4. Salve a finalidade: **Mercadorias do bar**, **Materiais de consumo**, **Equipamentos e patrimônio**, **Manutenção e melhorias**, **Outras compras e despesas** ou **Compra mista**. Toda nota nova começa **A classificar**. Filtre a lista por finalidade quando necessário. A classificação é auditada, pode ser corrigida antes de gerar uma compra e não altera o XML. Notas mistas permanecem para separação/conferência dos itens; não geram uma compra integral do bar.
5. Somente nas notas classificadas como mercadorias do bar, selecione o fornecedor existente ou identifique/cadastre pelo documento do emitente. Associe cada linha a um produto e informe a quantidade na unidade de compra do cadastro. Confira a conversão mostrada para o estoque e marque a confirmação.
6. **Criar compra conferida** cria uma compra com pagamento pendente, vinculada à nota. Abra a compra para informar o pagamento e registrar o recebimento pelo fluxo existente. Importar e gerar a compra não movimentam estoque nem registram pagamento.

A caixa geral exige `fiscal:invoices:manage` e primeiro acesso concluído. A permissão pertence por padrão à gestão (Owner, Administrator e Manager), sem ampliar o acesso dos perfis exclusivos do bar. Consultar opções e gerar uma compra do bar exige também `bar:purchases:manage`. Depois de atualizar o catálogo, renovar a sessão para obter as permissões atuais. O cadastro do fornecedor ganha CPF/CNPJ apenas após a conferência; documentos conflitantes são recusados.

## Escopo e limites

- NF-e modelo 55, XML `nfeProc` versão 4.00, com protocolo declarado de autorização (cStat 100/150). PDF/DANFE, NFC-e, NFS-e e XML de eventos não são suportados.
- O leitor confere estrutura necessária, chave, identidade, destinatário, ambiente e consistência dos valores. Não executa validação completa por XSD, verificação criptográfica da assinatura ou consulta do estado atual na SEFAZ. A tela informa isso explicitamente. Um protocolo escrito no arquivo não prova autenticidade nem ausência de cancelamento posterior.
- Composições fiscais não suportadas, divergências, notas especiais e notas com mais de 100 itens podem ser guardadas para consulta, mas não gerar compra neste fluxo. Notas com vários itens e frete/desconto ficam bloqueadas até existir rateio que preserve o valor por item.
- Cada linha precisa corresponder a um produto distinto que controle estoque, ativo e com a mesma versão apresentada na conferência. Se o cadastro mudar, recarregue a página. Não há correspondência automática por nome/código nem cadastro automático de produtos.
- Equipamentos, materiais, manutenção e demais despesas podem ter suas NF-e importadas e classificadas nesta caixa geral. Seus lançamentos financeiros, entradas de materiais e registros patrimoniais seguem os controles correspondentes, ainda sem geração automática a partir da nota. NFS-e de serviços exige outro leitor/conector; não confundir finalidade de compra com modelo fiscal do documento.
- Esta entrega não consulta a SEFAZ, não envia manifestação do destinatário e não configura certificado. Captura automática e acompanhamento de cancelamentos serão uma etapa posterior.

## Configuração e publicação

`Fiscal__RecipientCnpj=52247131000171` e `Fiscal__Environment=1` são os valores de operação para a Arena (já definidos em appsettings). Ambiente 2 é exclusivo de homologação, com banco separado. Não misturar documentos de teste com compras reais. O XML precisa corresponder ao ambiente configurado.

Aplicar `20261014113613_ReceivedInvoices` pelo job único de pré-publicação, após backup. A migration consolidada cria `received_invoices`, documento opcional único dos fornecedores, finalidade, versão de conferência e proteção de imutabilidade. As migrations locais anteriores de notas não foram publicadas e não fazem parte desta entrega. A base é a versão financeira vigente, sem a alteração local de estoque de materiais. Reclassificação após vínculo com compra é bloqueada.

Os XMLs ficam em `bytea` no PostgreSQL, junto do resumo em `jsonb`, hash SHA-256, autor e vínculo de compra. Incluir esse conteúdo nos backups e no controle de acesso ao banco. A auditoria da nota guarda identificadores/hash e vínculo, sem XML ou detalhes dos itens.

Rollback preferencial: reverter o artefato da aplicação e manter a migration aditiva e os documentos. Não executar `Down` em uma base com notas reais: ele remove a tabela e seus arquivos. Antes de qualquer remoção, preservar backup verificável e decidir a retenção.

## Verificação executada

- 18 testes unitários do leitor e 26 testes de integração de notas, autorização e compras passaram em PostgreSQL descartável.
- 23 testes da interface passaram; compilação TypeScript e build de produção concluídos.
- A identificação do autor na auditoria aceita o claim `sub` utilizado pela autenticação vigente.
- Backup de produção anterior à publicação foi baixado e conferido por SHA-256; os dados permanecem fora do repositório.

## Próxima etapa: captura direta

Preparar um adaptador separado de entrada que use a distribuição de DF-e e entregue documentos completos à mesma caixa de conferência. Antes de implementar, verificar documentação técnica vigente, habilitação do destinatário, certificado, limites de consulta e regras de manifestação. Persistir cursor de distribuição, tentativas e eventos de forma separada do documento original. Resumos recebidos não devem ser tratados como XML completo de itens. A política de manifestação exige definição explícita com a operação/contador; não confirmar compras automaticamente.

Certificado e senha devem ficar em armazenamento de segredos do servidor, nunca no frontend, repositório, logs ou chat. A validação de autenticidade e o estado consultado devem ser registrados separadamente da inspeção local, com data e origem da evidência.

