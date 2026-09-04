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

## Onde mexer em cada coisa

- Balanceamento de arma: `WEAPON_DEFS`. De inimigo: `ENEMY_DEFS`. Do resto:
  `src/config.ts`.
- Arma nova: entrada em `WEAPON_DEFS` (o item no chao e o desbloqueio saem do
  `unlockWave` sozinhos), um `case` no `buildRig` do `ViewModel`, uma silhueta
  em `weaponIcons.ts` e o timbre em `SHOT_SOUND` (`Game.ts`). Inclua o rig novo
  no aquecimento — `setVisibleForWarmup` ja' mostra todos, entao basta existir.
- HUD: `index.html` tem o markup, `src/ui/HUD.ts` os setters. Minimapa e bussola
  sao canvas proprios (`Minimap.ts`, `Compass.ts`).
- Melhorias entre ondas: `src/player/Stats.ts`. Uma melhoria nova e' uma entrada
  em `UPGRADES` mexendo num campo de `Stats` — quem consome ja' esta' ligado.
- Temperos de onda (horda/elite/cerco): `MODIFIERS` em `EnemyManager`.
- Feedback de combate em DOM (numero de dano, vida do inimigo):
  `src/ui/WorldMarkers.ts`. Seta de direcao do dano: `HUD.showHitDirection`.

## Modos

`GameMode` em `Game.ts` decide o que roda: `waves` (ondas) ou `range` (campo de
tiro, em `src/modes/ShootingRange.ts`).

O campo de tiro precisa de espaco LIMPO: `Level.useRangeLayout()` esconde os
obstaculos da arena e troca os colisores pelos do modo. Sem isso, metade dos
tiros morria num caixote antes de chegar na parede, e alvos nasciam dentro de
blocos — foi o que aconteceu na primeira versao.

Alvos que nao sao inimigos implementam `ShootableTarget` e entram pelo
`combat.setExtraTargets()`; o CombatSystem segue sendo o unico lugar que decide
o que a bala acerta.

Ao criar um modo novo, lembre de mostra-lo no aquecimento (`warmupShaders`),
senao o custo de compilar reaparece na hora que o jogador escolher o modo.

## Som

`src/core/Audio.ts` e' uma engine pequena, nao uma lista de bipes. O que faz um
tiro soar como tiro:

- **ataque de meio milissegundo** — envelope suave vira sopro;
- **saturacao** (`WaveShaper`), que arredonda o pico e da volume percebido;
- **ambiente** (`ConvolverNode` com resposta de impulso gerada na mao), sem o
  qual todo disparo parece dado dentro de um armario.

Cada disparo sao quatro camadas — estalo, corpo, grave e ferrolho — descritas em
`SHOT_PROFILES`. Mexer numa camada muda a arma sem descaracterizar o conjunto.

**O filtro vem antes do envelope**, entao o `gain` de `burst()` nao e' a
amplitude de saida: um bandpass estreito descarta quase toda a energia do ruido
branco. Ha uma compensacao explicita por largura de banda; sem ela, subir o
ganho cinco vezes mal mexia no volume (foi um bug real).

Para MEDIR som em vez de adivinhar, `init()` aceita um `OfflineAudioContext`:
renderize o efeito num buffer e olhe pico, ataque e envelope. Vale lembrar que o
compressor e o waveshaper somam ~9 ms de latencia fixa a tudo — meca o ataque a
partir do inicio do som, nao do zero, senao voce mede o pipeline.

## Recuo

O padrao de spray e' DETERMINISTICO (`Weapon.recoilStep()`), com so' um tico de
aleatorio por cima: e' isso que permite decorar o desenho de uma arma e
compensar puxando o mouse ao contrario. Os parametros por arma estao em
`WEAPON_DEFS` (`recoilPitch`, `recoilYaw`, `recoilRamp`, `recoilSway`,
`recoilRecovery`, `burstReset`).

O recuo e' um OFFSET somado a mira, nunca uma alteracao do `pitch`/`yaw` do
jogador — por isso ele volta sozinho ao lugar quando a rajada acaba, e quem
compensou com o mouse termina com a mira mais baixa, como na vida real.

Proporcao: a subida total por carregador e a abertura lateral andam juntas.
Hoje o jogo esta' na faixa dura — 12 a 22 graus, conforme a arma — depois de uma
versao mais leve em 8 graus. O que NAO pode mudar e' a proporcao entre os dois
eixos: a primeira versao de todas subia 20 graus e abria 1, o que e' uma linha
vertical, nao um desenho que se aprende.

Se for preciso afrouxar de novo, mexa em `recoilPitch` e `recoilYaw` juntos, na
mesma razao, e em `recoilRecovery` (maior = reassenta mais rapido). O teste de
padrao em `scratchpad/recoil.mjs` desenha o rastro de cada arma em escala real —
rode antes e depois, e' o jeito de ver o efeito sem jogar.

## Armadilhas conhecidas

- **NUNCA mude a quantidade de luzes da cena durante o jogo.** No three, entrar
  ou sair uma luz (inclusive `visible = false`, ou esconder o pai dela) invalida
  os programas de shader de TODOS os materiais, e a recompilacao trava o frame
  por centenas de milissegundos. Foi o que fazia o jogo engasgar a cada tiro e a
  cada inimigo morto. Todas as luzes sao criadas na inicializacao e apagadas com
  `intensity = 0`. Pelo mesmo motivo, materiais nascem com `transparent: true`
  quando forem desaparecer depois: ligar isso em pleno jogo recompila.
- **`Game.warmupShaders()` compila tudo na tela de carregamento.** Se voce
  adicionar material, geometria ou tipo de inimigo novo, inclua no aquecimento —
  senao o custo reaparece no meio da partida. Note que ele renderiza um frame de
  verdade: `renderer.compile` sozinho nao cobre shaders de sombra nem o envio das
  geometrias pra GPU. E os figurantes do aquecimento seguem vivos de proposito,
  porque descartar o ultimo material que usa um programa descarta o programa.
- Para medir esse tipo de engasgo, olhe `renderer.info.programs.length` e
  `renderer.info.memory.geometries` antes e depois de uma acao: se sobem em
  pleno jogo, tem trabalho caindo no frame errado.

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
