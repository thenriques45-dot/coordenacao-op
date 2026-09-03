import { ArrowUpToLine, Check, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { invokeApp } from "../appBridge";

const AJUDA_URL = "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started";

type StatusApi = {
  configurada: boolean;
  ativo: boolean;
  status: "desligado" | "ativo" | "token_invalido";
  phone_number_id: string;
  waba_id: string;
  tem_token: boolean;
  numero_formatado: string;
  limite_dia: number;
  uso_hoje: number;
};

export function ConfigEnvioAutomatico() {
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(false);
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [verToken, setVerToken] = useState(false);
  const [ocupado, setOcupado] = useState<"" | "testando" | "salvando" | "desativando">("");

  function recarregar() {
    invokeApp<StatusApi>("carregar_config_whatsapp_api")
      .then((s) => {
        setStatus(s);
        setPhoneId(s.phone_number_id);
        setWabaId(s.waba_id);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }

  useEffect(recarregar, []);

  const mostrarForm = !status || !status.configurada || editando;

  async function testar() {
    setErro("");
    setAviso("");
    if (mostrarForm && (phoneId.trim() || token.trim())) {
      await salvar(false);
    }
    setOcupado("testando");
    try {
      const numero = await invokeApp<string>("testar_conexao_whatsapp_api");
      setAviso(`Conexão OK — ${numero}`);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      recarregar();
    } finally {
      setOcupado("");
    }
  }

  async function salvar(comAviso = true) {
    setErro("");
    if (comAviso) setAviso("");
    setOcupado("salvando");
    try {
      const s = await invokeApp<StatusApi>("salvar_config_whatsapp_api", {
        input: { phone_number_id: phoneId.trim(), waba_id: wabaId.trim(), token: token.trim() || undefined },
      });
      setStatus(s);
      setToken("");
      setEditando(false);
      if (comAviso) setAviso("Envio automático ativado nesta máquina.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado("");
    }
  }

  async function desativar() {
    setOcupado("desativando");
    try {
      const s = await invokeApp<StatusApi>("desativar_whatsapp_api");
      setStatus(s);
      setAviso("Envio automático desativado.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="settings-card atd-config-api">
      <div className="atd-config-api-topo">
        <span className="atd-config-api-icone"><ArrowUpToLine size={18} aria-hidden /></span>
        <div>
          <strong>Envio automático de mensagens</strong>
          <p>
            Dispara mensagens para várias famílias sem clicar em cada aluno, usando a API oficial do WhatsApp.
            Cobra por mensagem (cerca de R$ 0,04) e vale só nesta máquina. Sem isso, o app continua enviando
            pelo seu WhatsApp normal.
          </p>
        </div>
        <span className={`atd-config-api-selo ${status?.ativo ? "ativo" : ""}`}>
          {status?.ativo ? "Ligado" : "Desligado"}
        </span>
      </div>

      {erro && <div className="notice error">{erro}</div>}
      {aviso && <div className="notice success">{aviso}</div>}

      {status?.status === "token_invalido" && !editando && (
        <div className="atd-config-api-alerta">
          <TriangleAlert size={16} aria-hidden />
          <div>
            <strong>Token inválido ou expirado</strong>
            <p>O envio automático foi desligado. A fila assistida continua funcionando.</p>
          </div>
          <button type="button" className="atd-btn-secundario" onClick={() => setEditando(true)}>Atualizar token</button>
        </div>
      )}

      {status?.status === "ativo" && !editando && (
        <div className="atd-config-api-ativo">
          <span className="atd-config-api-check"><Check size={16} aria-hidden /></span>
          <div>
            <strong>Ativo{status.numero_formatado ? ` · ${status.numero_formatado}` : ""}</strong>
            <p>Limite de {status.limite_dia} destinatários por dia · {status.uso_hoje} usados hoje</p>
          </div>
          <div className="atd-config-api-ativo-acoes">
            <button type="button" className="atd-btn-secundario" onClick={() => setEditando(true)}>Editar credenciais</button>
            <button type="button" className="atd-btn-secundario" onClick={desativar} disabled={ocupado === "desativando"}>
              Desativar
            </button>
          </div>
        </div>
      )}

      {mostrarForm && (
        <div className="atd-config-api-form">
          <label>
            <span>Phone Number ID</span>
            <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="ex.: 109876543210987" />
          </label>
          <label>
            <span>WABA ID</span>
            <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="ex.: 223344556677889" />
          </label>
          <label>
            <span>Token permanente</span>
            <div className="atd-config-api-token">
              <input
                type={verToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={status?.tem_token ? "•••••••• (deixe em branco para manter)" : "colar o token da Meta"}
              />
              <button type="button" onClick={() => setVerToken((v) => !v)} aria-label={verToken ? "Ocultar" : "Revelar"}>
                {verToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <small>Guardado apenas nesta instalação, na pasta de dados do app. Não sincroniza com o grupo.</small>
          </label>

          <div className="atd-config-api-acoes">
            <button type="button" className="atd-thread-link" onClick={() => invokeApp("abrir_url", { url: AJUDA_URL }).catch(() => {})}>
              Como obter essas credenciais
            </button>
            <div>
              <button type="button" className="atd-btn-secundario" onClick={testar} disabled={ocupado !== ""}>
                {ocupado === "testando" ? "Testando…" : "Testar conexão"}
              </button>
              <button type="button" className="atd-btn-primario" onClick={() => salvar()} disabled={ocupado !== "" || (!token.trim() && !status?.tem_token) || !phoneId.trim()}>
                {ocupado === "salvando" ? "Salvando…" : "Salvar e ativar"}
              </button>
              {editando && (
                <button type="button" className="atd-thread-link" onClick={() => { setEditando(false); recarregar(); }}>Cancelar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
