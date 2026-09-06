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
enquadramento).

**Malha com esqueleto muda TUDO nessa medicao.** O primeiro modelo de fora com
animacao custou meia duzia de medidas erradas, e a licao vale pros proximos:

- vertice cru NAO e' onde o vertice aparece. Num `SkinnedMesh` ele passa pelas
  matrizes dos ossos; medindo direto do `position`, dois metodos deram dois
  eixos longos diferentes pro mesmo arquivo, e nenhum batia com a tela. Quem
  sabe fazer a conta e' `applyBoneTransform`, depois de `skeleton.update()`;
- `Box3.setFromObject` usa a caixa em CACHE da malha, que e' a do bind pose.
  Invalide (`boundingBox = null`) antes de medir de novo — e' o que
  `medirCaixa()` faz;
- **a pose de repouso do arquivo pode nao ser uma pose de uso.** O AK guarda um
  segundo pente, SOLTO no ar ao lado da arma, que so' entra em cena na recarga.
  Ele entrava na caixa que escala e centra o modelo: a arma saia encolhida (pra
  que "arma + pente" coubessem nos 62 cm) e centrada no vazio entre os dois.
  A pose certa vem da animacao `idle`, aplicada antes de medir;
- por isso existe `hiddenBones` no `SPECS`, com o osso do pente avulso. A lista
  e' explicita e nao heuristica — esconder osso errado apaga parte da arma. E
  precisa ser reaplicada DEPOIS de cada `mixer.update()`, senao a animacao
  devolve o pente pro ar.

**Enquadramento errado se disfarca de orientacao errada.** Com o pente inflando
a caixa, o render parecia dizer que o cano apontava pro lado, e a medida do eixo
— que estava certa desde o comeco — parecia errada. Foram quatro trocas de `yaw`
atras de um problema que era de escala. Antes de mexer na orientacao, confira se
a peca esta' do tamanho certo.

