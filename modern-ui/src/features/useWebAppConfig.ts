import { useEffect, useState } from "react";
import { invokeApp } from "./appBridge";
import { carregarMembrosSincronizacao, garantirPerfilPersistido, nomesCompativeis, type WorkgroupSyncMember } from "./workgroupSync";

// Campos em comum entre ConfigPei e ConfigPlanejamento (Web App automático
// via OAuth) — ver PEI.tsx/Planejamento.tsx para os tipos completos, que têm
// campos próprios além destes (url_legado num, anos_finais/medio no outro).
type ConfigWebAppBase = {
  webapp_url: string;
  token_leitura: string;
  configurado_por_user_id: string;
  planilha_automatica_id: string;
  apps_script_projeto_id: string;
  apps_script_deployment_id: string;
};

type ProvisionamentoWebAppBase = {
  webapp_url: string;
  planilha_id: string;
  apps_script_projeto_id: string;
  apps_script_deployment_id: string;
  token_leitura: string;
};

type GerarLoteResultado<TRegistro> = {
  pasta: string;
  arquivos: number;
  pulados: number;
  erros: string[];
  registros: TRegistro[];
};

type LocaisResultado<TRegistro> = { pasta: string; registros: TRegistro[] };

type ComandosWebAppConfig = {
  carregarConfig: string;
  salvarConfig: string;
  carregarLocais: string;
  buscar: string;
  gerarLote: string;
  provisionarAutomatico: string;
  importarLinkPorConfig: string;
};

type TextosWebAppConfig = {
  // Mensagem de erro quando "carregar"/"buscar" é clicado sem nenhuma fonte
  // configurada (nem manual, nem planilha/Web App automático).
  semFonte: string;
  // Confirmação ao clicar em "Criar automaticamente"/"Atualizar turmas /
  // republicar" já havendo uma config de outro coordenador do grupo.
  confirmarSubstituirConfigDeOutro: string;
  // "Link importado! Já pode buscar os ___."
  linkImportado: string;
  // "Gerando ___..." (ex.: "documentos PEI", "planejamentos")
  gerando: string;
  // "Nenhum ___ novo." (ex.: "PEI", "planejamento")
  nenhumNovo: string;
};

type OpcoesUseWebAppConfig<TConfig extends ConfigWebAppBase, TRegistro> = {
  configPadrao: TConfig;
  comandos: ComandosWebAppConfig;
  ultimaBuscaKey: string;
  textos: TextosWebAppConfig;
  // true quando a config tem uma fonte manual configurada (url_legado no
  // PEI; algum dos links anos_finais/medio no Planejamento) — junto com
  // webapp_url/planilha_automatica_id, decide se a tela pode buscar e se o
  // modal de configuração deve abrir sozinho na primeira visita.
  temFonteManual: (config: TConfig) => boolean;
  // Efeito colateral extra, específico da tela, disparado uma vez logo após
  // a config inicial carregar (ex.: Planejamento sincroniza os textareas de
  // "componentes extras" a partir da config recém-lida). Opcional porque só
  // o Planejamento precisa disso.
  aoConfigCarregada?: (config: TConfig) => void;
};

