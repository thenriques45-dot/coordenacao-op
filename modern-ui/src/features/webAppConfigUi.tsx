import { FileText, RefreshCw } from "lucide-react";
import type { WorkgroupSyncMember } from "./workgroupSync";

export const BIMESTRES = ["1", "2", "3", "4"];

// Conectores que ficam em minúsculo no meio do nome (mas não se forem a
// primeira palavra) — "Orientação de Estudo em Matemática", não "Orientação
// De Estudo Em Matemática".
const CONECTORES_TITULO_DISCIPLINA = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);

// Uniformiza a caixa de nomes de disciplina para exibição — o mapão do SED
// mistura "Matemática" (Título) com componentes de expansão/itinerário como
// "EDUCACAO FISICA" (TUDO MAIÚSCULO), e a mesma turma podia mostrar as duas
// convenções lado a lado na matriz de PEI/Planejamento. Não restaura acento
// que o texto de origem já não tinha (não há como adivinhar "Educação" a
// partir de "EDUCACAO") — só resolve a inconsistência de caixa.
export function paraTituloDisciplina(valor: string): string {
  let primeira = true;
  return valor
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((parte) => {
      if (parte.trim() === "") return parte;
      const manterMinusculo = !primeira && CONECTORES_TITULO_DISCIPLINA.has(parte);
      primeira = false;
      if (manterMinusculo || !parte.charAt(0)) return parte;
      return parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1);
    })
    .join("");
}

type ConfiguradoPorOutroBannerProps = {
  membro: WorkgroupSyncMember | null;
  // Nome do que foi configurado, para a frase "já configurou o ___
  // automático para a escola" (ex.: "PEI", "Planejamento").
  rotulo: string;
  carregando: boolean;
  onCarregarAgora: () => void;
  onVerConfiguracoes: () => void;
  // Reatribui a config pro perfil local atual (mesmo UUID de quem
  // configurou originalmente não bate mais — reinstalação, formatação de
  // PC, limpeza de perfil). Só existe quando o nome de exibição bate com o
  // do usuário atual — ver `Planejamento.tsx`/`PEI.tsx`. `undefined` some
  // com o botão inteiro.
  onReivindicar?: () => void;
  reivindicando?: boolean;
};

// Card "Fulano já configurou isso" mostrado quando outro coordenador do
// grupo de trabalho já provisionou o Web App automático — evita que quem
// abre a tela pela primeira vez seja forçado a passar pela modal técnica de
// configuração. Idêntico entre PEI.tsx e Planejamento.tsx, só o texto muda.
export function ConfiguradoPorOutroBanner({
  membro, rotulo, carregando, onCarregarAgora, onVerConfiguracoes, onReivindicar, reivindicando,
}: ConfiguradoPorOutroBannerProps) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap",
        border: "1px solid var(--border-color, #333)", borderRadius: "10px",
        padding: "0.8rem 1rem", margin: "0 0 1rem",
      }}
    >
      {membro?.avatarDataUrl && (
        <img
          src={membro.avatarDataUrl}
          alt=""
          style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      )}
      <p style={{ margin: 0, flex: 1, minWidth: "220px", fontSize: "0.88rem" }}>
        <strong>{membro?.displayName || "Outro coordenador da equipe"}</strong> já configurou o {rotulo}{" "}
        automático para a escola — não é preciso criar um novo.
        {onReivindicar && " Esse nome é o seu de um perfil antigo (reinstalação, formatação)?"}
      </p>
      <button type="button" className="primary-action" onClick={onCarregarAgora} disabled={carregando}>
        <RefreshCw size={14} /> {carregando ? "Carregando..." : "Carregar agora"}
      </button>
      <button type="button" className="ghost-action" onClick={onVerConfiguracoes}>
        Ver configurações avançadas
      </button>
      {onReivindicar && (
        <button type="button" className="ghost-action" onClick={onReivindicar} disabled={reivindicando}>
          {reivindicando ? "Reivindicando..." : "Essa configuração é minha"}
        </button>
      )}
    </div>
  );
}

type MatrizBimestralProps<T extends { professor: string }> = {
  titulo: string;
  mensagemVazia: string;
  disciplinas: string[];
  // Indexada por `${normalizarDisciplina(disciplina)}|${bimestre}`.
  matriz: Map<string, T>;
  normalizarDisciplina: (disciplina: string) => string;
  tituloBotao: (disciplina: string, bimestre: string, registro: T) => string;
  onAbrir: (disciplina: string, bimestre: string, registro: T) => void;
};

// Tabela disciplina × bimestre com um botão por célula preenchida, abrindo o
// documento correspondente. Idêntica entre a matriz de PEIs (por aluno) e a
// de planejamentos (por turma) — só o rótulo, a fonte dos dados e a ação de
// abrir mudam, por isso o tipo do registro (T) só precisa ter `professor`.
export function MatrizBimestral<T extends { professor: string }>({
  titulo, mensagemVazia, disciplinas, matriz, normalizarDisciplina, tituloBotao, onAbrir,
}: MatrizBimestralProps<T>) {
  return (
    <div className="table-panel">
      <div className="panel-heading">
        <h3>{titulo}</h3>
      </div>
      {disciplinas.length === 0 ? (
        <p style={{ padding: "0.75rem", fontSize: "0.84rem", color: "var(--text-secondary)" }}>{mensagemVazia}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: "160px" }}>Disciplina</th>
              {BIMESTRES.map((b) => (
                <th key={b} style={{ textAlign: "center", width: "80px" }}>
                  {b}º Bim
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {disciplinas.map((disciplina) => (
              <tr key={disciplina}>
                <td>{disciplina}</td>
                {BIMESTRES.map((b) => {
                  const registro = matriz.get(`${normalizarDisciplina(disciplina)}|${b}`);
                  return (
                    <td key={b} style={{ textAlign: "center" }}>
                      {registro ? (
                        <button
                          type="button"
                          title={tituloBotao(disciplina, b, registro)}
                          onClick={() => onAbrir(disciplina, b, registro)}
                          style={{
                            background: "transparent",
                            border: "1px solid transparent",
                            borderRadius: "6px",
                            padding: "0.25rem 0.4rem",
                            cursor: "pointer",
                            color: "var(--accent)",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <FileText size={16} />
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