**`scratchpad/inspecionarModelo.html` faz essa conta pra voce** (mas nao a de
esqueleto: ele erra em modelo animado — o fuzil atual e' um deles). Ele fatia a
peca ao longo do comprimento, compara a area da secao transversal nas duas
pontas — a ponta FINA e' o cano — e imprime a linha de `SPECS` pronta, com
`flipped`, `length` e `offset`. Quando as duas pontas dao area parecida a peca
nao tem cano destacado, e a pagina diz que a medida foi INCONCLUSIVA em vez de
chutar; ai' confira de lado, com a camera do viewmodel em (1.1, 0, 0) olhando
pra origem — ali a direita da tela e' -Z, entao o cano tem que apontar pra
direita.

A pagina reencontra sozinha a orientacao das cinco armas SEM esqueleto e devolve
o `offset` calibrado a mao. No AK, que tem esqueleto, ela erra — quem decidiu
foi o render.

Trocar um modelo tambem NAO atualiza o icone do HUD: regere em
`scratchpad/traceIcons.html`. Ele importa o `SPECS` do jogo — orientacao e
ossos escondidos vem da MESMA fonte, porque a tabela duplicada que existia ali
saiu de sincronia no primeiro modelo novo e devolveu um icone que era uma tira
de quatro pontos.

O enquadramento de cada arma sai de DOIS ajustes em `SPECS`, e eles servem pra
coisas diferentes:

- **`offset`** posiciona a arma na MAO (X pra dentro/fora, Y pra cima/baixo, Z
  pra perto/longe).
- **`yaw`** e' o giro em torno de Y que leva o cano pra -Z. Era um booleano
  `flipped`, o que so' dava conta de peca deitada em X; o primeiro modelo de
  fora ja' veio deitado em Z e nenhum dos dois valores servia.
- **`adsOffset`** e' somado a` posicao SO' ao mirar. Existe porque mirar quer a
  linha de visada do modelo passando pelo centro da tela, e o `offset` nao serve
  pra isso: a peca e' centrada pela propria CAIXA, e a alca de mira nao fica no
  centro da caixa — fica em cima e no eixo. Sem esse segundo ajuste o fuzil
  mirava 4 cm a` esquerda do centro, apontando pro lado do alvo.

**Aproximar a arma NAO e' mexer so' no Z.** A arma fica de lado, fora do eixo da
camera; encurtando so' a profundidade, o que era um angulo pequeno vira um
angulo grande, e ela SAI pelo canto da tela em vez de crescer — subindo o Z do
fuzil de 0.1 pra 0.44 sobrou uma tira de cano no canto, MENOR do que era antes.
Pra trazer pra perto de verdade, encolha o vetor camera->arma INTEIRO por um
fator: mesma direcao, mesmo ponto da tela, so' que maior. O fuzil hoje esta' em
0.62 do vetor original no quadril e 0.85 na mira.

Na mira o limite nao e' estetico: passando de 0.85 a alca de mira cobre o alvo
que voce esta' mirando (medido em 0.72 — o circulo da mira some atras do bloco).
E os dois nao sao independentes: `adsOffset` e' somado POR CIMA do `offset`,
entao mexer no enquadramento do quadril desloca a mira junto e obriga a
recalcular o `adsOffset` pra manter a visada onde estava.

**So' o fuzil esta' calibrado** (quadril e mira). As outras cinco tem
`adsOffset: [0, 0, 0]` e seguem no enquadramento antigo — calibrar cada uma e'
escolher o fator de aproximacao e conferir a visada. Modelos sao mais longos que os rigs
procedurais, entao o angulo de 3/4 do quadril e' menor com eles
(`MODEL_HIP_YAW`/`MODEL_HIP_PITCH` no `ViewModel`).

Nao ha mais teto de tamanho pra modelo: no build normal ele sai como arquivo
separado (ver "Dois builds", abaixo). `npm run assets` diz quanto cada um pesa.

## Dois builds, e por que a diferenca importa

O jogo tem DUAS saidas, e confundi-las ja' custou caro:

- **`npm run build`** — a pasta `dist/` inteira, com os assets como arquivos
  separados. **E' isto que o GitHub Pages publica** (ver `.github/workflows/`).
  Nao ha limite de tamanho aqui: modelo pesado e' so' mais um arquivo, com cache
  proprio, baixado quando precisa.
- **`npm run build:single`** — `dist/rpk-fps.html`, com TUDO embutido em base64.
  E' um extra, pra baixar e jogar offline com duplo clique, e e' tambem o
  formato do link de previa. Nao e' o deploy.

O limite de embutir era 600 KB **pros dois**, e estava moldando decisao de asset
que nao precisava ser moldada: modelo, textura e som eram escolhidos pra caber
num arquivo avulso que nem e' como o jogo e' servido. Hoje o `assetsInlineLimit`
e' uma funcao que responde diferente por modo — 4 KB no normal, tudo no `single`.

**O modo `single` FALHA em vez de sair quebrado.** A versao anterior pegava um
`.js` e um `.css` e ignorava o resto: asset que nao coubesse, ou divisao de
codigo, viravam referencia pra arquivo inexistente. O HTML saia "pronto" e o que
faltava sumia calado — arma voltando pro rig procedural, som que nunca toca. Um
build quebrado tem que doer no build.

`npm run assets` lista o peso de cada asset nos dois mundos, com o custo de
base64 ja' somado.

### Modelo comprimido

`src/core/gltf.ts` e' o carregador de glTF do projeto — um so', pra arma,
personagem e o que vier. Ele ja' abre modelo comprimido:

- **meshopt** (geometria) vai EMBUTIDO: o decodificador do three e' um modulo JS
  com o wasm em base64 dentro, entao funciona ate' no arquivo unico. **E' a
  compressao a preferir.**
- **Draco** (geometria) e **KTX2/Basis** (textura) sao wasm carregado por URL,
  ~1.5 MB, baixado so' quando um `.glb` de fato usa a extensao.

**Nao chame `setDecoderPath` nem `setTranscoderPath`.** O three r185 aponta pros
decodificadores com `new URL(..., import.meta.url)`, padrao que o Vite entende:
ele emite os arquivos e reescreve a URL sozinho. Um caminho fixo desliga essa
resolucao e passa a exigir copia manual do wasm. (Uma versao deste projeto
chegou a ter um plugin de Vite copiando essas pastas do `node_modules` — era
redundante e duplicava 1.5 MB no `dist/`.)

Como Draco e KTX2 sao externos, **modelo comprimido assim nao funciona no
arquivo unico**, so' no site. O `build:single` avisa isso na saida.

**A ordem de inicializacao em `main.ts` nao e' arbitraria:** o renderer nasce
primeiro (so' ele sabe que formatos de textura comprimida a GPU aceita, e o
`KTX2Loader` precisa disso ANTES de abrir qualquer modelo), depois os modelos
(pro aquecimento de shaders cobrir os materiais deles), e o `Game` recebe os
dois prontos.

### Animacao vinda do .glb

`src/weapons/WeaponAnimator.ts` toca os clipes que vem dentro do modelo. O AK
traz nove; as outras cinco armas nao tem nenhum e seguem no movimento
procedural. **As duas coisas coexistem, e e' preciso desligar uma quando a outra
existe** — a recarga procedural (a arma inteira descendo e girando pra fora)
somada ao clipe daria a arma mergulhando enquanto a mao troca o pente. Quem
decide e' `animator.has('reload')`.

Tres camadas, porque os clipes nao servem todos pro mesmo tipo de coisa:

- **base em laco** — idle, andar, correr. Poses de corpo inteiro que se excluem,
  trocadas por crossfade conforme `moveSpeed01`;
- **disparo unico que assume a base** — sacar e recarregar. A base sai de cena e
  volta no evento `finished` do mixer;
- **ADITIVO** — atirar. Este nao pode substituir a base: o ferrolho precisa
  cyclar enquanto a arma continua no idle ou no passo. `makeClipAdditive` faz o
  clipe descrever a DIFERENCA em relacao a` propria pose de repouso dele;
  substituindo, cada tiro cortaria a animacao de baixo por um quarto de segundo.

**A referencia do `makeClipAdditive` e' o PROPRIO clipe, nao o idle.** Passar o
idle parece mais certo e nao e': a funcao casa trilha por NOME, e o idle deste
modelo nao tem trilha de posicao pro osso do ferrolho — so' de rotacao. Sem
referencia pra subtrair, aquela posicao continua ABSOLUTA, e a camada aditiva
soma ela por cima da base. O ferrolho saia voando pra exatamente o DOBRO da
distancia do corpo (medido: 0.1014 parado, 0.2027 atirando — o "dobro exato" e'
a assinatura desse erro), aparecendo como uma peca de metal boiando ao lado da
arma a cada tiro.

Depois de corrigido, o clipe continua fazendo efeito: um ponto de prova no osso
do ferrolho oscila 0.0044 parado e 0.0526 atirando, doze vezes mais. Verificar
que o bug sumiu NAO e' o mesmo que verificar que a animacao ainda roda — meca as
duas coisas.

**A duracao nunca e' a do arquivo.** O clipe de recarga tem 2.67 s e o
`reloadTime` do fuzil e' 1.75 — tocado na velocidade do arquivo, a arma estaria
pronta pra atirar com a mao ainda encaixando o pente na tela. Cada clipe entra
com `timeScale` ajustado pro tempo que o JOGO reservou.

**A capsula do JOGO tambem entregava, e por muito tempo.** Ela era um cilindro
de 11 mm de raio por 34 mm — 1.4 pra 1, quase tao larga quanto alta, com seis
lados. Um estojo 7.62x39 de verdade tem ~4.6 mm por 39 mm, quase 5 pra 1.
Ejetada a 24 cm do olho e iluminada pelo clarao, aquilo nao lia como estojo:
lia como uma pepita dourada boiando, e foi relatado como "um elemento flutuando
enquanto atiro" — que eu procurei no MODELO por tres rodadas antes de desligar a
ejecao do jogo e ver o objeto sumir.

A licao e' o metodo: **desligue o suspeito e veja se some**, antes de teorizar
sobre qual osso e'. O comprimento na tela quase nao mudou (3.5% -> 3.4% da
altura); o que mudou foi a ESPESSURA, de 2.4% pra 0.9%.

