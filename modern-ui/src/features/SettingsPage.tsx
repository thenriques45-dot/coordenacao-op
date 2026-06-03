import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";
import {
  aplicarPadroesDoProvedor,
  carregarAiAssistantSettings,
  rotuloAiProvider,
  salvarAiAssistantSettings,
  testarAiAssistant,
  type AiProvider,
  type AiAssistantSettings,
} from "./aiAssistant";
import {
  aplicarPayloadSincronizacao,
  montarPayloadSincronizacao,
  type WorkgroupSyncPayload,
  type WorkgroupSyncProfile,
} from "./workgroupSync";

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

type SyncStateResultado = {
  caminho: string;
  atualizado_em: string;
};

type SyncInstitutionalResultado = {
  caminho: string | null;
  arquivos: number;
  atualizado_em: string;
  backup_seguranca: string | null;
};

type DiagnosticoIaLocal = {
  ollama_instalado: boolean;
  servidor_ativo: boolean;
  modelo_instalado: boolean;
  modelos: string[];
  mensagem: string;
};

type SettingsSection = "instituicao" | "perfil" | "assistente" | "backup" | "atualizacao";

const secoesConfiguracoes: Array<{ id: SettingsSection; titulo: string; descricao: string }> = [
  { id: "instituicao", titulo: "Instituição", descricao: "Direção, critérios e cabeçalho" },
  { id: "perfil", titulo: "Perfil e sincronização", descricao: "Coordenador e grupo de trabalho" },
  { id: "assistente", titulo: "Assistente Pedagógico", descricao: "IA para relatórios" },
  { id: "backup", titulo: "Backup", descricao: "Exportar e restaurar dados" },
  { id: "atualizacao", titulo: "Atualização", descricao: "Versão e update do app" },
];

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
export function Configuracoes({
  turmas,
  perfilSync,
  onPerfilSyncChange,
  onAbrirAssistenteSync,
  onDadosAlterados,
}: {
  turmas: TurmaConfiguracoes[];
  perfilSync: WorkgroupSyncProfile;
  onPerfilSyncChange: (perfil: WorkgroupSyncProfile) => void;
  onAbrirAssistenteSync: () => void;
  onDadosAlterados: () => void;
}) {
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
  const [avatarOrigem, setAvatarOrigem] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiAssistantSettings>(() => carregarAiAssistantSettings());
  const [aiStatus, setAiStatus] = useState<DiagnosticoIaLocal | null>(null);
  const [verificandoIa, setVerificandoIa] = useState(false);
  const [acaoIa, setAcaoIa] = useState<"iniciar" | "baixar" | "testar" | null>(null);
  const [mostrarIaAvancado, setMostrarIaAvancado] = useState(false);
  const [secaoConfig, setSecaoConfig] = useState<SettingsSection>("instituicao");
  const [autostartAtivo, setAutostartAtivo] = useState(false);
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
    if (tauriDisponivel) {
      autostartIsEnabled().then(setAutostartAtivo).catch(() => {});
    }
  }, []);

  useEffect(() => {
    setCiclosBackup((atuais) => {
      if (atuais.includes("todos")) return atuais;
      const validos = atuais.filter((ciclo) => ciclosExistentes.includes(ciclo));
      return validos.length ? validos : ["todos"];
    });
  }, [ciclosExistentes]);

  useEffect(() => {
    if (secaoConfig === "assistente" && tauriDisponivel && aiSettings.provider === "ollama") {
      verificarIaLocal(false);
    }
  }, [secaoConfig, aiSettings.provider]);

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

  async function alternarAutostart() {
    setErro("");
    try {
      if (autostartAtivo) {
        await autostartDisable();
      } else {
        await autostartEnable();
      }
      const ativo = await autostartIsEnabled();
      setAutostartAtivo(ativo);
      setMensagem(ativo ? "Aplicativo configurado para iniciar com o Windows." : "Início automático desativado.");
    } catch (err) {
      setErro(`Não foi possível alterar o início automático: ${String(err)}`);
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

  async function escolherPastaSincronizacao() {
    setErro("");
    try {
      const selecionado = await abrirDialogoArquivo({
        directory: true,
        multiple: false,
        title: "Escolher pasta compartilhada do grupo de trabalho",
      });
      if (typeof selecionado === "string") {
        onPerfilSyncChange({ ...perfilSync, syncFolder: selecionado });
        setMensagem("Pasta de sincronização atualizada.");
      }
    } catch (err) {
      setErro(`Não foi possível selecionar a pasta: ${String(err)}`);
    }
  }

  function atualizarPerfilSync(campo: keyof WorkgroupSyncProfile, valor: string | boolean) {
    onPerfilSyncChange({ ...perfilSync, [campo]: valor });
  }

  function atualizarAiSettings(campo: keyof AiAssistantSettings, valor: string | boolean | number) {
    setAiSettings((atual) => {
      const alteraConexao = campo === "provider" || campo === "endpoint" || campo === "model" || campo === "apiKey";
      const proximo = {
        ...atual,
        [campo]: valor,
        ...(alteraConexao ? { connectionOk: false, lastTestedAt: undefined } : {}),
      } as AiAssistantSettings;
      salvarAiAssistantSettings(proximo);
      return proximo;
    });
  }

  function trocarProvedorIa(provider: AiProvider) {
    setAiSettings((atual) => {
      const proximo = aplicarPadroesDoProvedor(atual, provider);
      salvarAiAssistantSettings(proximo);
      setAiStatus(null);
      return proximo;
    });
  }

  function abrirLinkExterno(url: string) {
    if (tauriDisponivel) {
      invokeApp("abrir_url", { url }).catch((err) => setErro(String(err)));
      return;
    }
    window.open(url, "_blank");
  }

  async function testarConexaoIa() {
    setAcaoIa("testar");
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      const resposta = await testarAiAssistant(aiSettings);
      const validado = { ...aiSettings, connectionOk: true, lastTestedAt: new Date().toISOString() };
      setAiSettings(validado);
      salvarAiAssistantSettings(validado);
      setMensagem(`Assistente Pedagógico conectado: ${resposta}`);
      if (aiSettings.provider === "ollama") await verificarIaLocal(false);
    } catch (err) {
      const invalidado = { ...aiSettings, connectionOk: false, lastTestedAt: undefined };
      setAiSettings(invalidado);
      salvarAiAssistantSettings(invalidado);
      setErro(String(err));
    } finally {
      setAcaoIa(null);
      setProcessando(false);
    }
  }

  async function verificarIaLocal(mostrarMensagem = true) {
    setVerificandoIa(true);
    if (mostrarMensagem) {
      setMensagem("");
      setErro("");
    }
    try {
      const status = await invokeApp<DiagnosticoIaLocal>("diagnosticar_ia_local", { modelo: aiSettings.model });
      setAiStatus(status);
      if (mostrarMensagem) {
        setMensagem(status.mensagem);
      }
    } catch (err) {
      setErro(String(err));
    } finally {
      setVerificandoIa(false);
    }
  }

  async function iniciarIaLocal() {
    setAcaoIa("iniciar");
    setMensagem("");
    setErro("");
    try {
      await invokeApp<DiagnosticoIaLocal>("iniciar_ollama_local");
      await verificarIaLocal(false);
      setMensagem("Ollama iniciado. Verifique se o modelo recomendado está disponível.");
    } catch (err) {
      setErro(String(err));
    } finally {
      setAcaoIa(null);
    }
  }

  async function baixarModeloIaLocal() {
    setAcaoIa("baixar");
    setMensagem("Baixando modelo local. Isso pode demorar e depende da rede.");
    setErro("");
    try {
      const status = await invokeApp<DiagnosticoIaLocal>("baixar_modelo_ia_local", {
        input: { modelo: aiSettings.model },
      });
      setAiStatus(status);
      setMensagem(status.mensagem);
    } catch (err) {
      setErro(`Não foi possível baixar o modelo. ${String(err)}`);
    } finally {
      setAcaoIa(null);
    }
  }

  function escolherFotoPerfil(arquivo: File | null) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErro("Selecione uma imagem para a foto do perfil.");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => setAvatarOrigem(String(leitor.result ?? ""));
    leitor.onerror = () => setErro("Não foi possível carregar a imagem selecionada.");
    leitor.readAsDataURL(arquivo);
  }

  async function publicarEstadoGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de publicar.");
      }
      const payload = montarPayloadSincronizacao(perfilSync);
      const resultado = await invokeApp<SyncStateResultado>("publicar_estado_sincronizacao", {
        input: {
          pasta: perfilSync.syncFolder,
          device_id: perfilSync.userId,
          payload,
        },
      });
      onPerfilSyncChange({ ...perfilSync, syncEnabled: true, onboarding: "enabled", lastPublishedAt: resultado.atualizado_em });
      setMensagem(`Estado do Quadro de Gestão publicado em: ${resultado.caminho}`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function atualizarDoGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de atualizar.");
      }
      const payload = await invokeApp<WorkgroupSyncPayload | null>("carregar_estado_sincronizacao", { pasta: perfilSync.syncFolder });
      if (!payload) {
        setMensagem("Ainda não há estado publicado nesta pasta de sincronização.");
        return;
      }
      const resumo = aplicarPayloadSincronizacao(payload);
      onPerfilSyncChange({ ...perfilSync, syncEnabled: true, onboarding: "enabled", lastPulledAt: new Date().toISOString() });
      setMensagem(`Dados do grupo aplicados: ${resumo.tarefas} tarefas e ${resumo.eventos} eventos. Origem: ${resumo.origem}.`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function publicarDadosInstitucionaisGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de publicar.");
      }
      const resultado = await invokeApp<SyncInstitutionalResultado>("publicar_dados_institucionais_sincronizacao", {
        input: {
          pasta: perfilSync.syncFolder,
          device_id: perfilSync.userId,
        },
      });
      onPerfilSyncChange({
        ...perfilSync,
        syncEnabled: true,
        onboarding: "enabled",
        lastInstitutionalPublishedAt: resultado.atualizado_em,
      });
      setMensagem(`Turmas, alunos e status publicados: ${resultado.arquivos} arquivo(s).`);
    } catch (err) {
      setErro(String(err));
    } finally {
      setProcessando(false);
    }
  }

  async function atualizarDadosInstitucionaisGrupo() {
    setProcessando(true);
    setMensagem("");
    setErro("");
    try {
      if (!perfilSync.syncFolder) {
        throw new Error("Escolha a pasta compartilhada antes de atualizar.");
      }
      const resultado = await invokeApp<SyncInstitutionalResultado>("carregar_dados_institucionais_sincronizacao", { pasta: perfilSync.syncFolder });
      if (!resultado.caminho) {
        setMensagem("Ainda não há turmas e alunos publicados nesta pasta de sincronização.");
        return;
      }
      onDadosAlterados();
      onPerfilSyncChange({
        ...perfilSync,
        syncEnabled: true,
        onboarding: "enabled",
        lastInstitutionalPulledAt: resultado.atualizado_em || new Date().toISOString(),
      });
      setMensagem(`Turmas, alunos e status atualizados: ${resultado.arquivos} arquivo(s). Backup local: ${resultado.backup_seguranca ?? "não informado"}.`);
    } catch (err) {
      setErro(String(err));
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

      <section className="panel settings-layout">
        <nav className="settings-nav" aria-label="Seções de configurações">
          {secoesConfiguracoes.map((secao) => (
            <button
              key={secao.id}
              type="button"
              className={secaoConfig === secao.id ? "active" : ""}
              onClick={() => setSecaoConfig(secao.id)}
            >
              <strong>{secao.titulo}</strong>
              <span>{secao.descricao}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
        {secaoConfig === "instituicao" && (
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
        )}

        {secaoConfig === "perfil" && (
        <article className="settings-card">
          <h2>Perfil e sincronização</h2>
          <p>Identifique esta instalação antes de compartilhar dados com outros coordenadores.</p>
          <div className="profile-photo-settings">
            {perfilSync.avatarDataUrl ? (
              <img src={perfilSync.avatarDataUrl} alt="" />
            ) : (
              <span>{(perfilSync.displayName || "CP").trim().slice(0, 2).toUpperCase()}</span>
            )}
            <label className="file-action">
              Alterar foto
              <input type="file" accept="image/*" onChange={(event) => escolherFotoPerfil(event.target.files?.[0] ?? null)} />
            </label>
            {perfilSync.avatarDataUrl && (
              <button type="button" onClick={() => onPerfilSyncChange({ ...perfilSync, avatarDataUrl: undefined })}>Remover foto</button>
            )}
          </div>
          <label>
            Nome do coordenador
            <input value={perfilSync.displayName} onChange={(event) => atualizarPerfilSync("displayName", event.target.value)} placeholder="Ex.: Thiago Henrique" />
          </label>
          <label>
            Função
            <input value={perfilSync.role} onChange={(event) => atualizarPerfilSync("role", event.target.value)} />
          </label>
          <label>
            Nome deste dispositivo
            <input value={perfilSync.deviceName} onChange={(event) => atualizarPerfilSync("deviceName", event.target.value)} />
          </label>
          <label className="settings-check-row">
            <input type="checkbox" checked={perfilSync.syncEnabled} onChange={(event) => atualizarPerfilSync("syncEnabled", event.target.checked)} />
            Ativar sincronização de grupo de trabalho
          </label>
          <div className="settings-file-group">
            <span>Pasta compartilhada</span>
            <p>Use uma pasta OneDrive compartilhada exclusivamente para o CoordenacaoOP.</p>
            <button type="button" onClick={escolherPastaSincronizacao}>Escolher pasta</button>
            <span className="settings-version">{perfilSync.syncFolder || "Nenhuma pasta selecionada."}</span>
          </div>
          <div className="sync-actions-row">
            <button type="button" onClick={publicarEstadoGrupo} disabled={processando || !perfilSync.syncFolder}>Publicar estado</button>
            <button type="button" onClick={atualizarDoGrupo} disabled={processando || !perfilSync.syncFolder}>Atualizar do grupo</button>
          </div>
          <div className="settings-file-group">
            <span>Turmas, alunos e status</span>
            <p>Sincroniza os dados institucionais da pasta local, incluindo turmas, alunos, elegibilidade, liderança, notas ajustadas e demais registros de conselho.</p>
            <div className="sync-actions-row">
              <button type="button" onClick={publicarDadosInstitucionaisGrupo} disabled={processando || !perfilSync.syncFolder}>Publicar turmas e alunos</button>
              <button type="button" onClick={atualizarDadosInstitucionaisGrupo} disabled={processando || !perfilSync.syncFolder}>Atualizar turmas e alunos</button>
            </div>
          </div>
          <button type="button" className="secondary-action" onClick={onAbrirAssistenteSync}>Abrir assistente de configuração</button>
          <span className="settings-version">
            {perfilSync.syncEnabled ? "Sincronização preparada para esta instalação." : "Recurso desativado. Pode ser ativado quando o grupo estiver pronto."}
          </span>
          {perfilSync.lastPublishedAt && <span className="settings-version">Última publicação: {new Date(perfilSync.lastPublishedAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastPulledAt && <span className="settings-version">Última atualização recebida: {new Date(perfilSync.lastPulledAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastInstitutionalPublishedAt && <span className="settings-version">Última publicação de turmas: {new Date(perfilSync.lastInstitutionalPublishedAt).toLocaleString("pt-BR")}</span>}
          {perfilSync.lastInstitutionalPulledAt && <span className="settings-version">Última atualização de turmas: {new Date(perfilSync.lastInstitutionalPulledAt).toLocaleString("pt-BR")}</span>}
        </article>
        )}

        {secaoConfig === "backup" && (
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
        )}

        {secaoConfig === "assistente" && (
        <article className="settings-card">
          <h2>Assistente Pedagógico</h2>
          <p>Gera rascunhos de relatórios pedagógicos. Provedores em nuvem recebem os dados enviados para o relatório; use apenas com autorização da escola.</p>
          <label className="settings-check-row">
            <input type="checkbox" checked={aiSettings.enabled} onChange={(event) => atualizarAiSettings("enabled", event.target.checked)} />
            Ativar geração de relatórios com IA
          </label>
          <div className="ai-provider-options">
            {[
              { id: "gemini" as const, titulo: "Gemini", texto: "Grátis com limites. Requer chave do Google AI Studio." },
              { id: "manual-prompt" as const, titulo: "Prompt manual", texto: "Copia instruções para usar no Copilot, ChatGPT ou outra IA aberta pelo usuário." },
              { id: "ollama" as const, titulo: "Ollama local", texto: "Sem envio à nuvem, mas exige download de modelo e costuma ter qualidade menor." },
            ].map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                className={aiSettings.provider === opcao.id ? "selected" : ""}
                onClick={() => trocarProvedorIa(opcao.id)}
              >
                <strong>{opcao.titulo}</strong>
                <small>{opcao.texto}</small>
              </button>
            ))}
          </div>
          {aiSettings.provider === "gemini" && (
            <div className="data-warning neutral ai-privacy-warning">
              <strong>Uso em nuvem e custos</strong>
              <span>
                Gemini pode ser usado gratuitamente dentro dos limites do Google. Os dados usados para gerar o relatório são enviados ao serviço do Google quando este modo está ativo.
              </span>
            </div>
          )}
          {aiSettings.provider === "manual-prompt" && (
            <div className="data-warning neutral ai-privacy-warning">
              <strong>Modo manual</strong>
              <span>O aplicativo não acessa contas externas. Ele monta um prompt pedagógico para você copiar e colar na IA de sua preferência.</span>
            </div>
          )}
          {aiSettings.provider === "gemini" && (
            <div className="ai-advanced-grid">
              <label>
                Chave de API
                <input
                  type="password"
                  value={aiSettings.apiKey}
                  onChange={(event) => atualizarAiSettings("apiKey", event.target.value)}
                  placeholder="Chave do Google AI Studio"
                />
              </label>
              <label>
                Modelo
                <input value={aiSettings.model} onChange={(event) => atualizarAiSettings("model", event.target.value)} />
              </label>
              <button type="button" onClick={() => abrirLinkExterno("https://aistudio.google.com/app/apikey")}>
                Gerar chave no Google AI Studio
              </button>
              <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null || !aiSettings.apiKey.trim()}>
                {acaoIa === "testar" ? "Testando..." : "Testar conexão"}
              </button>
              <span className={`ai-status-pill ${aiSettings.connectionOk ? "ready" : "blocked"}`}>
                {aiSettings.connectionOk ? `Pronto: ${rotuloAiProvider(aiSettings.provider)}` : "Aguardando teste"}
              </span>
            </div>
          )}
          {aiSettings.lastTestedAt && (
            <span className="settings-version">
              Último teste bem-sucedido: {new Date(aiSettings.lastTestedAt).toLocaleString("pt-BR")}
            </span>
          )}
          {aiSettings.provider === "ollama" && (
          <div className="ai-setup-panel">
            <div className="ai-setup-heading">
              <strong>Status da IA local</strong>
              <span className={`ai-status-pill ${aiStatus?.modelo_instalado ? "ready" : aiStatus?.servidor_ativo ? "warning" : "blocked"}`}>
                {verificandoIa
                  ? "Verificando..."
                  : aiStatus?.modelo_instalado
                    ? "Pronto"
                    : aiStatus?.servidor_ativo
                      ? "Falta modelo"
                      : aiStatus?.ollama_instalado
                        ? "Ollama desligado"
                        : "Não configurado"}
              </span>
            </div>
            <p>{aiStatus?.mensagem ?? "Clique em verificar para diagnosticar a IA local neste computador."}</p>
            <div className="ai-setup-steps">
              <span className={aiStatus?.ollama_instalado ? "done" : ""}>1. Ollama instalado</span>
              <span className={aiStatus?.servidor_ativo ? "done" : ""}>2. Servidor local ativo</span>
              <span className={aiStatus?.modelo_instalado ? "done" : ""}>3. Modelo recomendado baixado</span>
            </div>
            <div className="sync-actions-row">
              <button type="button" onClick={() => verificarIaLocal()} disabled={verificandoIa || acaoIa !== null}>
                {verificandoIa ? "Verificando..." : "Verificar IA local"}
              </button>
              {!aiStatus?.ollama_instalado ? (
                <button type="button" onClick={() => abrirLinkExterno("https://ollama.com/download")}>
                  Instalar Ollama
                </button>
              ) : !aiStatus?.servidor_ativo ? (
                <button type="button" onClick={iniciarIaLocal} disabled={acaoIa !== null}>
                  {acaoIa === "iniciar" ? "Iniciando..." : "Iniciar Ollama"}
                </button>
              ) : !aiStatus?.modelo_instalado ? (
                <button type="button" onClick={baixarModeloIaLocal} disabled={acaoIa !== null}>
                  {acaoIa === "baixar" ? "Baixando..." : "Baixar modelo"}
                </button>
              ) : (
                <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null}>
                  {acaoIa === "testar" ? "Testando..." : "Testar assistente"}
                </button>
              )}
            </div>
            {aiStatus?.modelos.length ? (
              <span className="settings-version">Modelos disponíveis: {aiStatus.modelos.join(", ")}</span>
            ) : (
              <span className="settings-version">Modelo recomendado: {aiSettings.model}</span>
            )}
          </div>
          )}
          <button type="button" className="secondary-action" onClick={() => setMostrarIaAvancado((atual) => !atual)}>
            {mostrarIaAvancado ? "Ocultar opções avançadas" : "Mostrar opções avançadas"}
          </button>
          {mostrarIaAvancado && (
            <div className="ai-advanced-grid">
              <label>
                Provedor
                <select value={aiSettings.provider} onChange={(event) => trocarProvedorIa(event.target.value as AiProvider)}>
                  <option value="gemini">Gemini</option>
                  <option value="manual-prompt">Prompt manual</option>
                  <option value="ollama">Ollama local</option>
                </select>
              </label>
              <label>
                Endereço
                <input value={aiSettings.endpoint} onChange={(event) => atualizarAiSettings("endpoint", event.target.value)} placeholder="https://generativelanguage.googleapis.com" />
              </label>
              <label>
                Modelo
                <input value={aiSettings.model} onChange={(event) => atualizarAiSettings("model", event.target.value)} placeholder="gemini-2.5-flash" />
              </label>
              <label>
                Chave de API
                <input type="password" value={aiSettings.apiKey} onChange={(event) => atualizarAiSettings("apiKey", event.target.value)} placeholder="Opcional para IA local" />
              </label>
              <label>
                Criatividade
                <input type="range" min="0" max="1" step="0.05" value={aiSettings.temperature} onChange={(event) => atualizarAiSettings("temperature", Number(event.target.value))} />
              </label>
              <span className="settings-version">Valor atual: {aiSettings.temperature.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <button type="button" onClick={testarConexaoIa} disabled={processando || acaoIa !== null}>Testar conexão manual</button>
            </div>
          )}
        </article>
        )}

        {secaoConfig === "atualizacao" && (
        <article className="settings-card">
          <h2>Atualização</h2>
          <p>A verificação consulta a última versão publicada no GitHub.</p>
          <button onClick={verificarAtualizacao} disabled={processando}>Verificar atualização</button>
          <span className="settings-version">Versão atual: {appInfo?.version ? `v${appInfo.version}` : "não identificada"}</span>
          {atualizacao && (
            <button className="primary-action" onClick={instalarAtualizacao}>Atualizar e reiniciar</button>
          )}
          {atualizacao && <span className="settings-version">Disponível: {atualizacao.version}</span>}
          <p style={{ marginTop: "1rem" }}>Inicialização e bandeja do sistema.</p>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autostartAtivo}
              onChange={alternarAutostart}
              disabled={!tauriDisponivel}
            />
            Iniciar com o Windows e minimizar para a bandeja ao fechar
          </label>
          <span className="settings-version">Quando ativo, fechar a janela mantém o aplicativo na bandeja para continuar enviando notificações.</span>
        </article>
        )}
        </div>
      </section>

      {mensagem && <div className="notice success">{mensagem}</div>}
      {erro && <div className="notice error">{erro}</div>}
      {avatarOrigem && (
        <AvatarCropper
          imagem={avatarOrigem}
          onCancelar={() => setAvatarOrigem(null)}
          onSalvar={(avatarDataUrl) => {
            onPerfilSyncChange({ ...perfilSync, avatarDataUrl });
            setAvatarOrigem(null);
            setMensagem("Foto do perfil atualizada.");
          }}
        />
      )}
    </section>
  );
}

function AvatarCropper({
  imagem,
  onSalvar,
  onCancelar,
}: {
  imagem: string;
  onSalvar: (avatarDataUrl: string) => void;
  onCancelar: () => void;
}) {
  const imagemRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.15);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  function recortar() {
    const img = imagemRef.current;
    if (!img) return;
    const tamanho = 256;
    const canvas = document.createElement("canvas");
    canvas.width = tamanho;
    canvas.height = tamanho;
    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    contexto.clearRect(0, 0, tamanho, tamanho);
    contexto.save();
    contexto.beginPath();
    contexto.arc(tamanho / 2, tamanho / 2, tamanho / 2, 0, Math.PI * 2);
    contexto.clip();

    const base = Math.max(tamanho / img.naturalWidth, tamanho / img.naturalHeight) * zoom;
    const largura = img.naturalWidth * base;
    const altura = img.naturalHeight * base;
    const x = (tamanho - largura) / 2 + offsetX;
    const y = (tamanho - altura) / 2 + offsetY;
    contexto.drawImage(img, x, y, largura, altura);
    contexto.restore();
    onSalvar(canvas.toDataURL("image/png"));
  }

  const transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${zoom})`;

  return (
    <div className="modal-backdrop">
      <section className="avatar-cropper-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-cropper-title">
        <h2 id="avatar-cropper-title">Ajustar foto do perfil</h2>
        <div className="avatar-cropper-preview">
          <img ref={imagemRef} src={imagem} alt="" style={{ transform }} />
        </div>
        <div className="avatar-cropper-controls">
          <label>
            Zoom
            <input type="range" min="1" max="2.6" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <label>
            Horizontal
            <input type="range" min="-90" max="90" step="1" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
          </label>
          <label>
            Vertical
            <input type="range" min="-90" max="90" step="1" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="primary-action" onClick={recortar}>Salvar foto</button>
        </div>
      </section>
    </div>
  );
}
