import { open as abrirDialogoArquivo } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  Archive,
  ArchiveRestore,
  Check,
  ExternalLink,
  FolderOpen,
  LayoutGrid,
  ListChecks,
  Maximize2,
  Minus,
  Palette,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { invokeApp, tauriDisponivel } from "../appBridge";
import {
  ALTURA_QUADRO,
  arrumarEmGrade,
  carregarQuadro,
  CORES_LINHA,
  CORES_QUADRO,
  corTipoArquivo,
  giroAleatorio,
  LARGURA_QUADRO,
  limitarAoQuadro,
  lugarLivre,
  novoId,
  quadroVazio,
  rotuloTipoArquivo,
  salvarQuadro,
  sobreposicao,
  tamanhoLegivel,
  TAMANHO_MAX,
  TAMANHO_MIN,
  type AparenciaQuadro,
  type ArquivoNoQuadro,
  type CorQuadro,
  type ItemQuadro,
  type LinhaQuadro,
  type Quadro,
} from "./dados";
import "./quadroMagnetico.css";

const CORES_PRENDEDOR = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00"];

function corDoPrendedor(id: string) {
  let soma = 0;
  for (const letra of id) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return CORES_PRENDEDOR[soma % CORES_PRENDEDOR.length];
}

function fundoDaCor(cor: CorQuadro) {
  return CORES_QUADRO.find((item) => item.cor === cor)?.fundo ?? "#fff3a3";
}

function textoDoItem(item: ItemQuadro) {
  return [item.titulo, item.texto, item.etiqueta, item.arquivo?.nome ?? "", ...(item.itens ?? []).map((i) => i.texto)].join(" ").toLowerCase();
}

type Arrasto = {
  id: string;
  ponteiro: number;
  dx: number;
  dy: number;
  ultimoX: number;
  ultimoY: number;
  ultimoT: number;
  vx: number;
  vy: number;
  moveu: boolean;
};

type Redimensao = { id: string; ponteiro: number; inicioX: number; inicioY: number; w: number; h: number };

type LinhaNova = { de: string; x: number; y: number };

type Ponto = { x: number; y: number };

