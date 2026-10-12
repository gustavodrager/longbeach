# Próxima rodada — Google e PagBank

Preparação inicial em 10/10/2026. Atualização: Google já configurado e testado com duas contas reais na prévia local; pagamentos online permanecem desativados. Para o estado vigente, consultar `homologacao-local.md` e `fechamento-homologacao-local-2026-10-10.md`. Os passos Google abaixo são roteiro de referência, não pendências a repetir.

## Decisão vigente: homologação local

O usuário escolheu manter aplicação e banco no computador. O ambiente staging do Railway continuará vazio. Seguir `homologacao-local.md`. Um endereço HTTPS externo para notificações não é requisito para manter a prévia; é uma pendência específica do ensaio de callbacks PagBank, cuja exposição temporária depende de aprovação própria. Não há autorização para publicar ou provisionar infraestrutura hospedada.

## Entrada necessária

Confirmar quais recursos próprios do Long Beach já existem e onde estão configurados: projeto/client Web Google; conta e credencial sandbox PagBank Pedidos; credencial específica de Recorrência, se disponível; endereço HTTPS de uma API de homologação. Informar localização do segredo, nunca copiá-lo para relatório, conversa ou Git. O Client ID Google é identificador público, não senha.

Publicação, exposição de callback público e mudanças de configuração em ambiente hospedado precisam da aprovação específica já combinada. Um registro antigo de teste não autoriza reutilizar credenciais de outro ambiente.

## Ordem de execução

1. **Google local:** conferir Client ID Web e origens autorizadas. Para porta 5321, usar `http://localhost` e `http://localhost:5321`. Manter interface/API na mesma convenção de host e conferir CORS, cookies, CSP e popup. A orientação de localhost é confirmada pelo [guia oficial Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
2. **Configuração Google:** preencher `Authentication__Google__ClientId` e habilitar `Enabled`/`ClientRegistrationEnabled` somente no ambiente aprovado. Manter `ProvisionAllowedEmailsAsOwners=false`. A aplicação consulta o Client ID na API; nenhum client secret é enviado ao navegador. Detalhes em ADR-006.
3. **Aceite Google:** primeira entrada cria somente cliente; retorno não duplica; logout/renovação funcionam; conta com colisão ou inativa não é sobrescrita; cliente só vê vínculos próprios. Usar conta de teste do responsável, sem assumir identidade de outra pessoa.
4. **PagBank sandbox:** confirmar credenciais próprias de Pedidos e, separadamente, Recorrência. O provedor distingue Sandbox e Produção; os testes desta rodada externa devem usar Sandbox, conforme [ambientes disponíveis](https://developer.pagbank.com.br/docs/ambientes-disponiveis). Configurações exatas estão em `docs/bar/pagamentos-unificados.md`.
5. **Pix e cartão avulsos:** percorrer interface → API → provedor → consulta de confirmação → atualização da conta. Conferir aprovação, recusa, expiração, timeout e retomada da mesma operação, sem cobrança duplicada. Testar pagamento parcial apenas onde permitido.
6. **Notificações:** conferir a assinatura efetivamente enviada no ambiente e a chave confiável. Não remover validação para fazer a notificação passar; a [documentação oficial de autenticidade](https://developer.pagbank.com.br/reference/validacao-de-autenticidade) exige validação antes de atualizar dados.
7. **Recorrência:** somente após habilitação e credencial específica, testar ciclos, falhas, repetição, cancelamento e ausência de duplicidade por competência. As regras atuais do quinto encontro permanecem.

## Pendências registradas no ensaio anterior

O relatório interno de 07/10/2026, em `docs/bar/pagamentos-unificados.md`, registra: HTTP 500 em repetição de alguns pedidos Pix pendentes; erro 40008 no estorno de cartão; notificações sem os cabeçalhos de autenticidade esperados, corretamente rejeitadas; recorrência ainda não homologada com o provedor. Esses resultados históricos precisam ser reproduzidos e resolvidos antes de declarar os respectivos fluxos aprovados. Não foram repetidos nem considerados resolvidos nesta rodada.

## Critério de saída

Registrar cenário, ambiente, resultado, identificação não sensível da operação e evidência da tela/estado persistido. Não capturar tokens, dados de cartão, criptogramas ou corpo sensível de requests em logs. Emissão de comprovante deve corresponder à confirmação autoritativa. Uma resposta pendente não equivale a pagamento.

A aprovação local do caixa em dinheiro não aprova Pix, cartão integrado, recorrência, estorno externo ou EDI. O aceite final de produção permanece separado.
