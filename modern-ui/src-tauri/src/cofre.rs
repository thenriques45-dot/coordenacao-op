// Cofre de credenciais (tokens do Google e do GitHub). O lugar certo é o
// cofre do sistema operacional via `keyring`: Credential Manager no Windows,
// Keychain no macOS e Secret Service (GNOME Keyring, KWallet) no Linux.
//
// Só que muito Linux não tem Secret Service rodando (gerenciadores de janela
// como Hyprland/Sway, instalações mínimas), e aí o `keyring` falha com
// "DBus error: org.freedesktop.DBus.Error.ServiceUnknown" e o login no
// Google ficava impossível. Nesse caso — e só nesse — o token vai para um
// arquivo legível apenas pelo próprio usuário (0600), na pasta de config do
// sistema (no Flatpak, a pasta privada do app). Fica FORA da pasta de dados
// do app de propósito: ela entra nos backups e na sincronização do grupo.
// Quando o cofre volta a funcionar, o arquivo é apagado no próximo salvamento.

use std::{fs, io, path::PathBuf};

fn entrada(servico: &str, conta: &str) -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new(servico, conta)
}

/// O cofre não existe ou não responde (e não "a senha não está lá").
fn cofre_indisponivel(err: &keyring::Error) -> bool {
    matches!(err, keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_))
}

fn arquivo_reserva(servico: &str, conta: &str) -> Option<PathBuf> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    #[cfg(test)]
    if let Some(base) = crate::infra::BASE_DE_TESTE.with(|base| base.borrow().clone()) {
        return Some(base.join("credenciais").join(format!("{servico}.{conta}")));
    }
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(base.join("coordenacaoop-credenciais").join(format!("{servico}.{conta}")))
}

fn gravar_reserva(caminho: &PathBuf, segredo: &str) -> io::Result<()> {
    let pasta = caminho.parent().ok_or_else(|| io::Error::other("caminho sem pasta"))?;
    fs::create_dir_all(pasta)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let _ = fs::set_permissions(pasta, fs::Permissions::from_mode(0o700));
        let temporario = caminho.with_extension("tmp");
        let _ = fs::remove_file(&temporario);
        let mut arquivo = fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&temporario)?;
        io::Write::write_all(&mut arquivo, segredo.as_bytes())?;
        arquivo.sync_all()?;
        fs::rename(&temporario, caminho)
    }
    #[cfg(not(unix))]
    {
        fs::write(caminho, segredo)
    }
}

fn apagar_reserva(servico: &str, conta: &str) {
    if let Some(caminho) = arquivo_reserva(servico, conta) {
        let _ = fs::remove_file(caminho);
    }
}

pub(crate) fn salvar(servico: &str, conta: &str, segredo: &str) -> Result<(), String> {
    let erro = match entrada(servico, conta).and_then(|e| e.set_password(segredo)) {
        Ok(()) => {
            apagar_reserva(servico, conta);
            return Ok(());
        }
        Err(err) => err,
    };
    match arquivo_reserva(servico, conta) {
        Some(caminho) if cofre_indisponivel(&erro) => gravar_reserva(&caminho, segredo)
            .map_err(|err| format!("{erro}; e também não deu para gravar em {}: {err}", caminho.display())),
        _ => Err(erro.to_string()),
    }
}

pub(crate) fn carregar(servico: &str, conta: &str) -> Option<String> {
    if let Ok(segredo) = entrada(servico, conta).and_then(|e| e.get_password()) {
        return Some(segredo);
    }
    let segredo = fs::read_to_string(arquivo_reserva(servico, conta)?).ok()?;
    let segredo = segredo.trim().to_string();
    (!segredo.is_empty()).then_some(segredo)
}

pub(crate) fn apagar(servico: &str, conta: &str) -> Result<(), String> {
    apagar_reserva(servico, conta);
    match entrada(servico, conta).and_then(|e| e.delete_credential()) {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) if cofre_indisponivel(&err) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[cfg(all(test, target_os = "linux"))]
mod testes {
    use super::*;

    #[test]
    fn reserva_grava_le_e_apaga_com_permissao_restrita() {
        let base = std::env::temp_dir().join(format!("cofre-teste-{}", std::process::id()));
        crate::infra::BASE_DE_TESTE.with(|b| *b.borrow_mut() = Some(base.clone()));
        let caminho = arquivo_reserva("servico-teste", "conta").unwrap();
        gravar_reserva(&caminho, "segredo-1").unwrap();
        gravar_reserva(&caminho, "segredo-2").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let modo = fs::metadata(&caminho).unwrap().permissions().mode() & 0o777;
            assert_eq!(modo, 0o600);
        }
        assert_eq!(fs::read_to_string(&caminho).unwrap(), "segredo-2");
        apagar_reserva("servico-teste", "conta");
        assert!(!caminho.exists());
        crate::infra::BASE_DE_TESTE.with(|b| *b.borrow_mut() = None);
        let _ = fs::remove_dir_all(base);
    }
}