// Estado e fluxo de configuração do Web App automático (Planejamento/PEI):
// carregar/salvar config, popular a tela a partir do índice local (ver
// pei::carregar_peis_locais/planejamento::carregar_planejamentos_locais),
// criar/republicar o Web App, importar o link de outro coordenador e gerar
// os documentos em lote. PEI.tsx e Planejamento.tsx eram ~300-400 linhas
// duplicadas ponta a ponta aqui — só o vocabulário (PEI vs Planejamento)
// mudava. O que É específico de cada tela (lista de alunos/turmas, matriz
// disciplina×bimestre, relatório de pendências) continua em cada arquivo.
export function useWebAppConfig<TConfig extends ConfigWebAppBase, TRegistro>(
  opcoes: OpcoesUseWebAppConfig<TConfig, TRegistro>
) {
  const { configPadrao, comandos, ultimaBuscaKey, textos, temFonteManual, aoConfigCarregada } = opcoes;

  const [config, setConfig] = useState<TConfig>(configPadrao);
  const [configAberta, setConfigAberta] = useState(false);
  const [abaConfig, setAbaConfig] = useState<"automatico" | "manual">("automatico");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaBusca, setUltimaBusca] = useState(() => localStorage.getItem(ultimaBuscaKey) ?? "");
  const [registros, setRegistros] = useState<TRegistro[]>([]);
  const [gerando, setGerando] = useState(false);
  const [statusGeracao, setStatusGeracao] = useState("");
  const [pastaGeral, setPastaGeral] = useState("");
  const [criandoWebApp, setCriandoWebApp] = useState(false);
  const [erroWebApp, setErroWebApp] = useState("");
  const [linkRecebido, setLinkRecebido] = useState("");
  const [importandoLink, setImportandoLink] = useState(false);
  const [statusImportarLink, setStatusImportarLink] = useState("");
  const [configuradoPorOutro, setConfiguradoPorOutro] = useState(false);
  const [membroConfigurador, setMembroConfigurador] = useState<WorkgroupSyncMember | null>(null);
  const [reivindicando, setReivindicando] = useState(false);

  useEffect(() => {
    invokeApp<TConfig>(comandos.carregarConfig)
      .then((c) => {
        const cfg = { ...configPadrao, ...c };
        setConfig(cfg);
        // Configurado por outro coordenador via sincronização de grupo (ver
        // workgroupSync.ts): nesse caso não força a modal técnica, mostra o
        // card "Fulano já configurou" em vez disso.
        const perfilLocal = garantirPerfilPersistido();
        const porOutro = Boolean(
          cfg.webapp_url && cfg.token_leitura && cfg.configurado_por_user_id
            && cfg.configurado_por_user_id !== perfilLocal.userId
        );
        setConfiguradoPorOutro(porOutro);
        setMembroConfigurador(
          porOutro ? carregarMembrosSincronizacao().find((m) => m.userId === cfg.configurado_por_user_id) ?? null : null
        );
        setConfigAberta(!porOutro && !temFonteManual(cfg) && !cfg.webapp_url.trim());
        aoConfigCarregada?.(cfg);
      })
      .catch(() => setConfigAberta(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Popula a tela a partir do que já foi gerado em disco (índice local) —
  // não depende de nenhuma busca na planilha ter dado certo, então um
  // 403/erro de rede não faz a tela voltar a mostrar "nada" para quem já
  // tem documento salvo.
  useEffect(() => {
    invokeApp<LocaisResultado<TRegistro>>(comandos.carregarLocais)
      .then((res) => {
        setPastaGeral(res.pasta);
        setRegistros(res.registros);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function salvarConfig(): Promise<void> {
    return invokeApp(comandos.salvarConfig, { config }).then(() => {});
  }

  // Reatribui a config já existente pro perfil local atual, sem tocar em
  // nada no Google (planilha/Web App continuam os mesmos) — resolve o caso
  // de reinstalação/formatação de PC, onde o `userId` (UUID local, ver
  // workgroupSync.ts) muda mesmo sendo a mesma pessoa/nome de exibição.
  // Diferente de `criarWebAppAutomatico`, que reprovisiona de verdade.
  function reivindicar(): Promise<void> {
    setReivindicando(true);
    setErro("");
    const perfilLocal = garantirPerfilPersistido();
    const novaConfig = { ...config, configurado_por_user_id: perfilLocal.userId };
    setConfig(novaConfig);
    return invokeApp(comandos.salvarConfig, { config: novaConfig })
      .then(() => {
        setConfiguradoPorOutro(false);
        setMembroConfigurador(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setReivindicando(false));
  }

  // `forcar` (só o PEI usa): reescreve todo documento ignorando o índice —
  // para aplicar mudanças de layout a documentos já gerados cujo registro
  // não mudou. Omitido do payload quando falso, para não alterar o contrato
  // do comando de Planejamento.
  function gerarLote(recs: TRegistro[], forcar = false) {
    if (recs.length === 0) return;
    setGerando(true);
    setStatusGeracao(`Gerando ${textos.gerando}...`);
    invokeApp<GerarLoteResultado<TRegistro>>(comandos.gerarLote, forcar ? { registros: recs, forcar: true } : { registros: recs })
      .then((res) => {
        setPastaGeral(res.pasta);
        // Fonte de verdade da tela vira o índice mesclado (local + esta
        // leva) devolvido pelo backend — nunca o `recs` cru da planilha,
        // que pode vir parcial numa busca com erro.
        setRegistros(res.registros);
        const partes: string[] = [];
        if (res.arquivos > 0) partes.push(`${res.arquivos} gerado(s)`);
        if (res.pulados > 0) partes.push(`${res.pulados} sem mudança`);
        if (res.erros.length > 0) partes.push(`${res.erros.length} erro(s)`);
        setStatusGeracao(partes.length > 0 ? `${partes.join(", ")}.` : `${textos.nenhumNovo}`);
      })
      .catch((err) => setStatusGeracao(`Erro ao gerar: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setGerando(false));
  }

  function carregar() {
    if (!temFonteManual(config) && !config.planilha_automatica_id.trim() && !config.webapp_url.trim()) {
      setErro(textos.semFonte);
      return;
    }
    setCarregando(true);
    setErro("");
    salvarConfig().catch(() => {})
      .then(() => invokeApp<TRegistro[]>(comandos.buscar, { config }))
      .then((dados) => {
        const agora = new Date().toLocaleString("pt-BR");
        setUltimaBusca(agora);
        localStorage.setItem(ultimaBuscaKey, agora);
        setConfigAberta(false);
        // Não faz setRegistros(dados) direto: a tela só reflete o que
        // realmente foi (ou já estava) gerado em disco — gerarLote mescla
        // isto com o índice local e é quem atualiza `registros` de fato.
        gerarLote(dados);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : String(err)))
      .finally(() => setCarregando(false));
  }

  async function criarWebAppAutomatico() {
    const perfilLocal = garantirPerfilPersistido();
    if (
      config.configurado_por_user_id
      && config.configurado_por_user_id !== perfilLocal.userId
      && !window.confirm(textos.confirmarSubstituirConfigDeOutro)
    ) {
      return;
    }
    setCriandoWebApp(true);
    setErroWebApp("");
    try {
      const resultado = await invokeApp<ProvisionamentoWebAppBase>(comandos.provisionarAutomatico, { config });
      const novaConfig: TConfig = {
        ...config,
        planilha_automatica_id: resultado.planilha_id,
        webapp_url: resultado.webapp_url,
        apps_script_projeto_id: resultado.apps_script_projeto_id,
        apps_script_deployment_id: resultado.apps_script_deployment_id,
        token_leitura: resultado.token_leitura,
        configurado_por_user_id: perfilLocal.userId,
      };
      setConfig(novaConfig);
      setConfiguradoPorOutro(false);
      setMembroConfigurador(null);
      await invokeApp(comandos.salvarConfig, { config: novaConfig }).catch(() => {});
    } catch (err) {
      setErroWebApp(err instanceof Error ? err.message : String(err));
    } finally {
      setCriandoWebApp(false);
    }
  }

  // Colado de outro coordenador (que já configurou o Web App): evita repetir
  // a criação/OAuth só para ler os mesmos dados.
  function importarLinkRecebido() {
    const link = linkRecebido.trim();
    if (!link) return;
    setImportandoLink(true);
    setStatusImportarLink("");
    invokeApp<TConfig>(comandos.importarLinkPorConfig, { link })
      .then((novaConfig) => {
        setConfig({ ...configPadrao, ...novaConfig });
        setLinkRecebido("");
        setStatusImportarLink(textos.linkImportado);
      })
      .catch((err) => setStatusImportarLink(err instanceof Error ? err.message : String(err)))
      .finally(() => setImportandoLink(false));
  }

  return {
    config,
    setConfig,
    configAberta,
    setConfigAberta,
    abaConfig,
    setAbaConfig,
    carregando,
    erro,
    setErro,
    ultimaBusca,
    registros,
    gerando,
    statusGeracao,
    pastaGeral,
    criandoWebApp,
    erroWebApp,
    linkRecebido,
    setLinkRecebido,
    importandoLink,
    statusImportarLink,
    configuradoPorOutro,
    membroConfigurador,
    // Só oferece "essa configuração é minha" quando o nome de exibição de
    // quem configurou bate (por inteiro ou por prefixo) com o do perfil
    // local atual — evita que alguém reivindique a configuração de outra
    // pessoa por engano.
    podeReivindicar:
      configuradoPorOutro
      && !!membroConfigurador?.displayName?.trim()
      && nomesCompativeis(membroConfigurador.displayName, garantirPerfilPersistido().displayName),
    reivindicando,
    reivindicar,
    salvarConfig,
    carregar,
    gerarLote,
    criarWebAppAutomatico,
    importarLinkRecebido,
  };
}