**O modelo traz pecas que o jogo ja' faz — e melhor.** Alem do pente avulso, o
AK vem com dois CARTUCHOS proprios (cilindros de 0.12 x 0.73 x 0.12,
`Bone004_04` e `Bone005_05`) que a animacao de tiro cospe. O jogo ja' ejeta
capsula com pool, fisica e som ao bater no chao; as duas juntas davam municao
saindo em dobro. Os tres ossos estao em `hiddenBones`.

**O clarao do cano era um retangulo, nao um clarao.** Um plano de COR CHAPADA de
0.3 m, a 37 cm do olho, com escala aleatoria de ate' 1.5: chegava a 72% da
altura da tela. Numa automatica a 720 tiros por minuto ele fica aceso dois
tercos do tempo, entao virava um vidro amarelo permanente atravessado na frente
do jogador — foi relatado como "um elemento flutuando enquanto atiro". Hoje sao
0.14 m COM textura (`muzzleFlashTexture`): encolher sozinho ainda deixaria um
retangulo, e o que faz o quadrado sumir e' o brilho cair a zero antes da aresta.

**A boca do cano nao e' o canto da caixa.** O `muzzle` tinha X fixo em zero e Y
no meio da caixa. Como o `offset` afasta toda arma pro canto da tela, o clarao
saia ao LADO do cano; e num fuzil o pente puxa a caixa pra baixo, entao o meio
dela fica abaixo da linha do cano. Agora e' o centro da fatia da frente
(`pontaDoCano`), medido — no fuzil, (-0.127, 0.16, -0.193) em vez de
(0, meio-da-caixa, frente).

