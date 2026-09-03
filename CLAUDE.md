# Notas para o Claude Code

FPS de arena em TypeScript + Three.js + Vite. Projeto pessoal, sem framework
de jogo — tudo escrito à mão.

## Comandos

- `npm run dev` — servidor de desenvolvimento
- `npm run typecheck` — `tsc --noEmit`, roda em segundos
- `npm run build` — typecheck + bundle

**Sempre rode `npm run typecheck` antes de considerar uma mudança pronta.**
O `strict` está ligado, junto com `noUnusedLocals` e `noUnusedParameters`.

## Convenções

- Comentários e textos de UI em **português**, sem acentos no código-fonte
  (o HTML/CSS usa entidades ou texto sem acento) — o HUD é desenhado em fonte
  monoespaçada e acento fica desalinhado em algumas fontes.
- Números de balanceamento vão em `src/config.ts`, `WEAPON_DEFS` ou
  `ENEMY_DEFS`. Não espalhe constante mágica no meio da lógica.
- Nada de asset externo. Textura é canvas 2D, som é WebAudio, modelo é
  `BoxGeometry`. Se precisar de algo novo, gere por código.
- Efeitos visuais usam pool pré-alocado. Não aloque mesh nem material dentro
  do loop de jogo.

## Armadilhas conhecidas

- **Materiais metálicos ficam pretos sem environment map.** A cena usa um
  `PMREMGenerator` + `RoomEnvironment` em `Game`. Se criar outra cena, dê um
  `environment` a ela.
- **`ShaderMaterial` cru precisa de `#include <tonemapping_fragment>` e
  `#include <colorspace_fragment>`** no fim do fragment shader, senão a cor sai
  escura demais (foi o que aconteceu com o céu em `Level.buildSky`).
- **Three r155+ usa intensidades de luz físicas** — os valores são ~π vezes
  maiores que os do modo "legacy lights".
- **`rayAABB` devolve -1 se a origem estiver dentro da caixa.** Isso é
  proposital: sem isso, atirar colado numa parede devolve t=0 e engole o tiro.
- Pointer lock não funciona em navegador headless. Para testar com Playwright,
  force `window.__RPK.input.locked = true` depois de começar a partida.

## Como testar de verdade

O jogo expõe `window.__RPK` (a instância de `Game`). Num teste de navegador dá
pra spawnar inimigos, teleportar o jogador, disparar `g.combat.fire(...)` e ler
`player.health` / `enemies.enemies` direto. É assim que o combate foi validado.
