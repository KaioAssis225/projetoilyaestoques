# PRD — Sistema de Gestão de Estoque Ilya

**Status:** Rascunho v0.3  
**Responsável de produto:** a definir  
**Público:** Produto, Design, Engenharia e Operações  
**Última atualização:** 15/07/2026

## 1. Visão do produto

Criar um sistema interno que apresente, em uma única fonte confiável, onde cada item está e quanto dele está disponível, reservado, na China ou em trânsito. O sistema deve reduzir controles manuais, orientar o atendimento de pedidos comerciais e registrar todas as movimentações de estoque.

## 2. Objetivos

- Organizar o estoque de forma prática e automática.
- Permitir rastrear itens por localização física no Estoque GH.
- Acompanhar compras desde a China até a chegada e alocação no Estoque GH.
- Reservar estoque automaticamente conforme a demanda comercial.
- Alertar Comércio Exterior quando a demanda superar o estoque previsto.
- Manter histórico auditável de entradas, saídas, reservas e alterações de previsão.

### Indicadores iniciais de sucesso

- 100% das entradas e saídas do Estoque GH registradas no sistema.
- Saldo físico do sistema compatível com a contagem do Estoque GH.
- Toda saída associada a uma nota fiscal.
- Toda compra internacional com etapa, previsão e histórico de confirmações.
- Redução de controles paralelos em planilhas após a implantação.

## 3. Perfis de usuário

| Perfil | Usuários iniciais | Responsabilidades |
|---|---|---|
| Comercial | Lucimara | Consultar disponibilidade, analisar orçamento e confirmar demanda/reserva. |
| Logística | Valeria e Dewison | Alocar itens recebidos e registrar saídas por nota fiscal. |
| Comércio Exterior | Robson | Criar pedidos de compra, controlar estoque na China, trânsito e previsões de chegada. |
| Representante | Futuro | Ter visão adaptada da interface, sem alterar as regras centrais do estoque nesta fase. |
| Administrador | A definir | Gerenciar usuários, permissões e cadastros auxiliares. |

## 4. Conceitos e regras centrais

### 4.1 Saldos

- **Estoque China:** quantidade disponível na China e ainda não embarcada.
- **Em trânsito China → Porto:** quantidade embarcada com previsão de chegada ao Brasil.
- **No porto / em trânsito Porto → GH:** quantidade confirmada no Brasil, aguardando chegada ao Estoque GH.
- **Estoque GH físico:** quantidade efetivamente recebida na empresa.
- **Estoque empenhado:** quantidade já reservada para demandas comerciais confirmadas. Não é um estoque adicional.
- **Estoque GH disponível:** `Estoque GH físico - Estoque GH empenhado`.

Uma chegada aumenta o estoque físico GH. Ela não aumenta automaticamente o empenhado; o sistema apenas vincula o novo saldo às demandas que já estavam aguardando atendimento.

### 4.2 Localização física

- A localização é composta por **rua, coluna e nível**.
- O mesmo código pode existir em várias localizações.
- Cada alocação registra item, localização e quantidade.
- A soma das quantidades por localização deve ser igual ao estoque físico GH do item.
- Nenhuma movimentação pode deixar saldo negativo.

### 4.3 Prioridade para atender uma demanda

Ao confirmar uma demanda, o sistema propõe o atendimento nesta ordem:

1. Estoque GH disponível.
2. Quantidades em trânsito, ordenadas pela previsão mais próxima.
3. Estoque China disponível.
4. Quantidade não atendida, gerando necessidade de compra para Comércio Exterior.

O Comercial deve visualizar a composição antes de confirmar. A confirmação cria reservas por origem e evita que a mesma quantidade seja prometida duas vezes.

## 5. Escopo do MVP por módulo

## Módulo 0 — Visão inicial de estoque

### Objetivo

Ser a primeira tela do sistema e permitir comparar rapidamente, por item, onde estão as quantidades e quanto já está comprometido. Esta tela inicia o novo produto sem reproduzir a complexidade visual do protótipo anterior.

### Tabela principal

| Coluna | Definição |
|---|---|
| Código do item | Identificador único do produto. |
| Descrição | Nome principal do produto. |
| Acabamento | Variação ou acabamento padronizado do item. |
| Estoque China | Quantidade comprada e ainda mantida na China. |
| Em trânsito | Quantidade embarcada da China e ainda não confirmada no porto brasileiro. |
| Porto | Quantidade confirmada no porto e ainda não recebida fisicamente no Estoque GH. |
| Estoque GH | Quantidade física total no Estoque GH, somando todas as localizações. |
| Estoque empenhado | Total reservado para pedidos comerciais confirmados, considerando as reservas feitas em China, trânsito e GH. |