**O pente escondido precisa VOLTAR na recarga.** E' justamente ele que o clipe
encaixa na arma; deixado oculto, a recarga mostra o pente velho saindo e nenhum
entrando. `esconder`/`mostrar` sao chamados por quadro conforme
`animator.recarregando`, sempre DEPOIS do avanco da animacao — o clipe reescreve
a pose de todo osso que toca.

Medido (`scratchpad/` + `g.update(1/60)` num laco, amplitude de um osso):

| | movimento |
|---|---|
| idle (4.2 s) | 0.0095 |
| recarga | 0.0774 |
| tiro (0.25 s) | 0.1338 |
| correndo (1.6 s) | 0.1029 |

E o pente avulso apareceu em 100/100 quadros da recarga, voltando a escala zero
depois. Movimento nao da' pra conferir em captura estatica — meca.

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
(`rifle-2.ogg`), mais `balas` pra capsula caindo. Subpasta nao e' varrida —
`assets/sounds/originais/` guarda as gravacoes antes de aparar, fora do bundle.

**Silencio no inicio da gravacao vira atraso percebido, inteiro.** O `balas.wav`
que chegou tinha 0.58 s de silencio na frente: a capsula batia no chao e o som
saia meio segundo depois. Aparar tirou isso e de quebra levou o arquivo de 532
KB pra 96 KB. Meça com `scratchpad/somDoTiro.html`, que diz em quantos ms o som
comeca. As regras de formato, tamanho e licenca estao em
`assets/sounds/README.md` — a curta: **wav serve** (todo navegador decodifica), e
a escolha de formato e' de tamanho, nao de suporte. Seis wav curtos e mono custam
uns 350 KB. O que pesa e' wav longo ou estereo.

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
quente, ferrugem, contentor. A versao original era azul-acinzentada com ceu
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

### Superficie: relevo e rugosidade saem do proprio albedo

Cada textura entrega TRES mapas (`Surface` em `textures.ts`): cor, normal e
rugosidade. Os dois ultimos nao sao desenhados — sao derivados da mesma imagem,
separados por FREQUENCIA:

- **detalhe fino vira RELEVO** (junta, nervura, ripa, rebite, brita): geometria
  pequena demais pra modelar e grande demais pra ignorar;
- **mancha larga vira RUGOSIDADE** (oleo, ferrugem escorrida, sujeira no pe' da
  parede): e' sujeira SOBRE a superficie, nao forma dela.

Quem separa e' um passa-alta — tira do sinal a versao borrada dele mesmo. Sem
essa separacao a mancha entra no mapa de normal e vira um calombo de meio metro
no meio da parede.

Isso e' o que mais mudou a leitura da arena. Antes toda peca era cor chapada com
uma rugosidade fixa: a nervura do contentor era DESENHO, entao a luz passava por
ela sem reagir, e andar em volta nao mudava nada. Agora a mesma nervura acende
de um lado e sombreia do outro.

Duas armadilhas medidas:

- **Ganho demais e' pior que de menos.** O gradiente do passa-alta e' fraco
  (+-0.15) e precisa de ganho, mas com `k = 14` o rebite da chapa virava meia
  bola e a peca lia como plastico estofado. Esta' em 6.
