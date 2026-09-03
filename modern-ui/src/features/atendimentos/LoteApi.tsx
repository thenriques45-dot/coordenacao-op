import { Check, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invokeApp } from "../appBridge";
import type { MensagemTemplate } from "../SettingsPage";
import {
  assinaturaRastreio,
  montarSegmentosMensagem,
  telefoneParaWhatsapp,
  textoDeSegmentos,
  type VariavelMensagem,
} from "./mensagemFamilia";
import type { DisparoDestinatario as Dest, DisparoLote } from "./lote";
import type { AtendimentoAlunoInput } from "./tipos";

const TIPO_CONTATO_FAMILIA = "Contato com a família";
const PAUSA_MS = 900;

// Ordem em que as variáveis aparecem no corpo do modelo → ordem dos parâmetros
// {{1}}, {{2}}… do template aprovado na Meta.
function chavesNaOrdem(corpo: string): string[] {
  const vistas: string[] = [];
  for (const m of corpo.matchAll(/\{([a-z_]+)\}/g)) {
    if (!vistas.includes(m[1])) vistas.push(m[1]);
  }
  return vistas;
}

export function LoteApi({
  disparo: disparoInicial,
  turma,
  bimestre,
  modelo,
  metaTemplate,
  idioma,
  onSalvarAtendimento,
  onAtualizarDisparo,
  onConcluir,
}: {
  disparo: DisparoLote;
  turma: { codigo: string; caminho: string };
  bimestre: string;
  modelo: MensagemTemplate | undefined;
  metaTemplate: string;
  idioma: string;
  onSalvarAtendimento: (matricula: string, input: AtendimentoAlunoInput) => Promise<void>;
  onAtualizarDisparo: (d: DisparoLote) => Promise<void>;
  onConcluir: () => void;
}) {
  const [disparo, setDisparo] = useState<DisparoLote>(disparoInicial);
  const [pos, setPos] = useState(0);
  const [rodando, setRodando] = useState(true);
  const cancelar = useRef(false);
  const total = disparo.destinatarios.length;
  const custoCobrado = disparo.enviados.length * 0.04;

  const enviarUm = useCallback(
    async (d: Dest): Promise<{ ok: boolean; motivo?: string; codigo?: number }> => {
      if (!d.telefone) return { ok: false, motivo: "Sem telefone cadastrado" };
      let vars: VariavelMensagem[] = [];
      try {
        vars = await invokeApp<VariavelMensagem[]>("resolver_variaveis_mensagem", {
          caminho: turma.caminho,
          matricula: d.matricula,
          bimestre,
        });
      } catch {
        vars = [];
      }
      const extras: Record<string, string> = { responsavel: (d.responsavel_nome ?? "").trim() || "responsável" };
      const segmentos = montarSegmentosMensagem(modelo?.corpo ?? "", vars, extras);
      const texto = textoDeSegmentos(segmentos);
      const parametros = chavesNaOrdem(modelo?.corpo ?? "").map((chave) => {
        if (extras[chave]) return extras[chave];
        const v = vars.find((x) => x.chave === chave);
        return v?.disponivel ? v.valor : "—";
      });
      try {
        await invokeApp("enviar_mensagem_whatsapp_api", {
          input: { telefone: telefoneParaWhatsapp(d.telefone), template: metaTemplate, idioma, parametros },
        });
        const assinatura = assinaturaRastreio(d.responsavel_nome ?? "", "responsável", d.telefone);
        await onSalvarAtendimento(d.matricula, {
          data: new Date().toISOString().slice(0, 10),
          tipos: [TIPO_CONTATO_FAMILIA],
          atendido: "responsavel",
          atendido_nome: d.responsavel_nome ?? undefined,
          tags: modelo?.tags ?? [],
          descricao: `${texto}${assinatura}`,
          anexos: [],
          canal: "api",
          lote_id: disparo.id,
          modelo_id: modelo?.id,
        });
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const cod = /Erro (\d+)/.exec(msg)?.[1];
        return { ok: false, motivo: msg, codigo: cod ? Number(cod) : undefined };
      }
    },
    [turma.caminho, bimestre, modelo, metaTemplate, idioma, disparo.id, onSalvarAtendimento],
  );

  useEffect(() => {
    let ativo = true;
    (async () => {
      const enviados = new Set(disparo.enviados);
      const falhas = [...disparo.falhas];
      for (let i = disparo.posicao_atual; i < total; i++) {
        if (!ativo || cancelar.current) break;
        setPos(i);
        const d = disparo.destinatarios[i];
        if (enviados.has(d.matricula) || falhas.some((f) => f.matricula === d.matricula)) continue;
        const r = await enviarUm(d);
        if (r.ok) enviados.add(d.matricula);
        else falhas.push({ matricula: d.matricula, destinatario: d.responsavel_nome ?? undefined, motivo: r.motivo, codigo_meta: r.codigo });
        const parcial: DisparoLote = {
          ...disparo,
          enviados: [...enviados],
          falhas,
          posicao_atual: i + 1,
          situacao: "em_progresso",
          custo: enviados.size * 0.04,
        };
        setDisparo(parcial);
        try { await onAtualizarDisparo(parcial); } catch { /* rede */ }
        await new Promise((res) => setTimeout(res, PAUSA_MS));
      }
      if (!ativo) return;
      const final: DisparoLote = {
        ...disparo,
        enviados: [...enviados],
        falhas,
        posicao_atual: total,
        situacao: falhas.length > 0 ? "pendencias" : "concluida",
        custo: enviados.size * 0.04,
      };
      setDisparo(final);
      setRodando(false);
      try { await onAtualizarDisparo(final); } catch { /* rede */ }
    })();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enviados = disparo.enviados.length;
  const falhasEnvio = disparo.falhas.filter((f) => f.codigo_meta && f.codigo_meta !== 131026 && f.codigo_meta !== 131052).length;
  const semWhats = disparo.falhas.filter((f) => f.codigo_meta === 131026 || f.codigo_meta === 131052 || /WhatsApp/i.test(f.motivo ?? "")).length;
  const semTel = disparo.falhas.filter((f) => /sem telefone/i.test(f.motivo ?? "")).length;
  const restam = total - enviados - disparo.falhas.length;

  return (
    <div className="atd-lote-api">
      {rodando ? (
        <div className="atd-lote-api-progresso">
          <div className="atd-lote-api-topo">
            <div>
              <strong>Enviando pela API oficial</strong>
              <span className="atd-selo-canal api">Em progresso</span>
            </div>
            <p>Modelo aprovado <strong>{metaTemplate}</strong> · {total} destinatários · R$ {(total * 0.04).toFixed(2).replace(".", ",")} estimado</p>
          </div>
          <div className="atd-lote-api-barra"><span style={{ width: `${total ? ((enviados + disparo.falhas.length) / total) * 100 : 0}%` }} /></div>
          <div className="atd-lote-api-num">{pos + 1} de {total}</div>
          <div className="atd-lote-api-legenda">
            <span className="ok">{enviados} aceitos pela Meta</span>
            <span className="falha">{disparo.falhas.length} falhas</span>
            <span>{restam} na fila</span>
          </div>
          <p className="atd-lote-api-aviso">Cancelar interrompe os que ainda não saíram; os enviados já foram cobrados.</p>
          <button type="button" className="atd-thread-link" onClick={() => { cancelar.current = true; }}>Cancelar envio</button>
        </div>
      ) : (
        <div className="atd-lote-api-concluido">
          <div className="atd-lote-api-topo">
            <div>
              <strong>Disparo concluído</strong>
              {disparo.falhas.length > 0
                ? <span className="atd-lote-api-selo-pend"><TriangleAlert size={13} aria-hidden /> {disparo.falhas.length} pendências</span>
                : <span className="atd-selo-canal wa_me"><Check size={13} aria-hidden /> tudo enviado</span>}
            </div>
            <p>{new Date(disparo.atualizado_em || Date.now()).toLocaleString("pt-BR")} · custo cobrado R$ {custoCobrado.toFixed(2).replace(".", ",")} ({enviados} mensagens)</p>
          </div>

          <div className="atd-lote-api-cards">
            <div className="ok"><strong>{enviados}</strong><span>enviados</span></div>
            <div className="falha"><strong>{falhasEnvio}</strong><span>falhas no envio</span></div>
            <div><strong>{semWhats}</strong><span>sem WhatsApp no número</span></div>
            <div><strong>{semTel}</strong><span>sem telefone cadastrado</span></div>
          </div>

          {disparo.falhas.length > 0 && (
            <div className="atd-lote-api-falhas">
              <div className="atd-lote-api-falha-grade cab">
                <span>Aluno</span><span>Destinatário</span><span>Motivo</span><span>Ação</span>
              </div>
              {disparo.falhas.map((f) => {
                const d = disparo.destinatarios.find((x) => x.matricula === f.matricula);
                return (
                  <div key={f.matricula} className="atd-lote-api-falha-grade linha">
                    <strong>{d?.nome ?? f.matricula}</strong>
                    <span>{f.destinatario ?? "—"}{d?.telefone ? ` · ${d.telefone}` : ""}</span>
                    <span className="atd-lote-api-motivo"><TriangleAlert size={12} aria-hidden /> {f.motivo ?? "Erro no envio"}</span>
                    <span className="atd-lote-api-falha-acao">—</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="atd-lote-api-rodape">
            <button type="button" className="atd-btn-primario" onClick={onConcluir}>Voltar aos atendimentos</button>
          </div>
        </div>
      )}
    </div>
  );
}