### Comportamento da primeira versão

- Exibir uma linha por código de item.
- Permitir busca por código, descrição ou acabamento.
- Permitir ordenação pelas colunas da tabela.
- Exibir somente valores inteiros e nunca deixar células de saldo vazias; ausência de saldo aparece como `0`.
- Destacar visualmente o Estoque Empenhado, conforme o modelo fornecido.
- Atualizar os saldos automaticamente a partir das movimentações, sem edição direta na tabela.
- Ao selecionar uma linha, permitir acesso futuro ao detalhamento por localização e à origem dos empenhos; esse detalhamento não precisa aparecer na primeira tela do MVP.

### Regras de cálculo

- `Estoque GH` é o saldo físico total, antes da dedução dos empenhos.
- `Estoque empenhado` não é somado ao estoque: representa parte das quantidades já comprometidas.
- A quantidade disponível para novos pedidos é calculada internamente por origem como `saldo físico - saldo empenhado`.
- O Porto aparece para rastreamento, mas não entra no empenho enquanto não houver decisão explícita alterando essa regra.
- Os pedidos comerciais são processados por ordem de confirmação.

### Critérios de aceite

- Os oito cabeçalhos e sua ordem correspondem ao modelo Excel aprovado.
- Cada item aparece uma única vez na visão consolidada.
- A soma exibida por área corresponde aos movimentos válidos registrados para o item.
- O empenho total corresponde à soma das reservas ativas em China, trânsito e GH.
- A tela continua legível com muitos itens e não exige abrir os fluxos operacionais para consultar os saldos.

## Módulo 1 — Acesso e permissões

### Objetivo

Garantir que cada perfil veja e execute somente as funções necessárias.

### Funcionalidades

- Login e encerramento de sessão.
- Perfis: Comercial, Logística, Comércio Exterior e Administrador.
- Permissões por ação, não apenas por tela.
- Registro do usuário responsável por cada alteração.
- Estrutura preparada para o perfil Representante, inicialmente apenas com diferença visual e de navegação.

### Critérios de aceite

- Um usuário de Logística não cria pedidos de compra.
- Um usuário Comercial não altera saldos manualmente.
- Toda movimentação registra autor, data e hora.

## Módulo 2 — Cadastro de itens e localizações

### Objetivo

Manter a identificação única dos produtos e suas posições no Estoque GH.

### Campos do item

- Código do item, único e obrigatório.
- Descrição do item, obrigatória.
- Acabamento, em campo separado e padronizado.
- Status: ativo ou inativo.

### Campos da localização

- Rua.
- Coluna.
- Nível.
- Identificador completo único, por exemplo `R03-C02-N01`.

### Critérios de aceite

- Não é possível cadastrar dois itens com o mesmo código.
- Um item pode ocupar várias localizações.
- Uma mesma localização pode conter códigos de itens diferentes.
- Alterações de descrição ou acabamento não apagam o histórico do item.

## Módulo 3 — Pedidos de compra e importação

### Objetivo

Acompanhar o pedido internacional desde sua criação até a entrega no Estoque GH.

### Fluxo

1. Comércio Exterior cria um pedido de compra.
2. Inclui itens e quantidades.
3. Para cada item, distribui a quantidade entre:
   - permanência no Estoque China;
   - embarque China → Porto.
4. Informa a previsão de chegada ao porto para a quantidade embarcada.
5. Na data prevista, o sistema solicita confirmação.
6. Se não chegou, o usuário informa nova previsão e o sistema preserva o histórico.
7. Se chegou, o usuário confirma a chegada ao Brasil e informa a previsão Porto → GH.
8. Na nova data, o sistema solicita outra confirmação.
9. Se chegou ao GH, o recebimento fica pendente de conferência e alocação pela Logística.

### Status sugeridos

`Rascunho` → `Pedido confirmado` → `Parcialmente em trânsito` → `No porto` → `A caminho do GH` → `Aguardando alocação` → `Concluído`.

O status deve ser calculado pelas quantidades das linhas; um pedido pode ter itens em etapas diferentes.

### Critérios de aceite

- A soma distribuída nunca supera a quantidade comprada.
- Um mesmo item pode ser embarcado parcialmente em datas diferentes.
- Toda alteração de previsão registra data anterior, nova data, motivo e usuário.
- Confirmar chegada ao porto não aumenta o estoque GH.
- Somente a confirmação e alocação no GH aumentam o estoque físico.

