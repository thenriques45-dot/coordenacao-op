import { nomesCompativeis } from "./workgroupSync";
import type { EquipeGestora, GeneroEquipe, MembroEquipe } from "./SettingsPage";

// A equipe gestora é a fonte da verdade para nome + gênero das pessoas que
// assinam documentos e aparecem no grupo de trabalho. Este módulo resolve um
// nome (curto ou completo) para a pessoa certa e monta as formas flexionadas.

export type FuncaoEquipe = "direcao" | "vice" | "coordenacao";

export type PessoaEquipe = MembroEquipe & { funcao: FuncaoEquipe };

const ROTULO_FUNCAO: Record<FuncaoEquipe, { F: string; M: string; N: string }> = {
  direcao: { F: "Diretora", M: "Diretor", N: "Direção" },
  vice: { F: "Vice-diretora", M: "Vice-diretor", N: "Vice-direção" },
  coordenacao: { F: "Coordenadora", M: "Coordenador", N: "Coordenação" },
};

export function chaveNome(valor: string): string {
  return valor.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

// Direção + vices + coordenações num array só, ignorando entradas sem nome.
export function listarEquipe(equipe: EquipeGestora | undefined | null): PessoaEquipe[] {
  if (!equipe) return [];
  const pessoas: PessoaEquipe[] = [];
  if (equipe.direcao?.nome?.trim()) pessoas.push({ ...equipe.direcao, funcao: "direcao" });
  for (const v of equipe.vices ?? []) if (v.nome?.trim()) pessoas.push({ ...v, funcao: "vice" });
  for (const c of equipe.coordenacoes ?? []) if (c.nome?.trim()) pessoas.push({ ...c, funcao: "coordenacao" });
  return pessoas;
}

export type ResolucaoPessoa = { pessoa: PessoaEquipe; origem: "vinculo" | "automatico" };

// Resolve um nome (como a pessoa aparece no grupo, ex.: "Wilton") para a
// entrada da equipe. Prioridade: vínculo manual → nome compatível por prefixo.
// Vínculo com membro_id "" ("não vincular") corta a resolução automática.
export function resolverPessoa(
  nome: string,
  equipe: EquipeGestora | undefined | null,
): ResolucaoPessoa | null {
  if (!nome?.trim() || !equipe) return null;
  const pessoas = listarEquipe(equipe);
  const chave = chaveNome(nome);

  const vinculo = (equipe.vinculos ?? []).find((v) => chaveNome(v.nome_curto) === chave);
  if (vinculo) {
    if (!vinculo.membro_id) return null; // "não vincular"
    const alvo = pessoas.find((p) => p.id === vinculo.membro_id);
    return alvo ? { pessoa: alvo, origem: "vinculo" } : null;
  }

  const auto = pessoas.find((p) => nomesCompativeis(nome, p.nome));
  return auto ? { pessoa: auto, origem: "automatico" } : null;
}

// Nome que deve aparecer/imprimir: o completo da equipe, senão o que veio.
export function nomeExibicao(nome: string, equipe: EquipeGestora | undefined | null): string {
  return resolverPessoa(nome, equipe)?.pessoa.nome ?? nome;
}

export function rotuloFuncao(funcao: FuncaoEquipe, genero: GeneroEquipe): string {
  const r = ROTULO_FUNCAO[funcao];
  return genero === "F" ? r.F : genero === "M" ? r.M : r.N;
}

// "Coordenadora Ana Lima" / "Coordenador João" / "Coordenação Ana" (sem gênero).
export function tituloFlexionado(pessoa: PessoaEquipe): string {
  return `${rotuloFuncao(pessoa.funcao, pessoa.genero)} ${pessoa.nome}`.trim();
}

// "a coordenadora" / "o coordenador" / "a coordenação" — para concordância no
// corpo de textos gerados.
export function artigoFuncao(funcao: FuncaoEquipe, genero: GeneroEquipe): string {
  const artigo = genero === "M" ? "o" : "a";
  return `${artigo} ${rotuloFuncao(funcao, genero).toLocaleLowerCase("pt-BR")}`;
}
