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
    for (const chave of CHAVES_ESPELHADAS) {
      const valorEspelho = estado[chave];
      const valorLocal = localStorage.getItem(chave);
      if (valorLocal === null && typeof valorEspelho === "string") {
        localStorage.setItem(chave, valorEspelho);
      } else if (valorLocal !== null && valorEspelho === undefined) {
        invokeApp("salvar_estado_ui", { chave, valor: valorLocal }).catch(() => {});
      }
    }
  } catch {
    // Sem espelho não há restauração, mas o app segue com o localStorage.
  }
}

// Intercepta gravações no localStorage e replica as chaves espelhadas no disco,
// cobrindo todos os pontos de escrita atuais e futuros sem alterá-los um a um.
export function iniciarEspelhamentoEstadoUi() {
  if (!tauriDisponivel) return;
  const setItemOriginal = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (chave: string, valor: string) => {
    setItemOriginal(chave, valor);
    if (CHAVES_ESPELHADAS.includes(chave)) {
      invokeApp("salvar_estado_ui", { chave, valor }).catch(() => {
        // Falha ao espelhar não pode interromper o uso; o localStorage já foi gravado.
      });
    }
  };
}
