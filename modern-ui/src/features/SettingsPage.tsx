import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { invokeApp, tauriDisponivel } from "./appBridge";
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
