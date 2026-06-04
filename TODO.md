# TODO

## Fase 4 — Bluetooth (cubo físico) — futuro, opt-in, lazy

Suporte a smart cubes (GAN, Giiker, GoCube, QiYi) só na página principal,
carregado sob demanda. **Reusar `cubing/bluetooth`, não reimplementar** — a
decodificação BLE (GAN com cripto, etc.) é a parte difícil e já está pronta.

### Esboço de implementação

- **Import lazy, só no clique** (não carrega no boot):
  ```js
  const { connectSmartPuzzle } = await import('cubing/bluetooth')
  const puzzle = await connectSmartPuzzle() // precisa de gesto do usuário
  ```
- **Stream de movimentos** → alimentar o motor geométrico existente:
  ```js
  puzzle.addAlgLeafListener(e => {
    const move = e.latestAlgLeaf.as(Move) // Move do cubing/alg
    renderer.performMove(`${move.family}${...amount}`, speed)
  })
  ```
  Cada giro físico emite um `Move` (`family` + `amount`) — mapeia direto na
  tabela de `src/moves.js` (o contrato geométrico compartilhado). Basta
  serializar `family`+`amount` para um token que `resolveMove` entende.
- **Orientação (giroscópio)**, opcional:
  ```js
  puzzle.addOrientationListener(e => { /* e.quaternion {x,y,z,w} */ })
  ```
- **UI**: botão "Conectar cubo Bluetooth" no menu de settings (só página principal).

### Modo "seguir algoritmo"

Com Bluetooth conectado e `#a=` carregado: destacar o próximo movimento
esperado; quando o giro físico bate (`family`+`amount` == token esperado),
avançar e destacar o próximo. Compara **tokens de movimento**, não estado —
não precisa de kpuzzle.

### Notas de arquitetura (pesquisa cubing.js)

- `cubing/bluetooth` é entry-point standalone e code-split — pode ser
  `import()` dinâmico isolado do resto.
- O tipo `Move` vem de `cubing/alg` (leve). Dá pra depender só dele, ou ler
  `move.family` / `move.amount` e mapear para o motor próprio sem importar nada.
- **kpuzzle não é necessário** em nenhum ponto: nosso renderer é geométrico e o
  "seguir algoritmo" é comparação de tokens.

## Ideias menores (backlog)

- `remapMove` (lock view) só remapeia as 4 faces laterais e seus wides; slices,
  rotações e wides minúsculos ficam como estão. Generalizar se necessário.
- Commutators/conjugates `[R, U]` no parser: entram "de graça" se adotarmos
  `cubing/alg` junto com o Bluetooth.
