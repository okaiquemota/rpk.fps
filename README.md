# RPK.FPS

FPS de arena que roda no navegador. Você aguenta ondas de inimigos numa arena
fechada, com três armas, e o jogo fica mais difícil a cada onda.

Feito em **TypeScript + Three.js + Vite**, sem nenhum asset externo: geometria,
texturas e som são todos gerados por código. O repositório inteiro tem só código —
nada de baixar modelos, sprites ou `.wav`.

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
```

Outros comandos:

```bash
npm run build      # typecheck + bundle de produção em dist/
npm run preview    # serve o dist/ (útil pra testar o build)
npm run typecheck  # só o tsc, sem gerar nada
```

## Publicando

O repositório já traz um workflow de GitHub Pages
(`.github/workflows/pages.yml`). Para ligar:

1. **Settings → Pages → Source: "GitHub Actions"**
   Não escolha *"Deploy from a branch"*: nesse modo o GitHub serve os arquivos
   do repositório como estão, e o `index.html` da raiz é o arquivo fonte — ele
   aponta para `/src/main.ts`, que o navegador não sabe executar. O resultado é
   uma página crua, sem estilo e sem jogo. (Se isso acontecer, a própria página
   avisa e diz o que corrigir.)
2. Faça merge na `main` (ou rode o workflow à mão pela aba **Actions**)
3. O jogo sai em `https://<usuario>.github.io/rpk.fps/`

Servido assim, a página fica no topo do navegador — sem iframe no caminho — e a
captura do mouse funciona normalmente. É a diferença entre jogar com mira de FPS
de verdade e jogar no modo de mira solta.

## Controles

| Tecla | Ação |
|---|---|
| `W` `A` `S` `D` | Mover |
| `Shift` | Correr (só pra frente) |
| `Espaço` | Pular |
| `Ctrl` / `C` | Agachar |
| Botão esquerdo | Atirar |
| Botão direito | Mirar (ADS) |
| `R` | Recarregar |
| `1` `2` `3` / scroll | Trocar de arma |
| Setas | Olhar (alternativa ao mouse) |

| `Esc` | Pausar |

### Sobre a captura do mouse

Um FPS precisa capturar o cursor (pointer lock) para a mira funcionar direito.
O jogo pede isso ao começar, junto com tela cheia, e **continua tentando a cada
clique** — o navegador recusa a captura em situações passageiras (logo depois de
você sair de um lock com Esc, por exemplo), e desistir na primeira recusa
condenava a partida inteira.

Enquanto a captura não vem, entra o modo de mira solta: o mouse continua girando
a câmera, e empurrá-lo contra a borda da tela mantém o giro, para você dar a
volta completa sem o cursor esbarrar na moldura. Esse giro só age com o mouse em
movimento — largar o cursor na borda não faz a tela girar sozinha — e pode ser
desligado no menu de pausa.

**Uma página dentro de um iframe pode ter a captura bloqueada por política do
navegador, e aí não há o que o jogo faça.** Nesse caso, rode-o fora do iframe:
`npm run dev`, ou `npm run build:single` e abra o `dist/rpk-fps.html` direto no
navegador. Tela cheia (`F`) também ajuda bastante, porque a área para girar o
mouse passa a ser o monitor inteiro.

## Como o jogo funciona

- **Ondas.** Cada onda traz mais inimigos, com mais vida e mais rápidos. Tipos
  novos entram conforme as ondas avançam: capanga (onda 1), corredor (2),
  atirador (3), brutamontes (5, e em toda onda múltipla de 5).
- **Temperos de onda.** Cerca de uma onda em cada três vem com um modificador:
  *horda* (muitos corredores fracos), *elite* (poucos, duros, valem mais) ou
  *cerco* (atiradores por toda parte). Aparece no HUD ao lado do número da onda.
- **Melhorias.** Toda onda limpa abre uma escolha entre três cartas — dano,
  cadência, carregador, vida, colete, roubo de vida, munição por abate. Elas
  acumulam e valem pela partida inteira; a tela final mostra o que você montou.
- **Armas.** Você começa com a pistola (munição de reserva infinita). O fuzil
  aparece como item na arena na onda 2 e a escopeta na onda 4.
- **Vida.** Regenera até 50 depois de 6 segundos sem tomar dano. Passar de 50
  exige kit de vida — que os inimigos dropam e que aparece entre as ondas.
