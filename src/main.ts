import { Game } from './core/Game';
import { loadWeaponModels } from './weapons/WeaponModels';

const canvas = document.getElementById('viewport') as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error('canvas #viewport nao encontrado');
}

// WebGL pode simplesmente nao existir (driver, GPU bloqueada, navegador antigo).
// Melhor uma mensagem clara do que uma tela preta silenciosa.
const supportsWebGL = (): boolean => {
  try {
    const test = document.createElement('canvas');
    return !!(test.getContext('webgl2') ?? test.getContext('webgl'));
  } catch {
    return false;
  }
};

if (!supportsWebGL()) {
  document.body.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;font-family:monospace;color:#e8e6e3;text-align:center;padding:24px">' +
    '<div><h1>WebGL indisponivel</h1><p style="opacity:.6;margin-top:12px">' +
    'Este navegador nao consegue rodar o jogo. Tente ativar a aceleracao de hardware.</p></div></div>';
} else {
  // Os modelos entram ANTES do jogo existir: assim o aquecimento de shaders
  // cobre os materiais deles, e nada compila no meio da partida.
  const models = await loadWeaponModels();
  const game = new Game(canvas, models);

  // Gancho de depuracao: no console do navegador da' pra bisbilhotar
  // o estado do jogo (`__RPK.player`, `__RPK.enemies`, ...).
  (window as unknown as { __RPK: Game }).__RPK = game;

  if (import.meta.hot) {
    import.meta.hot.dispose(() => game.dispose());
  }
}
