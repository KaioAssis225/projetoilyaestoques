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
- **Estoque empenhado:** parte do estoque físico GH já reservada para demandas comerciais confirmadas. Não é um estoque adicional.
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
2. Quantidade não atendida, gerando necessidade de compra para Comércio Exterior.

Quantidades na China, em trânsito e no Porto podem ser exibidas como previsão de cobertura, mas não são reservadas. A confirmação cria empenho somente sobre o saldo disponível no Estoque GH.

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
| Estoque GH | Quantidade física total no Estoque GH, com indicação da parcela empenhada e do saldo disponível. |

### Comportamento da primeira versão

- Exibir uma linha por código de item.
- Atualizar imediatamente os valores de empenho e disponibilidade após criar ou cancelar um empenho, sem exigir filtros ou recarregamento.
- Permitir busca por código, descrição ou acabamento.
- Permitir ordenação pelas colunas da tabela.
- Exibir somente valores inteiros e nunca deixar células de saldo vazias; ausência de saldo aparece como `0`.
- Destacar visualmente o Estoque Empenhado, conforme o modelo fornecido.
- Atualizar os saldos automaticamente a partir das movimentações, sem edição direta na tabela.
- Exibir no Estoque GH o saldo físico total, a quantidade empenhada e a quantidade disponível.

### Regras de cálculo

- `Estoque GH` é o saldo físico total, antes da dedução dos empenhos.
- `Estoque empenhado` não é somado ao estoque: representa parte do Estoque GH já comprometida.
- A quantidade disponível no Estoque GH é calculada como `saldo físico GH - saldo empenhado GH`.
- Estoque China, trânsito e Porto não recebem empenhos.
- Os pedidos comerciais são processados por ordem de confirmação.

### Critérios de aceite

- Os sete cabeçalhos e sua ordem correspondem ao modelo aprovado.
- Cada item aparece uma única vez na visão consolidada.
- A soma exibida por área corresponde aos movimentos válidos registrados para o item.
- O empenho corresponde às reservas ativas no Estoque GH.
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

### Fluxo inicial da área Comércio Exterior

- A navegação possui uma área própria chamada `Comércio Exterior`.
- Em `Novo pedido de compra`, o usuário seleciona o código e informa a quantidade total comprada.
- A compra deve ser integralmente distribuída entre Estoque China e Em trânsito; uma das parcelas pode ser zero.
- Quando houver quantidade enviada em trânsito, a previsão de chegada ao Porto é obrigatória.
- Na data prevista ou após ela, a remessa permanece com alerta até o usuário informar `Chegou` ou `Não chegou`.
- `Não chegou` exige uma nova data prevista.
- Ao confirmar chegada ao Porto, toda a quantidade passa de Em trânsito para Porto e o usuário informa a previsão de chegada ao GH.
- Ao confirmar chegada ao GH, toda a quantidade passa do Porto para o Estoque GH.
- Confirmações de chegada nesta versão são sempre integrais; não há recebimento parcial.
- Em `Retirar do estoque China`, o usuário seleciona código, quantidade e previsão de chegada ao Porto.
- A retirada não pode superar o saldo disponível no Estoque China.
- Pedidos, remessas, previsões e saldos físicos são persistidos no banco D1.
- A lista `Pedidos de compra` exibe somente pedidos com remessas ainda em aberto.
- Quando a remessa vinculada é confirmada integralmente no Estoque GH, o pedido é concluído e removido da lista de pedidos abertos.

O status deve ser calculado pelas quantidades das linhas; um pedido pode ter itens em etapas diferentes.

### Critérios de aceite

- A soma distribuída nunca supera a quantidade comprada.
- Um mesmo item pode ser embarcado parcialmente em datas diferentes.
- Toda alteração de previsão registra data anterior, nova data, motivo e usuário.
- Confirmar chegada ao porto não aumenta o estoque GH.
- Somente a confirmação e alocação no GH aumentam o estoque físico.

## Módulo 4 — Recebimento e alocação no Estoque GH

### Objetivo

### Fluxo inicial da área Alocação

- A navegação possui uma área própria chamada `Alocação`.
- O usuário seleciona um código e informa rua, coluna, nível e quantidade.
- Todos os campos são obrigatórios.
- Um mesmo código pode ser distribuído entre múltiplas posições.
- A soma das quantidades alocadas de um código não pode ultrapassar seu saldo físico no Estoque GH.
- A tela informa o saldo GH, o total já alocado e o restante disponível para alocação.
- As posições ficam persistidas em tabela com produto, descrição, rua, coluna, nível e quantidade.
- Quando código, rua, coluna e nível forem iguais a uma posição existente, a nova quantidade é somada à mesma linha.
- A tabela permite ordenar alfabeticamente pelo código do produto em ordem crescente ou decrescente.
- Ao confirmar a chegada de uma remessa no Estoque GH, o sistema cria automaticamente uma pendência de alocação com o código e a quantidade integral recebida.
- A pendência permanece visível até que toda a quantidade recebida seja alocada em uma ou mais posições.

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

