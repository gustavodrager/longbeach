# Catálogo interno do Bar e histórico PagVendas

## Regra atual preparada em 19/10/2026

O Long Beach é a fonte oficial do catálogo, preços e estoque. Cadastre produtos em Bar → Produtos: nome, preço e unidade são os campos principais; código automático e categoria opcional ficam em Mais opções. A categoria ausente usa Sem categoria.

A aplicação de catálogo PagVendas está desativada: a interface só permite consultar lotes e o endpoint `/api/v1/imports/{id}/bar-catalog/apply` rejeita novas aplicações. Nenhum produto, código PV, preço, saldo ou referência histórica é removido. O serviço de prévia continua comparando lotes antigos para consulta. A prévia devolve `canApply: false`, inclusive para clientes antigos.

O catálogo original foi cadastrado pelo painel em 05/10/2026: 100 produtos e sete categorias, incluindo Sem categoria. Essa informação é histórica, não uma instrução para reaplicar o lote. O arquivo de origem e as evidências permanecem fora do Git.

Consultas financeiras, EDI e arquivos de observações ficam separados das vendas e movimentações internas. Não há conciliação automática por valor nem duplicação de recebimentos a partir do extrato. A entrada em operação exige inventário físico regular, com a revisão atual do sistema.

### Fotos dos produtos

A exportação XLSX observada não contém fotos nem URLs. Não foi localizado endpoint público documentado de consulta das fotos do catálogo PagVendas. A integração de Facebook e Instagram disponibiliza um feed em Loja Online > Configurações > Integrações; a presença e cobertura das imagens da Long Beach nesse feed ainda precisam ser verificadas na conta. O campo `items.image_url` da API de Checkout recebe uma URL fornecida pelo vendedor e não consulta fotos do PagVendas. O cadastro mantém as fotos existentes e não inventa imagens para produtos sem foto.

Em 05/10/2026, a lista autenticada com os 100 produtos revelou 78 fotos e 22 produtos sem foto. As imagens usam o CDN `https://cdn.pagvendas.pagseguro.uol.com.br/images/product/<uuid>?lastUpdate=<timestamp>`. Foram baixados os 78 arquivos observados, sem falhas, e guardados localmente com código PV, SHA-256 e mapeamento de origem, fora do Git. Isso identifica recursos de imagem usados pelo painel; não confirma uma API administrativa pública nem permite descobrir os UUIDs apenas pelo código do produto.

As 78 URLs foram associadas aos produtos correspondentes pelo painel Owner do Long Beach OS, sem substituir fotos anteriores. Após recarregar, o atendimento apresentou 100 produtos, 78 com URLs iguais às originais e 22 sem imagem, sem divergências; a tabela de nomes, preços, custos e situação permaneceu igual. As fotos atualmente dependem do CDN PagVendas. As cópias locais permitem uma futura migração para storage próprio com atualização das URLs, que ainda não foi realizada.

## Verificar a conexão

Configurar as variáveis `Payments__PagBank__BaseUrl`, `Payments__PagBank__Token`, `Payments__PagBank__WebhookPublicKey`, `Payments__PagBank__WebhookUrl` e `Payments__PagBank__Enabled` na plataforma de secrets do ambiente. Nunca enviar tokens ao frontend. A API .NET recebe essas variáveis pelo ambiente; não carrega arquivos `.env` automaticamente.

Para diagnóstico local, guardar as mesmas chaves em `.env.pagbank.local`, ignorado pelo Git, com permissão 600. `python3 scripts/verificar-pagbank.py` faz duas consultas autenticadas de leitura: `/public-keys/card` e `/public-keys/webhook`. Exibe somente ambiente, status HTTP e resultado da validação. Não cria pedidos, chaves ou cobranças. `--save-webhook-key` guarda a chave pública validada no mesmo arquivo, somente em sandbox. Não ativa pagamentos.

Em 05/10/2026 ambas as consultas sandbox retornaram HTTP 200. A chave de webhook foi identificada como ECDSA, compatível com o verificador existente. O guia de assinatura mostra `/public-keys?type=webhook`, mas essa URL retornou HTTP 403 na conta testada; a referência do endpoint usa `/public-keys/{type}` e a URL `/public-keys/webhook` respondeu corretamente. Não trocar a chave ECDSA por uma chave RSA de cartão.

Produção continua dependendo do token da própria conta, chave e assinatura do ambiente correspondente, URL HTTPS da API, homologação dos fluxos de pagamento e promoção aprovada do artefato. Consultar o token existente: gerar outro pode invalidar integrações em uso. Sandbox e produção não compartilham chaves de webhook. Validar criação, consulta, repetição, expiração e estorno conforme o runbook do Bar antes de habilitar.

## Referências oficiais

- [Consultar chave pública](https://developer.pagbank.com.br/reference/consultar-chave-publica).
- [Validar assinatura de notificações](https://developer.pagbank.com.br/reference/validacao-de-autenticidade).
- [Pix na API Orders](https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2).
- [Feed da Loja Online](https://faq.pagbank.com.br/duvida/como-criar-e-inserir-produtos-no-catalogo-do-facebook-para-vender-com-a-loja-online-do-pagvendas/2001).
- [Imagens no objeto Checkout](https://developer.pagbank.com.br/reference/objeto-checkout).
