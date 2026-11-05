# Preferências musicais dos mensalistas

O cadastro e a edição rápida de um grupo permitem marcar mais de um estilo em **Preferências musicais (opcional)**. A seleção pode ficar vazia. O resumo mostra somente os estilos escolhidos.

A lista fixa tem 15 opções: Rock, Pop, Pagode, Samba, Sertanejo, MPB, Funk, Forró / Piseiro, Rap / Hip-hop, Trap, Eletrônica, Reggae, Axé, Gospel e Brega / Arrocha. Os identificadores são estáveis e independem dos rótulos. A ordem facilita a escolha; não representa um ranking. Não há busca externa, playlist ou recomendação automática.

## Persistência e compatibilidade

`musicPreferences` é um array opcional no JSON já existente de `rentalGroups` em `operational_records`. Não há coluna, tabela ou migration própria para esta mudança. Cadastros antigos sem o campo continuam válidos. A API preserva a seleção anterior quando um cliente antigo omite o campo; um array vazio limpa explicitamente a seleção. Valores nulos, tipos incorretos, estilos desconhecidos e repetições são recusados.

Permanecem as permissões `projects:read` / `projects:write` e o escopo Mensalistas (`recurring`) da equipe. A preferência pertence ao grupo. Não altera integrantes, responsáveis, contas de acesso, valores, cobranças ou encontros já gerados. As versões e os conflitos de edição mantêm o comportamento atual.

## Fontes da seleção

A seleção é uma lista prática de estilos conhecidos, combinando os gêneros solicitados com referências brasileiras amplas. Não é uma medição dos gostos dos clientes da Long Beach.

- [Cultura nas Capitais](https://culturanascapitais.com.br/): entrevistas presenciais em 27 capitais em 2024, com resultados publicados em 2025. O [relatório do Rio de Janeiro, p. 16](https://culturanascapitais.com.br/wp-content/uploads/2025/02/Capitais-%E2%80%94-Rio-de-Janeiro.pdf) inclui a média conjunta para os estilos musicais.
- [Retrospectiva Spotify 2025](https://newsroom.spotify.com/2025-12-03/retrospectiva-top-artistas-musicas-albuns-podcasts-audiolivros/): referência complementar de artistas e repertórios atuais no Brasil.
- [ECAD: O que o Brasil ouve](https://www4.ecad.org.br/wp-content/uploads/2022/03/O-que-o-Brasil-Ouve-10-anos-de-musica.pdf): referência de variedade de ritmos na execução pública. As fontes servem apenas à preparação da lista; não são dependências da aplicação.

## Validação

Os testes cobrem seleção por teclado, criação sem preferência, várias opções, limpeza explícita, reabertura, falha e recuperação, preservação na edição de integrantes e financeiro, omissão por cliente antigo, entradas inválidas e conflito simultâneo de versões. Foram preservados os acessos de Gestor e Atendente e os bloqueios de Professor e Cliente.

Resultado consolidado: **719 testes unitários do servidor**, **10 integrações de Mensalistas em PostgreSQL 18** e **1.359 testes da interface em 111 arquivos** aprovados, sem falhas ou testes ignorados. Builds do servidor e da interface/PWA aprovados; o servidor compilou sem avisos ou erros. A prévia fictícia passou em 390 × 844 e 1440 × 1000, com teclado, seleção múltipla, reabertura e edição rápida. Seis capturas estão em `evidencias/mensalistas-musica-2026-11-05/`; os comprovantes da rodada final estão em `evidencias/entrega-bar-mensalistas-2026-11-05/`. O banco local temporário foi removido.

Esta alteração integra a entrega junto às melhorias do Bar. A preferência musical altera interface e API e usa o JSON existente. A versão consolidada também inclui as migrations 34 e 35 do Bar e depende de autorização específica para publicar interface, API e banco; não integra a autorização da Visão Geral.
