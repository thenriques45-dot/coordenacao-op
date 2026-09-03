import { useMemo } from "react";
import type { EquipeGestora, GeneroEquipe, MembroEquipe } from "./SettingsPage";
import { listarEquipe, resolverPessoa, rotuloFuncao } from "./equipe";
import {
  agruparMembrosPorPessoa,
  carregarMembrosSincronizacao,
  garantirPerfilPersistido,
  type WorkgroupSyncProfile,
} from "./workgroupSync";

const OPCOES_GENERO: { valor: GeneroEquipe; rotulo: string }[] = [
  { valor: "F", rotulo: "Feminino" },
  { valor: "M", rotulo: "Masculino" },
  { valor: "", rotulo: "Não informar" },
];

function novoMembro(): MembroEquipe {
  return { id: `m-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, nome: "", genero: "" };
}

function LinhaMembro({
  membro,
  onChange,
  onRemover,
}: {
  membro: MembroEquipe;
  onChange: (campos: Partial<MembroEquipe>) => void;
  onRemover: () => void;
}) {
  return (
    <div className="cfg-equipe-linha">
      <input
        value={membro.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        placeholder="Nome completo"
        aria-label="Nome"
      />
      <select value={membro.genero} onChange={(e) => onChange({ genero: e.target.value as GeneroEquipe })} aria-label="Gênero">
        {OPCOES_GENERO.map((o) => (
          <option key={o.rotulo} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
      <button type="button" className="danger-action" onClick={onRemover}>Remover</button>
    </div>
  );
}

function ListaMembros({
  itens,
  onChange,
  addLabel,
  vazio,
}: {
  itens: MembroEquipe[];
  onChange: (itens: MembroEquipe[]) => void;
  addLabel: string;
  vazio: string;
}) {
  return (
    <>
      <div className="cfg-equipe-lista">
        {itens.map((m, i) => (
          <LinhaMembro
            key={m.id}
            membro={m}
            onChange={(campos) => onChange(itens.map((x, j) => (j === i ? { ...x, ...campos } : x)))}
            onRemover={() => onChange(itens.filter((_, j) => j !== i))}
          />
        ))}
        {!itens.length && <span className="cfg-equipe-vazio">{vazio}</span>}
      </div>
      <button type="button" className="secondary-action" onClick={() => onChange([...itens, novoMembro()])}>
        {addLabel}
      </button>
    </>
  );
}

export function EquipeGestoraSecao({
  equipe,
  onChange,
  perfilSync,
}: {
  equipe: EquipeGestora;
  onChange: (equipe: EquipeGestora) => void;
  perfilSync: WorkgroupSyncProfile;
}) {
  // Pessoas do grupo de trabalho (membros sincronizados + este dispositivo).
  const membrosGrupo = useMemo(() => {
    const nomes = new Map<string, string>(); // chave normalizada -> nome exibido
    for (const m of agruparMembrosPorPessoa(carregarMembrosSincronizacao())) {
      if (m.displayName?.trim()) nomes.set(m.displayName.trim().toLowerCase(), m.displayName.trim());
    }
    const perfil = garantirPerfilPersistido();
    if (perfil.displayName?.trim()) nomes.set(perfil.displayName.trim().toLowerCase(), perfil.displayName.trim());
    return Array.from(nomes.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, []);

  const roster = useMemo(() => listarEquipe(equipe), [equipe]);

  function definirVinculo(nomeCurto: string, membroId: string | null) {
    const outros = (equipe.vinculos ?? []).filter(
      (v) => v.nome_curto.trim().toLowerCase() !== nomeCurto.trim().toLowerCase(),
    );
    // membroId null = volta ao automático (remove o vínculo)
    const vinculos = membroId === null ? outros : [...outros, { nome_curto: nomeCurto, membro_id: membroId }];
    onChange({ ...equipe, vinculos });
  }

  return (
    <>
      <div className="cfg-artigo" id="cfg-equipe-direcao">
        <div className="cfg-artigo-titulo">
          <strong>Direção</strong>
          <span>flexiona o título nos documentos: "Diretora" / "Diretor"</span>
        </div>
        <div className="cfg-campos-2col">
          <label>
            Nome da direção
            <input
              value={equipe.direcao.nome}
              onChange={(e) => onChange({ ...equipe, direcao: { ...equipe.direcao, nome: e.target.value } })}
              placeholder="Nome completo"
            />
          </label>
          <label>
            Gênero
            <select
              value={equipe.direcao.genero}
              onChange={(e) => onChange({ ...equipe, direcao: { ...equipe.direcao, genero: e.target.value as GeneroEquipe } })}
            >
              {OPCOES_GENERO.map((o) => (
                <option key={o.rotulo} value={o.valor}>{o.rotulo}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="cfg-artigo" id="cfg-equipe-vices">
        <div className="cfg-artigo-titulo">
          <strong>Vice-direção</strong>
          <span>quantas houver na escola</span>
        </div>
        <ListaMembros
          itens={equipe.vices ?? []}
          onChange={(vices) => onChange({ ...equipe, vices })}
          addLabel="Adicionar vice-direção"
          vazio="Nenhuma vice-direção cadastrada."
        />
      </div>

      <div className="cfg-artigo" id="cfg-equipe-coordenacoes">
        <div className="cfg-artigo-titulo">
          <strong>Coordenação</strong>
          <span>coordenadores pedagógicos e de gestão</span>
        </div>
        <ListaMembros
          itens={equipe.coordenacoes ?? []}
          onChange={(coordenacoes) => onChange({ ...equipe, coordenacoes })}
          addLabel="Adicionar coordenação"
          vazio="Nenhuma coordenação cadastrada."
        />
      </div>

      {perfilSync.syncEnabled && (
        <div className="cfg-artigo" id="cfg-equipe-vinculos">
          <div className="cfg-artigo-titulo">
            <strong>Grupo de trabalho</strong>
            <span>quem é quem — o nome completo e a função passam a valer em todo lugar</span>
          </div>
          {membrosGrupo.length === 0 ? (
            <span className="cfg-equipe-vazio">
              Ninguém no grupo ainda. Assim que os coordenadores sincronizarem, aparecem aqui para vincular.
            </span>
          ) : roster.length === 0 ? (
            <span className="cfg-equipe-vazio">
              Cadastre a equipe acima primeiro — aí dá para vincular cada pessoa do grupo.
            </span>
          ) : (
            <div className="cfg-equipe-vinculo-tabela">
              <div className="cfg-equipe-vinculo-cab">
                <span>No grupo aparece como</span>
                <span>É esta pessoa</span>
              </div>
              {membrosGrupo.map((nomeCurto) => {
                const resolucao = resolverPessoa(nomeCurto, equipe);
                const vinculoExplicito = (equipe.vinculos ?? []).find(
                  (v) => v.nome_curto.trim().toLowerCase() === nomeCurto.trim().toLowerCase(),
                );
                const valorSelect = vinculoExplicito
                  ? vinculoExplicito.membro_id || "__nao__"
                  : "__auto__";
                return (
                  <div key={nomeCurto} className="cfg-equipe-vinculo-linha">
                    <span className="cfg-equipe-vinculo-curto">
                      {nomeCurto}
                      {resolucao?.origem === "automatico" && <em className="cfg-equipe-selo">automático</em>}
                    </span>
                    <select
                      value={valorSelect}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__auto__") definirVinculo(nomeCurto, null);
                        else if (v === "__nao__") definirVinculo(nomeCurto, "");
                        else definirVinculo(nomeCurto, v);
                      }}
                      aria-label={`Vincular ${nomeCurto}`}
                    >
                      <option value="__auto__">
                        {resolucao?.origem === "automatico"
                          ? `Automático — ${resolucao.pessoa.nome} · ${rotuloFuncao(resolucao.pessoa.funcao, resolucao.pessoa.genero)}`
                          : "Automático (sem correspondência)"}
                      </option>
                      {roster.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome} · {rotuloFuncao(p.funcao, p.genero)}
                        </option>
                      ))}
                      <option value="__nao__">Não vincular</option>
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
