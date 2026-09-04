# Modelos 3D das armas

Coloque aqui os arquivos **`.glb`** (glTF binario). Um por arma, com o nome
igual ao `WeaponId` usado no codigo:

    pistol.glb      deagle.glb      smg.glb
    rifle.glb       shotgun.glb     sniper.glb

Do Ultimate Guns Pack, uma correspondencia razoavel seria:

| arquivo aqui  | modelo do pacote                |
|---------------|---------------------------------|
| `pistol.glb`  | uma pistola simples             |
| `deagle.glb`  | o revolver ou a pistola pesada  |
| `smg.glb`     | uma submetralhadora curta       |
| `rifle.glb`   | o fuzil de assalto (tipo AK/M4) |
| `shotgun.glb` | a escopeta de bombeamento       |
| `sniper.glb`  | o rifle com luneta              |

Sao so' esses seis: nao vale a pena versionar os 25 modelos do pacote se o jogo
usa meia duzia.

**O jogo funciona sem esta pasta.** Faltando um arquivo, aquela arma continua
usando o modelo procedural — nada quebra, e da' pra trocar uma de cada vez.

Credito do pacote em `CREDITS.md`, na raiz.
