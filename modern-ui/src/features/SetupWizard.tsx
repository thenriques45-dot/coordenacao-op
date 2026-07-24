import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { FolderOpen, School, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";
import { CICLOS_TURMA, PERIODOS_TURMA, codigoTurma, type NovaTurmaPayload } from "./ClassList";
import type { ConfiguracoesApp } from "./SettingsPage";
import { parseCsvAlunos, type NovoAlunoPayload } from "./studentsCsv";
import type { WorkgroupSyncProfile } from "./workgroupSync";

const TOTAL_PASSOS = 5;

export function AssistenteConfiguracaoInicial({
  perfil,
  turmasCount,
  onCriarTurma,
  onAbrirTelaTurmas,
  onConcluir,
  onDispensar,
}: {
  perfil: WorkgroupSyncProfile;
  turmasCount: number;
  onCriarTurma: (payload: NovaTurmaPayload) => Promise<void>;
  onAbrirTelaTurmas: () => void;
  onConcluir: (perfil: WorkgroupSyncProfile) => void;
  onDispensar: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [rascunhoPerfil, setRascunhoPerfil] = useState(perfil);
  const [config, setConfig] = useState<ConfiguracoesApp | null>(null);
  const [salvandoInstituicao, setSalvandoInstituicao] = useState(false);
  const [enviandoCabecalho, setEnviandoCabecalho] = useState(false);
  const [erro, setErro] = useState("");

  const [cicloForm, setCicloForm] = useState("EM");
  const [serieForm, setSerieForm] = useState(CICLOS_TURMA.EM[0]);
  const [letraForm, setLetraForm] = useState("A");
  const [salaForm, setSalaForm] = useState("");
  const [periodoForm, setPeriodoForm] = useState(PERIODOS_TURMA[0]);
  const [anoForm, setAnoForm] = useState(String(new Date().getFullYear()));
  const [arquivoNome, setArquivoNome] = useState("");
  const [alunosCsv, setAlunosCsv] = useState<NovoAlunoPayload[]>([]);
  const [criandoTurma, setCriandoTurma] = useState(false);
  const [turmaCriadaMsg, setTurmaCriadaMsg] = useState("");

  useEffect(() => {
    invokeApp<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function salvarInstituicaoEAvancar() {
    setErro("");
    if (config && tauriDisponivel) {
      setSalvandoInstituicao(true);
      try {
        const salvo = await invokeApp<ConfiguracoesApp>("salvar_configuracoes", { input: config });
        setConfig(salvo);
      } catch (err) {
        setErro(String(err));
        setSalvandoInstituicao(false);
        return;
      }
      setSalvandoInstituicao(false);
    }
    setPasso((atual) => atual + 1);
  }

  async function enviarCabecalhoAta(arquivo: File | undefined) {
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    if (!nome.endsWith(".jpg") && !nome.endsWith(".jpeg") && !nome.endsWith(".png")) {
      setErro("Selecione uma imagem JPG, JPEG ou PNG.");
      return;
    }
    setErro("");
    setEnviandoCabecalho(true);
    try {
      const bytes = Array.from(new Uint8Array(await arquivo.arrayBuffer()));
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_cabecalho_ata", { input: { nome: arquivo.name, bytes } });
      setConfig(salvo);
    } catch (err) {
      setErro(String(err));
    } finally {
      setEnviandoCabecalho(false);
    }
  }

  function alterarCiclo(valor: string) {
    setCicloForm(valor);
    setSerieForm((CICLOS_TURMA[valor] ?? CICLOS_TURMA.EM)[0]);
  }

  function selecionarCsv(arquivo: File | undefined) {
    setErro("");
    setArquivoNome("");
    setAlunosCsv([]);
    if (!arquivo) return;
    arquivo.text()
      .then((texto) => {
        const alunos = parseCsvAlunos(texto);
        if (!alunos.length) {
          throw new Error("Não encontrei alunos válidos no CSV.");
        }
        setArquivoNome(arquivo.name);
        setAlunosCsv(alunos);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)));
  }

  async function criarTurmaInline() {
    setErro("");
    const anoNumero = Number.parseInt(anoForm, 10);
    if (!Number.isFinite(anoNumero)) {
      setErro("Ano letivo inválido.");
      return;
    }
    if (!alunosCsv.length) {
      setErro("Selecione o CSV de alunos antes de criar a turma.");
      return;
    }
    const codigo = codigoTurma(serieForm, letraForm);
    setCriandoTurma(true);
    setTurmaCriadaMsg("");
    try {
      await onCriarTurma({
        codigo,
        ano: anoNumero,
        serie: serieForm,
        sala: salaForm,
        periodo: periodoForm,
        ciclo: cicloForm,
        alunos: alunosCsv,
        substituir_alunos: false,
      });
      setTurmaCriadaMsg(`Turma ${codigo} criada com ${alunosCsv.length} aluno(s).`);
      setArquivoNome("");
      setAlunosCsv([]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setCriandoTurma(false);
    }
  }

  async function escolherPasta() {
    setErro("");
    try {
      const selecionado = await abrirDialogoArquivo({
        directory: true,
        multiple: false,
        title: "Escolher pasta compartilhada do grupo de trabalho",
      });
      if (typeof selecionado === "string") {
        setRascunhoPerfil((atual) => ({ ...atual, syncFolder: selecionado }));
      }
    } catch (err) {
      setErro(`Não foi possível abrir o seletor de pasta: ${String(err)}`);
    }
  }

  function finalizarComSincronizacao() {
    if (!rascunhoPerfil.syncFolder.trim()) {
      setErro('Escolha a pasta compartilhada antes de finalizar, ou use "Concluir sem sincronização".');
      return;
    }
    onConcluir({
      ...rascunhoPerfil,
      displayName: rascunhoPerfil.displayName.trim() || "Coordenação",
      role: rascunhoPerfil.role.trim() || "Coordenação pedagógica",
      syncEnabled: true,
      onboarding: "enabled",
    });
  }

  function finalizarSemSincronizacao() {
    onConcluir({
      ...rascunhoPerfil,
      displayName: rascunhoPerfil.displayName.trim() || "Coordenação",
      role: rascunhoPerfil.role.trim() || "Coordenação pedagógica",
      syncEnabled: false,
      onboarding: "enabled",
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="sync-wizard" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title">
        <div className="sync-wizard-progress" aria-label={`Etapa ${passo + 1} de ${TOTAL_PASSOS}`}>
          {Array.from({ length: TOTAL_PASSOS }).map((_, indice) => (
            <span key={indice} className={indice <= passo ? "active" : ""} />
          ))}
        </div>

        {passo === 0 && (
          <>
            <span className="eyebrow">Bem-vindo</span>
            <h2 id="setup-wizard-title">Vamos configurar o CoordenacaoOP</h2>
            <p>
              Poucos passos para deixar o aplicativo pronto para o dia a dia da coordenação: dados da escola, importação
              das turmas e, se quiser, sincronização com o grupo de trabalho.
            </p>
            <div className="sync-wizard-grid">
              <article>
                <School size={20} />
                <strong>Dados da instituição</strong>
                <span>Direção, média mínima e cabeçalho da ata.</span>
              </article>
              <article>
                <Upload size={20} />
                <strong>Turmas e alunos</strong>
                <span>Crie a primeira turma a partir do mapão.</span>
              </article>
            </div>
            <p className="sync-wizard-note">Você pode pular qualquer etapa agora e voltar depois em Configurações.</p>
          </>
        )}

        {passo === 1 && (
          <>
            <span className="eyebrow">Instituição</span>
            <h2 id="setup-wizard-title">Dados da instituição</h2>
            <p>Esses dados aparecem na ata do conselho e nos relatórios gerados pelo app.</p>
            <div className="sync-wizard-form">
              <label>
                Nome da direção
                <input
                  value={config?.direcao_nome ?? ""}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, direcao_nome: event.target.value } : atual))}
                  placeholder="Ex.: Maria da Silva"
                  disabled={!config}
                />
              </label>
              <label>
                Pronome
                <select
                  value={config?.direcao_pronome ?? "F"}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, direcao_pronome: event.target.value } : atual))}
                  disabled={!config}
                >
                  <option value="F">Feminino: Diretora Sra.</option>
                  <option value="M">Masculino: Diretor Sr.</option>
                </select>
              </label>
              <label>
                Média mínima
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={config?.nota_minima ?? 5}
                  onChange={(event) => setConfig((atual) => (atual ? { ...atual, nota_minima: Number(event.target.value) } : atual))}
                  disabled={!config}
                />
              </label>
            </div>
            <div className="settings-file-group">
              <span>Cabeçalho da ata</span>
              <p>Use uma imagem JPG ou PNG com o cabeçalho oficial da escola. Ela aparecerá na ata e no relatório dos professores.</p>
              <label className="file-action">
                {enviandoCabecalho ? "Enviando..." : "Enviar imagem de cabeçalho"}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  disabled={enviandoCabecalho}
                  onChange={(event) => enviarCabecalhoAta(event.target.files?.[0])}
                />
              </label>
              <span className="settings-version">
                {config?.cabecalho_ata ? "Cabeçalho personalizado configurado." : "Usando cabeçalho padrão, se existir na pasta de dados."}
              </span>
            </div>
          </>
        )}

        {passo === 2 && (
          <>
            <span className="eyebrow">Turmas e alunos</span>
            <h2 id="setup-wizard-title">Crie a primeira turma</h2>
            <p>
              Selecione o mapão (CSV de alunos da SED) e preencha os dados da turma para criá-la agora, sem sair do
              assistente.
            </p>
            <div className="sync-wizard-grid">
              <article>
                <Upload size={20} />
                <strong>{turmasCount > 0 ? `${turmasCount} turma(s) já criada(s)` : "Nenhuma turma criada ainda"}</strong>
                <span>Você pode criar mais de uma turma aqui, uma de cada vez.</span>
              </article>
            </div>
            <div className="sync-wizard-form">
              <label>
                Ciclo
                <select value={cicloForm} onChange={(event) => alterarCiclo(event.target.value)}>
                  {Object.keys(CICLOS_TURMA).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Série
                <select value={serieForm} onChange={(event) => setSerieForm(event.target.value)}>
                  {(CICLOS_TURMA[cicloForm] ?? CICLOS_TURMA.EM).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Turma (letra)
                <input value={letraForm} maxLength={1} onChange={(event) => setLetraForm(event.target.value.toLocaleUpperCase("pt-BR"))} placeholder="Ex.: A" />
              </label>
              <label>
                Sala
                <input value={salaForm} onChange={(event) => setSalaForm(event.target.value)} placeholder="Opcional" />
              </label>
              <label>
                Período
                <select value={periodoForm} onChange={(event) => setPeriodoForm(event.target.value)}>
                  {PERIODOS_TURMA.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Ano letivo
                <input type="number" value={anoForm} onChange={(event) => setAnoForm(event.target.value)} />
              </label>
              <label className="file-action">
                {arquivoNome || "Selecionar CSV de alunos (mapão da SED)"}
                <input type="file" accept=".csv,text/csv" onChange={(event) => selecionarCsv(event.target.files?.[0])} />
              </label>
            </div>
            <button type="button" className="primary-action" onClick={criarTurmaInline} disabled={criandoTurma || !alunosCsv.length}>
              {criandoTurma ? "Criando..." : `Criar turma ${codigoTurma(serieForm, letraForm)}`}
            </button>
            {turmaCriadaMsg && <div className="notice success">{turmaCriadaMsg}</div>}
            <p className="sync-wizard-note">
              Prefere criar várias turmas de uma vez (por faixa de letras)? Use a tela de Turmas.
            </p>
            <button type="button" className="secondary-action" onClick={onAbrirTelaTurmas}>
              Abrir tela de Turmas
            </button>
          </>
        )}

        {passo === 3 && (
          <>
            <span className="eyebrow">Perfil do coordenador</span>
            <h2 id="setup-wizard-title">Identifique esta instalação</h2>
            <p>
              Esses dados ajudam o grupo a entender a origem das alterações, caso você ative a sincronização. Eles não
              substituem login nem enviam dados para servidor externo.
            </p>
            <div className="sync-wizard-form">
              <label>
                Seu nome
                <input
                  value={rascunhoPerfil.displayName}
                  onChange={(event) => setRascunhoPerfil((atual) => ({ ...atual, displayName: event.target.value }))}
                  placeholder="Ex.: Thiago Henrique"
                />
              </label>
              <label>
                Função
                <input
                  value={rascunhoPerfil.role}
                  onChange={(event) => setRascunhoPerfil((atual) => ({ ...atual, role: event.target.value }))}
                />
              </label>
              <label>
                Nome deste dispositivo
                <input
                  value={rascunhoPerfil.deviceName}
                  onChange={(event) => setRascunhoPerfil((atual) => ({ ...atual, deviceName: event.target.value }))}
                />
              </label>
            </div>
          </>
        )}

        {passo === 4 && (
          <>
            <span className="eyebrow">Sincronização de grupo (opcional)</span>
            <h2 id="setup-wizard-title">Compartilhar dados com outros coordenadores?</h2>
            <p>
              Use uma pasta OneDrive compartilhada entre os coordenadores, por exemplo <code>CoordenacaoOP-Sync</code>. Se
              preferir, conclua sem ativar agora — isso fica disponível depois em Configurações.
            </p>
            <div className="sync-folder-picker">
              <button type="button" onClick={escolherPasta}>
                <FolderOpen size={18} />
                Escolher pasta
              </button>
              <span>{rascunhoPerfil.syncFolder || "Nenhuma pasta selecionada"}</span>
            </div>
          </>
        )}

        {erro && <div className="notice error">{erro}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onDispensar}>Agora não</button>
          {passo > 0 && <button type="button" onClick={() => setPasso((atual) => atual - 1)}>Voltar</button>}
          {passo === 1 && (
            <button type="button" className="primary-action" onClick={salvarInstituicaoEAvancar} disabled={salvandoInstituicao}>
              {salvandoInstituicao ? "Salvando..." : "Próximo"}
            </button>
          )}
          {(passo === 0 || passo === 2 || passo === 3) && (
            <button type="button" className="primary-action" onClick={() => setPasso((atual) => atual + 1)}>
              Próximo
            </button>
          )}
          {passo === 4 && (
            <>
              <button type="button" onClick={finalizarSemSincronizacao}>Concluir sem sincronização</button>
              <button type="button" className="primary-action" onClick={finalizarComSincronizacao}>Finalizar</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
