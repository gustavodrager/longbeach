# Logo transparente — publicação em 30/10/2026

A interface do commit `393eb94fea352da10ab66343a810f4046f50c7a6`, [revisão 51](https://github.com/gustavodrager/longbeach/pull/51), foi publicada em 30/10/2026 às **07:28:15 de Brasília** (10:28:15 UTC), após autorização expressa do proprietário e aprovação no environment Production. O [workflow 41038240553/1](https://github.com/gustavodrager/longbeach/actions/runs/41038240553) concluiu os quatro trabalhos com sucesso.

O logo principal e o símbolo reduzido agora incorporam PNG com transparência real. O [PNG final](../../frontend/public/brand/long-beach-transparent.png) está separado do original; as duas versões SVG conservaram seus `viewBox`. As referências dos componentes foram mantidas. A edição usou a ferramenta de imagem integrada; o pedido completo, o original e os candidatos ficaram preservados nas evidências locais. O logo diferente usado no cardápio já tinha transparência e permaneceu como estava.

Foi promovido somente o frontend oficial, sem reconstrução após o workflow. A versão Firebase `b4a90452954c97ec`, release `1793356095243000`, substituiu `e2223d9a3f5ebe9c`. A configuração do site foi preservada. O mapa completo conferiu **86 arquivos da aplicação e dois arquivos reservados do Firebase**, com hashes dos reservados iguais aos da versão anterior. A estatística opcional de quantidade de arquivos não substituiu a validação por caminhos e hashes.

As observações somente de leitura antes e depois confirmaram a mesma API `e84ba6f`, imagem `sha256:97ae528cb7cefb83efbfe57fe7979cdddac5e67e2837cd9fcd491f97f218076f`, mesmos contêineres/início de API, PostgreSQL e Caddy, mesmos hashes dos arquivos de configuração e schema 30. A identidade conjunta foi `5210218e38753020d357f24256fc70a825996d7cd7c9af9e39b9928b75775dfa` nas duas observações. Não houve pausa da API, migration, job de conversão, alteração de usuários ou gravação no banco por esta operação.

As 94 consultas públicas passaram: 86 arquivos por hash, três páginas e cinco verificações da API. O PNG publicado tem canal alpha verdadeiro, cantos e vazados transparentes; os dois SVGs incorporam exatamente seus bytes. O navegador confirmou o logo carregado sem retângulo bege e sem transbordamento horizontal. O aviso **Atualização disponível** foi aplicado pelo botão **Atualizar agora**, carregando o novo logo no PWA. Não foi realizado login de produção nessa validação.

A permissão temporária da branch, ID `64900955`, foi removida após a conferência. Revisores e demais proteções permaneceram intactos. A prévia local foi encerrada. O [manifesto desta publicação](release-logo-transparente-2026-10-30.json) registra os identificadores e hashes; recibos privados e capturas estão em `LongBeach/evidencias/logo-transparente-2026-10-30`.

Para retorno, revisar uma mudança somente da interface que preserve a API e schema atuais. Não repetir estes helpers ou tratar recibos históricos como autorização futura.
