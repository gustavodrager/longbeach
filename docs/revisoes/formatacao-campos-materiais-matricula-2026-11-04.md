# Formatação, materiais e matrícula — 04/11/2026

Estado: implementado e conferido localmente; aguarda publicação específica da API e da interface. Esta revisão não acrescenta migration nem altera produção.

## Campos em português do Brasil

Valores monetários aparecem como `R$ 1.234,56`; telefone e CPF/CNPJ recebem máscaras. O formulário trabalha em reais, preservando contratos: reais continuam em reais; centavos, no controle mensal e na demonstração, mantêm a conversão por 100. API, SDK e banco conservam valores numéricos. Telefones e documentos mantêm valores canônicos nas integrações.

Custos médios preservam seis casas, sem arredondamento para centavos; preços unitários da NF-e preservam até dez. Número, série e chave da nota, cartão, códigos de autorização e referências não recebem máscara de CPF/CNPJ.

O componente compartilhado preserva o rascunho e formata ao sair. Focar ou desfocar não dispara alteração nem troca a identificação da operação. Campos nomeados fornecem um único valor canônico ao `FormData`, inclusive em formulário externo. Obrigatoriedade, limites, desabilitação e precisão consideram esse valor; espaços ou apenas `R$` não satisfazem um campo obrigatório.

Datas e competências conservam os controles nativos, os valores ISO e o calendário. Horários permanecem em 24 horas, inclusive `24:00` onde já permitido, sem mudar fusos. A auditoria estática identificou aproximadamente 44 declarações monetárias, 12 de telefone, sete de documento e 45 controles de data, além de horários e competências. São declarações no código, não contagens em execução.

## Materiais e equipamentos

“Onde fica guardado” passa a ser opcional no cadastro, nas movimentações da API e no modo demonstração. O local vazio não impede entrada, saída ou contagem; quando informado, mantém o limite de 160 caracteres. Unidade, quantidade, motivo, destino, responsável, versão e proteção contra repetição continuam exigidos conforme cada operação. Saldos, identificadores e históricos anteriores são preservados.

## Cadastro durante a matrícula

“+ Cadastrar aluno” abre o fluxo na matrícula, reutilizando Clientes. Permite selecionar uma pessoa existente, reaproveitar o aluno vinculado ou cadastrar os registros necessários. Concluir ou cancelar retorna à seleção sem perder turma, datas ou mensalidade. Permissões de leitura, cadastro e matrícula permanecem separadas. O fluxo não cria automaticamente uma conta de acesso `User`.

## Validação e publicação

A suíte final da interface aprovou 1.214 testes em 101 arquivos; build TypeScript e PWA aprovados. O build Release da API terminou sem avisos ou erros. Materiais tiveram 27 testes unitários e 14 integrações HTTP/PostgreSQL aprovados, observados nas ferramentas; os logs brutos desses testes não foram preservados. Os logs finais da interface e dos builds estão nas evidências locais desta revisão.

A prévia local conferiu os três fluxos com dados fictícios: máscaras, turma e cadastro de aluno durante a matrícula, preservando data e mensalidade de R$ 125,50; materiais sem local receberam movimentações de 0 → 5 → 15. A matrícula também foi conferida em 390 × 844, sem transbordamento horizontal, com foco no cadastro e retorno ao campo Aluno. Capturas registraram a conferência, sem operações em produção.

Perfis, concessões, credenciais e históricos permanecem preservados. A publicação exige API e interface.
