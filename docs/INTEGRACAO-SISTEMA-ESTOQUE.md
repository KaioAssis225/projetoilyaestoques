# Projeto Ilya Estoque — desenvolvimento e guia de integração

## 1. Objetivo deste documento

Este documento descreve o processo de desenvolvimento do projeto Ilya Estoque, as regras de negócio implementadas, a estrutura de dados e as rotas HTTP disponíveis.

O foco principal é orientar a integração com um sistema empresarial já existente, como ERP, sistema comercial, WMS, sistema de compras ou emissor fiscal. O integrador deve considerar qual aplicação será a fonte oficial de cada informação e evitar que dois sistemas alterem o mesmo saldo sem uma regra clara de sincronização.

## 2. Visão geral da solução

O projeto é uma aplicação web de controle operacional de estoque dividida em cinco áreas:

1. **Estoque:** posição consolidada por produto.
2. **Comercial:** reservas e empenhos de pedidos.
3. **Comércio Exterior:** compras, trânsito, Porto e chegada ao Estoque GH.
4. **Logística:** separação por pedido, baixa por nota fiscal, ajustes e devoluções.
5. **Alocação:** posições físicas do Estoque GH e posições de produtos devolvidos.

### Tecnologias atuais

- React e Next.js/vinext no frontend.
- Rotas HTTP no diretório `app/api`.
- Cloudflare Workers como ambiente de execução.
- Cloudflare D1, compatível com SQLite, para persistência.
- Drizzle ORM para declaração do esquema e geração de migrações.
- Binding lógico do banco: `DB`, declarado em `.openai/hosting.json`.

### Organização principal do código

| Caminho | Responsabilidade |
|---|---|
| `app/page.tsx` | Interface, formulários, estados das telas e chamadas às APIs. |
| `app/api/commitments/route.ts` | Reservas e empenhos criados pelo Comercial. |
| `app/api/foreign-trade/route.ts` | Compras, remessas e movimentações do Comércio Exterior. |
| `app/api/allocations/route.ts` | Alocações físicas do Estoque GH. |
| `app/api/logistics/route.ts` | Separação, NF, devolução e ajustes logísticos. |
| `db/schema.ts` | Definição das tabelas do banco. |
| `db/index.ts` | Criação do cliente Drizzle sobre o binding D1. |
| `drizzle/` | Histórico das migrações do banco. |
| `app/chatgpt-auth.ts` | Funções auxiliares de autenticação, ainda não aplicadas às rotas operacionais. |

## 3. Processo de desenvolvimento por blocos

### Bloco 1 — Estoque consolidado

Foi criada a visão central por produto com os seguintes saldos, nesta ordem:

- Estoque China;
- Em trânsito;
- Porto;
- Estoque GH;
- Estoque Devolução.

O Estoque GH apresenta também a quantidade empenhada e o saldo disponível. O cálculo conceitual é:

```text
Disponível no GH = Estoque GH - soma dos itens em reservas e pedidos empenhados
```

O campo `returns` é independente do campo `gh`. Portanto, um item devolvido não volta automaticamente ao saldo comercial disponível do Estoque GH.

### Bloco 2 — Comercial

O Comercial ganhou dois documentos:

- **Reserva de itens:** recebe um código sequencial `R001`, `R002`, `R003` etc.; exige observação.
- **Empenho de pedido:** exige número do pedido; a observação é opcional; pode ser marcado como item de empréstimo.

Cada documento aceita um ou mais produtos. O sistema soma todas as linhas do mesmo produto antes de validar o saldo. Não permite empenhar mais que o saldo disponível no Estoque GH.

O cancelamento é feito por documento completo. Todos os itens são removidos juntos e voltam a ficar disponíveis.

### Bloco 3 — Comércio Exterior

O Comércio Exterior controla a entrada de produtos e a progressão entre locais:

```text
Compra → China ou Em trânsito → Porto → Estoque GH → Aguardando alocação
```

Uma compra pode ser dividida entre China e trânsito. Toda quantidade em trânsito exige data prevista para o Porto. Na data, o usuário confirma a chegada ou informa uma nova previsão.

Depois da chegada ao Porto, é exigida uma previsão de chegada ao Estoque GH. Quando a chegada ao GH é confirmada:

- o saldo sai do Porto;
- o saldo entra no Estoque GH;
- a remessa é concluída;
- é criada uma pendência de alocação física.

O fluxo “Retirar do estoque China” usa a mesma progressão, começando pela redução do saldo na China e entrada em trânsito.

