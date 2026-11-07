/* Diagnóstico de imágenes (botón en Fuentes) */
import { runDiag } from '../services/diagnostics.js';
import { createDiagLog } from '../views/diag.view.js';

export const runDiagnostics = () => runDiag(createDiagLog());
