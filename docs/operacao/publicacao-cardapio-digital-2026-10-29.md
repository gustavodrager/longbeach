# Publicação do cardápio digital — 29/10/2026

Publicado e verificado em Production. Fonte imutável `e3e10a61baf5eef0731b587e5b0ac80ad42acf82`, PR #49, gate40957369189 tentativa1 aprovado pelo responsável e quatro jobs concluídos.

- Gestão: https://longbeach.quebranunca.com.br/bar/cardapio
- Apresentação: https://longbeach.quebranunca.com.br/cardapio/apresentacao
- Consulta pública: https://api.longbeach.quebranunca.com.br/api/v1/menu/published

Conteúdo ativo: versão2, quatro páginas editoriais e32itens, duração10segundos por tela. Preços conferidos no catálogo e fotografados na publicação. Os19produtos ausentes foram cadastrados pela gestão existente, sem inventar custos e sem gerar vendas, receitas ou estoque. Conferência SQL somente de leitura confirmou zero vínculos desses produtos com saldos, movimentos, vendas e fichas técnicas.

Migration aditiva `20261029210216_DigitalMenu` executada uma única vez:29→30. Cópia consistente ensaiada em PostgreSQL18 local isolado antes da aplicação; dados anteriores e sequências conferidos antes de reabrir a API. Pausa autorizada limitada a143,653segundos. PostgreSQL, Caddy, configuração da aplicação e backups preservados. A unificação de clientes já estava em produção e foi preservada, sem nova aplicação.

API promovida pelo digest `sha256:23c6d6671f7c4e51f243138de17ce7e85b17db031c834d7ae44b56732f6b92e7`. Firebase versão `1b1fcc50de9f73b0`,85arquivos verificados. Identificadores completos, histórico anterior e recibos em `release-google-vm.json` e `evidencias/cardapio-digital-2026-10-29/` no diretório principal.

Validação:745testes frontend,505unitários backend,419integração,28preflight e7guardas operacionais; CI verde. QA autenticada editar/salvar/recarregar/publicar, consulta anônima sem campos internos, proteção administrativa401, alternância, pausa e navegação. Todos os slides couberam em768×1024 e1024×768. Recarga offline/reconexão ensaiadas localmente com o mesmo bundle do cardápio; PWA e cache público atualizados em produção. Não foi realizado corte de rede de produção para QA.

Retorno mantém o schema aditivo, dados e publicação. Usar os artefatos anteriores registrados, com revisão de compatibilidade do preflight schema29→30 antes de reabrir a API. Nunca executar Down. Nenhum retorno foi executado. O backup privado foi preservado; contêineres, volumes e rede exclusivos do ensaio local foram removidos.

Este registro posterior não altera as fontes dos artefatos publicados. O checkout compartilhado e suas mudanças de outros trabalhos foram preservados.
