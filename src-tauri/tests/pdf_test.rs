use std::path::PathBuf;

#[test]
fn extracts_text_from_fixture_pdf() {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("sample.pdf");
    let text = pdf_extract::extract_text(&p).expect("extract");
    assert!(text.contains("RARE test fixture"));
}
