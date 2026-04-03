@../CLAUDE.md

# Sailor — CLAUDE.md
**REF-DS/CLAUDE/SAILOR v1.0**

## Identité

- **Code agent :** AG002
- **Tier design :** T2 — Product
- **Couleur accent :** Copper `#A0694A` (`--color-copper`)
- **Périmètre :** Base documentaire → chatbot → sources toujours citées

## Stack technique

| Couche | Tech |
|--------|------|
| Frontend | React + Vite (`sailor/app/`) |
| Backend | Express.js (`sailor/server/`) |
| Routing | React Router v7 |
| Icons | Lucide React |
| Build | Vite 8 |

## Structure

```
sailor/
├── app/          ← Frontend React
│   ├── src/
│   └── ...
└── server/       ← API Express
```

## Opérateurs utilisés

Sailor orchestrate : `OP-003 RAG`, `OP-004 OCR`, `OP-005 Doc Understanding`,
`OP-008 Embedding`, `OP-009 Chunker`, `OP-010 Reranker`, `OP-011 Vector Store`

## Règles UX spécifiques

- **Chaque réponse doit citer ses sources.** Toujours. C'est la promesse fondamentale de Sailor.
- Score de confiance affiché sur chaque réponse : `X sources · Score: YY`
- L'accent copper `#A0694A` souligne les éléments documentaires (badges source, indicateurs RAG)
- Interface chatbot T2 standard + panel sources latéral

## État design

⚠️ Vérifier l'alignement avec T2 — border-radius 6px, accent copper, tokens `@liteops/ds`.
