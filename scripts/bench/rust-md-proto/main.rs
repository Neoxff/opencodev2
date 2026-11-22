// Prototype Rust natif : parseur markdown de bloc representatif (std seul).
// Compare a parseMarkdown (AST sur) sur le meme document de 5000 lignes.
use std::time::Instant;

#[derive(Clone, Copy, PartialEq)]
enum Bloc { Titre, Liste, Code, Paragraphe, Regle, Vide }

fn classer(ligne: &str) -> Bloc {
    let t = ligne.trim();
    if t.is_empty() { return Bloc::Vide }
    if t.starts_with('#') { return Bloc::Titre }
    if t.starts_with("- ") || (t.len() > 2 && t.as_bytes()[0].is_ascii_digit() && t.contains(". ")) { return Bloc::Liste }
    if t.starts_with("```") || t.starts_with("~~~") { return Bloc::Code }
    if t.chars().all(|c| c == '-' || c == '*' || c == '_') && t.len() >= 3 { return Bloc::Regle }
    Bloc::Paragraphe
}

fn analyser(doc: &str) -> Vec<Bloc> {
    doc.lines().map(classer).filter(|b| *b != Bloc::Vide).collect()
}

fn document() -> String {
    (0..5000).map(|i| {
        if i % 10 == 0 { format!("## Section {}", i) }
        else if i % 7 == 0 { format!("- point **{}** avec du `code` et un [lien](https://example.com/{})", i, i) }
        else { format!("Texte du paragraphe {} avec *emphase* et **gras** pour mesurer le rendu.", i) }
    }).collect::<Vec<_>>().join("\n")
}

fn main() {
    let doc = document();
    let mut serie: Vec<f64> = Vec::new();
    for passage in 0..12 {
        let t0 = Instant::now();
        let blocs = analyser(&doc);
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        if passage >= 2 && blocs.is_empty() { panic!("parse vide"); }
        if passage >= 2 { serie.push(ms); }
    }
    serie.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = serie.len();
    println!("{{\"n\":{},\"mediane\":{},\"p95\":{},\"min\":{},\"max\":{}}}",
        n, serie[n/2], serie[n-1], serie[0], serie[n-1]);
}
