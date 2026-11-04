# Revisão — acesso individual da equipe

Data: 04/11/2026. Estado: implementado e validado localmente; não publicado.

## Entrega

- Equipe reúne ficha e conta, com telefone sugerido como login ou usuário exclusivo.
- Tipos Bar, Professor, Atendente e Gestor configuram menus e ações. Bar usa Operations restrito; os quatro perfis existentes permanecem exclusivos.
- Administração da equipe, tipos, reset, bloqueio, vínculo docente e importação de pessoas exigem dono confirmado por UserId. Os nomes não concedem acesso.
- Senha temporária individual de 24 horas, exibida uma vez, troca local obrigatória e revogação imediata das sessões ao mudar credenciais ou acesso.
- Conta atual compatível pode ser escolhida explicitamente. Google, salários ocultos, ficha de cliente e histórico são preservados. Não há associação automática ou reset em massa.
- Servidor recusa rotas e ações não liberadas. Interface fecha atalhos, formulários de edição e operações em tipos de consulta. Dependências de seletores e da agenda não abrem os cadastros administrativos correspondentes.
- Migration aditiva 33, permissões das tabelas e preflight de compatibilidade atualizados. Retorno destrutivo é recusado quando há acesso em uso.

## Validação local

| Verificação | Resultado |
|---|---|
| Interface | 1.285 testes em 108 arquivos aprovados |
| Build interface | TypeScript, Vite e PWA aprovados; 102 entradas no precache |
| Unidade do servidor | 696 aprovados; nenhum ignorado |
| Integração PostgreSQL 18.6 | 670 testes distintos com último resultado aprovado no consolidado das execuções; nenhum ignorado |
| API Release | Zero avisos ou erros |
| Modelo e migration 33 | Nenhuma diferença pendente no EF |
| Runtime Python | 51 aprovados; 1 teste opcional de WhatsApp ignorado por falta de contêiner dedicado |
| Preflight com PostgreSQL real | Aprovou donos/ACL corretos e detectou ausência de dono utilizável, escrita indevida em operações e leitura PUBLIC |
| Alterações | `git diff --check` aprovado; migrations históricas preservadas |

A integração completa teve 666 testes, com 662 aprovados e quatro expectativas antigas de migration corrigidas. Reexecuções afetadas e quatro novos cenários encerraram as pendências. O consolidado considera o último resultado por identificador estável; não é apresentado como uma nova execução completa única. Evidências privadas estão em `evidencias/equipe-acessos-2026-11-04/`, fora do repositório.

## Conferência no navegador

Fluxo: **Administração → Equipe → cadastro e tipo de acesso → API → PostgreSQL → sessão e menus delimitados**.

| Parte do fluxo | Evidência |
|---|---|
| Equipe integrada | Formulário servido pela interface real e contexto de acessos da API local |
| Computador e celular | Cadastro e tipos conferidos em 1280 × 720 e 390 × 844; largura do documento 390 em viewport 390 |
| Persistência e credenciais | Testes reais de transação, duplicidade, senha temporária, concorrência e sessões |
| Bar | Login fictício, somente cinco acessos de atendimento; sessão preservada após recarga; Financeiro por URL mostrou Acesso restrito |
| Professor | Login fictício, Hoje/Turmas/Presenças; Bar por URL mostrou Acesso restrito |
| Erros do navegador | Nenhum erro ou aviso na conferência final de Bar e Professor |

Nenhuma senha nova foi digitada pelo agente nos formulários do navegador. A troca obrigatória e seus resultados foram exercitados pelos testes automatizados. A prévia usou apenas contas fictícias e o banco local descartável, sem chamadas de alteração em produção.

## Condições antes de ativar

Confirmar privadamente as quatro contas dos donos, conferir fichas/contas da equipe e escolher explicitamente os vínculos. O preflight exige quatro IDs distintos existentes, perfil Gestor único e ao menos um dono com acesso utilizável, além do login local habilitado. Não inferir identidade pelo nome ou promover pessoas automaticamente.

A publicação exige autorização específica para a nova versão, envolvendo API, interface, migration 33 e configuração protegida. Google e os quatro perfis base permanecem como estão. Não publicar a API anterior depois de ativar tipos restritos.

Referências: [ADR-023](../adr/ADR-023-acesso-individual-equipe.md) e [operação da Equipe](../operacao/equipe-acessos.md).
