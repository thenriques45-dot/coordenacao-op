import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useMemo, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";

type TurmaConfiguracoes = {
  ciclo: string | null;
};

type ConfiguracoesApp = {
  direcao_nome: string;
  direcao_pronome: string;
  nota_minima: number;
  cabecalho_ata: string | null;
};

type BackupResultado = {
  caminho: string | null;
  arquivos: number;
  arquivos_importados: number;
  conflitos: string[];
  backup_seguranca: string | null;
};

type AppInfo = {
  name: string;
  stage: string;
  version: string;
  data_dir: string;
};

function rotuloCiclo(ciclo: string) {
  const rotulos: Record<string, string> = {
    EI: "Educação Infantil",
    EFAI: "Anos iniciais",
    EFAF: "Anos finais",
    EM: "Ensino médio",
    "Sem ciclo": "Sem ciclo",
  };
  return rotulos[ciclo] ?? ciclo;
}
export function Configuracoes({ turmas, onDadosAlterados }: { turmas: TurmaConfiguracoes[]; onDadosAlterados: () => void }) {
  const [config, setConfig] = useState<ConfiguracoesApp>({
    direcao_nome: "",
    direcao_pronome: "F",
    nota_minima: 5,
    cabecalho_ata: null,
  });
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);
  const [atualizacao, setAtualizacao] = useState<Update | null>(null);
  const [ciclosBackup, setCiclosBackup] = useState<string[]>(["todos"]);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);
  const ciclosExistentes = useMemo(() => {
    const ciclos = Array.from(new Set(turmas.map((turma) => turma.ciclo || "Sem ciclo").filter(Boolean)));
    return ciclos.sort((a, b) => rotuloCiclo(a).localeCompare(rotuloCiclo(b), "pt-BR", { numeric: true }));
  }, [turmas]);

  useEffect(() => {
    invokeApp<ConfiguracoesApp>("carregar_configuracoes")
      .then(setConfig)
      .catch((err) => setErro(String(err)));
    invokeApp<AppInfo>("app_info")
      .then(setAppInfo)
      .catch(() => setAppInfo(null));
  }, []);

  useEffect(() => {
    setCiclosBackup((atuais) => {
      if (atuais.includes("todos")) return atuais;
      const validos = atuais.filter((ciclo) => ciclosExistentes.includes(ciclo));
      return validos.length ? validos : ["todos"];
    });
  }, [ciclosExistentes]);

  async function salvar() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_configuracoes", { input: config });
      setConfig(salvo);
      setMensagem("Configurações salvas.");
      onDadosAlterados();
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function enviarCabecalhoAta(arquivo: File | null) {
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    if (!nome.endsWith(".jpg") && !nome.endsWith(".jpeg") && !nome.endsWith(".png")) {
      setErro("Selecione uma imagem JPG, JPEG ou PNG.");
      return;
    }
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const bytes = Array.from(new Uint8Array(await arquivo.arrayBuffer()));
      const salvo = await invokeApp<ConfiguracoesApp>("salvar_cabecalho_ata", {
        input: { nome: arquivo.name, bytes },
      });
      setConfig(salvo);
      setMensagem("Imagem de cabeçalho da ata atualizada.");
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function exportarBackup() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const ciclos = ciclosBackup.includes("todos") ? [] : ciclosBackup;
      const resultado = await invokeApp<BackupResultado>("exportar_backup_seletivo", { input: { ciclos } });
      setUltimoBackup(resultado.caminho);
      setMensagem(`Backup gerado com ${resultado.arquivos} arquivos em: ${resultado.caminho}`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  function alternarCicloBackup(ciclo: string) {
    setCiclosBackup((atuais) => {
      if (ciclo === "todos") return ["todos"];
      const base = atuais.filter((item) => item !== "todos");
      const proximo = base.includes(ciclo) ? base.filter((item) => item !== ciclo) : [...base, ciclo];
      return proximo.length ? proximo : ["todos"];
    });
  }

  function abrirUltimoBackup() {
    if (!ultimoBackup) return;
    invokeApp("abrir_pasta", { caminho: ultimoBackup }).catch((err) => setErro(String(err)));
  }

  async function importarBackup(arquivo: File | null, modo: "mesclar" | "substituir") {
    if (!arquivo) return;
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const bytes = Array.from(new Uint8Array(await arquivo.arrayBuffer()));
      const resultado = await invokeApp<BackupResultado>("importar_backup", {
        input: { nome: arquivo.name, bytes, modo },
      });
      if (modo === "substituir") {
        setMensagem(`Backup restaurado. Backup de segurança: ${resultado.backup_seguranca ?? "não gerado"}.`);
      } else {
        setMensagem(`Backup importado: ${resultado.arquivos_importados} arquivos adicionados, ${resultado.conflitos.length} conflitos ignorados.`);
      }
      onDadosAlterados();
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function verificarAtualizacao() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!tauriDisponivel) {
        throw new Error("Verificação disponível apenas no aplicativo desktop.");
      }
      const update = await check();
      setAtualizacao(update);
      setMensagem(update ? `Nova versão disponível: ${update.version}.` : "Você já está usando a versão mais recente.");
    } catch (err) {
      setErro(`Não foi possível verificar atualizações: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  async function instalarAtualizacao() {
    if (!atualizacao) return;
    setProcessando(true);
    setMensagem("Baixando atualização...");
    setErro("");
    try {
      await atualizacao.downloadAndInstall();
      setMensagem("Atualização instalada. Reiniciando...");
      if (tauriDisponivel) {
        await relaunch();
      }
    } catch (err) {
      setErro(`Não foi possível instalar a atualização: ${String(err)}`);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="page-title-row">
        <div>
          <h1>Configurações</h1>
          <p>Dados institucionais, backup e atualização do programa.</p>
        </div>
      </div>

      <section className="panel settings-grid">
        <article className="settings-card">
          <h2>Direção e critérios</h2>
          <label>
            Nome da direção
            <input value={config.direcao_nome} onChange={(event) => setConfig((atual) => ({ ...atual, direcao_nome: event.target.value }))} />
          </label>
          <label>
            Pronome
            <select value={config.direcao_pronome} onChange={(event) => setConfig((atual) => ({ ...atual, direcao_pronome: event.target.value }))}>
              <option value="F">Feminino: Diretora Sra.</option>
              <option value="M">Masculino: Diretor Sr.</option>
            </select>
          </label>
          <label>
            Média mínima
            <input type="number" min="0" max="10" step="0.1" value={config.nota_minima} onChange={(event) => setConfig((atual) => ({ ...atual, nota_minima: Number(event.target.value) }))} />
          </label>
          <div className="settings-file-group">
            <span>Cabeçalho da ata</span>
            <p>Use uma imagem JPG ou PNG com o cabeçalho oficial da escola. Ela aparecerá na ata e no relatório dos professores.</p>
            <label className="file-action">
              Enviar imagem de cabeçalho
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => enviarCabecalhoAta(event.target.files?.[0] ?? null)} />
            </label>
            <span className="settings-version">
              {config.cabecalho_ata ? "Cabeçalho personalizado configurado." : "Usando cabeçalho padrão, se existir na pasta de dados."}
            </span>
          </div>
          <button className="primary-action" onClick={salvar} disabled={processando}>Salvar configurações</button>
        </article>

        <article className="settings-card">
          <h2>Backup</h2>
          <p>O formato antigo de backup é compatível com a modern-ui.</p>
          <div className="backup-cycle-options" aria-label="Selecionar ciclos para backup">
            <button className={ciclosBackup.includes("todos") ? "selected" : ""} onClick={() => alternarCicloBackup("todos")}>
              Tudo
            </button>
            {ciclosExistentes.map((ciclo) => (
              <button
                key={ciclo}
                className={ciclosBackup.includes(ciclo) ? "selected" : ""}
                onClick={() => alternarCicloBackup(ciclo)}
              >
                {rotuloCiclo(ciclo)}
              </button>
            ))}
          </div>
          <button onClick={exportarBackup} disabled={processando}>Gerar backup</button>
          {ultimoBackup && (
            <button className="secondary-action" onClick={abrirUltimoBackup} disabled={processando}>
              Abrir pasta do último backup
            </button>
          )}
          <label className="file-action">
            Adicionar dados de backup
            <input type="file" accept=".zip" onChange={(event) => importarBackup(event.target.files?.[0] ?? null, "mesclar")} />
          </label>
          <label className="file-action danger">
            Substituir dados pelo backup
            <input type="file" accept=".zip" onChange={(event) => {
              if (window.confirm("Esta ação substitui os dados atuais. Um backup de segurança será criado antes da restauração.")) {
                importarBackup(event.target.files?.[0] ?? null, "substituir");
              }
            }} />
          </label>
        </article>

        <article className="settings-card">
          <h2>Atualização</h2>
          <p>A verificação consulta a última versão publicada no GitHub.</p>
          <button onClick={verificarAtualizacao} disabled={processando}>Verificar atualização</button>
          <span className="settings-version">Versão atual: {appInfo?.version ? `v${appInfo.version}` : "não identificada"}</span>
          {atualizacao && (
            <button className="primary-action" onClick={instalarAtualizacao}>Atualizar e reiniciar</button>
          )}
          {atualizacao && <span className="settings-version">Disponível: {atualizacao.version}</span>}
        </article>
      </section>

      {mensagem && <div className="notice success">{mensagem}</div>}
      {erro && <div className="notice error">{erro}</div>}
    </section>
  );
}
