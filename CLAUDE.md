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
- Quase nada de asset externo. Textura é canvas 2D, som é WebAudio, geometria
  é `BoxGeometry`. A única exceção são os modelos `.glb` das armas em
  `assets/models/` (ver `CREDITS.md`) — e mesmo eles são **opcionais**: faltando
  o arquivo, a arma cai no modelo procedural. Não introduza dependência de asset
  que quebre o jogo se o arquivo não existir.
- Efeitos visuais usam pool pré-alocado. Não aloque mesh nem material dentro
  do loop de jogo.

## Onde mexer em cada coisa

- Balanceamento de arma: `WEAPON_DEFS`. De inimigo: `ENEMY_DEFS`. Do resto:
  `src/config.ts`.
- Arma nova: entrada em `WEAPON_DEFS` (o item no chao e o desbloqueio saem do
  `unlockWave` sozinhos), um `case` no `buildRig` do `ViewModel`, o icone
  (regerado, ver abaixo) e o timbre em `SHOT_SOUND` (`Game.ts`). Inclua o rig novo
  no aquecimento — `setVisibleForWarmup` ja' mostra todos, entao basta existir.
- HUD: `index.html` tem o markup, `src/ui/HUD.ts` os setters. Minimapa e bussola
  sao canvas proprios (`Minimap.ts`, `Compass.ts`).
- Melhorias entre ondas: `src/player/Stats.ts`. Uma melhoria nova e' uma entrada
  em `UPGRADES` mexendo num campo de `Stats` — quem consome ja' esta' ligado.
- Temperos de onda (horda/elite/cerco): `MODIFIERS` em `EnemyManager`.
- Feedback de combate em DOM (numero de dano, vida do inimigo):
  `src/ui/WorldMarkers.ts`. Seta de direcao do dano: `HUD.showHitDirection`.

## Modelos 3D das armas

`src/weapons/WeaponModels.ts` carrega os `.glb` de `assets/models/` e os entrega
prontos ao `ViewModel`. Faltando um arquivo, aquela arma cai no rig procedural
— o jogo nunca depende de asset pra funcionar.

A escala NAO e' um fator fixo: e' derivada de um comprimento alvo em metros
(`SPECS`), medindo a caixa da peca. O pacote nao mantem proporcao real entre as
armas, e um fator unico deixaria umas gigantes e outras minusculas.

**Orientacao: o pacote NAO e' uniforme.** A maioria das armas deita ao longo de
X com o cano no lado POSITIVO, mas a pistola e a submetralhadora vem com ele no
NEGATIVO. Por isso cada entrada de `SPECS` tem `flipped`, e nao ha um giro unico
pra todas.

Errar isso NAO aparece na tela: em perspectiva, arma apontando pra frente e pra
tras parecem igualmente plausiveis (perdi tres capturas achando que era
enquadramento). Para descobrir num modelo novo, meca: fatie a peca ao longo do
comprimento e compare a area da secao transversal nas duas pontas — a ponta FINA
e' o cano. Confirme de lado, com a camera do viewmodel em (1.1, 0, 0) olhando
pra origem; ali a direita da tela e' -Z, entao o cano tem que apontar pra
direita.

O enquadramento de cada arma sai do `offset` em `SPECS` (X pra dentro/fora, Y
pra cima/baixo, Z pra perto/longe). Modelos sao mais longos que os rigs
procedurais, entao o angulo de 3/4 do quadril e' menor com eles
(`MODEL_HIP_YAW`/`MODEL_HIP_PITCH` no `ViewModel`).

Os `.glb` entram embutidos no bundle (`assetsInlineLimit` no `vite.config.ts`),
o que mantem o build de arquivo unico sendo um arquivo so'.

## Icones das armas no HUD

As silhuetas de `src/ui/weaponIcons.ts` sao TRACADAS dos proprios `.glb`, nao
desenhadas no olho. `scratchpad/traceIcons.html` renderiza cada modelo de lado
em silhueta chapada, segue a fronteira dos pixels, simplifica o contorno e
imprime o bloco pronto pra colar por cima do `SHAPES`. Rode com `npm run dev` e
confira ali mesmo: a pagina mostra cada icone nos tres tamanhos em que ele
aparece (118px do painel de municao, 46px do killfeed, e sobre fundo claro).

