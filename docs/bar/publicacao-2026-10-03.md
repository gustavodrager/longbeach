# Publicação do Bar — 3 de outubro de 2026

Publicação autorizada pelo responsável nesta conversa. Projeto Railway existente: longbeach-os (b88a93d7-6964-4ac5-9590-7cef49598cf0), ambiente production. Nenhum serviço, banco, domínio ou repositório novo foi criado.

## Artefatos publicados

- API: commit 1ca30a7, deployment 05c3e3b7-176d-4532-bed4-e5d11af1c136, SUCCESS, digest sha256:0e70671543814a9629ded55693fe24547823c4ac1cd9583aa3cbbf248522d42c.
- Web: commit 3a00451, deployment e07f30cc-deea-432d-902c-960dbb604725, SUCCESS, digest sha256:5a98920d2759b73bd0f086b057552f12865b6682b29ee825d7f866b8922f1acd.
- As alterações entre os dois commits são somente documentação e VITE_DEMO_MODE=false na configuração web.

## Verificações

- Job único --migrate-only aplicou as 11 migrations do Bar e informou conclusão com sucesso no PostgreSQL existente.
- API /health/live e /health/ready: HTTP 200.
- Catálogo, saldos e vendas do Bar sem autenticação: HTTP 401.
- Web oficial e preview /healthz: HTTP 200; /bar servido com HTTP 200.
- Bundle oficial atualizado para /assets/index-D9p87wav.js.
- Navegador restaurou a sessão existente do Owner, abriu PDV, cadastro de produtos e estoque; os locais Almoxarifado e Bar carregaram do servidor. Indicadores também carregaram com valores zerados e sem erros no console. Nenhuma venda, cadastro ou movimento de teste foi gravado em produção.
- Amostra de 200 linhas dos logs da API: 11 migrations aplicadas e zero entradas Error. Permanecem avisos de Data Protection sem persistência/encryptor; não houve mudança desse comportamento nesta publicação.

## Acesso e limites

https://longbeach.quebranunca.com.br/bar — exige usuário existente com permissões do Bar. A web usa VITE_DEMO_MODE=false. O backend mantém a configuração anterior de demonstração dos endpoints genéricos de operações; essa exceção não abrange o Bar.

PagBank permanece desativado por padrão. Publicação não equivale a homologação de pagamentos ou validação de fluxos financeiros com dados reais. Catálogo e contagem física ainda devem ser cadastrados antes da primeira abertura/venda.

Os endereços e demais serviços Railway foram preservados. Nenhum config apply foi executado; o arquivo IaC ainda precisa ser reconciliado com todos os bindings e serviços live antes de um futuro apply de projeto inteiro.

Rollback: usar os deployments anteriores registrados no Railway; preservar as tabelas aditivas e não executar Down nem apagar dados confirmados. Publicação feita por upload direto pois este repositório local não possui remote Git configurado.
