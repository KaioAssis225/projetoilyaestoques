# Projeto Ilya Estoques

Nova versão do sistema interno de controle de estoque da Ilya.

## Primeira entrega

A tela inicial apresenta uma visão consolidada por item:

- código;
- descrição;
- acabamento;
- estoque China;
- mercadoria em trânsito;
- mercadoria no porto;
- estoque físico GH;
- estoque empenhado.

A interface permite pesquisar, ordenar e filtrar itens empenhados.

## Executar localmente

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## Validar

```bash
npm run lint
npm run build
```

As regras de produto estão documentadas em `docs/PRD.md`.
