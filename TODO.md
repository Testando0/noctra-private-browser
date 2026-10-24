# Noctra Private Browser

## Navegação privada e experiência principal

- [x] Implementar uma tela inicial do navegador com campo superior arredondado para endereço ou pesquisa, ação de navegação e identidade visual quase preta com detalhes neon roxo e rosa.
  - O campo deve aceitar pesquisa ou endereço e apresentar estado vazio, foco e texto digitado.
  - A interface deve funcionar em portrait, com uso por uma mão, alvos de toque confortáveis e contraste adequado.
- [x] Implementar alternância explícita entre modo de busca e modo URL, com validação e encaminhamento correto do texto inserido.
- [x] Implementar navegação web compatível com Android, incluindo controles essenciais, tratamento seguro de links e indicadores de progresso durante o carregamento.
- [x] Implementar gerenciamento de múltiplas abas privadas, com visualização, seleção e fechamento individual de abas.
- [x] Limpar os dados associados à sessão quando uma aba privada for fechada, reduzindo cookies, cache, formulários e armazenamento local sempre que a plataforma permitir.
- [x] Implementar bloqueio de rastreadores e medidas de redução de persistência local, com comportamento transparente sobre limitações técnicas e possíveis impactos em sites.
- [x] Implementar histórico privado controlado pelo usuário, limitado ao contexto da sessão e apagável.
- [x] Implementar estados claros de carregamento, ausência de conexão, certificado ou navegação insegura e falha de página, com opções acessíveis para tentar novamente ou voltar.
- [x] Exibir aviso honesto e visível de que anonimato em nível Tor exige uma rede ou proxy Tor real, preparando arquitetura para integração futura sem simular ou alegar esse recurso.
- [x] Implementar acessibilidade Android com contraste adequado, rótulos para leitores de tela, foco previsível e suporte a dimensionamento de texto.

## Identidade nativa e entrega

- [x] Criar e configurar ícones quadrados de launcher em preto, roxo e rosa neon, sem cantos arredondados embutidos, mantendo os identificadores nativos do starter.
- [x] Executar checagem TypeScript/lint e corrigir diagnósticos acionáveis.
- [x] Salvar a implementação no repositório Manus e usar a integração autenticada do GitHub para disponibilizar uma cópia privada do código, sem trocar o repositório canônico nativo do Mobile.
- [x] Deixar o projeto pronto para gerar APK/AAB Android pelo Dashboard; não alegar que um APK foi gerado sem o resultado real do build.

O release nativo não é compilado dentro do Sandbox; o projeto e o checkpoint ficam preparados para a ação de build Android do Dashboard.