- **O sinal do eixo Y do mapa de normal nao aparece na tela.** Invertido, relevo
  vira afundado e as duas leituras parecem plausiveis — o mesmo tipo de erro
  silencioso do `flipped` das armas. O jeito de conferir NAO e' olhar: e' seguir
  o que a textura desenha. No engradado a ripa leva risco escuro em cima do vao
  e claro embaixo, que e' luz vindo de CIMA; entao no vao a normal tem que
  apontar pra cima, e e' isso que a conta precisa devolver.

Com mapa de rugosidade, o numero `roughness` do material vira MULTIPLICADOR do
mapa, nao um valor: fica em 1 e quem manda e' a textura. O que sobra por
material e' o `metalness`, que o mapa nao tem como saber — madeira, concreto e
chapa reagem diferente com a mesma aspereza.

Depois do relevo, a cor saturada que compensava a superficie chapada passou a
brigar com ela (o engradado lia como pinho de brinquedo). Os tons foram
dessaturados — madeira exposta ao tempo perde croma antes de perder valor.

### Luz: um sol so', e o ceu como environment

`SUN_DIR` (`Level.ts`) e' a UNICA fonte da direcao do sol: a luz direcional, o
disco no ceu e o environment map leem dali. Separados, o ceu mostrava o sol num
canto enquanto a sombra caia pro outro — ninguem estranha de imediato, so' fica
com cara de cenario falso.

O environment map vem do PROPRIO ceu, via PMREM da esfera do `buildSky`. Antes
vinha de um `RoomEnvironment`: uma sala fechada, entao toda chapa e todo
contentor do patio ao sol refletia um interior que nao existe no jogo — cinza de
estudio no lugar de azul em cima e chao quente embaixo.

**Trocar o environment obriga a mexer na hemisferica.** As duas fazem a MESMA
conta: luz do ceu em cima, quique do chao embaixo. Somando as duas inteiras, a
arena ficou clara e azulada e perdeu o patio ao sol. A hemisferica caiu de 2.4
pra 1.1. A CONTAGEM de luzes nao muda — so' o peso.

**A arma tambem e' iluminada pelo sol do mundo.** A cena da arma e' separada, e
com luz fixa ela tinha sempre o mesmo lado aceso: de frente pro sol ou de
costas, o cano brilhava igual. Hoje `SUN_DIR` e' transportado pro espaco da
camera a cada quadro (`armaKey`), entao virar de costas pro sol escurece a arma
e deixa so' o fio de luz na quina. Custa uma rotacao de vetor por quadro.

**A nevoa comecava perto demais.** Com `fogNear` em 38 m numa arena de 62, ela
pegava o patio inteiro: o muro do fundo chegava lavado e o contraste do meio ia
junto. Num patio de 60 m em dia claro nao ha' bruma nenhuma pra ver — ela existe
aqui so' pra amaciar o encontro do muro com o ceu. Esta' em 58/210.

A anisotropia vem do maximo do hardware (`setMaxAnisotropy`), e precisa ser
definida ANTES de `new Level()`: as texturas nascem no construtor dele.

Custo medido do conjunto (passe do mundo, mesma cena e mesma camera):

| | antes | depois |
|---|---|---|
| desenhos | 72 | 72 |
| triangulos | 1538 | 2034 |
| programas | 15 | 21 |
| texturas | 10 | 20 |
| CPU do `update` | 0.119 ms | 0.154 ms |

Nada disso e' o que decide o fps: desenho e triangulo nao mudaram (os 496
triangulos a mais sao a esfera do ceu com mais segmentos). O custo real e' POR
PIXEL — duas buscas de textura a mais por pixel nos materiais do mundo. **Isso
nao da' pra medir aqui** (ver Desempenho): so' com o F3 numa maquina com GPU.

**`PCFSoftShadowMap` nao existe mais.** No three r185 ele e' deprecado e cai em
`PCFShadowMap` sozinho, avisando no console a cada atualizacao de sombra. Foi
trocado aqui uma vez achando que amaciava a borda: nao mudou um pixel, so'
poluiu o log — e ninguem percebeu porque sombra macia e sombra dura parecem as
duas plausiveis numa captura. Quem amacia hoje e' `VSMShadowMap`, que traz
vazamento de luz e faz TODO receptor virar projetor tambem; e' alavanca
conhecida, com preco, nao melhoria de graca.

