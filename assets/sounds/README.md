# Sons de tiro (opcionais)

Largue aqui gravacoes de tiro e o jogo passa a usa-las no lugar do som
sintetizado. **Pasta vazia e' um estado valido** — sem arquivo nenhum, tudo
continua funcionando como sempre. Nao ha passo de build: o `import.meta.glob`
em `src/core/ShotSamples.ts` acha o que estiver aqui.

## Nome do arquivo

O nome e' o id da arma. Sufixo com hifen adiciona tomadas alternativas:

```
pistol.ogg      deagle.ogg      smg.ogg
rifle.ogg       shotgun.ogg     sniper.ogg

rifle-2.ogg     rifle-3.ogg     <- tomadas extras do fuzil
```

Ids validos: `pistol`, `deagle`, `smg`, `rifle`, `shotgun`, `sniper`, e mais
`balas` — a capsula batendo no chao, que nao e' arma mas usa o mesmo mecanismo.
Arquivo com outro nome e' ignorado. Da' pra cobrir so' uma; o resto segue
sintetizado.

Subpasta NAO e' varrida. `originais/` guarda as gravacoes antes de aparar: ficam
no repositorio, fora do bundle.

**Ponha 3 ou 4 tomadas nas automaticas.** O fuzil dispara doze vezes por
segundo — uma amostra so', repetida nessa cadencia, o ouvido escuta como
zumbido periodico, nao como tiro. O jogo ja' sorteia entre as tomadas e varia o
tom em ±4%, o que ajuda mas nao substitui ter gravacoes diferentes.

## Formato e tamanho

**`.wav` funciona** — e' inclusive o formato que todo navegador decodifica sem
discussao. Ogg/Opus e mp3 tambem. A escolha e' de TAMANHO, nao de suporte: os
arquivos entram embutidos no bundle como data URI, e base64 soma 33% em cima.

Por segundo de audio, mono:

| formato          | 1 s      | seis armas, 1 tomada | seis armas, 3 tomadas |
|------------------|----------|----------------------|-----------------------|
| wav 44.1k 16 bit | ~88 KB   | ~530 KB → 700 KB     | ~1.6 MB → 2.1 MB      |
| mp3 96 kbps      | ~12 KB   | ~72 KB → 96 KB       | ~216 KB → 288 KB      |
| ogg/opus 64 kbps | ~8 KB    | ~48 KB → 64 KB       | ~144 KB → 192 KB      |

O bundle inteiro tem ~1.4 MB hoje. Um tiro dura meio segundo: **seis wav curtos
custam uns 350 KB, o que e' perfeitamente aceitavel.** O que pesa e' wav LONGO
(cauda de reverb gravada junto) ou ESTEREO — que dobra tudo, e nem serve, porque
o jogo espacializa o som sozinho.

Entao: use wav se e' o que voce tem. Corte curto, deixe mono, e so' converta pra
ogg/mp3 se for por muitas tomadas por arma.

**Limite duro: 600 KB por arquivo.** Acima disso o Vite para de embutir
(`assetsInlineLimit` no `vite.config.ts`) e o arquivo vira um asset separado —
o build de arquivo unico deixa de conter o som, silenciosamente. Em wav mono
44.1k isso da' quase 7 segundos, entao tiro nao chega perto; um som de recarga
comprido, talvez.

## Corte o silencio do comeco

Isto nao e' detalhe, e' a diferenca entre o som funcionar e nao funcionar. O
arquivo toca no instante do evento, entao silencio no inicio da gravacao vira
atraso percebido, inteiro.

Aconteceu aqui: o `balas.wav` original tinha **0.58 s de silencio na frente** —
a capsula batia no chao e o som chegava meio segundo depois. Aparado, o mesmo
arquivo caiu de 532 KB pra 96 KB (silencio das duas pontas, estereo pra mono,
24 bits pra 16) sem perder nada do que se ouve.

Vale medir em vez de confiar no olho da forma de onda: `scratchpad/somDoTiro.html`
renderiza o disparo num OfflineAudioContext e diz em quantos ms o som comeca.

**Mono pra capsula.** Ela toca sem panner, entao estereo so' dobra o peso. Pra
arma do jogador, estereo faz sentido — o proprio tiro nao e' espacializado.

## Licenca

O jogo e' publico, entao so' entra aqui audio que possa ser redistribuido —
**CC0 / dominio publico**, como o pacote de modelos. Freesound
(https://freesound.org) permite filtrar por CC0 na busca.

Ao adicionar, credite em `CREDITS.md`, na secao "Sons".
