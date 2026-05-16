use std::path::PathBuf;

#[tauri::command]
pub fn extract_pdf_text(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    pdf_extract::extract_text(&p).map_err(|e| e.to_string())
}