Desenhar a mao nao funcionou: a versao anterior era uma pilha de retangulos, e
com o contorno de 4px os vaos entre as pecas fechavam — todas as armas viravam
o mesmo borrao branco no killfeed. Tracar do modelo conserta o desenho e ainda
faz o icone ser a arma que o jogador tem na mao.

O icone segue existindo sem os `.glb`: o que vai no bundle sao coordenadas, nao
o modelo. Trocar um modelo NAO atualiza o icone sozinho — tem que regerar.

Duas coisas que parecem detalhe e nao sao:

- **A largura nao e' proporcional ao comprimento real.** E' comprimento^0.6.
  Na proporcao real a pistola fica com 40px do lado do sniper e some no
  killfeed; com fator unico, a escada de tamanhos desaparece.
- **O contorno e' tracado ANTES do preenchimento**, e o preenchimento e'
  `evenodd`. E' isso que deixa so' a metade de fora do traco aparecendo e, de
  quebra, fecha o guarda-mato e o buraco da coronha do sniper.

Os icones sao gerados no aquecimento (`warmupWeaponIcons`), pelo mesmo motivo
dos shaders: sao ~1ms cada, e sob demanda esse custo cai na primeira troca de
arma, no meio da partida.

## Sons de tiro gravados (opcionais)

`assets/sounds/` aceita gravacoes de tiro; com arquivo, a arma toca a gravacao
no lugar das cinco camadas sintetizadas. **Pasta vazia e' o estado normal** — o
jogo nunca dependeu, e nao passa a depender, de arquivo de audio.

Quem acha os arquivos e' `src/core/ShotSamples.ts`, com `import.meta.glob`, e
NAO com import estatico: glob sem correspondencia devolve `{}` e o build passa,
enquanto `import x from '.../pistol.ogg'` quebraria a compilacao pra quem nao
tem o arquivo. E' a diferenca em relacao aos `.glb`, que precisam existir.

O nome do arquivo e' o id da arma (`rifle.ogg`), com sufixo pra tomadas extras
(`rifle-2.ogg`). As regras de formato, tamanho e licenca estao em
`assets/sounds/README.md` — a curta: opus ou mp3, nunca wav, e menos de 600 KB
por arquivo senao o Vite para de embutir e o build de arquivo unico perde o som
sem avisar.

Duas decisoes que nao sao obvias:

- **A gravacao passa pelo mesmo `output()` do sintetizado**, com panner e envio
  de ambiente. E' o que faz o tiro gravado pertencer a` arena em vez de soar
  como aviso de interface colado por cima. O envio de reverbo vai em 35% do
  valor sintetizado, porque a gravacao ja' traz a sala dela — mandando o mesmo,
  empilha ambiente em cima de ambiente.
- **Baixar e decodificar sao passos separados.** Baixar nao precisa de
  AudioContext, entao `preloadShotSamples()` roda na tela de carregamento; o
  contexto so' pode nascer de um clique, e a decodificacao vai junto com o
  `init()`. Ate' ela terminar os tiros saem sintetizados — nao ha espera nem
  engasgo. Cuidado: `decodeAudioData` DESTACA o ArrayBuffer, entao os bytes
  servem uma vez so'.

Pra conferir se a amostra esta' realmente entrando, `scratchpad/somDoTiro.html`
renderiza o disparo num OfflineAudioContext e mede. Som gravado e sintetizado
tem duracao bem diferente, e e' isso que denuncia qual dos dois tocou.

## Cara da arena

A referencia e' patio industrial ao sol, no espirito do CrossFire: concreto
quente, ferrugem, contentor. A versao anterior era azul-acinzentada com ceu
quase preto e duas luzes de canto laranja e azul saturadas — lia como galpao
fechado com iluminacao de fliperama.

O que decide a leitura, em ordem de impacto:

- **O ceu.** Ele ocupa a faixa toda acima do muro. Escuro ali, a arena inteira
  parece coberta, por mais iluminado que esteja o chao. Hoje e' dia claro com
  bruma quente no horizonte (`buildSky`), e a `Fog` do `Game` usa a MESMA cor da
  bruma — destoando, a parede do fundo recorta do ceu como adesivo.
