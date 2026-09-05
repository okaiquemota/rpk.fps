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

Ids validos: `pistol`, `deagle`, `smg`, `rifle`, `shotgun`, `sniper`. Arquivo
com outro nome e' ignorado. Da' pra cobrir so' uma arma; as outras seguem
sintetizadas.

**Ponha 3 ou 4 tomadas nas automaticas.** O fuzil dispara doze vezes por
segundo — uma amostra so', repetida nessa cadencia, o ouvido escuta como
zumbido periodico, nao como tiro. O jogo ja' sorteia entre as tomadas e varia o
tom em ±4%, o que ajuda mas nao substitui ter gravacoes diferentes.

## Formato e tamanho

**Use `.ogg` (Opus) ou `.mp3`. Nao ponha `.wav` aqui.** Os arquivos entram
embutidos no bundle como data URI, e base64 ainda soma 33% em cima:

| formato          | 1 s de audio | seis armas, 3 tomadas |
|------------------|--------------|-----------------------|
| wav 48k 16 bit   | ~96 KB       | ~1.7 MB → 2.3 MB embutido |
| mp3 96 kbps      | ~12 KB       | ~216 KB → 288 KB          |
| ogg/opus 64 kbps | ~8 KB        | ~144 KB → 192 KB          |

O bundle inteiro hoje tem 1.4 MB, entao opus ou mp3 custam pouco e wav quase
dobra o download.

**Limite duro: 600 KB por arquivo.** Acima disso o Vite para de embutir
(`assetsInlineLimit` no `vite.config.ts`) e o arquivo vira um asset separado —
o build de arquivo unico deixa de conter o som, silenciosamente. Tiro nao chega
perto desse tamanho se estiver comprimido; e' so' nao trazer wav.

Corte o silencio do comeco: o som toca no instante do disparo, e 80 ms de nada
no inicio da gravacao viram 80 ms de atraso percebido no gatilho.

## Licenca

O jogo e' publico, entao so' entra aqui audio que possa ser redistribuido —
**CC0 / dominio publico**, como o pacote de modelos. Freesound
(https://freesound.org) permite filtrar por CC0 na busca.

Ao adicionar, credite em `CREDITS.md`, na secao "Sons".
