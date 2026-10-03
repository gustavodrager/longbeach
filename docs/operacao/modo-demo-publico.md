# Modo de teste público com PostgreSQL

Durante a validação autorizada, o serviço `web` usa `VITE_DEMO_MODE=true` e `VITE_OPERATIONAL_STORAGE=postgres`. A página abre sem login, e alunos, equipe, estoque e projetos leem e gravam no PostgreSQL próprio do Long Beach OS. A API habilita somente essas rotas quando `DemoMode__PublicOperationalData=true`; as rotas de autenticação continuam com a política normal.

O endereço é público. Qualquer pessoa que o conheça pode consultar, criar ou alterar os cadastros fictícios compartilhados. As gravações são limitadas por IP a 60 por minuto. O CORS aceita apenas os endereços configurados. Não insira informações pessoais reais, credenciais, senhas ou informações financeiras reais nesta fase. A trilha de auditoria registra as operações sem copiar o conteúdo dos cadastros para os logs.

Na primeira abertura, o sistema envia ao PostgreSQL os registros que existirem somente no armazenamento local deste navegador. Quando o banco já tiver registros, o PostgreSQL é a fonte principal; registros locais com IDs novos são acrescentados. Depois da conexão, os módulos mantêm o armazenamento local como cópia de contingência. O indicador no menu informa conexão e falhas de gravação.

As quatro categorias ficam na tabela `operational_records`, com o tipo em `Kind` (`students`, `team`, `inventory` ou `projects`) e os campos do cadastro em `Payload` JSONB. A migration `20261001000200_OperationalRecords` cria a tabela sem apagar ou alterar as tabelas de autenticação.

## Preparar a fase de dados reais

Antes de inserir dados reais, desligue a escrita anônima (`DemoMode__PublicOperationalData=false`), volte a publicar o fluxo autenticado e valide autenticação, papéis, permissões e auditoria para as rotas operacionais. Faça backup do PostgreSQL e exporte os registros de teste se forem necessários para comparação. A remoção dos registros de teste deve ocorrer somente após validação do backup; a limpeza não faz parte do deploy desta fase.

Para voltar à experiência sem banco em desenvolvimento local, use `VITE_OPERATIONAL_STORAGE=local`. No Railway, uma mudança de `VITE_OPERATIONAL_STORAGE` exige novo build da web; mudança de `DemoMode__PublicOperationalData` exige novo deploy da API. A migration é aplicada pelo pre-deploy job já configurado para o serviço `api`.
