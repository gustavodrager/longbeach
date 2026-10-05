# Identidade global e aplicativos — Long Beach OS

A identidade oficial do manual fornecido foi aplicada ao sistema autenticado e ao protótipo: login, conta, navegação, módulos da arena, atendimento, cliente por QR, favicon, PWA e recursos nativos. Os vetores oficiais em `app/public/prototype-assets` continuam sendo a origem da marca, sem desenho gerado por IA. Manrope é servida localmente e sua licença OFL permanece junto ao arquivo.

## Recursos nativos

Foram renderizados 30 arquivos PNG, preservando os nomes e dimensões dos recursos Android e iOS existentes. Os ícones usam o símbolo oficial; as telas iniciais usam a assinatura horizontal com fundo areia. O foreground do ícone adaptativo mantém transparência e posiciona a marca na área segura. O ícone iOS de 1024 px não tem transparência. O arquivo de splash iOS usa composição central adequada ao recorte em telas verticais.

Android recebeu também os vetores XML oficiais, cores e barras do sistema, fundo do ícone adaptativo e configuração do splash compatível com Android 12+. A versão mínima existente, API 24, foi preservada. O storyboard de início iOS recebeu a cor areia.

A exportação é repetível com `scripts/export-native-branding.mjs`, executado com Node.js e Sharp instalado no ambiente de criação. Quando Sharp não estiver no caminho de módulos padrão, a variável `LONG_BEACH_SHARP_PATH` aponta para a biblioteca disponível. Essa ferramenta é usada apenas para exportar recursos; a aplicação publicada não depende de Sharp.

## Verificação

As dimensões dos 30 arquivos foram lidas antes de exportar e mantidas. O ícone iOS e o splash Android foram inspecionados visualmente. O build web e a sincronização Capacitor para Android e iOS concluíram em 2026-10-04.

A sincronização deve ser repetida depois do build web final de uma nova versão. Ela copia o bundle, fontes, marca e rotas para os projetos nativos; não gera um APK ou IPA assinado.

Neste ambiente não havia Android SDK configurado nem instalação completa do Xcode. Portanto a compilação e o ensaio dos pacotes Android/iOS permanecem uma etapa de release em ambiente apropriado. Nenhum APK, IPA, assinatura ou publicação em loja foi presumido como validado.