Sobre repeticao: mancha grande e' o que mais denuncia uma textura tileada — a
mesma bolha reaparecendo em catorze painels le' como padrao, enquanto grao fino
e ruido nao. Por isso o muro leva mancha fraca e ferrugem discreta, e o
contentor, que aparece em peca pequena, pode levar as duas fortes.

Este visual chegou a ser revertido, junto com as sombras, numa caçada a um
problema de desempenho que **nao estava no jogo** (ver Desempenho). Os dois
voltaram. Mudanca de aparencia aqui e' quase de graca: textura de canvas, cor de
luz, cor de ceu e UV nao aparecem no custo por quadro.

**Pra tirar captura da arena, NAO teleporte pro centro.** Em (0, y, 0) fica o
nucleo elevado, e a camera nasce dentro do bloco: o que aparece e' a face de
baixo do bloco de cima, a meio metro do olho — magnificada e borrada, com cara
de teto de concreto. Perdi meia duzia de capturas investigando esse "teto"
antes de perceber que o ponto de vista e' que estava dentro do cenario. Use o
`playerStart` ou um canto, e mire no centro com
`yaw = Math.atan2(-(0 - x), -(0 - z))` (a convencao vem de `Player.forward`).

## Modos

`GameMode` em `Game.ts` decide o que roda: `waves` (sobrevivencia contra horda),
`firefight` (confronto contra soldados armados) ou `range` (campo de tiro, em
`src/modes/ShootingRange.ts`).

### Confronto

Sobrevivencia e' horda que corre pra cima; confronto e' tiroteio contra quem
atira de volta. As diferencas que fazem os dois nao serem o mesmo modo com
outra cor:

- **Sem ondas.** `EnemyManager.setSkirmish(n)` desliga a maquina de ondas
  inteira e so' repoe soldado ate' `n` em campo. Ninguem escala de vida ou
  velocidade: a dificuldade vem de levarem tiro de volta, nao de inflar numero.
- **Voce VOLTA ao morrer.** Quem termina a partida e' o placar (`killTarget`) ou
  o relogio (`roundSeconds`), nunca a sua vida. Por isso morrer usa
  `Player.revive()`, e NAO `respawn()` — o segundo e' reinicio de partida, apaga
  melhorias e tranca as armas de novo; num modo onde se morre toda hora, isso
  seria outro jogo.
- **Ao respawnar, o ponto de volta e' o mais LONGE de quem esta' vivo.** Sem
  escolher, dava pra nascer no meio do tiroteio e morrer antes de encostar no
  teclado.
- **Todas as armas liberadas.** Entrar de pistola contra cinco fuzis nao e'
  desafio, e' pedagio.
- O placar `BL x GR` do HUD, que existia sem uso desde o comeco, e' o daqui:
  seus abates de um lado, seus tombos do outro, com o cronometro no meio.

O soldado e' um `EnemyKind` como os outros, com `weight: 0` — e' isso que o
mantem fora do sorteio das ondas. Uma horda que atira de 22 m nao da' pra jogar.

**Armadilha que ja' custou caro:** o `respawnIntoFight` precisa devolver
`state = 'playing'`. Sem isso o laco de morte reentra a cada quadro e respawna
sem parar — o placar do inimigo subia de 3 pra 13 sozinho em segundos e o
relogio congelava.

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

## Desempenho

O jogo nao e' pesado de geometria: **39 desenhos e ~4 mil triangulos** por
quadro. Isso e' carga trivial, e a logica de CPU (`update`) gasta 0.5 ms. Se o
fps estiver ruim, o gargalo e' **por pixel** — resolucao, luzes, sombra — e nao
adianta simplificar o cenario.

**O diagnostico e' esse mesmo confronto**: abra o F3 e compare. Desenhos e
triangulos baixos com fps baixo = problema por pixel. Só o inverso justifica
mexer em quantidade de objetos.

O que existe pra baixar o custo por pixel, se um dia precisar:

