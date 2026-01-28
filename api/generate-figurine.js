// api/generate-figurine.js
import { creaCardCalciatore } from '../utils/figurine.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fotoBase64, datiGiocatore } = req.body;

  if (!fotoBase64 || !datiGiocatore) {
    return res.status(400).json({ error: 'Missing fotoBase64 or datiGiocatore' });
  }

  try {
    console.log(`[generate-figurine] Ricevuta richiesta per ${datiGiocatore.nome} ${datiGiocatore.cognome}`);

    // Converti base64 a buffer
    const fotoBuffer = Buffer.from(fotoBase64, 'base64');

    // Genera figurina
    const figurinaBuffer = await creaCardCalciatore(fotoBuffer, datiGiocatore);

    if (!figurinaBuffer) {
      return res.status(500).json({ error: 'Generazione figurina fallita' });
    }

    // Restituisci come base64
    const figurinaBase64 = figurinaBuffer.toString('base64');

    console.log(`[generate-figurine] Figurina generata: ${Math.round(figurinaBuffer.length / 1024)}KB`);

    res.status(200).json({
      success: true,
      figurinaBase64,
      size: figurinaBuffer.length
    });

  } catch (error) {
    console.error('[generate-figurine] Errore:', error);
    res.status(500).json({ error: error.message });
  }
}
