import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { removeBackground } from "@imgly/background-removal-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Registra font Arial Bold
GlobalFonts.registerFromPath(path.join(__dirname, "arialbd.ttf"), "ArialBold");

// Path template (nella stessa directory)
const TEMPLATE_PATH = path.join(__dirname, "tamplate.png");

// Mapping ruoli da codice DB a nome completo
const ROLE_MAP = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
  "N/D": "N/D",
};

/**
 * Crea una card figurina calciatore scontornando la foto e sovrapponendola al template.
 *
 * @param {Buffer} fotoBuffer - Buffer della foto grezza del giocatore (JPG/PNG)
 * @param {object} datiGiocatore - { nome, cognome, squadra, ruolo, anno }
 * @returns {Promise<Buffer|null>} Buffer PNG della figurina, oppure null in caso di errore
 */
export async function creaCardCalciatore(fotoBuffer, datiGiocatore) {
  // Validazione chiavi obbligatorie
  const chiaviRichieste = ["nome", "cognome", "squadra", "ruolo", "anno"];
  const chiaviMancanti = chiaviRichieste.filter(
    (k) => !(k in datiGiocatore)
  );
  if (chiaviMancanti.length > 0) {
    console.error(`[figurine] Chiavi mancanti: ${chiaviMancanti.join(", ")}`);
    return null;
  }

  if (!fotoBuffer || !Buffer.isBuffer(fotoBuffer)) {
    console.error("[figurine] fotoBuffer non valido");
    return null;
  }

  console.log(
    `[figurine] Elaborazione: ${datiGiocatore.nome} ${datiGiocatore.cognome}...`
  );

  // 1. Carica il Template
  const templateImg = await loadImage(TEMPLATE_PATH);
  const W = templateImg.width;
  const H = templateImg.height;

  // 2. Rimozione sfondo (AI)
  console.log("[figurine] Rimozione sfondo in corso...");
  const fotoBlob = new Blob([fotoBuffer], { type: "image/jpeg" });
  const resultBlob = await removeBackground(fotoBlob);
  const scontornatoBuffer = Buffer.from(await resultBlob.arrayBuffer());
  console.log("[figurine] Sfondo rimosso");

  // 3. Ridimensionamento e Posizionamento
  const targetYStart = Math.round(H * 0.15);
  const targetYEnd = Math.round(H * 0.78);
  const targetHeight = targetYEnd - targetYStart;

  const giocatoreMeta = await sharp(scontornatoBuffer).metadata();
  const aspectRatio = giocatoreMeta.width / giocatoreMeta.height;
  const newHeight = Math.round(targetHeight * 1.45);
  const newWidth = Math.round(newHeight * aspectRatio);

  const giocatoreResized = await sharp(scontornatoBuffer)
    .resize(newWidth, newHeight, { kernel: sharp.kernel.lanczos3 })
    .toBuffer();

  // Centrato orizzontalmente, allineato in basso nell'area target
  const centerX = Math.round(W / 2);
  const posX = centerX - Math.round(newWidth / 2);
  const posY = targetYStart + (targetHeight - newHeight);

  // 4. Compositing + Testo
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Sfondo bianco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Layer: template -> giocatore scontornato
  ctx.drawImage(templateImg, 0, 0);
  const giocatoreImg = await loadImage(giocatoreResized);
  ctx.drawImage(giocatoreImg, posX, posY);

  // Testo
  const fontSize = 33;
  ctx.font = `bold ${fontSize}px "ArialBold"`;
  ctx.fillStyle = "rgba(30, 30, 30, 1)";

  const textX = Math.round(W * 0.08);
  const lineSpacing = Math.round(H * 0.04);
  const offsetXLabels = Math.round(W * 0.2);

  // Mappa ruolo da codice a nome completo
  const ruoloCompleto = ROLE_MAP[datiGiocatore.ruolo] || datiGiocatore.ruolo;

  const nomeCompleto =
    `${datiGiocatore.cognome} ${datiGiocatore.nome}`.toUpperCase();
  const squadra = datiGiocatore.squadra.toUpperCase();
  const ruolo = ruoloCompleto.toUpperCase();
  const anno = String(datiGiocatore.anno);

  const yNome = Math.round(H * 0.795);
  const ySquadra = yNome + lineSpacing;
  const yRuolo = ySquadra + lineSpacing;
  const yAnno = yRuolo + lineSpacing;

  // Canvas usa baseline come riferimento Y; si aggiunge fontSize per allineare
  ctx.fillText(nomeCompleto, textX + offsetXLabels, yNome + fontSize);
  ctx.fillText(squadra, textX + offsetXLabels, ySquadra + fontSize);
  ctx.fillText(ruolo, textX + offsetXLabels, yRuolo + fontSize);
  ctx.fillText(anno, textX + offsetXLabels, yAnno + fontSize);

  // 5. Output come Buffer PNG
  const pngBuffer = canvas.toBuffer("image/png");
  const finalBuffer = await sharp(pngBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  console.log(
    `[figurine] Card generata: ${Math.round(finalBuffer.length / 1024)}KB`
  );
  return finalBuffer;
}

export { ROLE_MAP };
