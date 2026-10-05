# Modo de teste público com PostgreSQL

Este modo foi usado na validação inicial com dados fictícios. Na implantação operacional de outubro de 2026, a web deve usar `VITE_DEMO_MODE=false`, e a API deve usar `DemoMode__PublicOperationalData=false`. Production ignora a habilitação de acesso operacional anônimo, mesmo que a configuração antiga esteja presente.

Somente Development e Test podem habilitar as quatro rotas originais fictícias com `DemoMode__PublicOperationalData=true`. Os novos módulos da arena continuam exigindo uma conta individual. O protótipo `/prototipo` mantém uma demonstração local independente, sem gravação no banco real.

O endereço é público. Qualquer pessoa que o conheça pode consultar, criar ou alterar os cadastros fictícios compartilhados. As gravações são limitadas por IP a 60 por minuto. O CORS aceita apenas os endereços configurados. Não insira informações pessoais reais, credenciais, senhas ou informações financeiras reais nesta fase. A trilha de auditoria registra as operações sem copiar o conteúdo dos cadastros para os logs.

A aplicação não envia cadastros locais automaticamente ao PostgreSQL. Na operação autenticada, a API é a fonte dos dados; respostas de uma sessão encerrada são descartadas. Não existe cópia local de contingência com dados pessoais. Uma falha de gravação mantém o formulário aberto e não apresenta confirmação de salvamento.

As quatro categorias ficam na tabela `operational_records`, com o tipo em `Kind` (`students`, `team`, `inventory` ou `projects`) e os campos do cadastro em `Payload` JSONB. A migration `20261001000200_OperationalRecords` cria a tabela sem apagar ou alterar as tabelas de autenticação.

## Preparar a fase de dados reais

Antes de inserir dados reais, desligue a escrita anônima (`DemoMode__PublicOperationalData=false`), volte a publicar o fluxo autenticado e valide autenticação, papéis, permissões e auditoria para as rotas operacionais. Faça backup do PostgreSQL e exporte os registros de teste se forem necessários para comparação. A remoção dos registros de teste deve ocorrer somente após validação do backup; a limpeza não faz parte do deploy desta fase.

Para voltar à experiência sem banco em desenvolvimento local, use `VITE_OPERATIONAL_STORAGE=local`. No Railway, uma mudança de `VITE_OPERATIONAL_STORAGE` exige novo build da web; mudança de `DemoMode__PublicOperationalData` exige novo deploy da API. A migration é aplicada pelo pre-deploy job já configurado para o serviço `api`.