### Bloco 4 — Alocação

Todo saldo físico do Estoque GH deve estar associado a uma posição:

- rua;
- coluna;
- nível;
- quantidade.

A soma das posições de um produto não pode ultrapassar seu saldo no Estoque GH. Quando o mesmo produto é alocado novamente na mesma rua, coluna e nível, a quantidade é somada à posição existente.

A chegada confirmada pelo Comércio Exterior cria uma tarefa de alocação. A tarefa permanece pendente até toda a quantidade recebida ser alocada.

A área possui duas visualizações:

- **Estoque GH:** posições do estoque normal.
- **Devolução:** posições criadas somente pelo retorno de pedidos de empréstimo.

### Bloco 5 — Logística

A saída normal foi substituída por **Separação de item por pedido**. A lista apresenta somente empenhos do tipo pedido ainda abertos no Comercial.

Para cada produto, a Logística seleciona uma ou mais posições físicas. A soma das quantidades selecionadas deve ser exatamente igual à quantidade empenhada.

Ao confirmar a separação:

- o Estoque GH é reduzido;
- as posições físicas são reduzidas ou removidas quando chegam a zero;
- as posições utilizadas são registradas no histórico;
- o documento deixa de aparecer como empenho aberto no Comercial;
- o processo logístico passa para `awaiting_invoice`.

Depois, o botão **Baixa por NF** exige o número da nota fiscal e salva a data de saída.

Para um pedido comum, o status passa para `completed`. Para um pedido de empréstimo, passa para `awaiting_return`.

Na devolução de empréstimo, todos os itens retornam juntos. É obrigatório informar rua, coluna e nível para cada item. A confirmação:

- soma a quantidade no Estoque Devolução;
- registra as posições em `return_allocations`;
- muda o processo para `returned`.

### Bloco 6 — Sincronização da interface

As operações atualizam os dados da própria tela e das áreas dependentes sem exigir recarregamento manual. Por exemplo, a criação de um empenho de pedido atualiza imediatamente a lista de pedidos disponíveis para separação na Logística.

Essa sincronização é feita pelo frontend com novas consultas HTTP após uma operação. Atualmente não há WebSocket, Server-Sent Events ou fila de eventos. Portanto, a atualização automática ocorre na mesma sessão que realizou a alteração. Para múltiplos usuários simultâneos, recomenda-se adicionar eventos em tempo real ou atualização periódica.

## 4. Modelo de dados

### `inventory`

Cadastro e saldo consolidado dos produtos.

| Campo | Função |
|---|---|
| `code` | Código único do produto. |
| `description` | Descrição. |
| `finish` | Acabamento. |
| `china` | Quantidade na China. |
| `transit` | Quantidade em trânsito. |
| `port` | Quantidade no Porto. |
| `gh` | Quantidade no Estoque GH. |
| `returns` | Quantidade no Estoque Devolução. |
| `updated_at` | Data da última atualização. |

### Comércio Exterior

- `purchase_orders`: registro da compra e sua divisão inicial.
- `shipments`: remessas em trânsito ou no Porto, com previsão de chegada.
- `allocation_tasks`: quantidades recebidas no GH que ainda precisam ser alocadas.

### Comercial

- `commitment_documents`: cabeçalho da reserva ou do pedido empenhado.
- `commitment_document_items`: produtos e quantidades do documento.
- `commitments`: tabela legada mantida para migração de dados antigos.

### Alocação

- `allocations`: posições físicas do Estoque GH.
- `return_allocations`: posições físicas do Estoque Devolução.

### Logística

- `logistics_orders`: processo logístico e seu status.
- `logistics_order_items`: itens separados.
- `logistics_order_sources`: posições das quais cada quantidade foi retirada.
- `logistics_events`: histórico legado de saídas manuais e ajustes; atualmente continua sendo usado para ajustes de estoque.

## 5. Convenções gerais das APIs

- Base local: `http://localhost:3000`.
- Conteúdo enviado: `Content-Type: application/json`.
- Respostas: JSON.
- Sucesso de criação comercial: HTTP `201`.
- Demais sucessos: HTTP `200`.
- Erro de validação: normalmente HTTP `400`.
- Registro não encontrado em remessa: HTTP `404`.
- Quantidades operacionais devem ser inteiros.
- Datas são enviadas como `AAAA-MM-DD`.
- Os nomes de campos das respostas seguem atualmente o formato `snake_case` do banco.