- **Pontos.** Cada abate vale os pontos do tipo × um multiplicador de combo que
  sobe a cada morte seguida e zera se você passar 4 segundos sem matar ninguém.
  Headshot vale 50 extras; limpar a onda N vale N × 100.
- O recorde fica salvo no `localStorage`.

## Arquitetura

```
src/
  config.ts             todos os números de tuning num lugar só
  main.ts               bootstrap + checagem de WebGL
  core/
    Game.ts             loop principal; conecta todos os sistemas
    Input.ts            teclado, mouse e pointer lock
    Audio.ts            efeitos sonoros procedurais (WebAudio)
    math.ts             AABB, raycast, lerp/damp, aleatórios
  world/
    Level.ts            arena: geometria + colisores + spawns + luzes
    Physics.ts          movimento de personagem com colisão AABB
    Pickups.ts          itens no chão
    textures.ts         texturas desenhadas em canvas
  player/
    Player.ts           movimento, câmera, vida, arsenal
  weapons/
    WeaponDefs.ts       stats das armas
    Weapon.ts           munição, cadência, recarga, dispersão
    Combat.ts           hitscan: quem foi atingido e por quanto
    ViewModel.ts        a arma na tela (bob, sway, recuo, recarga)
  enemies/
    EnemyTypes.ts       stats dos inimigos
    Enemy.ts            IA, animação e estado de um inimigo
    EnemyManager.ts     ondas, spawn e resolução de ataques
    Projectile.ts       projéteis dos atiradores
  fx/Effects.ts         tracers, impactos, sangue, decals, screen shake
  ui/
    HUD.ts              HUD em DOM
    Screens.ts          menus, opções e persistência
    style.css
```

Algumas decisões que valem ser explicadas:

- **Tudo colide como AABB.** Sem engine de física. `moveCharacter` resolve um
  eixo por vez, o que dá deslizamento em parede e subida de degrau de graça.
- **A geometria visual e a de colisão saem da mesma lista de blocos** em
  `Level.buildProps()`. É impossível o mundo desenhado divergir do que colide.
- **O tiro sai do olho, não do cano.** O raycast parte do centro da tela; o
  tracer é que sai da boca da arma. É o que todo FPS faz, e é o que faz a mira
  parecer honesta.
- **A arma é renderizada numa cena separada**, com câmera e FOV próprios, por
  cima do mundo com o depth buffer limpo. Sem isso ela atravessa parede.
- **As melhorias são multiplicadores num só objeto** (`Stats`), que as armas e o
  jogador consultam. Uma melhoria nova não toca no balanceamento, e o
  balanceamento não precisa saber que melhorias existem.
- **Som do mundo é posicional.** Tiro de inimigo, passo, morte e impacto passam
  por um `PannerNode` e chegam do lado certo; o que é seu (tiro, recarga, seus
  passos) vai direto pro master.
- **Pools pré-alocados em tudo que é efeito.** Um tiro de escopeta gera 9
  impactos no mesmo frame; alocar nesse momento é engasgo de GC na hora errada.
- **Faísca e fumaça são duas camadas de partículas separadas**, porque querem
  blending diferente: faísca soma luz, fumaça cobre o que está atrás.
- **A quantidade de luzes da cena nunca muda depois que o jogo carrega**, e os
  shaders são todos compilados na tela inicial. Os dois detalhes existem pelo
  mesmo motivo: no three, qualquer um deles fora de hora trava o frame.

Durante o jogo, `window.__RPK` expõe a instância do `Game` — dá pra bisbilhotar
`__RPK.player`, `__RPK.enemies.enemies`, etc. no console do navegador.

## Ideias pro próximo fim de semana

Coisas que o código já está preparado pra receber:

- [ ] Mais mapas (`Level` já é uma lista de blocos — dá pra ter várias)
- [ ] Mais armas (adicionar em `WEAPON_DEFS` + um rig em `ViewModel`)
- [ ] Granadas / dano em área
- [ ] Inimigo que voa ou que explode ao morrer
- [ ] Melhorias raras/lendárias, e melhorias que mudam como a arma funciona
- [ ] Chefe a cada dez ondas
- [ ] Minimapa
- [ ] Placar online
- [ ] Suporte a gamepad