## Módulo 4 — Recebimento e alocação no Estoque GH

### Objetivo

Permitir que a Logística confira e distribua rapidamente os itens recebidos entre várias posições.

### Fluxo

1. A Logística visualiza recebimentos aguardando alocação.
2. Abre o pedido e confere cada código e quantidade recebida.
3. Divide a quantidade entre uma ou mais combinações de rua, coluna e nível.
4. O sistema mostra, em tempo real, quantidade recebida, já alocada e restante.
5. A conclusão é permitida somente quando a soma alocada for igual à quantidade aceita no recebimento.
6. Ao concluir, o estoque físico GH e as posições são atualizados em uma única operação.

### Exemplo

Para 20 unidades do item `ABC`:

| Rua | Coluna | Nível | Quantidade |
|---|---|---|---:|
| 1 | A | 1 | 12 |
| 2 | B | 2 | 8 |

### Critérios de aceite

- O usuário pode adicionar ou remover linhas de localização durante a alocação.
- O sistema impede concluir o recebimento com quantidade diferente da prevista.
- O MVP não permite recebimento parcial, sobra, falta ou item avariado. Uma divergência deve ser resolvida antes da confirmação no sistema.
- Uma falha durante a conclusão não pode atualizar apenas parte do estoque.

## Módulo 5 — Saída por nota fiscal

### Objetivo

Dar baixa no Estoque GH com rastreabilidade por nota fiscal.

### Fluxo

1. A Logística inicia uma nova saída.
2. Informa o número da nota fiscal.
3. Vincula a saída a um orçamento ou pedido comercial confirmado.
4. Pesquisa e seleciona os códigos dos itens.
5. Informa a quantidade de cada item.
6. O sistema sugere as localizações de retirada.
7. A Logística confirma as posições e conclui a saída.
8. O estoque físico, as reservas relacionadas e o histórico são atualizados juntos.

### Critérios de aceite

- O número da nota fiscal é obrigatório e único no sistema.
- Toda saída deve estar vinculada a um orçamento ou pedido comercial.
- Uma saída pode conter vários itens.
- O sistema impede saída superior ao saldo físico das posições escolhidas.
- A nota fiscal, itens, quantidades, posições, usuário, data e hora permanecem consultáveis.
- Cancelamento ou correção cria movimento inverso; não apaga o registro original.

## Módulo 6 — Demanda comercial e empenho

### Objetivo

Analisar um orçamento, reservar quantidades e indicar como a demanda será atendida.

### Integração esperada

Adicionar à aba de pedidos do sistema comercial existente um botão de análise e confirmação. A integração será feita futuramente por webhook; seu contrato e sua implementação não fazem parte desta etapa do projeto.

### Fluxo

1. O Comercial abre um orçamento.
2. O sistema identifica os códigos e quantidades solicitados.
3. Exibe, por item:
   - estoque GH físico;
   - estoque GH já empenhado;
   - estoque GH disponível;
   - quantidades e previsões em trânsito;
   - estoque China disponível;
   - falta projetada.
4. O sistema propõe a composição de atendimento conforme a prioridade definida.
5. O Comercial revisa e confirma.
6. A confirmação cria o empenho e atualiza os saldos disponíveis por origem.
7. Faltas geram alerta de necessidade de compra para Comércio Exterior.

### Exemplo

Demanda de 50 unidades, com 20 disponíveis no GH, nenhuma em trânsito e 80 disponíveis na China:

- 20 reservadas no GH.
- 30 reservadas/projetadas no Estoque China.
- 0 unidades sem cobertura.
- Saldo China disponível após a reserva: 50.

### Critérios de aceite

- A mesma unidade não pode atender duas demandas.
- Alterar ou cancelar uma demanda libera as reservas correspondentes.
- O Comercial vê a data prevista quando o atendimento depende de trânsito ou China.
- Uma falta gera alerta com item, quantidade faltante e demanda de origem.
- A confirmação final exige autorização do usuário; a análise, sozinha, não altera estoque.

## Módulo 7 — Alertas e tarefas

### Objetivo

Transformar previsões e faltas em ações visíveis para o responsável correto.

### Alertas do MVP

- Confirmar chegada ao porto na data prevista.
- Informar nova previsão quando a carga atrasar.
- Confirmar chegada ao GH na data prevista.
- Alocar recebimento pendente no estoque.
- Comprar quantidade insuficiente para uma demanda confirmada.

### Regras

- Cada alerta possui responsável, prazo, status e vínculo com o registro de origem.
- Alertas continuam pendentes até uma ação ou justificativa.
- O MVP utiliza alertas dentro do sistema; e-mail ou WhatsApp ficam fora do escopo inicial.

