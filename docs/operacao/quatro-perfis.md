# Operação dos quatro perfis

Referência: [ADR-019](../adr/ADR-019-quatro-perfis-exclusivos.md). Estado: preparação para publicação autorizada nesta conversa, incluindo Visitante e cadastro como Cliente pelo Google. Este guia não registra inventário real, conversão ou publicação como concluídos; os comprovantes da operação devem registrar o que efetivamente ocorrer.

## Escolha do perfil

Usar uma conta individual por pessoa e exatamente um perfil. Gestor é quem precisa administrar a arena e suas finanças; Professor atende somente suas próprias aulas; Atendente reúne recepção, agenda e atendimento do bar; Cliente usa somente seus próprios registros. Ser aluno, cliente de bar ou mensalista não cria perfis diferentes. Cadastrar alguém em Equipe ou Clientes também não concede acesso de funcionário.

Visitante é a experiência anônima para consultar conteúdo público e iniciar o cadastro pelo Google. Não possui conta nem perfil persistido enquanto não entrar. Com cadastro público habilitado, uma identidade nova vira Cliente (`Student`); a mesma entrada de uma conta existente preserva seu perfil. Não há quinto perfil no banco e nenhuma consulta pública permite abrir registros de outras pessoas. Manter o cadastro Google separado dos bootstraps administrativos.

Professor exige conta Teacher e vínculo explícito com o cadastro correto da equipe em Administração → Acesso dos professores. Cliente exige vínculo conferido com o cadastro operacional e financeiro correto; sem vínculo, a conta continua limitada aos próprios dados já associados. O cadastro público Google cria somente Student. Não ampliar papéis pela allowlist ou associar pessoas apenas por nome semelhante.

## Preview e mapa privado

Executar os comandos com o binário da nova versão em processo separado, sem servidor nem workers. Usar a configuração do ambiente explicitamente autorizado. Primeiro ensaiar em banco descartável; o nome do banco de teste deve identificar seu uso. Nunca copiar credenciais de produção para testes.

1. Executar `dotnet LongBeach.Api.dll --preview-profiles`. O comando somente lê o inventário de IDs, status, estado do primeiro acesso e papéis. A saída contém impressão (`Fingerprint`), totais por combinação atual, totais previstos, mudanças e impedimentos. Não contém nomes ou e-mails. IDs continuam sendo informação privada: guardar a saída em local operacional privado, fora do Git.
2. Conferir com o responsável os casos `explicit_mapping_required`. Não escolher automaticamente um perfil para BarOperator, BarSupervisor, StockManager, BarFinance, Viewer, Auditor, papéis personalizados, conta sem papel ou combinações.
3. Criar JSON privado com `Mappings` e os IDs retornados. Cada item contém `UserId`, `ExpectedRoles` (lista exata atual) e `TargetRole`, um de `Manager`, `Teacher`, `Operations`, `Student`. É permitido mapear explicitamente uma conta já canônica; permanece obrigatório um Gestor ativo com primeiro acesso concluído. Contas pendentes, com credencial inicial válida ou expirada, não contam como Gestor utilizável.
4. Repetir `dotnet LongBeach.Api.dll --preview-profiles --provision-from-stdin`, fornecendo esse JSON pela entrada padrão em canal que não exponha seu conteúdo. Resolver todos os `Issues`. Adicionar ao mesmo JSON `ExpectedFingerprint` com o valor do último preview. A impressão cobre todos os IDs/status/papéis e o estado de primeiro acesso: uma alteração concorrente exige novo preview e nova conferência.

Formato ilustrativo, com ID fictício:

```json
{
  "ExpectedFingerprint": "valor-do-preview-conferido",
  "Mappings": [
    {
      "UserId": "00000000-0000-4000-8000-000000000001",
      "ExpectedRoles": ["BarOperator"],
      "TargetRole": "Operations"
    }
  ]
}
```

`roles_changed` significa mapa antigo; `unsupported_target`, destino fora dos quatro; `duplicate_mapping`, ID repetido; `unknown_user`, ID ausente; `invalid_mapping`, item ou lista de papéis esperados malformados; `active_manager_required`, resultado sem Gestor ativo com primeiro acesso concluído. `ActiveManagers` conta somente gestores utilizáveis. Nenhum impedimento permite aplicação parcial.

## Aplicação autorizada