### Fluxo inicial da área Logística

- A navegação possui uma área própria chamada `Logística`.
- Em `Saída de produtos`, nota fiscal, número do pedido, código e quantidade são obrigatórios.
- A saída diminui imediatamente o saldo físico do Estoque GH.
- Antes de informar a quantidade, o usuário seleciona uma das posições alocadas do produto.
- A saída reduz simultaneamente o saldo do Estoque GH e a quantidade da posição escolhida.
- A quantidade não pode ultrapassar o saldo da posição; posições zeradas são removidas.
- A quantidade da saída não pode superar o saldo disponível nem consumir unidades empenhadas.
- Em `Ajuste de estoque`, o usuário seleciona o código e informa a nova quantidade física do Estoque GH.
- Todo ajuste exige uma observação explicando o motivo.
- Saídas e ajustes são persistidos em um histórico cronológico com produto, quantidades, nota, pedido, justificativa, data e hora.
- O histórico de saída registra também rua, coluna e nível de origem.

## Módulo 6 — Demanda comercial e empenho

### Objetivo

Analisar um orçamento, reservar quantidades e indicar como a demanda será atendida.

### Integração esperada

Adicionar à aba de pedidos do sistema comercial existente um botão de análise e confirmação. A integração será feita futuramente por webhook; seu contrato e sua implementação não fazem parte desta etapa do projeto.

### Fluxo

1. O usuário acessa a área Comercial e seleciona `Novo empenho`.
2. Escolhe o código do item.
3. O sistema exibe o estoque GH físico, o estoque já empenhado e o saldo disponível.
4. O usuário informa uma quantidade inteira positiva e uma observação com o motivo ou destinatário.
5. Se a quantidade solicitada superar o saldo disponível no Estoque GH, o sistema bloqueia a confirmação e informa o saldo disponível.
6. A confirmação cria o empenho no Estoque GH e atualiza seu saldo disponível.
7. Cada empenho ativo pode ser cancelado mediante confirmação do usuário.
8. O cancelamento remove o empenho ativo e devolve imediatamente a quantidade ao saldo disponível do Estoque GH.

### Exemplo

Demanda de 50 unidades, com 20 disponíveis no GH, nenhuma em trânsito e 80 unidades na China:

- 20 reservadas no GH.
- 30 unidades não empenhadas, com cobertura futura projetada pelo saldo da China.
- O saldo China permanece 80, pois não recebe reservas.
- A necessidade pendente da demanda permanece identificada até a mercadoria entrar no Estoque GH.

### Critérios de aceite

- A mesma unidade não pode atender duas demandas.
- Somente usuários da área Comercial autorizados podem criar empenhos.
- Código do item, quantidade e observação são obrigatórios.
- A quantidade empenhada deve ser inteira, positiva e menor ou igual ao saldo disponível no Estoque GH.
- Alterar ou cancelar uma demanda libera o empenho correspondente no Estoque GH.
- A criação e o cancelamento de empenhos atualizam imediatamente a visão de Estoque.
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
- Demandas podem reservar quantidades somente no Estoque GH.
- Demandas concorrentes são atendidas por ordem de confirmação.
- Uma localização pode conter códigos diferentes.
- O MVP aceita somente recebimentos com a quantidade prevista.
- Toda saída por nota fiscal deve estar vinculada a um orçamento ou pedido comercial.
- O número, isoladamente, identifica uma nota fiscal de forma única.
- Administradores podem ajustar estoque a qualquer momento; a Logística também pode, mediante motivo obrigatório.

### Visão inicial confirmada

- A primeira entrega começa por uma tabela consolidada de estoque baseada no arquivo `modelo de estoque.xlsx`.
- A tabela apresenta código, descrição, acabamento, China, trânsito, Porto e Estoque GH.
- O Estoque GH apresenta, na mesma célula, o saldo físico, a quantidade empenhada e a quantidade disponível.
- Os exemplos de pedidos comerciais presentes na planilha servem como massa de cenário para validar o cálculo automático do empenho, e não como parte da tabela principal.

## 10. Definição de pronto do MVP

O MVP estará pronto quando um pedido de compra puder ser acompanhado da China até o GH, seus itens puderem ser alocados em múltiplas posições, uma demanda comercial puder reservar saldos sem duplicidade, uma saída puder ser registrada por nota fiscal e todo saldo puder ser explicado pelo histórico de movimentos.