- **Ajuste de resolucao** (menu de pausa, 50% a 100%). O custo do quadro cresce
  com a AREA: 70% de resolucao sao 49% dos pixels. Numa tela de alta densidade
  e' a alavanca mais forte, porque o `setPixelRatio` ja' parte de
  `devicePixelRatio` (ate' 2) — 4x os pixels de uma tela comum.
- **Contagem de luzes.** E' o custo que NAO aparece em perfil de geometria: a
  contagem entra no shader, e cada point light e' avaliada em todo pixel de todo
  material — apagada ou nao. Hoje sao 8 (hemisferica, sol, duas de canto e
  quatro de clarão); cortar pela metade ja' foi medido e funciona.
- **Sombra projetada.** Custa dois preços: um passe extra desenhando a cena
  inteira num mapa de 2048, e amostragem PCF em cada pixel do passe principal.
  Desligar leva os desenhos de 73 pra 39.

Os dois ultimos ja' foram aplicados uma vez e depois desfeitos: o problema era
outro (abaixo). Ficam registrados como alavancas conhecidas, com o efeito
medido — nao como coisas a fazer preventivamente.

**A primeira pergunta nao e' sobre o jogo: e' quem esta' desenhando.** O F3
mostra o nome do renderizador e acende em vermelho quando o navegador caiu pra
software — SwiftShader, llvmpipe, ou "Microsoft Basic Render Driver" (WARP) no
Windows. Nesse estado cada pixel sai da CPU e nenhuma otimizacao de shader muda
a ordem de grandeza.

**Isso ja' aconteceu de verdade neste projeto**, e custou uma rodada inteira de
otimizacao errada: 13 fps com a aceleracao por hardware desligada. Ligar a
aceleracao no navegador resolveu na hora. Antes disso foram removidas as sombras
e metade das luzes, e a arena foi revertida do visual novo — tudo por causa de
um problema que nao estava no jogo. **Cheque o F3 primeiro.**

Quando a deteccao acusa software, o jogo ja' nasce adaptado: resolucao em 50% e
sem suavizacao de serrilhado, que sao os dois maiores custos por pixel. Quem tem
GPU nao ve' diferenca nenhuma — os dois ajustes sao condicionais.

**Nao da' pra medir fps neste ambiente.** Sob renderizacao por software o jogo
roda a ~2 fps por melhor que esteja, e qualquer conclusao tirada dali mede o
swiftshader. O que VALE medir aqui: `renderer.info.render.calls`,
`.triangles`, `info.programs.length`, `memory.geometries` e o tempo de CPU do
`update` — todos independentes de GPU. Fps de verdade, so' com o F3 na maquina
de quem joga.

Ponta solta conhecida: tirar a sombra deixou 5 geometrias de pool (tracer,
decal, capsula) subindo pra GPU no primeiro uso em vez de no aquecimento — o
passe de sombra as forcava antes. Converge em 83 e para, entao e' upload tardio
e nao vazamento; sao poucos KB, uma vez so'.

## Armadilhas conhecidas

- **NUNCA mude a quantidade de luzes da cena durante o jogo.** No three, entrar
  ou sair uma luz (inclusive `visible = false`, ou esconder o pai dela) invalida
  os programas de shader de TODOS os materiais, e a recompilacao trava o frame
  por centenas de milissegundos. Foi o que fazia o jogo engasgar a cada tiro e a
  cada inimigo morto. Todas as luzes sao criadas na inicializacao e apagadas com
  `intensity = 0`. Pelo mesmo motivo, materiais nascem com `transparent: true`
  quando forem desaparecer depois: ligar isso em pleno jogo recompila.
  **Mas luz apagada nao e' luz de graca**: ela segue no laco de luzes do
  shader, avaliada em cada pixel de cada material. A contagem e' escolha de
  desempenho, decidida na inicializacao — nao um numero qualquer.
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

**Sob renderizacao por software, esperar o relogio nao funciona.** O `dt` e'
limitado a 1/20 por quadro, e a ~1.5 fps isso faz 23 segundos reais virarem 2 de
jogo — nada da' tempo de acontecer, e o teste conclui que o sistema esta' morto
quando ele so' esta' em camera lenta. Chame `g.update(1/60)` num laco pra
avancar o tempo de JOGO sem pagar rasterizacao:

```js
for (let t = 0; t < segundos; t += 1 / 60) g.update(1 / 60);
```

Foi assim que o confronto foi validado — e foi so' assim que o respawn em laco
apareceu.
