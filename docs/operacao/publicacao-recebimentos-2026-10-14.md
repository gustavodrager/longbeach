# Publicação de recebimentos Bar/Quadra — 14/10/2026

## Escopo e base

Publicação autorizada pelo proprietário para produção e homologação na mesma revisão. A versão candidata incorpora `1a239e89ac10bcf85f085c5fe6a7b91d9a7672be`, já publicado com notas recebidas, e a regra de origem dos recebimentos. A branch é `codex/recebimentos-bar-quadra-20261014`; revisão [PR #33](https://github.com/gustavodrager/longbeach/pull/33), baseada na versão de notas recebidas.

Maquininha PagBank e PagVendas são Bar, inclusive Pix nessas vendas. Pix de aulas, mensalidades e serviços da Quadra em PagBank ou C6 são Quadra. A conta de recebimento é separada da unidade; o cadastro não confirma crédito bancário nem ativa integração C6. Históricos reconhecidos recebem classificação de leitura, preservando payload/hash/fingerprint; fontes sem canal comprovado continuam sem unidade. Não há criação de movimentos financeiros a partir do deploy.

## Isolamento e banco

Não há migration nova para produção em relação à versão de notas. Homologação recebe a migration aditiva `20261014113613_ReceivedInvoices`, com coluna opcional de documento do fornecedor, tabela de notas, índices e proteção do original fiscal. O pré-deploy mantém migration antes do preparo de contas fictícias. `Fiscal__Environment=2` é exclusivo de staging; produção mantém `1` padrão. Banco, contas, credenciais, flags de pagamento e domínios de cada ambiente são preservados.

Não foi criada cópia nova de produção: a publicação não modifica o schema existente nem regrava os históricos. Nenhum backup recorrente ou recurso de backup em nuvem foi configurado.

## Retorno

Preferir retornar somente a interface, conservando a API capaz de preservar os novos metadados em edições antigas. Não executar downgrade das migrations nem restaurar base de homologação sobre produção. A referência anterior de produção é `1a239e8` (API `9c3d890d-22d7-413f-95bd-70fd66841538`, web `cac7a00c-dc05-40d8-9e9f-25ddb89391ad`); staging estava em `d1d3dd8`. Retorno de API exige avaliar a preservação dos campos já cadastrados.

## Verificação e publicação

Artefato: `ee803b7a2300af27f6f43dcc07dc0e194c701194`. [CI 38597949843](https://github.com/gustavodrager/longbeach/actions/runs/38597949843) aprovada: 338 testes frontend, 339 unitários, 296 de integração em PostgreSQL 17 e 18 e 14 conversores, além dos builds e verificações operacionais do pipeline.

Homologação publicada com API `8794ef87-d053-447c-95d9-bc0f0496c5f4` e web `f4409d3e-8c5f-4c66-9002-3730691ebe6b`, ambas SUCCESS. API publicada antes da web. Health da web e opções públicas de autenticação responderam 200; leitura financeira sem sessão respondeu 401.

No Chrome, um único lançamento fictício a receber foi salvo como Pix da Quadra/C6: unidade Quadra, status Pendente. Após recarga, os campos permaneceram. A edição para PagVendas fixou Bar e também persistiu; a opção Maquininha PagBank ficou disponível. O lançamento terminou Cancelado, confirmado por nova recarga, sem pagamento confirmado ou cobrança. Console sem erros. A PWA exigiu usar “Atualizar agora” para carregar a interface nova. Capturas privadas fora do Git.

A classificação depende da origem identificada. EDI sem canal comprovado permanece sem unidade; Pix direto não tem confirmação bancária automática e C6 não foi conectado. PagVendas mantém importação por arquivo. Equalização significa mesma revisão de código com dados/credenciais separados; não representa aprovação de homologação pelo PagBank.

API de produção `b48d5990-4bde-4a3d-ae57-384401e9114d` publicada com sucesso antes da interface. Liveness/readiness responderam 200; acesso Google e cadastro de clientes permaneceram habilitados e login de homologação desabilitado. Configuração, nomes de variáveis e domínios preservados; nenhuma configuração financeira de produção foi habilitada por este deploy.

Web de produção `4684fbae-2e2e-4cf8-b8ab-29e8f26b7dff` publicada com SUCCESS no mesmo commit. Página inicial, health web e readiness da API responderam 200; financeiro sem sessão respondeu 401. Os seis serviços de produção e os três de staging estão online, sem falhas recentes, alertas ou patches pendentes. Serviços auxiliares e PostgreSQL mantiveram os deployments anteriores.

Snapshot Railway sincronizado após a promoção; plano sem divergências. Configurações comparadas antes/depois: somente fonte/commit de API/web e adição de `Fiscal__Environment` na API staging.

No Chrome de produção, entrada Google autorizada concluída e atualização da PWA aplicada. No formulário sem salvar, Pix da Quadra/C6 selecionou Quadra e PagVendas selecionou Bar. Nenhum lançamento de teste foi gravado em produção. O formulário foi descartado sem salvar. A página de notas recebidas carregou os documentos existentes; o histórico de PagVendas apresentou crédito, débito e QR Code classificados como Bar, conservando o aviso de período parcial. Console sem erros ao finalizar. Capturas privadas fora do Git.
