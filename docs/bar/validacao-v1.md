# Validação da auditoria Bar V1 — 03/10/2026

Código real em /Users/gustavo-drager/longbeach/longbeach-os, HEAD b5289db mais alterações locais prévias. Nenhum código de aplicação alterado por esta revisão.

| Verificação | Resultado observado |
|---|---|
| Frontend Vitest | 2 arquivos, 14 testes aprovados |
| Frontend TypeScript + Vite/PWA | Build concluído; service worker gerado localmente; sem publicação |
| .NET test LongBeach.sln, SDK 10.0.401 | 42 unitários aprovados, 1 falha; 23 integração aprovados, 1 ignorado |
| API e dependências .NET | Compiladas durante dotnet test |
| BarMigrationTests.All_bar_migrations_are_additive_and_model_snapshot_matches | Falha em Assert.False(db.Database.HasPendingModelChanges()), linha 14: divergência modelo/snapshot |
| BarPostgresTests | Ignorado: LONG_BEACH_TEST_DATABASE_URL ausente; banco real não homologado |
| PagBank real / staging / produção | Não executado; sem credenciais ou alterações hospedadas |

Não houve falha de build observada no teste .NET; a suíte completa terminou com exit code 1 pela falha acima. Não assumir que o restante das verificações daquele teste de migration executou: a primeira asserção interrompeu o teste.

Tentativas iniciais em cópia local encontraram restrições de pipes do MSBuild/cache do Vite e pnpm tentou consultar o registry. A validação válida acima foi feita no checkout real com runtimes locais e permissões de execução; não houve instalação de dependências. Artefatos binários/dist são resultados locais de verificação.

Bloqueio Bar 0: inspecionar diff real do modelo/snapshot e reconciliar com alterações locais antes de gerar migration aditiva; não editar migrations antigas nem simplesmente silenciar a asserção. Executar upgrade PostgreSQL e concorrência antes de habilitar a fatia operacional. A causa específica da divergência não foi determinada nesta auditoria.

Arquivos novos desta revisão: ADR-004-bar-comandas-e-pagamentos-independentes.md, auditoria-v1-2026-10-03.md, especificacao-v1.md, backlog-v1.md e este registro. Mantidos os documentos anteriores como histórico. Sem migrations aplicadas, mudanças destrutivas ou deploy.
