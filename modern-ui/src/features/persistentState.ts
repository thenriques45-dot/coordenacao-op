import { invokeApp, tauriDisponivel } from "./appBridge";

// Chaves do localStorage espelhadas em disco pelo backend (dados/estado_ui.json).
// O localStorage do WebView pode ser perdido em limpezas de cache/perfil; o
// espelho permite restaurar o quadro kanban, o calendário e os caches na
// inicialização. As configurações de IA ficam de fora por conterem a chave de
// API — o arquivo espelhado entra nos backups exportados.
const CHAVES_ESPELHADAS = [
  "coordenacaoop:quadro-kanban:v1",
  "coordenacaoop:quadro-kanban-colunas:v1",
  "coordenacaoop:calendario-gestao:v1",
  "coordenacaoop:eventos-realizados",
  "coordenacaoop:pei-url-planilha",
  "coordenacaoop:pei-ultima-busca",
  "coordenacaoop:pei-registros-cache",
  "coordenacaoop:planejamento-ultima-busca",
  "coordenacaoop:planejamento-registros-cache",
  "coordenacaoop:workgroup-sync-profile:v1",
  "coordenacaoop:workgroup-sync-members:v1",
  "coordenacaoop:workgroup-sync-tombstones:v1",
];

// Restaura do disco as chaves ausentes no localStorage. Precisa rodar antes do
// primeiro render, porque os componentes leem o localStorage no estado inicial.
// Também semeia o espelho com o que já existe só no localStorage (migração de
// versões anteriores a este recurso).
export async function hidratarEstadoUi() {
  if (!tauriDisponivel) return;
  try {
    const estado = await invokeApp<Record<string, string>>("carregar_estado_ui");
    const semearNoEspelho: Record<string, string> = {};
    for (const chave of CHAVES_ESPELHADAS) {
      const valorEspelho = estado[chave];
      const valorLocal = localStorage.getItem(chave);
      if (valorLocal === null && typeof valorEspelho === "string") {
        localStorage.setItem(chave, valorEspelho);
      } else if (valorLocal !== null && valorEspelho === undefined) {
        semearNoEspelho[chave] = valorLocal;
      }
    }
    // Numa só gravação: são até 12 chaves, e cada chamada avulsa reescreveria
    // o arquivo inteiro logo na abertura do app.
    if (Object.keys(semearNoEspelho).length > 0) {
      invokeApp("salvar_estado_ui_lote", { entradas: semearNoEspelho }).catch(() => {});
    }
  } catch {
    // Sem espelho não há restauração, mas o app segue com o localStorage.
  }
}

// Janela de agrupamento das gravações do espelho. Um ciclo de sincronização
// com 11 peers dispara ~154 gravações em poucos segundos (cada peer aplica
// kanban + calendário + colunas + tombstones e re-registra os 9 membros do
// roster), quase todas com conteúdo idêntico. Sem agrupar, cada uma reescrevia
// o arquivo inteiro — que passa de 2 MB por causa dos avatares em base64.
const INTERVALO_ESPELHO_MS = 2000;

const pendentes = new Map<string, string>();
let temporizador: number | null = null;
let gravando: Promise<void> = Promise.resolve();

// Encadeia as gravações em vez de disparar em paralelo: duas chamadas
// concorrentes de salvar_estado_ui_lote fariam ler-modificar-gravar em cima do
// mesmo arquivo e a segunda poderia perder as chaves da primeira.
function descarregarEspelho() {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  if (pendentes.size === 0) return gravando;
  const entradas = Object.fromEntries(pendentes);
  pendentes.clear();
  gravando = gravando
    .catch(() => {})
    .then(() => invokeApp("salvar_estado_ui_lote", { entradas }).then(() => {}))
    .catch(() => {
      // Falha ao espelhar não pode interromper o uso; o localStorage já foi
      // gravado de forma síncrona e continua sendo a fonte de verdade.
    });
  return gravando;
}

// Intercepta gravações no localStorage e replica as chaves espelhadas no disco,
// cobrindo todos os pontos de escrita atuais e futuros sem alterá-los um a um.
// O localStorage em si continua sendo gravado na hora, de forma síncrona — o
// atraso vale só para a cópia em disco, que é um seguro contra limpeza de
// cache do WebView, não a fonte de verdade.
export function iniciarEspelhamentoEstadoUi() {
  if (!tauriDisponivel) return;
  const setItemOriginal = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (chave: string, valor: string) => {
    setItemOriginal(chave, valor);
    if (!CHAVES_ESPELHADAS.includes(chave)) return;
    // Só a última gravação de cada chave interessa: o espelho guarda estado,
    // não histórico.
    pendentes.set(chave, valor);
    if (temporizador === null) {
      temporizador = window.setTimeout(descarregarEspelho, INTERVALO_ESPELHO_MS);
    }
  };

  // A janela fica escondida na bandeja em vez de fechar (ver on_window_event
  // no main.rs), então `beforeunload` só chega no encerramento de verdade;
  // esconder dispara `visibilitychange`. Os dois são melhor-esforço: se o
  // processo morrer antes, perde-se no máximo a última janela de 2 s do
  // espelho — o localStorage já tem o dado.
  window.addEventListener("beforeunload", () => void descarregarEspelho());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void descarregarEspelho();
  });
}