As rotas de Comércio Exterior e Logística usam um campo `action` no corpo para selecionar a operação. Em uma integração corporativa definitiva, pode ser preferível criar endpoints REST separados para facilitar autorização, auditoria e versionamento.

## 6. Rota Comercial — `/api/commitments`

### `GET /api/commitments`

Retorna todos os documentos comerciais ainda abertos.

Resposta resumida:

```json
{
  "documents": [
    {
      "id": 15,
      "type": "order",
      "reservation_code": null,
      "order_number": "10500",
      "note": "",
      "loan_items": 1,
      "created_at": "2026-07-20 10:00:00",
      "items": [
        {
          "id": 28,
          "code": "CD0100",
          "quantity": 10,
          "description": "Cadeira",
          "finish": "Taupe"
        }
      ]
    }
  ]
}
```

### `POST /api/commitments`

Cria uma reserva ou empenho de pedido.

Reserva:

```json
{
  "type": "reservation",
  "note": "Reserva para showroom",
  "items": [
    { "code": "CD0100", "quantity": 5 },
    { "code": "MJ0100", "quantity": 2 }
  ]
}
```

Pedido:

```json
{
  "type": "order",
  "orderNumber": "10500",
  "note": "Cliente corporativo",
  "loanItems": true,
  "items": [
    { "code": "CD0100", "quantity": 10 }
  ]
}
```

Regras:

- `type` aceita `reservation` ou `order`.
- Reserva exige `note`.
- Pedido exige `orderNumber`.
- `loanItems` só é aplicado a pedidos.
- Deve existir pelo menos um item.
- A quantidade precisa ser inteira e positiva.
- A soma solicitada por produto não pode ultrapassar `inventory.gh` menos todos os empenhos abertos.

### `DELETE /api/commitments?id={documentId}`

Cancela o documento completo e remove todas as linhas associadas.

Exemplo:

```http
DELETE /api/commitments?id=15
```

## 7. Rota Comércio Exterior — `/api/foreign-trade`

### `GET /api/foreign-trade`

Retorna:

- `inventory`: todos os saldos;
- `shipments`: somente remessas não concluídas;
- `orders`: até 30 registros de compra recentes ainda existentes.

### `POST` com `action: "purchase"`

Registra uma compra.

```json
{
  "action": "purchase",
  "code": "CD0100",
  "totalQuantity": 100,
  "chinaQuantity": 50,
  "transitQuantity": 50,
  "dueDate": "2026-08-15"
}
```

`chinaQuantity + transitQuantity` deve ser igual a `totalQuantity`. A data é obrigatória quando existir quantidade em trânsito.

### `POST` com `action: "dispatch_china"`

Retira saldo da China e coloca em trânsito.

```json
{
  "action": "dispatch_china",
  "code": "CD0100",
  "quantity": 20,
  "dueDate": "2026-08-15"
}
```

Não permite quantidade superior ao saldo da China.

### `POST` com `action: "reschedule"`

Atualiza a previsão de uma remessa aberta.

```json
{
  "action": "reschedule",
  "code": "CD0100",
  "shipmentId": 9,
  "dueDate": "2026-08-22"
}
```

### `POST` com `action: "confirm_arrival"`

Confirma a chegada da etapa atual.

Chegada ao Porto, exigindo a próxima previsão para o GH:

```json
{
  "action": "confirm_arrival",
  "code": "CD0100",
  "shipmentId": 9,
  "dueDate": "2026-08-30"
}
```

Quando a remessa já está no Porto, a mesma ação confirma a chegada ao GH. Nesse caso, `dueDate` não é utilizado.

### `POST` com `action: "reset_test_data"`

Limpa dados operacionais e zera os estoques para testes.

```json
{
  "action": "reset_test_data",
  "code": "CD0100"
}
```

> **Alerta:** esta ação é destrutiva, limpa também os processos logísticos e as devoluções, e não deve estar disponível em produção.

## 8. Rota Alocação — `/api/allocations`

### `GET /api/allocations`

Retorna:

- `inventory`: posição consolidada;
- `allocations`: posições físicas do Estoque GH enriquecidas com descrição e acabamento;
- `tasks`: pendências de alocação ainda abertas.

### `POST /api/allocations`

Cria ou soma uma posição física.

```json
{
  "code": "CD0100",
  "street": "A",
  "column": "03",
  "level": "02",
  "quantity": 20,
  "taskId": 7
}
```

Regras:

