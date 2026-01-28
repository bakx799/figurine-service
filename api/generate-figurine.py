from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import os
from PIL import Image, ImageDraw, ImageFont
import pathlib

# Prova a importare rembg
REMBG_AVAILABLE = False
REMBG_SESSION = None
REMBG_ERROR = None

try:
    from rembg import remove, new_session
    print("[figurine] Inizializzazione modello silueta...")
    REMBG_SESSION = new_session("silueta")
    REMBG_AVAILABLE = True
    print("[figurine] ✅ Modello silueta caricato!")
except Exception as e:
    REMBG_ERROR = str(e)
    print(f"[figurine] ❌ rembg non disponibile: {e}")

# Mapping ruoli
ROLE_MAP = {
    "P": "Portiere",
    "D": "Difensore",
    "C": "Centrocampista",
    "A": "Attaccante",
    "N/D": "N/D"
}

# Path assets
PROJECT_ROOT = pathlib.Path(__file__).parent.parent.resolve()
TEMPLATE_PATH = PROJECT_ROOT / "utils" / "tamplate.png"
FONT_PATH = PROJECT_ROOT / "utils" / "arialbd.ttf"


def genera_figurina(foto_base64: str, dati: dict) -> dict:
    """
    Genera una figurina calciatore.

    Args:
        foto_base64: Foto del giocatore in base64
        dati: { nome, cognome, squadra, ruolo, anno }

    Returns:
        { success: True, figurinaBase64: str } o { success: False, error: str }
    """
    try:
        # Validazione
        chiavi_richieste = ['nome', 'cognome', 'squadra', 'ruolo', 'anno']
        chiavi_mancanti = [k for k in chiavi_richieste if k not in dati]
        if chiavi_mancanti:
            return {"success": False, "error": f"Chiavi mancanti: {chiavi_mancanti}"}

        print(f"[figurine] Elaborazione: {dati['nome']} {dati['cognome']}...")
        print(f"[figurine] PROJECT_ROOT: {PROJECT_ROOT}")
        print(f"[figurine] TEMPLATE_PATH: {TEMPLATE_PATH}")
        print(f"[figurine] Template exists: {TEMPLATE_PATH.exists()}")

        # 1. Decode base64 -> bytes
        foto_bytes = base64.b64decode(foto_base64)

        # 2. Carica template
        if not TEMPLATE_PATH.exists():
            return {"success": False, "error": f"Template not found at {TEMPLATE_PATH}"}
        sfondo = Image.open(str(TEMPLATE_PATH)).convert("RGBA")
        W, H = sfondo.size

        # 3. Rimuovi sfondo con rembg (se disponibile)
        if REMBG_AVAILABLE:
            print("[figurine] Rimozione sfondo in corso...")
            foto_scontornata = remove(foto_bytes, session=REMBG_SESSION)
            print(f"[figurine] ✅ Sfondo rimosso: {len(foto_scontornata)} bytes")
            giocatore = Image.open(io.BytesIO(foto_scontornata)).convert("RGBA")
        else:
            print(f"[figurine] ⚠️ rembg non disponibile ({REMBG_ERROR}), uso foto originale")
            giocatore = Image.open(io.BytesIO(foto_bytes)).convert("RGBA")

        print("[figurine] Foto caricata")

        # 5. Ridimensionamento e posizionamento
        target_y_start = int(H * 0.15)
        target_y_end = int(H * 0.78)
        target_height = target_y_end - target_y_start

        aspect_ratio = giocatore.width / giocatore.height
        new_height = int(target_height * 1.45)
        new_width = int(new_height * aspect_ratio)

        giocatore = giocatore.resize((new_width, new_height), Image.Resampling.LANCZOS)

        center_x = W // 2
        pos_x = center_x - (new_width // 2)
        pos_y = target_y_start + (target_height - new_height)

        # 6. Compositing
        canvas = Image.new("RGBA", sfondo.size)
        canvas.paste(sfondo, (0, 0))
        canvas.paste(giocatore, (pos_x, pos_y), mask=giocatore)

        # 7. Testo
        draw = ImageDraw.Draw(canvas)

        try:
            font = ImageFont.truetype(str(FONT_PATH), 33)
        except IOError:
            font = ImageFont.load_default()
            print(f"[figurine] Font non trovato a {FONT_PATH}, uso default")

        text_color = (30, 30, 30, 255)
        text_x = int(W * 0.08)
        line_spacing = int(H * 0.040)
        offset_x_labels = int(W * 0.20)

        # Mappa ruolo
        ruolo_completo = ROLE_MAP.get(dati['ruolo'], dati['ruolo'])

        nome_completo = f"{dati['cognome']} {dati['nome']}".upper()
        squadra = dati['squadra'].upper()
        ruolo = ruolo_completo.upper()
        anno = str(dati['anno'])

        y_nome = int(H * 0.795)
        y_squadra = y_nome + line_spacing
        y_ruolo = y_squadra + line_spacing
        y_anno = y_ruolo + line_spacing

        draw.text((text_x + offset_x_labels, y_nome), nome_completo, font=font, fill=text_color)
        draw.text((text_x + offset_x_labels, y_squadra), squadra, font=font, fill=text_color)
        draw.text((text_x + offset_x_labels, y_ruolo), ruolo, font=font, fill=text_color)
        draw.text((text_x + offset_x_labels, y_anno), anno, font=font, fill=text_color)

        # 8. Salva come PNG in memoria
        bg = Image.new("RGB", canvas.size, (255, 255, 255))
        bg.paste(canvas, mask=canvas.split()[3])

        output = io.BytesIO()
        bg.save(output, format='PNG')
        figurina_base64 = base64.b64encode(output.getvalue()).decode('utf-8')

        print(f"[figurine] Figurina generata: {len(output.getvalue()) // 1024}KB")

        return {
            "success": True,
            "figurinaBase64": figurina_base64,
            "size": len(output.getvalue())
        }

    except Exception as e:
        print(f"[figurine] Errore: {str(e)}")
        return {"success": False, "error": str(e)}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            foto_base64 = data.get('fotoBase64')
            dati_giocatore = data.get('datiGiocatore')

            if not foto_base64 or not dati_giocatore:
                result = {"success": False, "error": "Missing fotoBase64 or datiGiocatore"}
            else:
                result = genera_figurina(foto_base64, dati_giocatore)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
