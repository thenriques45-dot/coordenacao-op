import { ImagePlus, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { invokeApp } from "./appBridge";

type FotoDados = { data_url: string; posicao: string };

const FILTROS_FOTO = [
  {
    name: "Imagens",
    extensions: ["jpg", "jpeg", "jpe", "jfif", "png", "webp", "gif", "bmp", "dib", "cr2", "nef", "arw", "heic", "heif"],
  },
];

function lerXY(posicao: string): [number, number] {
  const [px, py] = posicao.split(/\s+/);
  const x = parseInt(px, 10);
  const y = parseInt(py, 10);
  return [Number.isFinite(x) ? x : 50, Number.isFinite(y) ? y : 50];
}

// Abre o seletor de arquivo e grava a foto do aluno. Retorna true se gravou.
async function escolherEArquivarFoto(matricula: string): Promise<boolean> {
  const caminho = await abrirDialogoArquivo({ multiple: false, filters: FILTROS_FOTO });
  if (!caminho || typeof caminho !== "string") return false;
  await invokeApp("definir_foto_aluno", { input: { matricula, caminho } });
  return true;
}

export function FotoAluno({
  matricula,
  tamanho = 96,
  editavel = true,
}: {
  matricula?: string | null;
  tamanho?: number;
  editavel?: boolean;
}) {
  const [foto, setFoto] = useState<FotoDados | null>(null);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(() => {
    if (!matricula) {
      setFoto(null);
      return Promise.resolve();
    }
    return invokeApp<FotoDados | null>("carregar_foto_aluno", { matricula })
      .then((f) => setFoto(f))
      .catch(() => setFoto(null));
  }, [matricula]);

  useEffect(() => {
    let vivo = true;
    if (!matricula) {
      setFoto(null);
      return;
    }
    invokeApp<FotoDados | null>("carregar_foto_aluno", { matricula })
      .then((f) => { if (vivo) setFoto(f); })
      .catch(() => { if (vivo) setFoto(null); });
    return () => { vivo = false; };
  }, [matricula]);

  if (!matricula) return null;
  const lado = `${tamanho}px`;

  async function adicionarFoto() {
    if (!matricula || ocupado) return;
    setOcupado(true);
    try {
      if (await escolherEArquivarFoto(matricula)) await recarregar();
    } catch (e) {
      alert(`Não foi possível usar essa imagem: ${e}`);
    } finally {
      setOcupado(false);
    }
  }

  if (!foto) {
    if (!editavel) {
      return (
        <div className="foto-aluno foto-aluno-vazia" style={{ width: lado, height: lado }} aria-hidden>
          <UserRound size={Math.round(tamanho * 0.5)} />
        </div>
      );
    }
    return (
      <button
        type="button"
        className="foto-aluno foto-aluno-vazia foto-aluno-add"
        style={{ width: lado, height: lado }}
        onClick={adicionarFoto}
        disabled={ocupado}
        title="Clique para escolher uma foto no computador"
      >
        <ImagePlus size={Math.round(tamanho * 0.42)} />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="foto-aluno"
        style={{ width: lado, height: lado, cursor: editavel ? "pointer" : "default" }}
        onClick={() => editavel && setEditando(true)}
        title={editavel ? "Clique para ajustar ou trocar a foto" : undefined}
      >
        <img src={foto.data_url} alt="" style={{ objectPosition: foto.posicao }} />
      </button>
      {editando && (
        <PosicionadorFoto
          matricula={matricula}
          foto={foto}
          onClose={() => setEditando(false)}
          onSalvo={(pos) => { setFoto({ ...foto, posicao: pos }); setEditando(false); }}
          onRemovido={() => { setFoto(null); setEditando(false); }}
          onTrocado={async () => { await recarregar(); setEditando(false); }}
        />
      )}
    </>
  );
}

function PosicionadorFoto({
  matricula,
  foto,
  onClose,
  onSalvo,
  onRemovido,
  onTrocado,
}: {
  matricula: string;
  foto: FotoDados;
  onClose: () => void;
  onSalvo: (pos: string) => void;
  onRemovido: () => void;
  onTrocado: () => void;
}) {
  const [[x0, y0]] = useState(() => lerXY(foto.posicao));
  const [x, setX] = useState(x0);
  const [y, setY] = useState(y0);
  const [ocupado, setOcupado] = useState(false);
  const pos = `${x}% ${y}%`;

  function salvar() {
    invokeApp("salvar_posicao_foto", { matricula, posicao: pos })
      .then(() => onSalvo(pos))
      .catch(() => onSalvo(pos));
  }
  function remover() {
    invokeApp("remover_foto_aluno", { matricula }).then(onRemovido).catch(onRemovido);
  }
  async function trocar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (await escolherEArquivarFoto(matricula)) onTrocado();
    } catch (e) {
      alert(`Não foi possível usar essa imagem: ${e}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="whats-new-modal" role="dialog" aria-modal="true" style={{ maxWidth: "380px", width: "90vw", textAlign: "center" }}>
        <h2 style={{ marginTop: 0 }}>Reposicionar foto</h2>
        <div className="foto-aluno" style={{ width: "220px", height: "220px", margin: "0.5rem auto 1rem" }}>
          <img src={foto.data_url} alt="" style={{ objectPosition: pos }} />
        </div>
        <label style={{ display: "block", textAlign: "left", fontSize: "0.82rem", marginBottom: "0.6rem" }}>
          Horizontal
          <input type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label style={{ display: "block", textAlign: "left", fontSize: "0.82rem" }}>
          Vertical
          <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <div className="modal-actions" style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end", alignItems: "center" }}>
          <button type="button" className="danger-action" style={{ marginRight: "auto" }} onClick={remover}>Remover</button>
          <button type="button" onClick={trocar} disabled={ocupado}>Trocar foto</button>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" className="primary-action" onClick={salvar}>Salvar</button>
        </div>
      </section>
    </div>
  );
}
