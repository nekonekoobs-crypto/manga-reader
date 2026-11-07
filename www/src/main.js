/* Punto de entrada: enlaza vistas, controladores y funciones, y arranca la app */
import { S } from './models/state.js';
import { mangadex, generic } from './models/sources/index.js';
import { getDoc, nativeRef } from './lib/http.js';
import { tidyTitle } from './lib/text.js';
import { capHttp, nativeBlobUrl } from './services/image-loader.js';
import { toast } from './views/toast.view.js';
import { renderSrcSelect } from './views/explore.view.js';
import { bindCoverFallback } from './views/images.view.js';
import { bindNavigation, showOverlay, goBack } from './controllers/navigation.controller.js';
import { bindExplore, runSearch } from './controllers/explore.controller.js';
import { bindDetail, openDetail } from './controllers/detail.controller.js';
import { bindReader } from './controllers/reader.controller.js';
import { bindLibrary } from './controllers/library.controller.js';
import { bindSources, installSource } from './controllers/sources.controller.js';
import { bindGenres } from './controllers/genres.controller.js';
import { bindBackup } from './controllers/backup.controller.js';
import { openUrl } from './controllers/link.controller.js';
import { initAdapt } from './features/adapt/adapt.js';
import { initTheme } from './features/theme/theme.js';

bindCoverFallback();
bindNavigation();
bindExplore();
bindDetail();
bindReader();
bindLibrary();
bindSources();
bindGenres();
bindBackup();
initAdapt();
initTheme();

renderSrcSelect();
runSearch(true);

// Acceso para las pruebas automáticas
window.__MR = { S, mangadex, generic, runSearch, openDetail, openUrl, getDoc, tidyTitle, nativeRef, capHttp, nativeBlobUrl, showOverlay, goBack, toast, saveCfg: installSource };