- rua, coluna, nível e quantidade são obrigatórios;
- quantidade deve ser inteira e positiva;
- a soma alocada não pode ultrapassar o Estoque GH;
- quando `taskId` for enviado, a quantidade não pode ultrapassar a pendência daquela chegada;
- produto e posição iguais, sem diferenciar maiúsculas e minúsculas, têm suas quantidades somadas;
- a tarefa é concluída quando toda a quantidade recebida for alocada.

As posições de devolução são somente leitura nesta área e são produzidas pelo fluxo `return_order` da Logística.

## 9. Rota Logística — `/api/logistics`

### `GET /api/logistics`

Retorna:

- `inventory`: saldos atuais;
- `events`: ajustes e eventos logísticos legados;
- `openOrders`: empenhos de pedido ainda disponíveis para separação;
- `logisticsOrders`: pedidos já separados e seus estados;
- `returnAllocations`: posições do Estoque Devolução.

### `POST` com `action: "separate_order"`

Separa um pedido usando uma ou mais posições por item.

```json
{
  "action": "separate_order",
  "documentId": 15,
  "selections": [
    { "itemId": 28, "allocationId": 4, "quantity": 6 },
    { "itemId": 28, "allocationId": 8, "quantity": 4 }
  ]
}
```

Regras e efeitos:

- o documento deve ser um pedido ainda aberto;
- cada item precisa ter pelo menos uma posição;
- a soma das posições deve ser exatamente igual à quantidade do item;
- nenhuma posição pode ficar negativa;
- reduz o Estoque GH;
- reduz ou remove as alocações consumidas;
- copia os dados das posições para o histórico de origem;
- remove o documento da fila Comercial;
- cria um processo com status `awaiting_invoice`.

### `POST` com `action: "invoice"`

Registra a nota fiscal e a data de saída.

```json
{
  "action": "invoice",
  "orderId": 12,
  "invoiceNumber": "NF-88991"
}
```

Transição:

- pedido normal: `awaiting_invoice → completed`;
- empréstimo: `awaiting_invoice → awaiting_return`.

### `POST` com `action: "return_order"`

Registra a devolução integral de um empréstimo.

```json
{
  "action": "return_order",
  "orderId": 12,
  "positions": [
    { "itemId": 31, "street": "DEV-A", "column": "01", "level": "02" },
    { "itemId": 32, "street": "DEV-B", "column": "03", "level": "01" }
  ]
}
```

Todos os itens precisam receber uma posição. As quantidades são as mesmas separadas originalmente e não podem ser devolvidas parcialmente. O saldo é somado em `inventory.returns`, não em `inventory.gh`.

### `POST` com `action: "adjustment"`

Ajusta diretamente o Estoque GH, exigindo justificativa.

```json
{
  "action": "adjustment",
  "code": "CD0100",
  "newQuantity": 120,
  "note": "Correção após inventário físico"
}
```

O ajuste é registrado em `logistics_events`, com saldo anterior, novo saldo e observação.

## 10. Estados e transições importantes

### Remessas

```text
transit → port → completed
```

### Tarefas de alocação

```text
pending → completed
```

### Pedido normal

```text
Empenhado no Comercial → awaiting_invoice → completed
```

### Pedido de empréstimo

```text
Empenhado no Comercial → awaiting_invoice → awaiting_return → returned
```

## 11. Estratégia recomendada para integrar com um sistema existente

### Etapa 1 — Definir a fonte oficial por domínio

Antes da integração, documentar quem manda em cada informação:

| Informação | Fonte oficial sugerida |
|---|---|
| Cadastro de produto | ERP existente. |
| Pedido comercial | ERP ou sistema comercial existente. |
| Compra internacional | ERP ou módulo de Comércio Exterior. |
| Localização física | Ilya Estoque ou WMS. |
| Nota fiscal | ERP/emissor fiscal. |
| Saldo consolidado | Definir um único proprietário; evitar edição concorrente. |

### Etapa 2 — Criar identificadores externos

Adicionar campos como `external_id`, `external_updated_at` e `source_system` nas tabelas integradas. O número do pedido pode se repetir atualmente e não deve ser usado sozinho como chave técnica.

### Etapa 3 — Tornar gravações idempotentes

Toda movimentação vinda de outro sistema deve possuir uma chave única de evento. Se o integrador reenviar a mesma requisição, o estoque não pode ser somado ou reduzido novamente.

Exemplo de cabeçalho ou campo recomendado:

```text
Idempotency-Key: erp-pedido-10500-separacao-1
```

### Etapa 4 — Separar comandos de consultas

