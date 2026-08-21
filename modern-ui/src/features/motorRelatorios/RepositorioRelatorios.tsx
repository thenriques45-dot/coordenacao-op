// Tela "Repositório de relatórios": navega os relatórios publicados no
// repositório GitHub público do projeto (oficiais + comunidade) e baixa
// pra dentro da lista local de relatórios personalizados. Só leitura —
// enviar um relatório novo pro repositório é feito fora do app (ver
// relatorios_repositorio/README.md na raiz do projeto).

import { Download, FolderGit2 } from "lucide-react";
import { useEffect, useState } from "react";
import { invokeApp } from "../appBridge";
import { FormatoSaida, ItemRepositorio } from "./tipos";

const ROTULOS_FORMATO: Record<FormatoSaida, string> = {
  docx: "Word (.docx)",
  xlsx: "Excel (.xlsx)",
  csv: "Planilha (.csv)",
  pdf: "PDF (.pdf)",
};

export function RepositorioRelatorios({ onVoltar }: { onVoltar: () => void }) {
  const [itens, setItens] = useState<ItemRepositorio[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");

  function carregar() {
    setCarregando(true);
    setErro("");
    invokeApp<ItemRepositorio[]>("listar_repositorio_relatorios")
      .then(setItens)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function baixar(item: ItemRepositorio) {
    setBaixando(item.caminho);
    setErro("");
    setMensagem("");
    try {
      await invokeApp("baixar_relatorio_repositorio", { caminho: item.caminho });
      setMensagem(`"${item.nome}" baixado — já aparece na sua lista de relatórios.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(null);
    }
  }

  const oficiais = itens?.filter((i) => i.categoria === "oficial") ?? [];
  const comunidade = itens?.filter((i) => i.categoria === "comunidade") ?? [];

  return (
    <section className="reports-page">
      <button className="back-link" onClick={onVoltar}>← Voltar para Relatórios</button>
      <header className="topbar">
        <div>
          <span className="eyebrow">Relatórios · Repositório</span>
          <h1>Repositório de relatórios</h1>
          <p>Relatórios prontos, publicados por você ou pela comunidade — baixe e use sem montar do zero.</p>
        </div>
      </header>

      {erro && <div className="notice error">{erro}</div>}
      {mensagem && <div className="notice success">{mensagem}</div>}

      {carregando && <p className="report-path">Carregando repositório...</p>}

      {!carregando && itens && itens.length === 0 && (
        <section className="panel report-generator-card">
          <p>Nenhum relatório publicado no repositório ainda.</p>
        </section>
      )}

      {!carregando && oficiais.length > 0 && (
        <>
          <h2>Oficiais</h2>
          <section className="report-menu-grid">
            {oficiais.map((item) => (
              <ItemRepositorioCard key={item.caminho} item={item} baixando={baixando === item.caminho} onBaixar={() => baixar(item)} />
            ))}
          </section>
        </>
      )}

      {!carregando && comunidade.length > 0 && (
        <>
          <h2>Comunidade</h2>
          <section className="report-menu-grid">
            {comunidade.map((item) => (
              <ItemRepositorioCard key={item.caminho} item={item} baixando={baixando === item.caminho} onBaixar={() => baixar(item)} />
            ))}
          </section>
        </>
      )}
    </section>
  );
}

function ItemRepositorioCard({
  item,
  baixando,
  onBaixar,
}: {
  item: ItemRepositorio;
  baixando: boolean;
  onBaixar: () => void;
}) {
  return (
    <div className="report-menu-card" style={{ cursor: "default", alignItems: "flex-start" }}>
      <FolderGit2 size={26} />
      <div style={{ width: "100%" }}>
        <strong>{item.nome}</strong>
        <span>{item.descricao}</span>
        <div className="report-actions" style={{ marginTop: 10 }}>
          <span className="report-path">
            {ROTULOS_FORMATO[item.formato_saida]}
            {item.autor && ` · por ${item.autor}`}
          </span>
          <button type="button" className="secondary-action" disabled={baixando} onClick={onBaixar}>
            <Download size={14} /> {baixando ? "Baixando..." : "Baixar"}
          </button>
        </div>
      </div>
    </div>
  );
}
