# ADR-020 — Central WhatsApp com transporte whatsmeow

Data: 31/10/2026. Estado: implementação local; ativação hospedada e pareamento dependem da operação aprovada.

## Decisão

A central é uma área do LongBeach OS, com Conversas, Envios e Automação, usando as identidades e permissões existentes. Gestor administra conexão, conteúdo aprovado e configuração; Atendente consulta e atende. Professor e Cliente não acessam a caixa da arena. Os catálogos efetivos de perfis do servidor e frontend incluem permissões próprias de mensagens.

Por escolha explícita do proprietário, o transporte usa whatsmeow, biblioteca Go de WhatsApp Web multidevice, em um processo privado na mesma infraestrutura. Esse processo é parte do produto e não um serviço de outro cliente. A exceção ao runtime exclusivamente .NET limita-se ao protocolo de transporte: cadastro, autorização, IA, confirmações, conversa, outbox e auditoria continuam no monólito modular. A integração é não oficial e depende da aceitação e continuidade da sessão pelo WhatsApp.

O transporte tem sessão PostgreSQL própria, schema e login restritos, sem acesso aos dados operacionais do monólito. Não há nova instância, broker ou dependência da QuebraNunca. Somente um processo mantém a sessão, protegido por lock no banco. O runtime não executa migrations: EF e sqlstore são atualizados por comandos únicos explícitos e por artefatos identificados. A integração começa desabilitada.

## Estado e limites

Separar situação do atendimento, modo bot/equipe e estado de entrega da mensagem. Um timeout após envio é incerto; preservar operação e ID e consultar sua confirmação. Recibos não regridem estados. Histórico e grupos não acionam o bot. Envio manual pausa automação antes de enfileirar; mensagens próprias de outros dispositivos também indicam atendimento humano, sem inventar seu autor individual. Há latência entre dispositivos, portanto não existe exclusão perfeitamente atômica entre celular e servidor.

Telefone, PN e LID são referências de transporte, não autorização. A gestão confere o vínculo com Cliente e a aceitação dos lembretes. Contas do bar exigem o responsável financeiro explícito; o saldo é recalculado antes do envio. Matrícula, encontro e conta não são associados por nome ou coincidência de telefone.

Confirmações antecipadas são registros próprios, separados de frequência, reserva e cobrança. O convite identifica ocorrência, pessoa, data, horário e quadra; mudanças invalidam a confirmação anterior. Uma negativa não libera vagas ou quadras. Lembretes começam às 18h da véspera em São Paulo, com recuperação de até uma hora e sem disparar acúmulo vencido.

A IA seleciona somente ações limitadas e referências de uma base autorizada. O servidor produz respostas aprovadas e valores; não executa texto arbitrário, SQL ou instruções do cliente. Conteúdo desconhecido segue à equipe. Mensagens e anexos ficam privados; auditoria contém IDs/autor/estados, sem duplicar texto, telefone, QR ou chaves.

## Operação

Sessões e dados de teste não compartilham credenciais de produção. O overlay opcional não substitui os gates existentes de inicialização da VM, migrations e release. Um retorno não deve apagar as novas tabelas com histórico; desligar workers e transporte preserva os dados. O runbook [WhatsApp](../operacao/whatsapp.md) define configuração, testes e piloto. Esta ADR não registra deploy, pareamento ou envio real.