Para produção, recomenda-se evoluir de `POST + action` para rotas versionadas:

```text
POST /api/v1/purchase-orders
POST /api/v1/shipments/{id}/arrival
POST /api/v1/orders/{id}/separation
POST /api/v1/orders/{id}/invoice
POST /api/v1/orders/{id}/return
```

Isso permite políticas de acesso diferentes por operação e contratos mais fáceis de manter.

### Etapa 5 — Sincronização

Existem três alternativas:

1. **Webhook:** o sistema de origem chama o Ilya Estoque quando algo muda. É a opção preferida para atualização rápida.
2. **Fila de eventos:** indicada quando confiabilidade e reprocessamento são críticos.
3. **Consulta periódica:** implementação simples, porém com atraso e maior risco de duplicidade.

Para cada evento recebido, salvar data, origem, identificador externo, conteúdo resumido, resultado e mensagem de erro.

### Etapa 6 — Conciliação

Criar uma rotina periódica que compare:

- saldo por produto;
- empenhos abertos;
- pedidos aguardando NF;
- empréstimos aguardando devolução;
- total físico alocado versus Estoque GH;
- total de posições de devolução versus Estoque Devolução.

Diferenças não devem ser corrigidas silenciosamente. Devem gerar uma pendência de conciliação com histórico.

## 12. Segurança e prontidão para produção

Antes de integrar dados reais, são necessárias as seguintes melhorias:

1. Aplicar autenticação às páginas e APIs. O arquivo `app/chatgpt-auth.ts` existe, mas as rotas operacionais ainda não exigem usuário autenticado.
2. Criar autorização por perfil: Comercial, Comércio Exterior, Logística, Alocação e administrador.
3. Desativar ou proteger `reset_test_data`.
4. Registrar usuário responsável por cada ação.
5. Adicionar chaves estrangeiras e índices às relações principais.
6. Garantir atomicidade das movimentações críticas. Algumas operações executam inserções antes do lote final e precisam ser protegidas contra falha intermediária.
7. Implementar idempotência e controle de concorrência.
8. Validar códigos, pedidos e notas contra o sistema oficial.
9. Versionar as APIs antes de disponibilizá-las a integrações externas.
10. Definir política de retenção, backup e restauração do D1.

## 13. Regras que o sistema integrado não deve violar

- Nunca permitir saldo negativo.
- Nunca empenhar mais que o GH disponível.
- Nunca alocar no GH mais que o saldo GH.
- Nunca separar um pedido com soma diferente da quantidade empenhada.
- Nunca baixar a mesma NF duas vezes para o mesmo processo.
- Nunca devolver parcialmente um empréstimo no modelo atual.
- Nunca somar uma devolução ao GH normal sem uma movimentação de transferência explícita.
- Nunca reutilizar uma reserva sequencial cancelada.

## 14. Checklist de homologação da integração

- [ ] Cadastro de produtos sincronizado por identificador estável.
- [ ] Criação e cancelamento de reserva testados.
- [ ] Criação de pedido comum e de empréstimo testada.
- [ ] Validação de saldo insuficiente testada.
- [ ] Compra dividida entre China e trânsito testada.
- [ ] Reagendamento de chegada testado.
- [ ] Chegada ao Porto e ao GH testada.
- [ ] Criação automática de pendência de alocação testada.
- [ ] Separação em uma posição testada.
- [ ] Separação em múltiplas posições testada.
- [ ] Baixa por NF testada.
- [ ] Devolução integral e Estoque Devolução testados.
- [ ] Reenvio da mesma mensagem sem duplicidade testado.
- [ ] Concorrência de dois usuários sobre o mesmo saldo testada.
- [ ] Perfis e permissões testados.
- [ ] Logs, alertas, backup e restauração testados.

## 15. Próximos passos sugeridos

1. Escolher o sistema que será integrado e listar os campos disponíveis.
2. Produzir um mapa de campos entre esse sistema e as tabelas deste projeto.
3. Definir a fonte oficial de cada saldo e documento.
4. Criar a versão `/api/v1` com autenticação, autorização e idempotência.
5. Implementar uma integração piloto somente com cadastro e pedidos.
6. Homologar as movimentações de estoque em ambiente isolado.
7. Ativar Comércio Exterior, Logística e devoluções em etapas.

---

Esta documentação representa o comportamento atual do código até a migração `0010_remarkable_speedball.sql`. Qualquer alteração de regra, rota ou esquema deve atualizar este arquivo na mesma entrega.