- **Textura medida em METROS, nao em repeticoes por peca.** `scaleBoxUVs` em
  `textures.ts` escala as UVs de cada caixa pelo tamanho dela. Sem isso, um
  bloco de 10 m e um de 2 m mostram uma repeticao cada, a ripa do grande sai
  cinco vezes maior que a do pequeno, e tudo le' como bloco pintado. O muro usa
  painel de 4.5 m; os obstaculos, 1.6 m (madeira) e 2.6 m (metal).
- **Tres TIPOS de peca, nao tres cores da mesma textura**: contentor (nervura
  vertical), engradado (ripa e travessa diagonal) e chapa (rebite). Reconhecer
  a peca de longe e' metade da sensacao de mapa.
- **Sol baixo.** Sombra longa e' o que faz um patio parecer patio; a pino, tudo
  achata.

A **contagem de luzes nao mudou** de proposito ao trocar a iluminacao — mudar
quantas luzes a cena tem recompila todo material (ver Armadilhas). Cor e
intensidade sao de graca; contagem, nao.

Sobre repeticao: mancha grande e' o que mais denuncia uma textura tileada — a
mesma bolha reaparecendo em catorze painels le' como padrao, enquanto grao fino
e ruido nao. Por isso o muro leva mancha fraca e ferrugem discreta, e o
contentor, que aparece em peca pequena, pode levar as duas fortes.

**Pra tirar captura da arena, NAO teleporte pro centro.** Em (0, y, 0) fica o
nucleo elevado, e a camera nasce dentro do bloco: o que aparece e' a face de
baixo do bloco de cima, a meio metro do olho — magnificada e borrada, com cara
de teto de concreto. Perdi meia duzia de capturas investigando esse "teto"
antes de perceber que o ponto de vista e' que estava dentro do cenario. Use o
`playerStart` ou um canto, e mire no centro com
`yaw = Math.atan2(-(0 - x), -(0 - z))` (a convencao vem de `Player.forward`).

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

**`recoilPitch` NAO e' a subida do carregador — e' a subida de UM tiro, e ela
nunca soma inteira.** O alvo do recuo decai por `recoilRecovery` a cada frame,
inclusive enquanto se atira, entao segurar o gatilho leva a mira a um patamar,
nao a uma soma: o que se acumula por tiro e o que volta por segundo se
equilibram. Multiplicar `recoilPitch` pelo tamanho do carregador da' um numero
que o jogo nunca chega perto — foi assim que estas notas ja' afirmaram uma
subida de "12 a 22 graus" quando o fuzil subia 1.7.

Medido (`scratchpad/recoil.html`, 120 fps, carregador cheio):

| arma      | sobe | abre | razao V/H |
|-----------|------|------|-----------|
| pistola   | 2.2  | 3.3  | 0.67      |
| deagle    | 3.2  | 2.5  | 1.30      |
| smg       | 4.0  | 6.3  | 0.63      |
| fuzil     | 5.5  | 8.3  | 0.67      |
| escopeta  | 2.0  | 0.4  | 4.71      |
| sniper    | 3.3  | 0.2  | 15.8      |

A razao entre os eixos e' o que faz o padrao ser aprendivel. Nas automaticas ela
mora perto de 0.65: cai pra 0.2 e o rastro vira uma varredura lateral (foi a
reclamacao "esta so' na horizontal"); passa de umas 3 e vira linha vertical, que
tambem nao se aprende. Escopeta e sniper sao linha vertical de proposito — em
arma de um tiro por vez nao ha rastro pra decorar.

Pra afrouxar ou endurecer, mexa em `recoilPitch` e `recoilYaw` juntos e confira
a razao; `recoilRecovery` maior reassenta mais rapido E abaixa o patamar, entao
ele mexe nos dois eixos de uma vez.

**Meca com `scratchpad/recoil.html`, nao jogando.** A pagina simula o tempo num
passo fixo e desenha o rastro de cada arma em graus. Testar recuo dentro do jogo
sob renderizacao por software mede o framerate, nao a arma: a ~1.5 fps o fuzil
dispara 1.5 tiros por segundo em vez de 12, e o patamar cai junto.

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
