# Creditos

## Modelos 3D

Sao dois regimes diferentes, e a diferenca importa: um dispensa atribuicao, o
outro EXIGE.

### Fuzil — atribuicao obrigatoria

**Ak47, por wburton** — licenciado sob
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

- Autor: wburton (@wburton95)
- Origem: https://sketchfab.com/3d-models/ak47-831519a097d84e079fd8bc4b15e5b57d
- Alteracoes: convertido pro espaco do viewmodel (escala, orientacao,
  enquadramento) e com o pente avulso da animacao de recarga oculto.

CC BY **obriga** creditar autor, obra, licenca e as alteracoes. Por isso o
credito tambem aparece na tela inicial do jogo: o build de arquivo unico circula
sozinho, longe deste arquivo.

### As outras cinco armas — CC0

**Ultimate Guns Pack by Quaternius via Poly Pizza**

Licenca: CC0 (dominio publico). Uso livre, inclusive comercial, sem exigencia
de atribuicao — o credito aqui e' cortesia, nao obrigacao.

- Autor: Quaternius — https://quaternius.com
- Origem: Poly Pizza — https://poly.pizza

## O resto

Todo o restante do jogo e' gerado por codigo: texturas em canvas 2D, som em
WebAudio, geometria em `BoxGeometry` e afins. Sem bibliotecas de arte e sem
sprites.

Bibliotecas: [three.js](https://threejs.org) (MIT), [Vite](https://vite.dev)
(MIT), [TypeScript](https://www.typescriptlang.org) (Apache-2.0).

## Sons

A base e' sintetizada em WebAudio (`src/core/Audio.ts`) e nao tem credito a dar.
Por cima dela, `assets/sounds/` aceita gravacoes que substituem o som de uma
arma; hoje ha' duas:

| arquivo      | usado em                | autor | origem | licenca |
|--------------|-------------------------|-------|--------|---------|
| `rifle.wav`  | disparo do fuzil        | ?     | ?      | ?       |
| `balas.wav`  | capsula batendo no chao | ?     | ?      | ?       |

**ATRIBUICAO PENDENTE.** O repositorio e' publico, entao so' pode ficar aqui
audio redistribuivel — CC0 de preferencia (ver `assets/sounds/README.md`).
Preencha a tabela com a procedencia de cada arquivo, ou remova os dois: sem
arquivo, o tiro volta pro sintetizado e nada quebra.
