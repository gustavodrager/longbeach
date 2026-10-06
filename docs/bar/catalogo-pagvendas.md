# Catálogo PagVendas e conexão PagBank

O catálogo pertence ao Bar do Long Beach OS. PagVendas fornece a origem do arquivo; PagBank Orders fornece pagamentos. Não existe dependência de runtime com outro produto.

## Preparar e conferir produtos

1. No PagVendas, abrir Cadastros > Produtos, selecionar uma quantidade por página suficiente para incluir todo o catálogo e baixar todos os produtos. Conferir a quantidade: a exportação observada respeita o filtro de página.
2. Executar `python3 scripts/preparar-catalogo-pagvendas.py /caminho/produtos.xlsx /caminho/catalogo.json`. O conversor usa apenas a biblioteca padrão, valida o cabeçalho e os valores monetários, mantém linha original, código externo e SHA-256 do XLSX. Não estima estoque nem gera fotos.
3. Entrar como Owner no Long Beach OS e enviar o JSON em Importações. Conferir o nome, hash e total do lote registrado.
4. Usar **Conferir produtos do bar**. O backend aceita somente produtos PagVendas da Long Beach, referências coerentes, moeda BRL e códigos únicos. Outros lotes permanecem nos fluxos próprios de revisão.
5. Revisar a tabela antes de **Aplicar catálogo conferido**. O token de conferência vincula a aplicação ao estado do catálogo, incluindo versões e divergências. Alteração concorrente exige nova conferência. Estoque, pagamentos e saldos não são lançados por esse fluxo.

Os produtos recebem GUID próprio e código interno `PV-<código PagVendas>`. Os produtos já existentes com mesmo nome, preço e categoria são reconciliados sem alteração. Custos calculados, fornecedor, unidades, foto, código de barras, receitas, favoritos, atividade e configuração de estoque locais são preservados. Diferença de nome, preço ou categoria bloqueia o lote: revisar o cadastro e conferir novamente. Não há sobrescrita automática de preços ou custos existentes.

Aplicação e auditoria são atômicas. O lote e as linhas passam para Applied somente após sucesso; repetir não duplica produtos. O fluxo usa as tabelas existentes de staging e o catálogo existente, sem migration nova. Revisões futuras das exports podem adicionar produtos, mas não desativam os ausentes.

O catálogo original foi cadastrado pelo painel em 05/10/2026: 100 produtos e sete categorias, incluindo Sem categoria. Antes de reconciliar esse lote, a prévia deve mostrar 100 já cadastrados e zero novos. Se mostrar produtos novos ou divergentes, conferir a origem e os códigos. O arquivo de origem e as evidências permanecem fora do Git.

Não foi localizada API pública documentada de escrita administrativa de produtos/estoque PagVendas. O feed da Loja Online serve a catálogos de divulgação e não garante saldos. Este fluxo é atualização explícita por exportação e conferência; não é sincronização contínua.

### Fotos dos produtos

A exportação XLSX observada não contém fotos nem URLs. Não foi localizado endpoint público documentado de consulta das fotos do catálogo PagVendas. A integração de Facebook e Instagram disponibiliza um feed em Loja Online > Configurações > Integrações; a presença e cobertura das imagens da Long Beach nesse feed ainda precisam ser verificadas na conta. O campo `items.image_url` da API de Checkout recebe uma URL fornecida pelo vendedor e não consulta fotos do PagVendas. Este importador mantém as fotos existentes e não inventa imagens para produtos sem foto.

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
