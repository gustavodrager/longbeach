# Logo do Canva — 6 de outubro de 2026

Fonte: Kit de Marca **Arena LongBeach**, seção [Logotipos](https://www.canva.com/brand/kAHXPiRE6wQ/ingredient/IG-GUeI36okatmA). Arquivo baixado: `Long-Beach-logo-referencia-raster.png`, 860 × 376 px.

`app/public/brand/long-beach-canva.png` preserva o arquivo recebido, sem redesenho, alteração de cores, remoção de fundo ou mudança de proporção. A composição tem o sol sobre a onda e o nome abaixo. O arquivo é raster, não um vetor.

`node scripts/export-web-branding.mjs` gera os invólucros SVG de apresentação. O logo completo usa a composição original; as áreas compactas e os ícones enquadram apenas o símbolo existente. Os caminhos anteriores são mantidos para compatibilidade com a interface, protótipo e exportação nativa. O ícone maskable mantém o desenho na área central de segurança.

`scripts/export-native-branding.mjs` atualiza os recursos Android/iOS a partir dos mesmos ativos. Isso prepara os próximos builds nativos; a publicação web/PWA não distribui um novo binário pelas lojas.

A cor do fundo original fica restrita à imagem e aos ícones. A paleta da interface permanece própria do sistema. Uma futura versão vetorial ou transparente deve ser fornecida pela identidade visual e substituir a fonte, sem reconstrução aproximada das letras.

Verificação: SHA-256 do PNG igual ao download do Canva (`d52e928d1ff52d4d712b5fe8b87eaf04a95c1a779f045e6c766f944ef553ac32`); 173 testes frontend e build PWA aprovados. Logo carregado e sem transbordamento de página em 360, 390, 768 e 1440 px. Trinta recursos nativos foram regenerados; a distribuição nativa requer seu processo de build separado.