Depois de obter autorização específica para o ambiente e conferir o mapa, executar uma vez `dotnet LongBeach.Api.dll --consolidate-profiles --provision-from-stdin`, passando o JSON revisado. Não passar JSON, IDs privados ou credenciais na linha de comando. O comando não depende de seed de startup e não inicia workers.

A transação bloqueia gravações concorrentes nas tabelas de identidade/catálogo enquanto confere e aplica o inventário. Rejeita impressão divergente, mapa incompleto e ausência de Gestor ativo com primeiro acesso concluído antes de qualquer alteração. Preserva identidades e histórico, substitui somente o papel, revoga refresh das contas alteradas e reconcilia grants. A saída da aplicação contém somente totais. Uma falha reverte toda a transação; não repetir com mapa alterado sem conferir novo preview.

Conferir nova prévia sem mapas: quatro perfis, nenhum impedimento e nenhuma mudança prevista. Conferir totais, auditorias `ProfileConsolidated`/`ProfileCatalogConsolidated`, vínculos e entrada do próprio titular com Google. Refresh anterior de conta convertida deve ser recusado; permissões e desativação valem na próxima requisição autenticada da API nova. Uma segunda aplicação com nova impressão deve indicar zero contas alteradas.

## Publicação e retorno

A aplicação nova nega contas ainda em perfis legados. Na promoção autorizada, preparar e conferir o mapa antes da janela; executar o processo único com o novo binário antes de disponibilizar API/frontend compatíveis, mantendo as escritas administrativas suspensas durante a conversão. Não ligar bootstraps amplos como substituto do mapa. Validar Gestor, Professor, Atendente e Cliente, incluindo URL/API direta e registros de terceiros.

Classes e opções antigas que incluem “Owner”/“Admin” no nome permanecem por compatibilidade operacional, mas provisionam somente Manager. Bootstraps administrativos de produção, Google e desenvolvimento criam uma conta nova ou reconhecem uma conta ativa que já tenha exatamente um perfil Manager; conta existente sem perfil, com outro perfil ou com vários papéis exige consolidação explícita. Repetição idempotente preserva ID e credenciais. O provisionador de primeiro acesso aceita somente os quatro nomes. Ao encerrar um bootstrap, desligar a opção e retirar a credencial temporária conforme o procedimento existente.

Não restaurar papéis/grants antigos para contornar um bloqueio. Se houver falha de configuração ou vínculo, corrigir a versão ou o vínculo de forma auditada. Um retorno de código precisa preservar a identidade e avaliar os limites da versão anterior, que pode reintroduzir acesso amplo de perfis retirados. Não desfazer migrations publicadas nem apagar usuários, vínculos ou auditorias. A publicação autorizada nesta conversa deve usar o commit/digest e o mapa atuais conferidos; não autoriza mudanças de DNS/infraestrutura nem repetição de planos antigos. Registrar resultados após cada ação, sem antecipar sucesso.


## Validação local — 29/10/2026

Implementação validada no checkout principal, com identidades fictícias e PostgreSQL descartável separado de qualquer ambiente real:

- 533 testes unitários do servidor e 483 testes de integração aprovados, sem falhas ou ignorados.
- 783 testes da interface aprovados em 80 arquivos; TypeScript e build/PWA aprovados. A API compilou na solução e na execução final dos testes.
- Cobertura de quatro perfis exclusivos, claims antigas, conta bloqueada ou inexistente, troca de perfil com o mesmo JWT, isolamento de professor/cliente/caixa, operações vedadas ao Atendente, proteção do último Gestor e recusa de bootstrap para contas ambíguas.
- Conversão ensaiada tanto pelo serviço quanto pelos comandos do binário: prévia incompleta impediu aplicação; mapa explícito converteu duas contas fictícias para Manager/Operations; prévia posterior ficou sem impedimentos e sem mudanças previstas.
- Preview sem escrita, inventário alterado, mapas conflitantes, preservação de dados/auditoria e revogação de refresh verificados. Na interface, troca de sessão durante renovação não reenvia a operação como outra pessoa; um 403 não repete a operação recusada.

Total: **1.799 testes aprovados**. Não houve inventário, conversão ou publicação de contas reais. As migrations históricas e a infraestrutura hospedada foram preservadas. A validação não substitui o mapa privado das contas reais nem autoriza sua aplicação.