export function QuadroMagnetico() {
  const [quadro, setQuadro] = useState<Quadro>(quadroVazio);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [linhaSelecionada, setLinhaSelecionada] = useState<string | null>(null);
  const [linhaNova, setLinhaNova] = useState<LinhaNova | null>(null);
  const [busca, setBusca] = useState("");
  const [verArquivados, setVerArquivados] = useState(false);
  const [verAparencia, setVerAparencia] = useState(false);
  const [arrastando, setArrastando] = useState<{ id: string; inclinacao: number } | null>(null);
  const [assentando, setAssentando] = useState<Set<string>>(new Set());
  const [chegando, setChegando] = useState<Set<string>>(new Set());
  const [saindo, setSaindo] = useState<Set<string>>(new Set());
  const [linhasNovas, setLinhasNovas] = useState<Set<string>>(new Set());
  const [confirmarArquivo, setConfirmarArquivo] = useState<ItemQuadro | null>(null);
  const [desfazer, setDesfazer] = useState<{ item: ItemQuadro; linhas: LinhaQuadro[] } | null>(null);
  const [miniaturas, setMiniaturas] = useState<Record<string, string | null>>({});
  const [arquivoSobre, setArquivoSobre] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 1000, h: 600 });

  const rolagem = useRef<HTMLDivElement>(null);
  const lona = useRef<HTMLDivElement>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const redimensao = useRef<Redimensao | null>(null);
  const quadroRef = useRef(quadro);
  quadroRef.current = quadro;
  const zoom = quadro.zoom;

  // ── carregar / salvar ───────────────────────────────────────────────────
  useEffect(() => {
    let ativo = true;
    carregarQuadro()
      .then((dados) => {
        if (ativo) setQuadro(dados);
      })
      .catch((falha) => setErro(`Não consegui abrir o quadro: ${falha instanceof Error ? falha.message : String(falha)}`))
      .finally(() => ativo && setCarregado(true));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (!carregado) return;
    const espera = window.setTimeout(() => {
      salvarQuadro(quadro).catch((falha) => setErro(`Não consegui salvar o quadro: ${falha instanceof Error ? falha.message : String(falha)}`));
    }, 400);
    return () => window.clearTimeout(espera);
  }, [quadro, carregado]);

  // Miniaturas das imagens.
  useEffect(() => {
    if (!tauriDisponivel) return;
    for (const item of quadro.itens) {
      const arquivo = item.arquivo;
      if (!arquivo || !arquivo.tipo.startsWith("image/") || arquivo.arquivoId in miniaturas) continue;
      setMiniaturas((atuais) => ({ ...atuais, [arquivo.arquivoId]: null }));
      invokeApp<string | null>("miniatura_arquivo_quadro", { arquivoId: arquivo.arquivoId })
        .then((url) => setMiniaturas((atuais) => ({ ...atuais, [arquivo.arquivoId]: url })))
        .catch(() => undefined);
    }
  }, [quadro.itens, miniaturas]);

  // ── utilidades ──────────────────────────────────────────────────────────
  const atualizarItem = useCallback((id: string, mudanca: Partial<ItemQuadro>) => {
    setQuadro((atual) => ({
      ...atual,
      itens: atual.itens.map((item) => (item.id === id ? { ...item, ...mudanca, atualizadoEm: new Date().toISOString() } : item)),
    }));
  }, []);

  const mudarAparencia = (mudanca: Partial<AparenciaQuadro>) => setQuadro((atual) => ({ ...atual, aparencia: { ...atual.aparencia, ...mudanca } }));

  const pontoNoQuadro = useCallback((clientX: number, clientY: number): Ponto => {
    const area = lona.current?.getBoundingClientRect();
    if (!area) return { x: 0, y: 0 };
    return { x: (clientX - area.left) / quadroRef.current.zoom, y: (clientY - area.top) / quadroRef.current.zoom };
  }, []);

  const centroVisivel = useCallback((): Ponto => {
    const caixa = rolagem.current;
    if (!caixa) return { x: 200, y: 200 };
    const z = quadroRef.current.zoom;
    return { x: (caixa.scrollLeft + caixa.clientWidth / 2) / z, y: (caixa.scrollTop + caixa.clientHeight / 2) / z };
  }, []);

  const maiorZ = () => quadroRef.current.itens.reduce((maior, item) => Math.max(maior, item.z), 0);

  const marcarTemporario = (setter: (atualizar: (atual: Set<string>) => Set<string>) => void, id: string, ms: number) => {
    setter((atual) => new Set(atual).add(id));
    window.setTimeout(() => {
      setter((atual) => {
        const novo = new Set(atual);
        novo.delete(id);
        return novo;
      });
    }, ms);
  };

  const atualizarViewport = useCallback(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    const z = quadroRef.current.zoom;
    setViewport({ x: caixa.scrollLeft / z, y: caixa.scrollTop / z, w: caixa.clientWidth / z, h: caixa.clientHeight / z });
  }, []);

  useEffect(() => {
    atualizarViewport();
    window.addEventListener("resize", atualizarViewport);
    return () => window.removeEventListener("resize", atualizarViewport);
  }, [atualizarViewport, zoom]);

  // ── criar itens ─────────────────────────────────────────────────────────
  function criarItem(tipo: ItemQuadro["tipo"], extra: Partial<ItemQuadro> = {}, posicao?: Ponto) {
    const agora = new Date().toISOString();
    const tamanho = tipo === "arquivo" ? { w: 220, h: 210 } : tipo === "lista" ? { w: 240, h: 220 } : { w: 210, h: 190 };
    const centro = posicao ?? centroVisivel();
    const desvio = posicao ? { x: 0, y: 0 } : { x: Math.random() * 80 - 40, y: Math.random() * 60 - 30 };
    const lugar = lugarLivre(
      { x: centro.x - tamanho.w / 2 + desvio.x, y: centro.y - tamanho.h / 2 + desvio.y, ...tamanho },
      quadroRef.current.itens.filter((outro) => !outro.arquivado),
    );
    const item: ItemQuadro = {
      id: novoId("item"),
      tipo,
      ...tamanho,
      ...lugar,
      z: maiorZ() + 1,
      giro: giroAleatorio(),
      cor: tipo === "nota" ? (["amarelo", "rosa", "azul", "verde", "laranja"] as CorQuadro[])[Math.floor(Math.random() * 5)] : "branco",
      titulo: "",
      texto: "",
      etiqueta: "",
      criadoEm: agora,
      atualizadoEm: agora,
      ...extra,
    };
    setQuadro((atual) => ({ ...atual, itens: [...atual.itens, item] }));
    marcarTemporario(setChegando, item.id, 650);
    setSelecionado(item.id);
    return item;
  }

  function novoPostIt() {
    const item = criarItem("nota");
    setEditando(item.id);
  }

  function novaLista() {
    const item = criarItem("lista", { titulo: "", itens: [{ id: novoId("li"), texto: "", feito: false }] });
    setEditando(item.id);
  }

  const adicionarArquivos = useCallback(
    async (caminhos: string[], posicao?: Ponto) => {
      setErro("");
      let deslocamento = 0;
      for (const caminho of caminhos) {
        try {
          const copia = await invokeApp<{ arquivo_id: string; nome: string; tamanho: number; tipo: string }>("adicionar_arquivo_quadro", { caminho });
          const arquivo: ArquivoNoQuadro = { arquivoId: copia.arquivo_id, nome: copia.nome, tamanho: copia.tamanho, tipo: copia.tipo };
          const base = posicao ?? centroVisivel();
          criarItem("arquivo", { arquivo, titulo: copia.nome }, { x: base.x + deslocamento, y: base.y + deslocamento });
          deslocamento += 28;
        } catch (falha) {
          setErro(falha instanceof Error ? falha.message : String(falha));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centroVisivel],
  );
  const adicionarArquivosRef = useRef(adicionarArquivos);
  adicionarArquivosRef.current = adicionarArquivos;

  async function escolherArquivos() {
    if (!tauriDisponivel) {
      setErro("Colocar arquivos no quadro só funciona no aplicativo instalado.");
      return;
    }
    try {
      const selecao = await abrirDialogoArquivo({ multiple: true });
      if (!selecao) return;
      await adicionarArquivos(Array.isArray(selecao) ? selecao : [selecao]);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    }
  }

  // Arrastar arquivos do computador direto para o quadro.
  useEffect(() => {
    if (!tauriDisponivel) return;
    let cancelado = false;
    let desinscrever: (() => void) | undefined;
    const dentro = (posicao: { x: number; y: number }) => {
      const area = rolagem.current?.getBoundingClientRect();
      if (!area) return null;
      const x = posicao.x / window.devicePixelRatio;
      const y = posicao.y / window.devicePixelRatio;
      return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom ? { x, y } : null;
    };
    getCurrentWebview()
      .onDragDropEvent((evento) => {
        const dados = evento.payload;
        if (dados.type === "leave") {
          setArquivoSobre(false);
          return;
        }
        const ponto = dentro(dados.position);
        if (dados.type === "drop") {
          setArquivoSobre(false);
          if (ponto && dados.paths.length) void adicionarArquivosRef.current(dados.paths, pontoNoQuadro(ponto.x, ponto.y));
          return;
        }
        setArquivoSobre(Boolean(ponto));
      })
      .then((fn) => {
        if (cancelado) fn();
        else desinscrever = fn;
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
      desinscrever?.();
    };
  }, [pontoNoQuadro]);

  // ── apagar / arquivar ───────────────────────────────────────────────────
  function tirarDoQuadro(item: ItemQuadro) {
    const linhas = quadroRef.current.linhas.filter((linha) => linha.de === item.id || linha.para === item.id);
    marcarTemporario(setSaindo, item.id, 420);
    window.setTimeout(() => {
      setQuadro((atual) => ({
        ...atual,
        itens: atual.itens.filter((i) => i.id !== item.id),
        linhas: atual.linhas.filter((linha) => linha.de !== item.id && linha.para !== item.id),
      }));
    }, 380);
    setSelecionado(null);
    setEditando(null);
    return linhas;
  }

  function apagar(item: ItemQuadro) {
    if (item.tipo === "arquivo") {
      setConfirmarArquivo(item);
      return;
    }
    const linhas = tirarDoQuadro(item);
    setDesfazer({ item, linhas });
  }

  async function apagarArquivoConfirmado(item: ItemQuadro) {
    setConfirmarArquivo(null);
    if (item.arquivo && tauriDisponivel) {
      try {
        await invokeApp("remover_arquivo_quadro", { arquivoId: item.arquivo.arquivoId });
      } catch (falha) {
        setErro(falha instanceof Error ? falha.message : String(falha));
        return;
      }
    }
    tirarDoQuadro(item);
  }

  useEffect(() => {
    if (!desfazer) return;
    const espera = window.setTimeout(() => setDesfazer(null), 7000);
    return () => window.clearTimeout(espera);
  }, [desfazer]);

  function desfazerApagar() {
    if (!desfazer) return;
    const { item, linhas } = desfazer;
    setQuadro((atual) => ({ ...atual, itens: [...atual.itens, { ...item, z: maiorZ() + 1 }], linhas: [...atual.linhas, ...linhas] }));
    marcarTemporario(setChegando, item.id, 650);
    setDesfazer(null);
  }

  function arquivar(item: ItemQuadro, arquivado: boolean) {
    if (arquivado) {
      marcarTemporario(setSaindo, item.id, 420);
      window.setTimeout(() => atualizarItem(item.id, { arquivado: true }), 380);
      setSelecionado(null);
      setEditando(null);
    } else {
      const centro = centroVisivel();
      atualizarItem(item.id, { arquivado: false, z: maiorZ() + 1, ...limitarAoQuadro({ ...item, x: centro.x - item.w / 2, y: centro.y - item.h / 2 }) });
      marcarTemporario(setChegando, item.id, 650);
    }
  }

  // ── arrastar com "física" ───────────────────────────────────────────────
  function empurrarVizinhos(id: string) {
    setQuadro((atual) => {
      const solto = atual.itens.find((item) => item.id === id);
      if (!solto) return atual;
      const itens = atual.itens.map((outro) => {
        if (outro.id === id || outro.arquivado || outro.fixado) return outro;
        if (sobreposicao(solto, outro) < 0.5) return outro;
        // Empurra o de baixo para longe do centro do que caiu por cima.
        const cx = outro.x + outro.w / 2 - (solto.x + solto.w / 2);
        const cy = outro.y + outro.h / 2 - (solto.y + solto.h / 2);
        const distancia = Math.hypot(cx, cy) || 1;
        const passo = Math.max(solto.w, solto.h) * 0.6;
        const destino = limitarAoQuadro({ ...outro, x: outro.x + (cx / distancia) * passo, y: outro.y + (cy / distancia) * passo });
        return { ...outro, ...destino };
      });
      return { ...atual, itens };
    });
  }

  function aoPegar(evento: ReactPointerEvent, item: ItemQuadro) {
    if (evento.button !== 0) return;
    const alvo = evento.target as HTMLElement;
    if (alvo.closest("input, textarea, button, a, select, .qm-alca, .qm-conector")) return;
    setSelecionado(item.id);
    setLinhaSelecionada(null);
    if (item.fixado || editando === item.id) return;
    const ponto = pontoNoQuadro(evento.clientX, evento.clientY);
    arrasto.current = {
      id: item.id,
      ponteiro: evento.pointerId,
      dx: ponto.x - item.x,
      dy: ponto.y - item.y,
      ultimoX: ponto.x,
      ultimoY: ponto.y,
      ultimoT: performance.now(),
      vx: 0,
      vy: 0,
      moveu: false,
    };
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    atualizarItem(item.id, { z: maiorZ() + 1 });
  }

  function aoMover(evento: ReactPointerEvent) {
    const atual = arrasto.current;
    if (atual && atual.ponteiro === evento.pointerId) {
      const ponto = pontoNoQuadro(evento.clientX, evento.clientY);
      const agora = performance.now();
      const dt = Math.max(1, agora - atual.ultimoT);
      // Velocidade suavizada (px por ms) para inclinar e deslizar ao soltar.
      atual.vx = atual.vx * 0.6 + ((ponto.x - atual.ultimoX) / dt) * 0.4;
      atual.vy = atual.vy * 0.6 + ((ponto.y - atual.ultimoY) / dt) * 0.4;
      atual.ultimoX = ponto.x;
      atual.ultimoY = ponto.y;
      atual.ultimoT = agora;
      const item = quadroRef.current.itens.find((i) => i.id === atual.id);
      if (!item) return;
      if (!atual.moveu && Math.hypot(ponto.x - atual.dx - item.x, ponto.y - atual.dy - item.y) < 3) return;
      atual.moveu = true;
      const lugar = limitarAoQuadro({ ...item, x: ponto.x - atual.dx, y: ponto.y - atual.dy });
      setQuadro((q) => ({ ...q, itens: q.itens.map((i) => (i.id === atual.id ? { ...i, ...lugar } : i)) }));
      setArrastando({ id: atual.id, inclinacao: Math.max(-9, Math.min(9, atual.vx * 6)) });
      return;
    }
    const redim = redimensao.current;
    if (redim && redim.ponteiro === evento.pointerId) {
      const z = quadroRef.current.zoom;
      const w = Math.max(TAMANHO_MIN.w, Math.min(TAMANHO_MAX.w, redim.w + (evento.clientX - redim.inicioX) / z));
      const h = Math.max(TAMANHO_MIN.h, Math.min(TAMANHO_MAX.h, redim.h + (evento.clientY - redim.inicioY) / z));
      setQuadro((q) => ({ ...q, itens: q.itens.map((i) => (i.id === redim.id ? { ...i, w: Math.round(w), h: Math.round(h) } : i)) }));
      return;
    }
    if (linhaNova) {
      const ponto = pontoNoQuadro(evento.clientX, evento.clientY);
      setLinhaNova({ ...linhaNova, ...ponto });
    }
  }

  function deslizar(id: string, vx: number, vy: number) {
    // Inércia: continua um pouco na direção em que foi jogado e para devagar.
    let velX = Math.max(-2.5, Math.min(2.5, vx));
    let velY = Math.max(-2.5, Math.min(2.5, vy));
    let anterior = performance.now();
    const passo = (agora: number) => {
      const dt = Math.min(32, agora - anterior);
      anterior = agora;
      const atrito = Math.pow(0.9, dt / 16);
      velX *= atrito;
      velY *= atrito;
      setQuadro((q) => ({
        ...q,
        itens: q.itens.map((i) => (i.id === id ? { ...i, ...limitarAoQuadro({ ...i, x: i.x + velX * dt, y: i.y + velY * dt }) } : i)),
      }));
      if (Math.hypot(velX, velY) > 0.03) requestAnimationFrame(passo);
      else assentar(id);
    };
    requestAnimationFrame(passo);
  }

  function assentar(id: string) {
    setArrastando(null);
    marcarTemporario(setAssentando, id, 450);
    empurrarVizinhos(id);
  }

  function aoSoltar(evento: ReactPointerEvent) {
    const atual = arrasto.current;
    if (atual && atual.ponteiro === evento.pointerId) {
      arrasto.current = null;
      if (!atual.moveu) {
        setArrastando(null);
        return;
      }
      if (Math.hypot(atual.vx, atual.vy) > 0.25) deslizar(atual.id, atual.vx, atual.vy);
      else assentar(atual.id);
      return;
    }
    if (redimensao.current && redimensao.current.ponteiro === evento.pointerId) {
      atualizarItem(redimensao.current.id, {});
      redimensao.current = null;
      return;
    }
    if (linhaNova) {
      const alvo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest("[data-item-id]") as HTMLElement | null;
      const para = alvo?.dataset.itemId;
      if (para && para !== linhaNova.de) {
        const existe = quadroRef.current.linhas.some((l) => (l.de === linhaNova.de && l.para === para) || (l.de === para && l.para === linhaNova.de));
        if (!existe) {
          const linha: LinhaQuadro = { id: novoId("linha"), de: linhaNova.de, para, cor: CORES_LINHA[0], rotulo: "" };
          setQuadro((q) => ({ ...q, linhas: [...q.linhas, linha] }));
          marcarTemporario(setLinhasNovas, linha.id, 700);
          setLinhaSelecionada(linha.id);
          setSelecionado(null);
        }
      }
      setLinhaNova(null);
    }
  }

  function comecarRedimensao(evento: ReactPointerEvent, item: ItemQuadro) {
    evento.stopPropagation();
    redimensao.current = { id: item.id, ponteiro: evento.pointerId, inicioX: evento.clientX, inicioY: evento.clientY, w: item.w, h: item.h };
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
  }

  function comecarLinha(evento: ReactPointerEvent, item: ItemQuadro) {
    evento.stopPropagation();
    const ponto = pontoNoQuadro(evento.clientX, evento.clientY);
    setLinhaNova({ de: item.id, ...ponto });
    (evento.currentTarget as HTMLElement).releasePointerCapture?.(evento.pointerId);
  }

  // ── zoom e organização ──────────────────────────────────────────────────
  function mudarZoom(novo: number, foco?: Ponto) {
    const caixa = rolagem.current;
    const z = Math.round(Math.max(0.4, Math.min(1.6, novo)) * 100) / 100;
    const centro = foco ?? centroVisivel();
    setQuadro((atual) => ({ ...atual, zoom: z }));
    if (caixa) {
      requestAnimationFrame(() => {
        caixa.scrollLeft = centro.x * z - caixa.clientWidth / 2;
        caixa.scrollTop = centro.y * z - caixa.clientHeight / 2;
        atualizarViewport();
      });
    }
  }

  function ajustarTudo() {
    const caixa = rolagem.current;
    const visiveis = quadro.itens.filter((item) => !item.arquivado);
    if (!caixa || !visiveis.length) return;
    const minX = Math.min(...visiveis.map((i) => i.x)) - 40;
    const minY = Math.min(...visiveis.map((i) => i.y)) - 40;
    const maxX = Math.max(...visiveis.map((i) => i.x + i.w)) + 40;
    const maxY = Math.max(...visiveis.map((i) => i.y + i.h)) + 40;
    const z = Math.min(1.2, caixa.clientWidth / (maxX - minX), caixa.clientHeight / (maxY - minY));
    mudarZoom(z, { x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }

  function arrumar() {
    const caixa = rolagem.current;
    const visiveis = quadro.itens.filter((item) => !item.arquivado);
    const posicoes = arrumarEmGrade(visiveis, (caixa?.clientWidth ?? 1200) / zoom);
    setQuadro((atual) => ({
      ...atual,
      itens: atual.itens.map((item) => {
        const lugar = posicoes.get(item.id);
        return lugar ? { ...item, ...lugar } : item;
      }),
    }));
    if (caixa) caixa.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    const aoRodar = (evento: WheelEvent) => {
      if (!evento.ctrlKey) return;
      evento.preventDefault();
      mudarZoom(quadroRef.current.zoom * (evento.deltaY < 0 ? 1.1 : 0.9), pontoNoQuadro(evento.clientX, evento.clientY));
    };
    caixa.addEventListener("wheel", aoRodar, { passive: false });
    return () => caixa.removeEventListener("wheel", aoRodar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado]);

  // Teclado: Delete apaga o selecionado, Esc solta a seleção.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const alvo = evento.target as HTMLElement;
      if (alvo.closest("input, textarea, [contenteditable]")) return;
      if (evento.key === "Escape") {
        setSelecionado(null);
        setLinhaSelecionada(null);
        setEditando(null);
      }
      if (evento.key === "Delete" || evento.key === "Backspace") {
        if (linhaSelecionada) {
          setQuadro((q) => ({ ...q, linhas: q.linhas.filter((l) => l.id !== linhaSelecionada) }));
          setLinhaSelecionada(null);
        } else if (selecionado) {
          const item = quadroRef.current.itens.find((i) => i.id === selecionado);
          if (item) apagar(item);
        }
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  // ── dados derivados ─────────────────────────────────────────────────────
  const visiveis = useMemo(() => quadro.itens.filter((item) => !item.arquivado), [quadro.itens]);
  const arquivados = useMemo(() => quadro.itens.filter((item) => item.arquivado), [quadro.itens]);
  const termo = busca.trim().toLowerCase();
  const prendedor = quadro.aparencia.prendedor;
  const fisico = prendedor !== "nenhum" || quadro.aparencia.fundo === "cortica";

  function ancora(item: ItemQuadro, rumo: Ponto): Ponto {
    // Com tachinha ou ímã, o barbante sai do prendedor; sem, da borda do
    // cartão voltada para o outro item.
    if (prendedor !== "nenhum") return { x: item.x + item.w / 2, y: item.y + 4 };
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const dx = rumo.x - cx;
    const dy = rumo.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const escala = Math.min(dx ? item.w / 2 / Math.abs(dx) : Infinity, dy ? item.h / 2 / Math.abs(dy) : Infinity);
    return { x: cx + dx * Math.min(1, escala), y: cy + dy * Math.min(1, escala) };
  }

  const centro = (item: ItemQuadro): Ponto => ({ x: item.x + item.w / 2, y: item.y + item.h / 2 });

  function caminhoBarbante(a: Ponto, b: Ponto) {
    const distancia = Math.hypot(b.x - a.x, b.y - a.y);
    const caida = Math.min(90, distancia * 0.16);
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + caida };
    return { d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`, meio: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 }, comprimento: distancia * 1.08 };
  }

  const linhasDesenhadas = quadro.linhas
    .map((linha) => {
      const de = visiveis.find((i) => i.id === linha.de);
      const para = visiveis.find((i) => i.id === linha.para);
      if (!de || !para) return null;
      return { linha, ...caminhoBarbante(ancora(de, centro(para)), ancora(para, centro(de))) };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const linhaEditada = linhasDesenhadas.find((l) => l.linha.id === linhaSelecionada);
  const camadaLinhasAcima = prendedor !== "nenhum";

  const svgLinhas = (
    <svg className={`qm-linhas ${camadaLinhasAcima ? "acima" : ""}`} width={LARGURA_QUADRO} height={ALTURA_QUADRO}>
      {linhasDesenhadas.map(({ linha, d, comprimento }) => (
        <g key={linha.id} className={linhaSelecionada === linha.id ? "selecionada" : ""}>
          <path
            d={d}
            className={`qm-barbante ${linhasNovas.has(linha.id) ? "nova" : ""}`}
            stroke={linha.cor}
            style={{ "--comprimento": comprimento } as CSSProperties}
          />
          <path
            d={d}
            className="qm-barbante-alvo"
            onPointerDown={(e) => {
              e.stopPropagation();
              setLinhaSelecionada(linha.id);
              setSelecionado(null);
            }}
          />
        </g>
      ))}
      {linhaNova &&
        (() => {
          const de = visiveis.find((i) => i.id === linhaNova.de);
          if (!de) return null;
          const { d } = caminhoBarbante(ancora(de, linhaNova), linhaNova);
          return <path d={d} className="qm-barbante rascunho" stroke={CORES_LINHA[0]} />;
        })()}
    </svg>
  );

  if (!carregado) {
    return (
      <section className="qm-tela">
        <p className="qm-carregando">Abrindo o quadro…</p>
      </section>
    );
  }

  return (
    <section className="qm-tela" onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
      <header className="topbar qm-topo">
        <div>
          <span className="eyebrow">Quadro de Gestão</span>
          <h1>Quadro magnético</h1>
          <p>Seu mural pessoal de recados, listas e arquivos importantes. Só você vê: ele não vai para o grupo, mas entra no seu backup.</p>
        </div>
        <div className="qm-ferramentas">
          <button type="button" className="primary-action" onClick={novoPostIt}>
            <StickyNote size={17} /> Post-it
          </button>
          <button type="button" className="secondary-action" onClick={novaLista}>
            <ListChecks size={17} /> Lista
          </button>
          <button type="button" className="secondary-action" onClick={() => void escolherArquivos()}>
            <Paperclip size={17} /> Arquivo
          </button>
          <label className="qm-busca">
            <Search size={15} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no quadro" />
            {busca && (
              <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="qm-menu-ancora">
            <button type="button" className="secondary-action" onClick={() => setVerAparencia((v) => !v)} aria-expanded={verAparencia}>
              <Palette size={17} /> Aparência
            </button>
            {verAparencia && (
              <div className="qm-menu" onPointerDown={(e) => e.stopPropagation()}>
                <strong>Fundo</strong>
                <div className="qm-opcoes">
                  {(
                    [
                      ["pontos", "Pontilhado"],
                      ["cortica", "Cortiça"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button key={valor} type="button" className={quadro.aparencia.fundo === valor ? "ativo" : ""} onClick={() => mudarAparencia({ fundo: valor })}>
                      <span className={`qm-amostra ${valor}`} /> {rotulo}
                    </button>
                  ))}
                </div>
                <strong>Prender os cartões com</strong>
                <div className="qm-opcoes">
                  {(
                    [
                      ["nenhum", "Nada"],
                      ["tachinha", "Tachinhas"],
                      ["ima", "Ímãs"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <button key={valor} type="button" className={prendedor === valor ? "ativo" : ""} onClick={() => mudarAparencia({ prendedor: valor })}>
                      {valor !== "nenhum" && <span className={`qm-amostra-prendedor ${valor}`} />} {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {erro && (
        <div className="notice error qm-erro">
          {erro}
          <button type="button" onClick={() => setErro("")} aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      )}

      <div
        ref={rolagem}
        className={`qm-rolagem fundo-${quadro.aparencia.fundo} ${prendedor !== "nenhum" ? "com-prendedor" : ""} ${arquivoSobre ? "arquivo-sobre" : ""}`}
        onScroll={atualizarViewport}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("qm-lona")) {
            setSelecionado(null);
            setLinhaSelecionada(null);
            setEditando(null);
            setVerAparencia(false);
          }
        }}
      >
        <div className="qm-espaco" style={{ width: LARGURA_QUADRO * zoom, height: ALTURA_QUADRO * zoom }}>
          <div ref={lona} className="qm-lona" style={{ width: LARGURA_QUADRO, height: ALTURA_QUADRO, transform: `scale(${zoom})` }}>
            {!camadaLinhasAcima && svgLinhas}
            {visiveis.map((item) => {
              const emArrasto = arrastando?.id === item.id;
              const combina = !termo || textoDoItem(item).includes(termo);
              // No visual limpo os cartões ficam retos; com cortiça ou prendedor, tortinhos como papel.
              const giroBase = fisico ? item.giro * (item.tipo === "arquivo" ? 0.5 : 1) : 0;
              const inclinacao = emArrasto ? giroBase * 0.4 + arrastando.inclinacao : giroBase;
              const classes = [
                "qm-item",
                `tipo-${item.tipo}`,
                selecionado === item.id ? "selecionado" : "",
                emArrasto ? "arrastando" : "",
                assentando.has(item.id) ? "assentando" : "",
                chegando.has(item.id) ? "chegando" : "",
                saindo.has(item.id) ? "saindo" : "",
                item.fixado ? "fixado" : "",
                termo ? (combina ? "achado" : "apagado") : "",
              ].join(" ");
              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  className={classes}
                  style={
                    {
                      transform: `translate(${item.x}px, ${item.y}px)`,
                      width: item.w,
                      height: item.h,
                      zIndex: emArrasto ? 100000 : item.z,
                      "--giro": `${inclinacao}deg`,
                      "--fundo": fundoDaCor(item.cor),
                      "--prendedor": corDoPrendedor(item.id),
                    } as CSSProperties
                  }
                  onPointerDown={(e) => aoPegar(e, item)}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest("input, textarea, button")) return;
                    if (item.tipo === "arquivo" && item.arquivo) void abrirArquivo(item.arquivo);
                    else setEditando(item.id);
                  }}
                >
                  <div className="qm-papel">
                    {prendedor !== "nenhum" && <span className={`qm-prendedor ${prendedor}`} />}
                    {item.fixado && prendedor === "nenhum" && <Pin className="qm-alfinete" size={15} />}
                    <ConteudoItem
                      item={item}
                      editando={editando === item.id}
                      miniatura={item.arquivo ? miniaturas[item.arquivo.arquivoId] : undefined}
                      onMudar={(mudanca) => atualizarItem(item.id, mudanca)}
                      onTerminar={() => setEditando(null)}
                      onAbrir={() => item.arquivo && void abrirArquivo(item.arquivo)}
                      onMostrar={() => item.arquivo && void mostrarArquivo(item.arquivo)}
                    />
                  </div>
                  {selecionado === item.id && editando !== item.id && (
                    <div className={`qm-acoes ${item.y < 56 ? "abaixo" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
                      {item.tipo !== "arquivo" && (
                        <button type="button" title="Editar" onClick={() => setEditando(item.id)}>
                          <Pencil size={14} />
                        </button>
                      )}
                      <span className="qm-cores">
                        {CORES_QUADRO.map((cor) => (
                          <button
                            key={cor.cor}
                            type="button"
                            title={cor.nome}
                            className={item.cor === cor.cor ? "ativa" : ""}
                            style={{ background: cor.fundo }}
                            onClick={() => atualizarItem(item.id, { cor: cor.cor })}
                          />
                        ))}
                      </span>
                      <button type="button" title={item.fixado ? "Soltar (deixar mover)" : "Fixar no lugar"} onClick={() => atualizarItem(item.id, { fixado: !item.fixado })}>
                        {item.fixado ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button type="button" title="Arquivar (tira do quadro sem apagar)" onClick={() => arquivar(item, true)}>
                        <Archive size={14} />
                      </button>
                      <button type="button" title="Apagar" className="perigo" onClick={() => apagar(item)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                  <span className="qm-conector" title="Arraste até outro item para ligar com uma linha" onPointerDown={(e) => comecarLinha(e, item)} />
                  <span className="qm-alca" title="Arraste para mudar o tamanho" onPointerDown={(e) => comecarRedimensao(e, item)} />
                </div>
              );
            })}
            {camadaLinhasAcima && svgLinhas}
            {linhasDesenhadas.map(
              ({ linha, meio }) =>
                linha.rotulo && (
                  <span
                    key={`rotulo-${linha.id}`}
                    className="qm-rotulo-linha"
                    style={{ left: meio.x, top: meio.y, borderColor: linha.cor, color: linha.cor }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setLinhaSelecionada(linha.id);
                    }}
                  >
                    {linha.rotulo}
                  </span>
                ),
            )}
            {linhaEditada && (
              <div className="qm-menu-linha" style={{ left: linhaEditada.meio.x, top: linhaEditada.meio.y + 18 }} onPointerDown={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={linhaEditada.linha.rotulo}
                  placeholder="Escreva na linha (opcional)"
                  onChange={(e) => {
                    const rotulo = e.target.value.slice(0, 40);
                    setQuadro((q) => ({ ...q, linhas: q.linhas.map((l) => (l.id === linhaEditada.linha.id ? { ...l, rotulo } : l)) }));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && setLinhaSelecionada(null)}
                />
                <div className="qm-cores-linha">
                  {CORES_LINHA.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      style={{ background: cor }}
                      className={linhaEditada.linha.cor === cor ? "ativa" : ""}
                      onClick={() => setQuadro((q) => ({ ...q, linhas: q.linhas.map((l) => (l.id === linhaEditada.linha.id ? { ...l, cor } : l)) }))}
                      aria-label="Cor da linha"
                    />
                  ))}
                  <button
                    type="button"
                    className="qm-apagar-linha"
                    onClick={() => {
                      setQuadro((q) => ({ ...q, linhas: q.linhas.filter((l) => l.id !== linhaEditada.linha.id) }));
                      setLinhaSelecionada(null);
                    }}
                  >
                    <Trash2 size={13} /> Tirar linha
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {!visiveis.length && (
          <div className="qm-vazio">
            <StickyNote size={30} />
            <strong>Seu quadro está vazio</strong>
            <span>Crie um post-it ou uma lista, ou arraste arquivos do computador para cá.</span>
          </div>
        )}
      </div>

      <div className="qm-rodape">
        <button type="button" className="qm-gaveta-botao" onClick={() => setVerArquivados((v) => !v)} aria-expanded={verArquivados}>
          <Archive size={15} /> Arquivados ({arquivados.length})
        </button>
        <button type="button" className="qm-gaveta-botao" onClick={arrumar} title="Organiza os cartões em fileiras">
          <LayoutGrid size={15} /> Arrumar
        </button>
        <span className="qm-dica">Dica: arraste a bolinha da direita de um cartão até outro para ligar os dois com uma linha.</span>
        <Minimapa itens={visiveis} viewport={viewport} onIr={(ponto) => {
          const caixa = rolagem.current;
          if (!caixa) return;
          caixa.scrollTo({ left: ponto.x * zoom - caixa.clientWidth / 2, top: ponto.y * zoom - caixa.clientHeight / 2, behavior: "smooth" });
        }} />
        <div className="qm-zoom">
          <button type="button" onClick={() => mudarZoom(zoom - 0.1)} aria-label="Diminuir">
            <Minus size={14} />
          </button>
          <button type="button" className="qm-zoom-valor" onClick={() => mudarZoom(1)} title="Voltar a 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => mudarZoom(zoom + 0.1)} aria-label="Aumentar">
            <Plus size={14} />
          </button>
          <button type="button" onClick={ajustarTudo} title="Mostrar tudo">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {verArquivados && (
        <aside className="qm-gaveta">
          <header>
            <strong>Arquivados</strong>
            <button type="button" onClick={() => setVerArquivados(false)} aria-label="Fechar">
              <X size={16} />
            </button>
          </header>
          {!arquivados.length && <p>Nada arquivado. Use o botão de arquivar de um cartão para guardar sem apagar.</p>}
          {arquivados.map((item) => (
            <div key={item.id} className="qm-arquivado" style={{ "--fundo": fundoDaCor(item.cor) } as CSSProperties}>
              <span className="qm-arquivado-cor" />
              <span className="qm-arquivado-texto">{item.titulo || item.texto || item.arquivo?.nome || "Sem título"}</span>
              <button type="button" title="Voltar ao quadro" onClick={() => arquivar(item, false)}>
                <ArchiveRestore size={15} />
              </button>
              <button type="button" title="Apagar" className="perigo" onClick={() => apagar(item)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </aside>
      )}

      {desfazer && (
        <div className="qm-toast">
          {desfazer.item.tipo === "lista" ? "Lista apagada." : "Post-it apagado."}
          <button type="button" onClick={desfazerApagar}>
            Desfazer
          </button>
        </div>
      )}

      {confirmarArquivo && (
        <div className="modal-backdrop" onPointerDown={() => setConfirmarArquivo(null)}>
          <div className="modal qm-confirmar" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2>Apagar o arquivo do quadro?</h2>
            <p>
              <strong>{confirmarArquivo.arquivo?.nome}</strong> também será apagado do computador: a cópia que o quadro guarda na pasta do
              programa vai embora. O arquivo original, se ainda estiver onde você pegou, não é tocado.
            </p>
            <p className="qm-confirmar-dica">Se quiser só tirar da frente, use "Arquivar".</p>
            <div className="qm-confirmar-acoes">
              <button type="button" className="secondary-action" onClick={() => setConfirmarArquivo(null)}>
                Cancelar
              </button>
              {!confirmarArquivo.arquivado && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    arquivar(confirmarArquivo, true);
                    setConfirmarArquivo(null);
                  }}
                >
                  <Archive size={15} /> Arquivar
                </button>
              )}
              <button type="button" className="primary-action perigo" onClick={() => void apagarArquivoConfirmado(confirmarArquivo)}>
                <Trash2 size={15} /> Apagar do quadro e do computador
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  async function abrirArquivo(arquivo: ArquivoNoQuadro) {
    try {
      await invokeApp("abrir_arquivo_quadro", { arquivoId: arquivo.arquivoId });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    }
  }

  async function mostrarArquivo(arquivo: ArquivoNoQuadro) {
    try {
      await invokeApp("mostrar_arquivo_quadro", { arquivoId: arquivo.arquivoId });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
    }
  }
}

function ConteudoItem({
  item,
  editando,
  miniatura,
  onMudar,
  onTerminar,
  onAbrir,
  onMostrar,
}: {
  item: ItemQuadro;
  editando: boolean;
  miniatura: string | null | undefined;
  onMudar: (mudanca: Partial<ItemQuadro>) => void;
  onTerminar: () => void;
  onAbrir: () => void;
  onMostrar: () => void;
}) {
  if (item.tipo === "arquivo" && item.arquivo) {
    const rotulo = rotuloTipoArquivo(item.arquivo.nome, item.arquivo.tipo);
    return (
      <div className="qm-arquivo">
        {miniatura ? (
          <img className="qm-miniatura" src={miniatura} alt="" draggable={false} />
        ) : (
          <div className="qm-tipo-arquivo" style={{ background: corTipoArquivo(rotulo) }}>
            {rotulo}
          </div>
        )}
        <div className="qm-arquivo-nome" title={item.arquivo.nome}>
          {item.arquivo.nome}
        </div>
        <div className="qm-arquivo-rodape">
          <span>{tamanhoLegivel(item.arquivo.tamanho)}</span>
          <button type="button" onClick={onAbrir} title="Abrir">
            <ExternalLink size={13} /> Abrir
          </button>
          <button type="button" onClick={onMostrar} title="Mostrar na pasta">
            <FolderOpen size={13} />
          </button>
        </div>
      </div>
    );
  }

  if (editando) {
    return (
      <div className="qm-edicao" onKeyDown={(e) => e.key === "Escape" && onTerminar()}>
        <input className="qm-etiqueta-campo" value={item.etiqueta} placeholder="Etiqueta (ex.: Família)" onChange={(e) => onMudar({ etiqueta: e.target.value.slice(0, 24) })} />
        <input className="qm-titulo-campo" autoFocus value={item.titulo} placeholder="Título" onChange={(e) => onMudar({ titulo: e.target.value })} />
        {item.tipo === "lista" ? (
          <div className="qm-lista-edicao">
            {(item.itens ?? []).map((linha, indice) => (
              <div key={linha.id} className="qm-lista-linha">
                <input
                  value={linha.texto}
                  placeholder={`Item ${indice + 1}`}
                  onChange={(e) => onMudar({ itens: (item.itens ?? []).map((l) => (l.id === linha.id ? { ...l, texto: e.target.value } : l)) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onMudar({ itens: [...(item.itens ?? []), { id: novoId("li"), texto: "", feito: false }] });
                  }}
                />
                <button type="button" onClick={() => onMudar({ itens: (item.itens ?? []).filter((l) => l.id !== linha.id) })} aria-label="Tirar item">
                  <X size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="qm-mais-item" onClick={() => onMudar({ itens: [...(item.itens ?? []), { id: novoId("li"), texto: "", feito: false }] })}>
              <Plus size={13} /> Item
            </button>
          </div>
        ) : (
          <textarea value={item.texto} placeholder="Escreva o recado…" onChange={(e) => onMudar({ texto: e.target.value })} />
        )}
        <button type="button" className="qm-pronto" onClick={onTerminar}>
          <Check size={14} /> Pronto
        </button>
      </div>
    );
  }

  return (
    <div className="qm-conteudo">
      {item.etiqueta && <span className="qm-etiqueta">{item.etiqueta}</span>}
      {item.titulo && <strong className="qm-titulo">{item.titulo}</strong>}
      {item.tipo === "lista" ? (
        <ul className="qm-lista">
          {(item.itens ?? [])
            .filter((linha) => linha.texto.trim())
            .map((linha) => (
              <li key={linha.id} className={linha.feito ? "feito" : ""}>
                <button
                  type="button"
                  className="qm-caixa"
                  onClick={() => onMudar({ itens: (item.itens ?? []).map((l) => (l.id === linha.id ? { ...l, feito: !l.feito } : l)) })}
                  aria-label={linha.feito ? "Desmarcar" : "Marcar como feito"}
                >
                  {linha.feito && <Check size={12} />}
                </button>
                <span>{linha.texto}</span>
              </li>
            ))}
        </ul>
      ) : (
        item.texto && <p className="qm-texto">{item.texto}</p>
      )}
      {!item.titulo && !item.texto && !(item.itens ?? []).some((l) => l.texto.trim()) && <span className="qm-placeholder">Clique duas vezes para escrever</span>}
    </div>
  );
}

function Minimapa({ itens, viewport, onIr }: { itens: ItemQuadro[]; viewport: { x: number; y: number; w: number; h: number }; onIr: (ponto: Ponto) => void }) {
  const escala = 128 / LARGURA_QUADRO;
  return (
    <div
      className="qm-minimapa"
      style={{ width: LARGURA_QUADRO * escala, height: ALTURA_QUADRO * escala }}
      onPointerDown={(e) => {
        const area = e.currentTarget.getBoundingClientRect();
        onIr({ x: (e.clientX - area.left) / escala, y: (e.clientY - area.top) / escala });
      }}
      title="Clique para ir até essa parte do quadro"
    >
      {itens.map((item) => (
        <i key={item.id} style={{ left: item.x * escala, top: item.y * escala, width: Math.max(2, item.w * escala), height: Math.max(2, item.h * escala), background: fundoDaCor(item.cor) }} />
      ))}
      <span
        className="qm-minimapa-vista"
        style={{
          left: viewport.x * escala,
          top: viewport.y * escala,
          width: Math.min(LARGURA_QUADRO, viewport.w) * escala,
          height: Math.min(ALTURA_QUADRO, viewport.h) * escala,
        }}
      />
    </div>
  );
}
