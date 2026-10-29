// Inkwell desktop shell.
//
// The UI is the same web build that runs in the browser. This file adds the handful of
// file operations a project needs. They use only the Rust standard library, so they work
// in any folder the user picks (another drive, Google Drive, Dropbox) with no permission
// scopes to configure. Folder pickers come from the dialog plugin.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::PathBuf;

fn describe(path: &str, e: std::io::Error) -> String {
    match e.kind() {
        ErrorKind::PermissionDenied => format!("Permission denied: {}", path),
        _ => format!("{}: {}", path, e),
    }
}

/// Read a UTF-8 text file. A missing file returns null rather than an error.
#[tauri::command]
fn read_text(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(describe(&path, e)),
    }
}

fn write_atomic(path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| describe(path, e))?;
    }
    // Write to a temporary file next to the target, then rename over it, so a crash
    // mid-save never leaves a half-written file behind.
    let tmp = PathBuf::from(format!("{}.inkwell-tmp", path));
    {
        let mut f = fs::File::create(&tmp).map_err(|e| describe(path, e))?;
        f.write_all(bytes).map_err(|e| describe(path, e))?;
        f.sync_all().map_err(|e| describe(path, e))?;
    }
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(describe(path, e));
    }
    Ok(())
}

/// Write a UTF-8 text file atomically, creating parent folders as needed.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    write_atomic(&path, contents.as_bytes())
}

/// Write a binary file (images) sent as base64.
#[tauri::command]
fn write_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64_decode(&data).ok_or_else(|| format!("{}: invalid image data", path))?;
    write_atomic(&path, &bytes)
}

/// Read a binary file as base64. A missing file returns null.
#[tauri::command]
fn read_base64(path: String) -> Result<Option<String>, String> {
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(base64_encode(&bytes))),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(describe(&path, e)),
    }
}

/// Names of the files (not folders) directly inside a folder. A missing folder is empty.
#[tauri::command]
fn list_files(path: String) -> Result<Vec<String>, String> {
    let entries = match fs::read_dir(&path) {
        Ok(it) => it,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(describe(&path, e)),
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        if is_file {
            names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    names.sort();
    Ok(names)
}

/// Delete a file. A missing file is not an error.
#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(describe(&path, e)),
    }
}

/// Whether a path exists (file or folder).
#[tauri::command]
fn path_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

// ---------- base64 (standard alphabet, with padding) ----------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[((n >> 18) & 63) as usize] as char);
        out.push(B64[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { B64[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn base64_value(c: u8) -> Option<u32> {
    match c {
        b'A'..=b'Z' => Some((c - b'A') as u32),
        b'a'..=b'z' => Some((c - b'a') as u32 + 26),
        b'0'..=b'9' => Some((c - b'0') as u32 + 52),
        b'+' | b'-' => Some(62),
        b'/' | b'_' => Some(63),
        _ => None,
    }
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let clean: Vec<u8> = input.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        if chunk.len() == 1 {
            return None;
        }
        let mut n: u32 = 0;
        for (i, c) in chunk.iter().enumerate() {
            n |= base64_value(*c)? << (18 - 6 * i as u32);
        }
        out.push((n >> 16) as u8);
        if chunk.len() > 2 {
            out.push((n >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(n as u8);
        }
    }
    Some(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            write_base64,
            read_base64,
            list_files,
            remove_file,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running Inkwell");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_round_trip() {
        for len in 0..40 {
            let data: Vec<u8> = (0..len).map(|i| (i * 37 + 11) as u8).collect();
            assert_eq!(base64_decode(&base64_encode(&data)).unwrap(), data);
        }
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
    }
}
