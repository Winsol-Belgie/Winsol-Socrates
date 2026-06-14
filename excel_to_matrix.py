"""
excel_to_matrix.py
------------------
Converteert een Winsol productstoring-Excel naar het JSON-formaat
dat SO!Crates verwacht in Cloudflare KV.

Gebruik:
    python excel_to_matrix.py SCREEN_PRODUCTSTORING.xlsx screen
    python excel_to_matrix.py SCREEN_PRODUCTSTORING.xlsx screen --png-folder PNG

    Met --png-folder wordt de opgegeven map gescand op PNG-bestanden waarvan
    de bestandsnaam begint met de oorzaakcode (bv. SC12_stap1.png).
    De gevonden bestandsnamen worden opgeslagen als "images": [...] in de JSON.

Output:
    <COMPONENT>_MATRIX.json  (klaar om te uploaden naar Cloudflare KV)

Excel-structuur die verwacht wordt:
    Kolom A  : Verplichte-info-code  (SS01, LS01, ...)
    Kolom B  : Vraag / label
    Kolom C  : Opties (komma-gescheiden)
    Kolom D  : Klacht-code           (SP01, LP01, ...)
    Kolom E  : Klachtomschrijving
    Kolom F  : Mogelijke oorzaken in volgorde (komma-gescheiden)
    Kolom G  : Oorzaak-code          (SC01, LC01, ...)
    Kolom H  : Van toepassing bij Casambi? (ja/nee)
    Kolom I  : Van toepassing bij Somfy?   (ja/nee)
    Kolom J  : Oorzaak-omschrijving
    Kolom K  : Oplossing
    Kolom L  : Link (optioneel — URL voor meer uitleg)
"""

import sys
import json
import argparse
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Installeer openpyxl eerst:  pip install openpyxl")


def find_images(png_folder: Path, code: str) -> list:
    """Zoek PNG-bestanden in png_folder waarvan de naam begint met 'code' (eerste 4 tekens)."""
    if not png_folder or not png_folder.is_dir():
        return []
    prefix = code[:4].upper()
    matches = sorted(p.name for p in png_folder.iterdir()
                     if p.suffix.lower() == ".png" and p.name.upper().startswith(prefix))
    return matches


def excel_to_matrix(filepath: str, component_name: str, png_folder: Path = None) -> dict:
    wb = openpyxl.load_workbook(filepath)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Kolom A-C: verplichte info (bv. type aansturing)
    required_info = []
    for row in rows[1:]:
        if row[0] and row[1]:
            required_info.append({
                "code": str(row[0]).strip(),
                "vraag": str(row[1]).strip(),
                "opties": [o.strip() for o in str(row[2] or "").split(",") if o.strip()]
            })

    # Kolom D-F: klachten
    complaints = []
    for row in rows[1:]:
        if row[3] and row[4]:
            causes_raw = str(row[5] or "")
            causes = [c.strip() for c in causes_raw.split(",") if c.strip()]
            complaints.append({
                "code": str(row[3]).strip(),
                "klacht": str(row[4]).strip(),
                "oorzaken_volgorde": causes
            })

    # Kolom G-L: oorzaken + oplossingen + optionele link
    causes = {}
    for row in rows[1:]:
        if row[6] and row[9]:
            code = str(row[6]).strip()
            entry = {
                "casambi": str(row[7] or "").strip().lower() == "ja",
                "somfy":   str(row[8] or "").strip().lower() == "ja",
                "omschrijving": str(row[9]).strip(),
                "oplossing":    str(row[10] or "").strip(),
            }
            # Kolom L: optionele link
            link = str(row[11] or "").strip() if len(row) > 11 else ""
            if link:
                entry["link"] = link
            # PNG-afbeeldingen
            images = find_images(png_folder, code)
            if images:
                entry["images"] = images
            causes[code] = entry

    return {
        "component": component_name,
        "required_info": required_info,
        "complaints": complaints,
        "causes": causes
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Converteer Winsol Excel naar SO!Crates JSON")
    parser.add_argument("excel",     help="Pad naar het Excel-bestand")
    parser.add_argument("component", help="Componentnaam (screen, led, lamel)")
    parser.add_argument("--png-folder", default=None, help="Map met PNG-afbeeldingen (optioneel)")
    args = parser.parse_args()

    png_folder = Path(args.png_folder) if args.png_folder else None
    matrix = excel_to_matrix(args.excel, args.component.lower(), png_folder)

    output_file = f"{args.component.upper()}_MATRIX.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(matrix, f, ensure_ascii=False, indent=2)

    print(f"✓ {output_file} aangemaakt")
    print(f"  Klachten : {len(matrix['complaints'])}")
    print(f"  Oorzaken : {len(matrix['causes'])}")
    links  = sum(1 for c in matrix['causes'].values() if c.get('link'))
    images = sum(1 for c in matrix['causes'].values() if c.get('images'))
    print(f"  Met link : {links}")
    print(f"  Met afbeeldingen: {images}")
    print(f"  Verplichte info: {len(matrix['required_info'])}")
