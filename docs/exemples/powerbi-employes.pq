// Power BI / Excel : Obtenir des données > Requête vide > Éditeur avancé, coller ce code.
// Source de données : choisir « Anonyme » (la clé voyage dans l'en-tête).
// Utiliser une clé de niveau 1 ou 2 pour un rapport partagé (pas de salaires).
let
    Base     = "https://VOTRE-APPLICATION",   // adresse de l'application, sans / final
    Cle      = "fms_xxxxxxxx_VOTRE_CLE",
    ParPage  = 500,
    Page = (p as number) =>
        Json.Document(
            Web.Contents(Base, [
                RelativePath = "api/v1/employees",
                Query = [presence = "actifs", per_page = Text.From(ParPage), page = Text.From(p)],
                Headers = [Authorization = "Bearer " & Cle]
            ])
        ),
    Premiere = Page(1),
    NbPages  = Number.RoundUp(Premiere[total] / ParPage),
    Lignes   = if NbPages <= 1 then Premiere[data]
               else List.Combine(List.Transform({1 .. NbPages}, each Page(_)[data])),
    Table    = Table.FromRecords(Lignes)
in
    Table