## Módulo 8 — Histórico, consulta e auditoria

### Objetivo

Explicar qualquer saldo atual a partir de movimentos registrados.

### Funcionalidades

- Consulta consolidada por código.
- Detalhamento por saldo, localização, pedido, demanda e nota fiscal.
- Histórico cronológico de entradas, saídas, reservas, liberações e ajustes.
- Filtros por período, código, usuário, tipo de movimento e nota fiscal.
- Exportação simples para CSV.

### Critérios de aceite

- Todo saldo possui movimentos que justificam sua composição.
- Registros de auditoria não podem ser editados ou apagados pelos usuários operacionais.
- Administradores podem realizar ajustes manuais a qualquer momento.
- Usuários de Logística também podem realizar ajustes, mas devem informar um motivo obrigatório.

## 6. Requisitos gerais

- Interface em português do Brasil e adequada a desktop.
- Pesquisa de item por código e descrição.
- Valores de quantidade devem ser inteiros e não negativos no MVP.
- Datas e horários armazenados com fuso e exibidos no horário de Brasília.
- Operações que alteram vários saldos devem ser concluídas integralmente ou desfeitas.
- O sistema deve validar permissões no servidor, independentemente do que a tela exibe.
- Dados históricos devem ser preservados quando itens ou usuários forem inativados.

## 7. Fora do escopo inicial

- Lote mínimo de compra.
- Controle de lote, número de série ou validade.
- Aplicativo móvel nativo.
- Leitura por código de barras.
- Notificações por WhatsApp.
- Previsão automática de demanda por inteligência artificial.
- Regras comerciais exclusivas para Representantes.
- Integrações não confirmadas com ERP, emissão fiscal ou rastreamento de transportadoras.

## 8. Estrutura sugerida para a equipe

Cada módulo funcional deve possuir regras, telas, API, persistência e testes próprios, compartilhando apenas identidade, catálogo e o registro central de movimentos.

| Frente | Entregas principais |
|---|---|
| Produto/Operações | Validar termos, prioridades, exceções e critérios de aceite. |
| UX/UI | Fluxos de compra, linha do tempo, alocação, saída e análise comercial. |
| Frontend | Telas por perfil, formulários, pesquisas e estados de alerta. |
| Backend | Permissões, regras de saldo, reservas, movimentações e alertas. |
| Dados | Modelo de itens, posições, pedidos, demandas e livro de movimentos. |
| Qualidade | Testes de saldos, concorrência, permissões e fluxos ponta a ponta. |

### Ordem recomendada de implementação

1. Visão inicial de estoque com os oito campos do modelo aprovado.
2. Acesso, permissões, cadastro de itens e localizações.
3. Livro de movimentos e consulta detalhada do estoque GH.
4. Saída por nota fiscal.
5. Pedido internacional, etapas e alertas de data.
6. Recebimento e alocação no GH.
7. Demanda comercial, reservas e alertas de compra.
8. Relatórios, exportação e acabamento da visão de Representante.

## 9. Decisões de produto

### Confirmadas

- O sistema comercial foi desenvolvido internamente e terá integração futura por webhook.
- O Estoque China contém somente mercadoria já comprada e pertencente à empresa.
- Demandas podem reservar quantidades no Estoque China, em trânsito e no Estoque GH.
- Demandas concorrentes são atendidas por ordem de confirmação.
- Uma localização pode conter códigos diferentes.
- O MVP aceita somente recebimentos com a quantidade prevista.
- Toda saída por nota fiscal deve estar vinculada a um orçamento ou pedido comercial.
- O número, isoladamente, identifica uma nota fiscal de forma única.
- Administradores podem ajustar estoque a qualquer momento; a Logística também pode, mediante motivo obrigatório.

### Visão inicial confirmada

- A primeira entrega começa por uma tabela consolidada de estoque baseada no arquivo `modelo de estoque.xlsx`.
- A tabela apresenta código, descrição, acabamento, China, trânsito, porto, GH e empenho.
- Os exemplos de pedidos comerciais presentes na planilha servem como massa de cenário para validar o cálculo automático do empenho, e não como parte da tabela principal.

## 10. Definição de pronto do MVP

O MVP estará pronto quando um pedido de compra puder ser acompanhado da China até o GH, seus itens puderem ser alocados em múltiplas posições, uma demanda comercial puder reservar saldos sem duplicidade, uma saída puder ser registrada por nota fiscal e todo saldo puder ser explicado pelo histórico de movimentos.
