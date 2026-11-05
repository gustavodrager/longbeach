# Visão Geral mais simples

A abertura concentra o trabalho do dia: reservas, horas livres, turmas, até três próximos horários e pendências com destino direto. Os botões principais são **Abrir agenda** e **Atendimento**, conforme as permissões existentes.

Foram retirados da Visão Geral o resumo financeiro, os resultados por período, os filtros de datas, os relatórios históricos, as consultas de estoque e grade e os avisos de cadastros incompletos. Os indicadores não repetem instruções para abrir cada destino. A data de atualização só aparece quando a última leitura foi preservada após falha.

As consultas exclusivas de saldos/contas e resumo das planilhas continuam em **Financeiro → Histórico**, nas seções recolhidas **Saldos e contas** e **Resumo dos controles importados**. As consultas são feitas ao abrir cada seção. Os demais relatórios continuam nos destinos próprios já existentes de Financeiro, Bar, Agenda, Mensalistas e Aulas.

## Preservação

- Pendências reais, Pix sem confirmação, valores, horários, quadra, carregamento e falhas continuam identificados. Falta de dados não é tratada como zero ou ausência de pendências.
- Restrições por permissão, vínculos e direcionamentos são preservados. Nenhuma alteração na API, banco, contas, perfis ou configuração do Google.
- Os estilos do rodapé financeiro no celular foram transferidos ao estilo financeiro; o resumo importado usa o módulo original de formatação, evitando ciclo de imports.

## Conferência

Prévia local com dados fictícios no computador (1470 px), celular (390 × 844) e largura de 320 px, sem rolagem horizontal. Ações principais visíveis sem rolar em 390 × 844, controles de pelo menos 48 px e foco visível por teclado. A navegação por teclado abriu a agenda; o navegador não registrou erros. Os arquivos temporários da prévia foram removidos e o servidor foi encerrado.

As evidências visuais e os resultados de testes/build ficam em `evidencias/visao-geral-clean-2026-11-05/`, fora do repositório da aplicação. A validação automatizada cobre a Visão Geral, acesso às consultas financeiras somente ao abrir, estados de falha/leitura preservada e permissões.

Resultado local: **1.287 testes da interface em 108 arquivos aprovados**, build da interface/PWA aprovado e build da solução do servidor sem avisos ou erros. A execução geral identificou três testes antigos dependentes da data real; os relógios das agendas foram alinhados às fixtures e a validade do recibo fictício passou a ser calculada a partir do teste, preservando as asserções e o comportamento do produto.

Esta revisão prepara somente a interface. A publicação da nova fonte depende de aprovação específica; autorizações de versões anteriores não se aplicam.
