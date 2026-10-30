# Publicação dos perfis e acesso de Visitante

A versão `e84ba6f19b0d6e47ad52ed7fe768093becfa5815`, da [PR 50](https://github.com/gustavodrager/longbeach/pull/50), foi publicada com autorização expressa do proprietário. A API iniciou em 30/10/2026 às 02:46:55 UTC (29/10, 23:46 de Brasília); a interface entrou no ar às 03:02:43 UTC (30/10, 00:02 de Brasília). O [manifesto desta publicação](release-perfis-visitante-2026-10-30.json) registra imagens, versões, hashes e validação.

## Resultado

Existem quatro perfis autenticados, um por pessoa: **Gestor, Professor, Atendente e Cliente**. O [contrato de acesso e conversão](quatro-perfis.md) detalha os limites. **Visitante** é a entrada pública, sem conta ou permissões internas: pode consultar o cardápio e iniciar o cadastro como Cliente em `/login?cadastro=cliente`. Novas contas públicas Google recebem somente `Student` (Cliente).

A conferência real encontrou seis contas ativas e com primeiro acesso concluído, todas com um único papel `Owner`. As seis foram convertidas para `Manager`, sem mapeamentos ambíguos. Quatro tinham vínculo Google e duas não tinham; os vínculos e credenciais existentes foram preservados. Nenhum usuário foi criado. Três sessões de atualização ainda ativas foram revogadas; pode ser necessário entrar novamente.

Somente a API foi pausada e recriada. O procedimento confirmou a preservação dos dados de negócio, usuários, vínculos, sequências e auditoria anterior **antes de reabrir os consumidores**. PostgreSQL e Caddy mantiveram identidade e início; somente `API_IMAGE` mudou na configuração de execução. Workers e integrações conservaram seus gates. O schema permaneceu com 30 migrations, terminando em `20261029210216_DigitalMenu`; esta publicação não executou migration.

## Artefatos e aprovação

O [workflow Production 40991015956, tentativa 1](https://github.com/gustavodrager/longbeach/actions/runs/40991015956) concluiu os quatro trabalhos com sucesso e aprovação do proprietário no environment. O [CI 40964108543](https://github.com/gustavodrager/longbeach/actions/runs/40964108543) também passou para a mesma fonte. A exceção temporária da branch desta publicação foi removida; revisores, regras e demais permissões atuais foram preservados. Uma exceção anterior de outra operação, removida externamente durante o trabalho, não foi recriada.

A API foi promovida sem reconstrução, com índice OCI `sha256:97ae528cb7cefb83efbfe57fe7979cdddac5e67e2837cd9fcd491f97f218076f`, proveniência e SBOM conferidos. A interface usa os bytes do mesmo workflow, comparados integralmente com uma construção da mesma fonte e dos mesmos quatro valores públicos de configuração. Os candidatos locais anteriores ficaram preservados.

Firebase publicou a versão `e2223d9a3f5ebe9c`, release `1793329363925000`, preservando a configuração do site. Foram conferidos os 85 arquivos da aplicação e os dois arquivos reservados gerados pelo Firebase, cujos hashes permaneceram iguais aos anteriores. A estatística `fileCount` foi temporariamente omitida mesmo após `FINALIZED`; a liberação exigiu o mapa completo de caminhos ativos e hashes, além de status, configuração, origem e gates. A continuação usou a mesma versão enviada, sem criar outra versão ou reenviar arquivos. Falhas e intenções intermediárias permanecem nos recibos privados.

## Validação e uso

- Servidor: 533 testes unitários e 486 de integração por versão PostgreSQL 17 e 18; interface: 805 testes. Builds e verificações operacionais do workflow aprovados.
- Produção: 95 consultas públicas passaram, incluindo os 85 arquivos por hash, páginas, HTTPS, saúde 200, opções Google e três rotas privadas sem sessão retornando 401.
- Banco: seis Gestores utilizáveis, nenhum perfil inválido ou acumulado, preservação verificada antes da retomada.
- Navegador: Visitante, entrada de cadastro como Cliente, botão Google e retorno ao acesso público conferidos. O pacote ativo foi `index-rt59yN8W.js`, sem transbordamento horizontal na janela usada.
- PWA: uma versão anterior em cache mostrou a página antiga até o aviso **Atualização disponível**. O botão **Atualizar agora** carregou a versão publicada. Atualize a página e use esse botão se o aviso aparecer.

Não foi concluído login Google com uma conta real durante esta validação, nem criada conta de teste em produção. As verificações autenticadas de isolamento, mudanças de perfil e permissões foram executadas pelos testes automatizados.

Os recibos e metadados mínimos de recuperação estão em `LongBeach/evidencias/perfis-visitante-2026-10-29`, com acesso privado. O bloqueio global temporário da operação foi arquivado após a conclusão, mantendo a API saudável. Os arquivos já modificados localmente `release-google-vm.json` e `publicacao-clientes-2026-10-29.md`, de outra operação, foram preservados; o manifesto específico acima é o registro desta publicação.

Um retorno exige revisão e uma versão compatível com os quatro perfis e schema 30. Não reativar grants legados, restaurar sessões revogadas, executar `Down` ou restaurar sobre o banco ativo. Recibos e helpers históricos não autorizam nova execução.
