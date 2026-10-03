# Checklist de publicação — App Store e Google Play

> Requisitos das lojas mudam. Confirmar as regras vigentes nos portais oficiais na data de cada submissão e registrar a evidência no release.

## Governança comum

- [ ] Titular legal, razão/nome, endereço e dados de contato da Long Beach confirmados.
- [ ] Contas Apple Developer e Google Play Console sob governança da Long Beach, com dois administradores e MFA.
- [ ] Acordos, dados fiscais e bancários necessários aceitos pelo titular.
- [ ] Acesso das agências/pessoas concedido por função, sem compartilhar senha.
- [ ] E-mail de suporte e processo de atendimento ativos.
- [ ] Política de privacidade e termos publicados em URLs estáveis e próprios.
- [ ] Política de retenção, exportação e exclusão de conta/dados implementada e testada.
- [ ] Inventário de dados coletados, finalidade, base, retenção, criptografia e terceiros revisado.
- [ ] Lista de SDKs/plugins e comportamento de dados corresponde às declarações das lojas.

## Identidade do aplicativo

- [ ] Nome público “Long Beach”/“Long Beach Arena” aprovado e consistente.
- [ ] iOS Bundle ID: `br.com.longbeacharena.app`.
- [ ] Android Application ID: `br.com.longbeacharena.app`.
- [ ] Ícone, splash, cores, tipografia e screenshots aprovados para todos os tamanhos exigidos.
- [ ] Versão semântica, iOS build number e Android versionCode definidos e crescentes.
- [ ] IDs e endpoints de Staging não aparecem no pacote Production.
- [ ] Deep links/universal links/app links usam domínios e association files do Long Beach OS.

## Segurança e comportamento

- [ ] HTTPS e certificados válidos; nenhuma exceção insegura de transporte.
- [ ] Access token em memória e refresh token no Keychain/Keystore via secure storage.
- [ ] Logout, revogação do dispositivo, troca de senha e sessão expirada testados.
- [ ] Permissões de câmera, fotos e notificações são pedidas no contexto e têm texto claro.
- [ ] Aplicativo funciona quando permissão opcional é negada.
- [ ] Nenhum secret, chave privada, credencial fixa ou endpoint interno está no bundle.
- [ ] Logs e crash reports não incluem token, senha, endereço, pagamento ou conteúdo sensível.
- [ ] WebView permite somente origens necessárias; links externos abrem com regra segura.
- [ ] Fila offline identifica operação, evita duplicidade e torna conflito visível.
- [ ] Dependências/SDKs foram revisados e build possui artefato/SBOM rastreável.

## Experiência e qualidade

- [ ] Login, onboarding e recuperação de conta concluem em dispositivo real.
- [ ] Sócio/gestor, professor e aluno veem somente recursos permitidos.
- [ ] Fluxos principais funcionam em telas pequenas, modo claro/escuro quando suportado e tamanho de texto ampliado.
- [ ] VoiceOver/TalkBack, foco, labels e contraste verificados nos fluxos essenciais.
- [ ] Conectividade ausente/lenta, timeout, retry e atualização obrigatória/opcional tratados.
- [ ] Câmera, upload, deep link, push e compartilhamento testados em aparelhos reais.
- [ ] Consumo de bateria/dados e tamanho do pacote avaliados.
- [ ] Crash-free smoke test e monitoramento de release ativos.
- [ ] Conta de demonstração e dados de revisão não expiram durante análise.

## App Store Connect / iOS

- [ ] App criado no App Store Connect com Bundle ID correto.
- [ ] Certificados, App ID e provisioning profiles sob conta oficial e com plano de rotação.
- [ ] Capability de push e Associated Domains configuradas apenas se usadas.
- [ ] Privacy manifest e required reason APIs revisados para app e SDKs.
- [ ] App Privacy preenchido conforme coleta e tracking reais.
- [ ] Export compliance/criptografia respondida e documentação guardada quando aplicável.
- [ ] Categoria, classificação etária, descrição, palavras-chave, subtítulo e copyright revisados.
- [ ] URL de suporte e política de privacidade acessíveis sem login.
- [ ] In-app account deletion disponível se o aplicativo permite criar conta.
- [ ] Sign in with Apple avaliado se forem adicionados logins sociais de terceiros.
- [ ] Build Release assinado, arquivado e enviado; símbolos de crash preservados/enviados.
- [ ] TestFlight interno concluído; grupo externo usado quando necessário.
- [ ] Review Notes explicam perfis, permissões nativas e fornecem conta de revisão.
- [ ] Fluxo de revisão funciona sem depender de acesso físico à arena.

## Google Play Console / Android

- [ ] App criado com Application ID correto.
- [ ] Play App Signing habilitado; upload key guardada e recuperação documentada.
- [ ] Android App Bundle Release gerado e assinado pelo CI autorizado.
- [ ] Target API e bibliotecas atendem aos requisitos vigentes na data da submissão.
- [ ] Data safety preenchido de acordo com app e SDKs.
- [ ] Content rating, público-alvo e declaração de anúncios respondidos corretamente.
- [ ] Política de privacidade, exclusão de conta e contato do desenvolvedor publicados.
- [ ] App access contém instruções e conta de revisão válida.
- [ ] Permissões sensíveis declaradas somente quando necessárias e acompanhadas das declarações exigidas.
- [ ] Internal Testing concluído; Closed/Open Testing executado conforme regra da conta e risco da release.
- [ ] Pre-launch report analisado em dispositivos/versões relevantes.
- [ ] Play Integrity avaliado sem bloquear aparelhos legítimos de forma indevida.
- [ ] Store listing, screenshots, feature graphic e notas da versão revisados.

## Push notifications

- [ ] APNs key/certificate e credenciais FCM pertencem à Long Beach e ficam no cofre do ambiente.
- [ ] Tokens de dispositivo são associados a uma instalação, rotacionados e removidos quando inválidos.
- [ ] Staging e Production usam projetos/credenciais separados.
- [ ] Consentimento e preferências por categoria estão disponíveis.
- [ ] Payload não carrega dado sensível na tela bloqueada.
- [ ] Deep link do push valida sessão e autorização antes de mostrar conteúdo.

## Liberação e pós-release

- [ ] Release vinculada a tag, commit, artefato web/API compatível e migrations implantadas.
- [ ] API mantém compatibilidade com a versão móvel anterior durante a janela definida.
- [ ] Rollout gradual configurado quando disponível.
- [ ] Alertas de crash, ANR, falha de login e erro de API acompanhados por responsável.
- [ ] Critérios para pausar rollout e plano de hotfix definidos.
- [ ] Notas de versão e comunicação de suporte preparadas.
- [ ] Decisão final, horários e versões registradas no runbook de release.
