// Motor de Relatórios Personalizáveis (v3.0) — ver plano em
// C:\Users\thenr\.claude\plans\zany-soaring-yeti.md.
//
// Fase 1 (núcleo): registro de campos (campos.rs) + esquema declarativo
// (definicao.rs) + motor de expressões (expressoes.rs) + executor genérico
// (executor.rs) + renderers por formato (renderers.rs), com os relatórios
// de hoje recriados como ReportDefinition (embutidos.rs) pra validar que o
// motor reproduz o que já existia antes de qualquer migração apagar código
// antigo ou de construir o construtor visual em cima disso.

mod campos;
mod colecoes;
mod comandos;
mod definicao;
mod embutidos;
mod executor;
mod expressoes;
mod renderers;
mod repositorio;

#[allow(unused_imports)]
pub(crate) use {
    comandos::*, definicao::*, executor::RelatorioGenericoResultado, renderers::carregar_familia_fonte_pdf,
    repositorio::*,
};
